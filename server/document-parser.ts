import fs from "fs";
import path from "path";
import * as mammoth from "mammoth";
import { simpleParser } from "mailparser";
import { spawn } from "child_process";
import { writeFile, unlink, readdir, readFile } from "fs/promises";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import MsgReaderModule from "@kenjiuno/msgreader";
import OpenAI from "openai";
import sharp from "sharp";

let pdfModule: any = null;

async function loadPdfModule() {
  if (pdfModule) return pdfModule;
  pdfModule = await import("pdf-parse");
  return pdfModule;
}

export async function parseDocument(filePath: string, fileType: string): Promise<string> {
  try {
    const buffer = fs.readFileSync(filePath);

    switch (fileType.toLowerCase()) {
      case "pdf":
        return await parsePdf(buffer, filePath);
      case "docx":
        return await parseDocx(buffer);
      case "eml":
        return await parseEml(buffer);
      case "msg":
        return await parseMsg(buffer);
      case "txt":
        return buffer.toString("utf-8");
      default:
        return buffer.toString("utf-8");
    }
  } catch (error: any) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return `[Error parsing file: ${error.message}]`;
  }
}

async function parsePdf(buffer: Buffer, filePath: string): Promise<string> {
  try {
    const { PDFParse, VerbosityLevel } = await loadPdfModule();
    const parser = new PDFParse({ data: buffer, verbosity: VerbosityLevel.ERRORS });
    const result = await parser.getText();
    const text = result?.text?.trim() || "";
    await parser.destroy();

    if (text.replace(/\s/g, "").length > 50) {
      return text;
    }

    console.log(`PDF appears to be scanned, attempting OCR: ${filePath}`);
    return await ocrPdf(filePath);
  } catch (error: any) {
    console.error(`PDF parse error, attempting OCR: ${error.message}`);
    try {
      return await ocrPdf(filePath);
    } catch (ocrError: any) {
      return `[PDF parsing and OCR failed: ${error.message}]`;
    }
  }
}

function findPdftoppm(): string {
  const isWindows = process.platform === "win32";
  const popplerPath = process.env.POPPLER_PATH;
  if (popplerPath) {
    const bin = isWindows ? path.join(popplerPath, "pdftoppm.exe") : path.join(popplerPath, "pdftoppm");
    if (fs.existsSync(bin)) return bin;
    const binDir = path.join(popplerPath, "bin");
    const binInBin = isWindows ? path.join(binDir, "pdftoppm.exe") : path.join(binDir, "pdftoppm");
    if (fs.existsSync(binInBin)) return binInBin;
    const libDir = path.join(popplerPath, "Library", "bin");
    const binInLib = isWindows ? path.join(libDir, "pdftoppm.exe") : path.join(libDir, "pdftoppm");
    if (fs.existsSync(binInLib)) return binInLib;
  }
  return "pdftoppm";
}

async function preprocessImage(imagePath: string): Promise<void> {
  const buffer = await sharp(imagePath)
    .grayscale()
    .linear(2.0, -(128 * 2.0 - 128))
    .threshold()
    .png()
    .toBuffer();
  await writeFile(imagePath, buffer);
}

const visionClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
});

function getOcrModel(): string {
  const model = process.env.EXTRACTION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1";
  if (model.startsWith("claude-")) return "gpt-4.1";
  return model;
}

