import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { documentChunks } from "@shared/schema";
import { parseDocument } from "./document-parser";
import { logCost } from "./cost-tracker";
import type { LeaseFile } from "@shared/schema";

const embeddingApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const embeddingBaseURL = process.env.OPENAI_API_KEY
  ? (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
  : (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");

const openai = new OpenAI({
  apiKey: embeddingApiKey,
  baseURL: embeddingBaseURL,
});

console.log(`[VECTORIZE] Embeddings client configured: baseURL=${embeddingBaseURL}, hasKey=${!!embeddingApiKey}`);

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
let dimensionsVerified = false;

async function ensureVectorColumn(dimensions: number) {
  if (dimensionsVerified) return;
  try {
    const colCheck = await db.execute(sql`
      SELECT data_type, udt_name FROM information_schema.columns
      WHERE table_name = 'document_chunks' AND column_name = 'embedding'
    `);
    const colRows = (colCheck as any).rows || colCheck;
    const exists = colRows.length > 0;

    if (exists) {
      await db.execute(sql`ALTER TABLE document_chunks DROP COLUMN embedding`);
    }
    await db.execute(
      sql.raw(`ALTER TABLE document_chunks ADD COLUMN embedding vector(${dimensions})`)
    );
    dimensionsVerified = true;
    console.log(`Vector column set to ${dimensions} dimensions.`);
  } catch (err: any) {
    if (err.message?.includes("already exists")) {
      dimensionsVerified = true;
    } else {
      console.warn("Vector column setup warning:", err.message);
    }
  }
}

function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  if (!text || text.trim().length === 0) return chunks;

  const sentences = text.split(/(?<=[.!?\n])\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(CHUNK_OVERLAP / 5));
      currentChunk = overlapWords.join(" ") + " " + sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function generateEmbeddings(texts: string[], costContext?: { leaseId?: number; siteId?: number }): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
    const usage = response.usage;
    if (usage) {
      await logCost({
        type: "embedding",
        leaseId: costContext?.leaseId ?? null,
        siteId: costContext?.siteId ?? null,
        model: EMBEDDING_MODEL,
        inputTokens: usage.total_tokens,
        outputTokens: 0,
      });
    }
  }

  return allEmbeddings;
}

export async function vectorizeFile(file: LeaseFile, siteId?: number): Promise<number> {
  console.log(`[VECTORIZE] Parsing file: ${file.fileName} (${file.fileType}) at ${file.filePath}`);
  const content = await parseDocument(file.filePath, file.fileType);

  if (!content || content.startsWith("[Error") || content.startsWith("[Empty") || content.startsWith("[OCR failed") || content.startsWith("[Scanned PDF") || content.startsWith("[PDF parsing") || content.startsWith("[MSG file parsing failed")) {
    console.warn(`[VECTORIZE] No usable content from ${file.fileName}: ${content?.substring(0, 100) || "(empty)"}`);
    return 0;
  }

  const cleanContent = content.replace(/\s+/g, " ").trim();
  if (cleanContent.length < 20) {
    console.warn(`[VECTORIZE] Content too short (${cleanContent.length} chars) from ${file.fileName}`);
    return 0;
  }

  console.log(`[VECTORIZE] Parsed ${content.length} chars from ${file.fileName}, splitting into chunks...`);
  const chunks = splitTextIntoChunks(content);
  if (chunks.length === 0) {
    console.warn(`[VECTORIZE] No chunks produced from ${file.fileName}`);
    return 0;
  }

  console.log(`[VECTORIZE] ${chunks.length} chunks, generating embeddings...`);
  const embeddings = await generateEmbeddings(chunks, { leaseId: file.leaseId, siteId });

  if (embeddings.length > 0 && !dimensionsVerified) {
    await ensureVectorColumn(embeddings[0].length);
  }

  for (let i = 0; i < chunks.length; i++) {
    const embeddingStr = `[${embeddings[i].join(",")}]`;
    await db.execute(sql`
      INSERT INTO document_chunks (file_id, lease_id, chunk_index, content, file_name, embedding)
      VALUES (${file.id}, ${file.leaseId}, ${i}, ${chunks[i]}, ${file.fileName}, ${embeddingStr}::vector)
    `);
  }

  console.log(`[VECTORIZE] Stored ${chunks.length} chunks for ${file.fileName}`);
  return chunks.length;
}

export async function vectorizeLeaseFiles(leaseId: number, files: LeaseFile[], siteId?: number): Promise<number> {
  console.log(`[VECTORIZE] Starting vectorization for lease ${leaseId} (${files.length} files)`);
  await db.execute(sql`DELETE FROM document_chunks WHERE lease_id = ${leaseId}`);

  let totalChunks = 0;
  for (const file of files) {
    try {
      const count = await vectorizeFile(file, siteId);
      totalChunks += count;
    } catch (err: any) {
      console.error(`[VECTORIZE] ERROR vectorizing ${file.fileName}:`, err.message);
      if (err.stack) console.error(err.stack);
    }
  }

  console.log(`[VECTORIZE] Lease ${leaseId} complete: ${totalChunks} total chunks from ${files.length} files`);
  return totalChunks;
}

export async function findRelevantChunks(
  leaseId: number,
  query: string,
  topK: number = 10,
  costContext?: { siteId?: number }
): Promise<{ content: string; fileName: string; similarity: number }[]> {
  const [queryEmbedding] = await generateEmbeddings([query], { leaseId, siteId: costContext?.siteId });
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(sql`
    SELECT content, file_name, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM document_chunks
    WHERE lease_id = ${leaseId}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);

  const rows = (results as any).rows || results;
  return rows.map((row: any) => ({
    content: row.content,
    fileName: row.file_name,
    similarity: parseFloat(row.similarity),
  }));
}

export async function hasChunksForLease(leaseId: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as count FROM document_chunks WHERE lease_id = ${leaseId}
  `);
  const rows = (result as any).rows || result;
  const count = parseInt(rows[0]?.count || "0");
  console.log(`[VECTORIZE] hasChunksForLease(${leaseId}): count=${count}`);
  return count > 0;
}
