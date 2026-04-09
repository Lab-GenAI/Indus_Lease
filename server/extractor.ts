import OpenAI from "openai";
import { storage } from "./storage";
import { findRelevantChunks, hasChunksForLease, vectorizeLeaseFiles } from "./vectorizer";
import { parseDocument } from "./document-parser";
import { logCost } from "./cost-tracker";
import type { Tag, LeaseFile } from "@shared/schema";
import { emitProgress } from "./progress";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || process.env.OPENAI_MODEL || "azure.gpt-4.1";
const PARALLEL_LIMIT = 5;
const MAX_CONTEXT_CHARS = 60000;

async function extractSingleTag(
  leaseId: number,
  tag: Tag,
  siteId?: number
): Promise<{ name: string; value: string }> {
  const query = tag.description
    ? `${tag.name}: ${tag.description}`
    : tag.name;

  const relevantChunks = await findRelevantChunks(leaseId, query, 8, { siteId });

  if (relevantChunks.length === 0) {
    return { name: tag.name, value: "Not Found" };
  }

  const contextText = relevantChunks
    .map((c, i) => `[Source: ${c.fileName} | Relevance: ${(c.similarity * 100).toFixed(1)}%]\n${c.content}`)
    .join("\n\n---\n\n");

  const prompt = `You are a lease document analysis expert. Extract the following specific data point from the provided document excerpts.

Data point to extract: ${tag.name}${tag.description ? ` (${tag.description})` : ""}

Relevant document excerpts:
${contextText}

Instructions:
- Extract the most accurate and specific value for "${tag.name}" from the provided text
- If the value cannot be found in the excerpts, respond with exactly "Not Found"
- Be precise and use exact values from the documents
- For dates, use the format found in the document
- For monetary values, include currency symbols if present
- For names, include full names as written in the document
- Respond with ONLY the extracted value, nothing else. No explanation, no prefix, no quotes.`;

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 512,
    });

    const usage = response.usage;
    if (usage) {
      await logCost({
        type: "extraction",
        leaseId,
        siteId: siteId ?? null,
        model: EXTRACTION_MODEL,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      });
    }

    const value = response.choices[0]?.message?.content?.trim() || "Not Found";
    return { name: tag.name, value };
  } catch (err: any) {
    console.error(`Failed to extract tag "${tag.name}":`, err.message);
    return { name: tag.name, value: "Extraction Error" };
  }
}

async function extractSingleTagDirect(
  documentText: string,
  tag: Tag,
  leaseId?: number,
  siteId?: number
): Promise<{ name: string; value: string }> {
  const prompt = `You are a lease document analysis expert. Extract the following specific data point from the provided documents.

Data point to extract: ${tag.name}${tag.description ? ` (${tag.description})` : ""}

Document content:
${documentText}

Instructions:
- Extract the most accurate and specific value for "${tag.name}" from the provided text
- If the value cannot be found in the text, respond with exactly "Not Found"
- Be precise and use exact values from the documents
- For dates, use the format found in the document
- For monetary values, include currency symbols if present
- For names, include full names as written in the document
- Respond with ONLY the extracted value, nothing else. No explanation, no prefix, no quotes.`;

  try {
    const response = await openai.chat.completions.create({
      model: EXTRACTION_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 512,
    });

    const usage = response.usage;
    if (usage) {
      await logCost({
        type: "extraction",
        leaseId: leaseId ?? null,
        siteId: siteId ?? null,
        model: EXTRACTION_MODEL,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      });
    }

    const value = response.choices[0]?.message?.content?.trim() || "Not Found";
    return { name: tag.name, value };
  } catch (err: any) {
    console.error(`Failed to extract tag "${tag.name}":`, err.message);
    return { name: tag.name, value: "Extraction Error" };
  }
}