async function ocrPageWithVision(imagePath: string, pageIndex: number): Promise<string> {
  const MAX_RETRIES = 3;

  let imageData: string;
  try {
    const buffer = await readFile(imagePath);
    imageData = buffer.toString("base64");
  } catch (e: any) {
    console.error(`[OCR] Failed to read image file for page ${pageIndex + 1}: ${e.message}`);
    return "";
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await visionClient.chat.completions.create({
        model: getOcrModel(),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract ALL text from this scanned document page. Preserve the original layout, formatting, paragraph structure, and table structure as much as possible. Include all headers, footers, page numbers, stamps, and any text visible on the page. Output ONLY the extracted text, nothing else.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageData}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_completion_tokens: 4096,
      }, { timeout: 120000 });

      const text = (response.choices[0].message.content || "").trim();
      return text;
    } catch (e: any) {
      if (attempt < MAX_RETRIES) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`[OCR] Vision API error on page ${pageIndex + 1} (attempt ${attempt}/${MAX_RETRIES}): ${e.message} — retrying in ${waitTime / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitTime));
      } else {
        console.error(`[OCR] Vision API error on page ${pageIndex + 1} (attempt ${attempt}/${MAX_RETRIES}): ${e.message} — giving up`);
        return "";
      }
    }
  }
  return "";
}

function spawnProcess(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    proc.on("error", (err) => reject(err));
  });
}

async function ocrPdf(pdfPath: string): Promise<string> {
  const tempDir = path.join(tmpdir(), `ocr-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const pdftoppmBin = findPdftoppm();
    console.log(`[OCR] Using pdftoppm: "${pdftoppmBin}" (POPPLER_PATH=${process.env.POPPLER_PATH || "not set"})`);
    console.log(`[OCR] PDF path: "${pdfPath}"`);
    const pagePrefix = path.join(tempDir, "page");
    const popplerResult = await spawnProcess(pdftoppmBin, ["-png", "-r", "300", pdfPath, pagePrefix]);
    if (popplerResult.code !== 0) {
      console.error(`[OCR] pdftoppm failed (code ${popplerResult.code}): ${popplerResult.stderr}`);
      return `[OCR failed: pdftoppm exited with code ${popplerResult.code}. Ensure POPPLER_PATH env var points to Poppler bin directory.]`;
    }

    const imageFiles = (await readdir(tempDir))
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => path.join(tempDir, f));

    if (imageFiles.length === 0) {
      return "[Scanned PDF: No pages could be converted for OCR]";
    }

    console.log(`[OCR] Converted ${imageFiles.length} pages at 300 DPI, preprocessing and sending to Vision API...`);

    for (const imgFile of imageFiles) {
      await preprocessImage(imgFile);
    }
    console.log(`[OCR] Preprocessed ${imageFiles.length} page images (grayscale, contrast, binarization)`);

    const pageTexts: string[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      const pageText = await ocrPageWithVision(imageFiles[i], i);
      if (pageText) {
        pageTexts.push(`--- Page ${i + 1} ---\n${pageText}`);
        console.log(`[OCR] Page ${i + 1}: extracted ${pageText.length} chars via Vision`);
      } else {
        console.log(`[OCR] Page ${i + 1}: no text extracted via Vision`);
      }
    }

    if (pageTexts.length === 0) {
      return "[Scanned PDF: Vision OCR produced no text from any page]";
    }

    const result = pageTexts.join("\n\n").trim();
    console.log(`[OCR] Total: ${result.length} chars from ${pageTexts.length}/${imageFiles.length} pages`);
    return result.length > 10 ? result : "[Scanned PDF: OCR produced minimal text]";
  } catch (error: any) {
    console.error(`[OCR] Error: ${error.message}`);
    return `[OCR failed: ${error.message}]`;
  } finally {
    try {
      const files = fs.readdirSync(tempDir);
      for (const f of files) fs.unlinkSync(path.join(tempDir, f));
      fs.rmdirSync(tempDir);
    } catch {}
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "[Empty DOCX document]";
}

async function parseEml(buffer: Buffer): Promise<string> {
  const parsed = await simpleParser(buffer);
  const parts = [];
  if (parsed.subject) parts.push(`Subject: ${parsed.subject}`);
  if (parsed.from?.text) parts.push(`From: ${parsed.from.text}`);
  if (parsed.to) {
    const toText = Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text;
    parts.push(`To: ${toText}`);
  }
  if (parsed.date) parts.push(`Date: ${parsed.date.toISOString()}`);
  if (parsed.text) parts.push(`\nBody:\n${parsed.text}`);
  else if (parsed.html) parts.push(`\nBody (HTML):\n${parsed.html}`);

  return parts.join("\n") || "[Empty email]";
}

