import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";
import { getFileExtension, isSupportedFile } from "./document-parser";
import { extractTagsFromLease } from "./extractor";
import { vectorizeFile } from "./vectorizer";
import { emitProgress, subscribe, unsubscribe, generateTaskId } from "./progress";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { costLogs } from "@shared/schema";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + file.originalname);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 2000 },
});

const tagUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/dashboard/stats", async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sites", async (_req, res) => {
    try {
      const sites = await storage.getSites();
      res.json(sites);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/sites/:id", async (req, res) => {
    try {
      const siteId = parseInt(req.params.id);
      const site = await storage.getSite(siteId);
      if (!site) return res.status(404).json({ message: "Site not found" });

      const leasesList = await storage.getLeasesBySite(siteId);
      const leasesWithDetails = await Promise.all(
        leasesList.map(async (lease) => {
          const leaseFiles = await storage.getFilesByLease(lease.id);
          const extraction = await storage.getExtractionByLease(lease.id);
          return { ...lease, files: leaseFiles, extraction };
        })
      );

      res.json({ ...site, leases: leasesWithDetails });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/sites", async (req, res) => {
    try {
      await storage.deleteAllSites();
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/sites/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const site = await storage.getSite(id);
      if (!site) return res.status(404).json({ message: "Site not found" });
      await storage.deleteSite(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/upload-folder", upload.array("files", 2000), async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[];
      const paths = req.body.paths as string | string[];
      const pathsArray = Array.isArray(paths) ? paths : [paths];

      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      let sitesCreated = 0;
      let leasesCreated = 0;
      let filesCreated = 0;
      const createdFiles: any[] = [];

      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        const relativePath = pathsArray[i] || file.originalname;

        const parts = relativePath.split("/").filter(Boolean);
        if (parts.length < 2) continue;

        const siteIdName = parts[0];
        const leaseNumber = parts[1];
        const fileName = parts[parts.length - 1];

        if (!isSupportedFile(fileName)) continue;

        let site = await storage.getSiteByName(siteIdName);
        if (!site) {
          site = await storage.createSite({ siteId: siteIdName });
          sitesCreated++;
        }

        let lease = await storage.getLeaseByNumber(site.id, leaseNumber);
        if (!lease) {
          lease = await storage.createLease({ siteId: site.id, leaseNumber });
          leasesCreated++;
        }

        const fileType = getFileExtension(fileName);
        const createdFile = await storage.createFile({
          leaseId: lease.id,
          fileName,
          fileType,
          filePath: file.path,
          fileSize: file.size,
        });
        (createdFile as any)._siteId = site.id;
        createdFiles.push(createdFile);
        filesCreated++;
      }

      const taskId = generateTaskId();

      res.json({
        message: "Folder processed successfully",
        sitesCreated,
        leasesCreated,
        filesCreated,
        taskId,
      });

      const validFiles = createdFiles;
      if (validFiles.length > 0) {
        (async () => {
          console.log(`Starting background vectorization for ${validFiles.length} files...`);
          let vectorized = 0;
          emitProgress({ taskId, type: "upload", status: "in_progress", current: 0, total: validFiles.length, message: "Starting document vectorization..." });
          let chunksTotal = 0;
          for (const file of validFiles) {
            try {
              const chunks = await vectorizeFile(file, (file as any)._siteId);
              vectorized++;
              chunksTotal += chunks;
              emitProgress({ taskId, type: "upload", status: "in_progress", current: vectorized, total: validFiles.length, message: `Vectorizing documents...`, detail: chunks > 0 ? `${file.fileName} (${chunks} chunks)` : `${file.fileName} (no text extracted)` });
            } catch (err: any) {
              console.error(`Vectorization failed for ${file.fileName}:`, err.message);
              vectorized++;
              emitProgress({ taskId, type: "upload", status: "in_progress", current: vectorized, total: validFiles.length, message: `Vectorizing documents...`, detail: `Failed: ${file.fileName}` });
            }
          }
          emitProgress({ taskId, type: "upload", status: "completed", current: validFiles.length, total: validFiles.length, message: `Vectorization complete: ${vectorized} files, ${chunksTotal} chunks stored` });
          console.log(`Background vectorization complete: ${vectorized}/${validFiles.length} files processed.`);
        })();
      } else {
        emitProgress({ taskId, type: "upload", status: "completed", current: 0, total: 0, message: "No files to vectorize" });
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tags", async (_req, res) => {
    try {
      const tagsList = await storage.getTags();
      res.json(tagsList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tags", async (req, res) => {
    try {
      const { name, description, category } = req.body;
      if (!name) return res.status(400).json({ message: "Tag name is required" });
      const tag = await storage.createTag({ name, description, category });
      res.status(201).json(tag);
    } catch (error: any) {
      if (error.message?.includes("unique") || error.code === "23505") {
        return res.status(409).json({ message: "A tag with this name already exists" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/tags/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, description, category } = req.body;
      const tag = await storage.updateTag(id, { name, description, category });
      res.json(tag);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/tags", async (req, res) => {
    try {
      await storage.deleteAllTags();
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/tags/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTag(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/tags/template", (_req, res) => {
    try {
      const templateData = [
        { Name: "Example Tag Name", Description: "What this tag extracts from documents", Category: "Financial" },
        { Name: "Annual Rent", Description: "The total annual rent amount", Category: "Financial" },
        { Name: "Lease Start Date", Description: "The date when the lease begins", Category: "Dates" },
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(templateData);
      ws["!cols"] = [{ wch: 25 }, { wch: 45 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, "Tags");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", "attachment; filename=tag_import_template.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tags/upload", tagUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });

      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

      let imported = 0;
      let skipped = 0;

      for (const row of data) {
        const name = row["name"] || row["Name"] || row["TAG"] || row["tag"] || row["Tag Name"] || row["Tag"] || Object.values(row)[0];
        if (!name || typeof name !== "string") continue;

        const description = row["description"] || row["Description"] || row["desc"] || "";
        const category = row["category"] || row["Category"] || row["cat"] || "";

        try {
          await storage.createTag({
            name: name.trim(),
            description: description ? String(description).trim() : undefined,
            category: category ? String(category).trim() : undefined,
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      res.json({ imported, skipped, total: data.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/extractions", async (_req, res) => {
    try {
      const extractionsList = await storage.getExtractions();
      res.json(extractionsList);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/extractions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteExtraction(id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/extractions/delete-batch", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No extraction IDs provided" });
      }
      await storage.deleteExtractions(ids);
      res.json({ deleted: ids.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/files/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const file = await storage.getFile(id);
      if (!file) return res.status(404).json({ message: "File not found" });

      const filePath = file.filePath;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }

      const ext = file.fileType.toLowerCase();

      if (ext === "msg" || ext === "eml") {
        const { renderEmailAsHtml } = await import("./document-parser");
        const buffer = fs.readFileSync(filePath);
        const html = await renderEmailAsHtml(buffer, ext);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
        return;
      }

      const mimeTypes: Record<string, string> = {
        pdf: "application/pdf",
        txt: "text/plain",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };

      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/files/:id/content", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const file = await storage.getFile(id);
      if (!file) return res.status(404).json({ message: "File not found" });

      const filePath = file.filePath;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }

      const { parseDocument } = await import("./document-parser");
      const content = await parseDocument(filePath, file.fileType);
      res.json({ fileName: file.fileName, fileType: file.fileType, content });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/extractions/start/:leaseId", async (req, res) => {
    try {
      const leaseId = parseInt(req.params.leaseId);
      const lease = await storage.getLease(leaseId);
      if (!lease) return res.status(404).json({ message: "Lease not found" });

      let extraction = await storage.getExtractionByLease(leaseId);
      if (extraction && extraction.status === "processing") {
        return res.status(409).json({ message: "Extraction already in progress" });
      }

      if (extraction) {
        await storage.updateExtraction(extraction.id, { status: "processing", results: undefined as any });
      } else {
        extraction = await storage.createExtraction({ leaseId, status: "processing" });
      }

      const taskId = generateTaskId();
      res.json({ message: "Extraction started", extractionId: extraction.id, taskId });

      (async () => {
        try {
          const results = await extractTagsFromLease(leaseId, taskId, lease.siteId);
          await storage.updateExtraction(extraction!.id, {
            status: "completed",
            results,
            extractedAt: new Date(),
          });
          await storage.updateLeaseStatus(leaseId, "extracted");
        } catch (error: any) {
          console.error("Extraction failed:", error);
          emitProgress({ taskId, type: "extraction", status: "failed", current: 0, total: 0, message: error.message || "Extraction failed" });
          await storage.updateExtraction(extraction!.id, { status: "failed" });
        }
      })();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/extractions/start-site/:siteId", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const site = await storage.getSite(siteId);
      if (!site) return res.status(404).json({ message: "Site not found" });

      const leasesList = await storage.getLeasesBySite(siteId);
      if (leasesList.length === 0) {
        return res.status(400).json({ message: "No leases found for this site" });
      }

      const taskId = generateTaskId();
      const started: number[] = [];
      const skipped: number[] = [];
      const leaseTaskIds: Record<number, string> = {};

      for (const lease of leasesList) {
        let extraction = await storage.getExtractionByLease(lease.id);
        if (extraction && extraction.status === "processing") {
          skipped.push(lease.id);
          continue;
        }
        if (extraction) {
          await storage.updateExtraction(extraction.id, { status: "processing", results: undefined as any });
        } else {
          extraction = await storage.createExtraction({ leaseId: lease.id, status: "processing" });
        }
        started.push(lease.id);
        leaseTaskIds[lease.id] = generateTaskId();

        const extId = extraction.id;
        const lId = lease.id;
        const leaseTaskId = leaseTaskIds[lease.id];
        (async () => {
          try {
            const results = await extractTagsFromLease(lId, leaseTaskId, siteId);
            await storage.updateExtraction(extId, {
              status: "completed",
              results,
              extractedAt: new Date(),
            });
            await storage.updateLeaseStatus(lId, "extracted");
          } catch (error: any) {
            console.error(`Extraction failed for lease ${lId}:`, error);
            emitProgress({ taskId: leaseTaskId, type: "extraction", status: "failed", current: 0, total: 0, message: error.message || "Extraction failed" });
            await storage.updateExtraction(extId, { status: "failed" });
          }
        })();
      }

      res.json({ message: "Site extraction started", started: started.length, skipped: skipped.length, taskId, leaseTaskIds });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/extractions/start-sites", async (req, res) => {
    try {
      const { siteIds } = req.body;
      if (!Array.isArray(siteIds) || siteIds.length === 0) {
        return res.status(400).json({ message: "siteIds array is required" });
      }

      const taskId = generateTaskId();
      let totalStarted = 0;
      let totalSkipped = 0;
      const leaseTaskIds: Record<number, string> = {};

      for (const siteId of siteIds) {
        const site = await storage.getSite(siteId);
        if (!site) continue;

        const leasesList = await storage.getLeasesBySite(siteId);

        for (const lease of leasesList) {
          let extraction = await storage.getExtractionByLease(lease.id);
          if (extraction && extraction.status === "processing") {
            totalSkipped++;
            continue;
          }
          if (extraction) {
            await storage.updateExtraction(extraction.id, { status: "processing", results: undefined as any });
          } else {
            extraction = await storage.createExtraction({ leaseId: lease.id, status: "processing" });
          }
          totalStarted++;
          leaseTaskIds[lease.id] = generateTaskId();

          const extId = extraction.id;
          const lId = lease.id;
          const leaseTaskId = leaseTaskIds[lease.id];
          const currentSiteId = siteId;
          (async () => {
            try {
              const results = await extractTagsFromLease(lId, leaseTaskId, currentSiteId);
              await storage.updateExtraction(extId, {
                status: "completed",
                results,
                extractedAt: new Date(),
              });
              await storage.updateLeaseStatus(lId, "extracted");
            } catch (error: any) {
              console.error(`Extraction failed for lease ${lId}:`, error);
              emitProgress({ taskId: leaseTaskId, type: "extraction", status: "failed", current: 0, total: 0, message: error.message || "Extraction failed" });
              await storage.updateExtraction(extId, { status: "failed" });
            }
          })();
        }
      }

      res.json({ message: "Batch extraction started", started: totalStarted, skipped: totalSkipped, taskId, leaseTaskIds });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/costs/summary", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          COALESCE(SUM(cost_inr), 0)::real AS total_inr,
          COALESCE(SUM(cost_usd), 0)::real AS total_usd,
          COALESCE(SUM(CASE WHEN type = 'embedding' THEN cost_inr ELSE 0 END), 0)::real AS embedding_inr,
          COALESCE(SUM(CASE WHEN type = 'embedding' THEN cost_usd ELSE 0 END), 0)::real AS embedding_usd,
          COALESCE(SUM(CASE WHEN type = 'extraction' THEN cost_inr ELSE 0 END), 0)::real AS extraction_inr,
          COALESCE(SUM(CASE WHEN type = 'extraction' THEN cost_usd ELSE 0 END), 0)::real AS extraction_usd,
          COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
          COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens,
          COALESCE(SUM(total_tokens), 0)::int AS total_tokens
        FROM cost_logs
      `);
      const row = (result.rows as any[])[0] || {};
      res.json({
        totalInr: row.total_inr || 0,
        totalUsd: row.total_usd || 0,
        embeddingInr: row.embedding_inr || 0,
        embeddingUsd: row.embedding_usd || 0,
        extractionInr: row.extraction_inr || 0,
        extractionUsd: row.extraction_usd || 0,
        totalInputTokens: row.total_input_tokens || 0,
        totalOutputTokens: row.total_output_tokens || 0,
        totalTokens: row.total_tokens || 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/costs/by-site", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          s.id AS site_id,
          s.site_id AS site_name,
          COALESCE(SUM(c.cost_inr), 0)::real AS total_inr,
          COALESCE(SUM(c.cost_usd), 0)::real AS total_usd,
          COALESCE(SUM(CASE WHEN c.type = 'embedding' THEN c.cost_inr ELSE 0 END), 0)::real AS embedding_inr,
          COALESCE(SUM(CASE WHEN c.type = 'extraction' THEN c.cost_inr ELSE 0 END), 0)::real AS extraction_inr
        FROM sites s
        LEFT JOIN cost_logs c ON c.site_id = s.id
        GROUP BY s.id, s.site_id
        ORDER BY total_inr DESC
      `);
      res.json((result.rows as any[]).map((r) => ({
        siteId: r.site_id,
        siteName: r.site_name,
        totalInr: r.total_inr || 0,
        totalUsd: r.total_usd || 0,
        embeddingInr: r.embedding_inr || 0,
        extractionInr: r.extraction_inr || 0,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/costs/by-lease/:siteId", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) return res.status(400).json({ message: "Invalid siteId" });
      const result = await db.execute(sql`
        SELECT
          l.id AS lease_id,
          l.lease_number,
          COALESCE(SUM(c.cost_inr), 0)::real AS total_inr,
          COALESCE(SUM(c.cost_usd), 0)::real AS total_usd,
          COALESCE(SUM(CASE WHEN c.type = 'embedding' THEN c.cost_inr ELSE 0 END), 0)::real AS embedding_inr,
          COALESCE(SUM(CASE WHEN c.type = 'extraction' THEN c.cost_inr ELSE 0 END), 0)::real AS extraction_inr
        FROM leases l
        LEFT JOIN cost_logs c ON c.lease_id = l.id
        WHERE l.site_id = ${siteId}
        GROUP BY l.id, l.lease_number
        ORDER BY total_inr DESC
      `);
      res.json((result.rows as any[]).map((r) => ({
        leaseId: r.lease_id,
        leaseNumber: r.lease_number,
        totalInr: r.total_inr || 0,
        totalUsd: r.total_usd || 0,
        embeddingInr: r.embedding_inr || 0,
        extractionInr: r.extraction_inr || 0,
      })));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/progress/:taskId", (req, res) => {
    const { taskId } = req.params;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const callback = (data: any) => {
      sendEvent(data);
    };

    subscribe(taskId, callback);

    req.on("close", () => {
      unsubscribe(taskId, callback);
    });
  });

  return httpServer;
}