async function getLeaseTextDirect(leaseId: number): Promise<string> {
  const files = await storage.getFilesByLease(leaseId);
  if (files.length === 0) {
    throw new Error("No files found for this lease.");
  }

  const textParts: string[] = [];
  for (const file of files) {
    try {
      const content = await parseDocument(file.filePath, file.fileType);
      if (content && !content.startsWith("[Error") && !content.startsWith("[Empty") && !content.startsWith("[OCR failed") && !content.startsWith("[Scanned PDF") && !content.startsWith("[PDF parsing")) {
        const clean = content.replace(/\s+/g, " ").trim();
        if (clean.length > 20) {
          textParts.push(`=== FILE: ${file.fileName} ===\n${content}`);
        }
      }
    } catch (err: any) {
      console.error(`[EXTRACTOR] Failed to parse ${file.fileName}:`, err.message);
    }
  }

  if (textParts.length === 0) {
    throw new Error("No readable content found in any lease documents.");
  }

  let combined = textParts.join("\n\n");
  if (combined.length > MAX_CONTEXT_CHARS) {
    combined = combined.substring(0, MAX_CONTEXT_CHARS) + "\n\n[... text truncated due to length ...]";
  }

  console.log(`[EXTRACTOR] Direct text fallback: ${textParts.length} files, ${combined.length} chars`);
  return combined;
}

async function runInParallel<T>(
  items: T[],
  fn: (item: T) => Promise<any>,
  limit: number
): Promise<any[]> {
  const results: any[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function extractTagsFromLease(leaseId: number, taskId?: string, siteId?: number): Promise<Record<string, string>> {
  const tags = await storage.getTags();

  if (tags.length === 0) {
    throw new Error("No extraction tags configured. Please add tags in the Admin panel first.");
  }

  if (taskId) {
    emitProgress({ taskId, type: "extraction", status: "in_progress", current: 0, total: tags.length, message: "Checking document chunks..." });
  }

  const chunksExist = await hasChunksForLease(leaseId);
  if (!chunksExist) {
    const files = await storage.getFilesByLease(leaseId);
    if (files.length === 0) {
      throw new Error("No files found for this lease.");
    }
    if (taskId) {
      emitProgress({ taskId, type: "extraction", status: "in_progress", current: 0, total: tags.length, message: `Vectorizing ${files.length} file(s)...` });
    }
    console.log(`No chunks found for lease ${leaseId}, vectorizing ${files.length} files...`);
    try {
      await vectorizeLeaseFiles(leaseId, files, siteId);
    } catch (err: any) {
      console.error(`[EXTRACTOR] Vectorization error: ${err.message}`);
    }
  }

  const finalChunksExist = await hasChunksForLease(leaseId);

  if (finalChunksExist) {
    console.log(`Extracting ${tags.length} tags using vector search for lease ${leaseId}...`);

    let completed = 0;
    const results = await runInParallel(
      tags,
      async (tag) => {
        const result = await extractSingleTag(leaseId, tag, siteId);
        completed++;
        if (taskId) {
          emitProgress({ taskId, type: "extraction", status: "in_progress", current: completed, total: tags.length, message: `Extracting tags...`, detail: `Completed: ${tag.name}` });
        }
        return result;
      },
      PARALLEL_LIMIT
    );

    const extractionResults: Record<string, string> = {};
    for (const result of results) {
      extractionResults[result.name] = result.value;
    }

    if (taskId) {
      emitProgress({ taskId, type: "extraction", status: "completed", current: tags.length, total: tags.length, message: "Extraction complete" });
    }

    return extractionResults;
  }

  console.log(`[EXTRACTOR] No chunks available, falling back to direct text mode for lease ${leaseId}`);
  if (taskId) {
    emitProgress({ taskId, type: "extraction", status: "in_progress", current: 0, total: tags.length, message: "Reading documents directly..." });
  }

  const documentText = await getLeaseTextDirect(leaseId);

  let completed = 0;
  const results = await runInParallel(
    tags,
    async (tag) => {
      const result = await extractSingleTagDirect(documentText, tag, leaseId, siteId);
      completed++;
      if (taskId) {
        emitProgress({ taskId, type: "extraction", status: "in_progress", current: completed, total: tags.length, message: `Extracting tags (direct)...`, detail: `Completed: ${tag.name}` });
      }
      return result;
    },
    PARALLEL_LIMIT
  );

  const extractionResults: Record<string, string> = {};
  for (const result of results) {
    extractionResults[result.name] = result.value;
  }

  if (taskId) {
    emitProgress({ taskId, type: "extraction", status: "completed", current: tags.length, total: tags.length, message: "Extraction complete" });
  }

  return extractionResults;
}