async function parseMsg(buffer: Buffer): Promise<string> {
  try {
    const MsgReader = (MsgReaderModule as any).default || MsgReaderModule;
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const reader = new MsgReader(arrayBuffer);
    const fileData = reader.getFileData();
    const parts: string[] = [];

    if (fileData.senderName || fileData.senderEmail) {
      parts.push(`From: ${fileData.senderName || ""} ${fileData.senderEmail ? `<${fileData.senderEmail}>` : ""}`);
    }
    if (fileData.subject) {
      parts.push(`Subject: ${fileData.subject}`);
    }
    if ((fileData as any).recipients && Array.isArray((fileData as any).recipients)) {
      const recipients = (fileData as any).recipients.map((r: any) => r.name || r.email).filter(Boolean);
      if (recipients.length > 0) {
        parts.push(`To: ${recipients.join(", ")}`);
      }
    }
    if ((fileData as any).creationTime) {
      parts.push(`Date: ${(fileData as any).creationTime}`);
    }
    if (parts.length > 0) {
      parts.push("---");
    }
    if (fileData.body) {
      parts.push(fileData.body);
    } else {
      parts.push("[No text body found in MSG file]");
    }
    if (fileData.attachments && fileData.attachments.length > 0) {
      parts.push("\n--- Attachments ---");
      fileData.attachments.forEach((att: any, i: number) => {
        parts.push(`${i + 1}. ${att.fileName || att.name || "unnamed"}`);
      });
    }
    return parts.join("\n");
  } catch (error: any) {
    return `[MSG file parsing failed: ${error.message}]`;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailHtml(fields: { from?: string; to?: string; cc?: string; subject?: string; date?: string; body?: string; bodyHtml?: string; attachments?: string[] }): string {
  const headerRows = [
    fields.from ? `<tr><td class="label">From</td><td>${escapeHtml(fields.from)}</td></tr>` : "",
    fields.to ? `<tr><td class="label">To</td><td>${escapeHtml(fields.to)}</td></tr>` : "",
    fields.cc ? `<tr><td class="label">Cc</td><td>${escapeHtml(fields.cc)}</td></tr>` : "",
    fields.subject ? `<tr><td class="label">Subject</td><td><strong>${escapeHtml(fields.subject)}</strong></td></tr>` : "",
    fields.date ? `<tr><td class="label">Date</td><td>${escapeHtml(fields.date)}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  const attachmentSection = fields.attachments && fields.attachments.length > 0
    ? `<div class="attachments"><span class="label">Attachments:</span> ${fields.attachments.map(a => escapeHtml(a)).join(", ")}</div>`
    : "";

  const bodyContent = fields.bodyHtml
    ? fields.bodyHtml
    : fields.body
      ? `<pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit;margin:0;">${escapeHtml(fields.body)}</pre>`
      : "<p style='color:#888;'>No message body.</p>";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; background: #1a1a2e; color: #e0e0e0; line-height: 1.6; }
  .header { background: #16213e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .header table { width: 100%; border-collapse: collapse; }
  .header td { padding: 6px 12px; vertical-align: top; font-size: 14px; }
  .header td.label { color: #888; font-weight: 600; width: 80px; white-space: nowrap; }
  .body-content { background: #16213e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 20px; font-size: 14px; }
  .attachments { margin-top: 12px; padding: 10px 12px; background: #1a1a3e; border-radius: 6px; font-size: 13px; color: #aaa; }
  .attachments .label { font-weight: 600; }
  a { color: #6ea8fe; }
  pre { font-size: 14px; }
</style>
</head>
<body>
  <div class="header">
    <table>${headerRows}</table>
    ${attachmentSection}
  </div>
  <div class="body-content">${bodyContent}</div>
</body>
</html>`;
}

export async function renderEmailAsHtml(buffer: Buffer, ext: string): Promise<string> {
  if (ext === "msg") {
    try {
      const MsgReader = (MsgReaderModule as any).default || MsgReaderModule;
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const reader = new MsgReader(arrayBuffer);
      const data = reader.getFileData();
      const recipients = (data as any).recipients;
      const toList = recipients?.filter((r: any) => r.recipType === "to" || !r.recipType).map((r: any) => r.name || r.email).filter(Boolean) || [];
      const ccList = recipients?.filter((r: any) => r.recipType === "cc").map((r: any) => r.name || r.email).filter(Boolean) || [];
      const attachmentNames = data.attachments?.map((a: any) => a.fileName || a.name || "unnamed") || [];
      return buildEmailHtml({
        from: data.senderName ? `${data.senderName}${data.senderSmtpAddress ? ` <${data.senderSmtpAddress}>` : ""}` : undefined,
        to: toList.length > 0 ? toList.join(", ") : recipients?.map((r: any) => r.name || r.email).filter(Boolean).join(", "),
        cc: ccList.length > 0 ? ccList.join(", ") : undefined,
        subject: data.subject,
        date: data.clientSubmitTime ? new Date(data.clientSubmitTime).toLocaleString() : (data as any).creationTime ? new Date((data as any).creationTime).toLocaleString() : undefined,
        body: data.body,
        attachments: attachmentNames,
      });
    } catch (e: any) {
      return buildEmailHtml({ subject: "Error", body: `Failed to parse MSG file: ${e.message}` });
    }
  }

  if (ext === "eml") {
    try {
      const parsed = await simpleParser(buffer);
      const toText = parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(", ") : parsed.to.text) : undefined;
      const ccText = parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.map(t => t.text).join(", ") : parsed.cc.text) : undefined;
      const attachmentNames = parsed.attachments?.map(a => a.filename || "unnamed") || [];
      return buildEmailHtml({
        from: parsed.from?.text,
        to: toText,
        cc: ccText,
        subject: parsed.subject,
        date: parsed.date?.toLocaleString(),
        bodyHtml: typeof parsed.html === "string" ? parsed.html : undefined,
        body: !parsed.html ? parsed.text : undefined,
        attachments: attachmentNames,
      });
    } catch (e: any) {
      return buildEmailHtml({ subject: "Error", body: `Failed to parse EML file: ${e.message}` });
    }
  }

  return buildEmailHtml({ subject: "Unsupported", body: "This file type cannot be previewed as email." });
}

export function getFileExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  return ext;
}

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "eml", "msg", "txt"];

export function isSupportedFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return SUPPORTED_EXTENSIONS.includes(ext);
}
