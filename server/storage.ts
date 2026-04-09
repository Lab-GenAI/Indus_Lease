import { eq, desc, sql, count, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  sites, leases, files, tags, extractions,
  type Site, type InsertSite,
  type Lease, type InsertLease,
  type LeaseFile, type InsertFile,
  type Tag, type InsertTag,
  type Extraction, type InsertExtraction,
} from "@shared/schema";

export interface IStorage {
  getSites(): Promise<(Site & { leaseCount: number; fileCount: number; vectorized: boolean; extractionStatus: string })[]>;
  getSite(id: number): Promise<Site | undefined>;
  getSiteByName(siteId: string): Promise<Site | undefined>;
  createSite(data: InsertSite): Promise<Site>;
  deleteSite(id: number): Promise<void>;
  deleteAllSites(): Promise<void>;

  getLeasesBySite(siteId: number): Promise<Lease[]>;
  getLease(id: number): Promise<Lease | undefined>;
  getLeaseByNumber(siteId: number, leaseNumber: string): Promise<Lease | undefined>;
  createLease(data: InsertLease): Promise<Lease>;
  updateLeaseStatus(id: number, status: string): Promise<void>;

  getFilesByLease(leaseId: number): Promise<LeaseFile[]>;
  createFile(data: InsertFile): Promise<LeaseFile>;

  getTags(): Promise<Tag[]>;
  getTag(id: number): Promise<Tag | undefined>;
  createTag(data: InsertTag): Promise<Tag>;
  updateTag(id: number, data: Partial<InsertTag>): Promise<Tag>;
  deleteTag(id: number): Promise<void>;
  deleteAllTags(): Promise<void>;

  getExtractions(): Promise<(Extraction & { leaseNumber: string; siteId: string })[]>;
  getExtractionByLease(leaseId: number): Promise<Extraction | undefined>;
  createExtraction(data: InsertExtraction): Promise<Extraction>;
  updateExtraction(id: number, data: Partial<{ status: string; results: Record<string, string>; extractedAt: Date }>): Promise<void>;
  deleteExtraction(id: number): Promise<void>;
  deleteExtractions(ids: number[]): Promise<void>;

  getFile(id: number): Promise<LeaseFile | undefined>;

  getDashboardStats(): Promise<{
    totalSites: number;
    totalLeases: number;
    totalFiles: number;
    totalTags: number;
    extractionStats: { pending: number; processing: number; completed: number; failed: number };
    recentExtractions: (Extraction & { leaseNumber: string; siteId: string })[];
    fileTypeDistribution: Record<string, number>;
  }>;
}

class DatabaseStorage implements IStorage {
  async getSites() {
    const result = await db.execute(sql`
      SELECT s.*,
        COALESCE((SELECT COUNT(*) FROM leases l WHERE l.site_id = s.id), 0)::int AS lease_count,
        COALESCE((SELECT COUNT(*) FROM files f JOIN leases l ON f.lease_id = l.id WHERE l.site_id = s.id), 0)::int AS file_count,
        COALESCE((SELECT COUNT(*) FROM document_chunks dc JOIN leases l ON dc.lease_id = l.id WHERE l.site_id = s.id), 0)::int AS chunk_count,
        COALESCE((SELECT COUNT(*) FROM leases l WHERE l.site_id = s.id), 0)::int AS total_leases,
        COALESCE((SELECT COUNT(*) FROM extractions e JOIN leases l ON e.lease_id = l.id WHERE l.site_id = s.id AND e.status = 'completed'), 0)::int AS completed_extractions
      FROM sites s
      ORDER BY s.created_at DESC
    `);
    return (result.rows as any[]).map((r) => ({
      id: r.id,
      siteId: r.site_id,
      createdAt: r.created_at,
      leaseCount: r.lease_count,
      fileCount: r.file_count,
      vectorized: r.chunk_count > 0,
      extractionStatus: r.total_leases > 0 && r.completed_extractions === r.total_leases ? "completed" : r.completed_extractions > 0 ? "partial" : "none",
    }));
  }

  async getSite(id: number) {
    const [site] = await db.select().from(sites).where(eq(sites.id, id));
    return site;
  }

  async getSiteByName(siteId: string) {
    const [site] = await db.select().from(sites).where(eq(sites.siteId, siteId));
    return site;
  }

  async createSite(data: InsertSite) {
    const [site] = await db.insert(sites).values(data).returning();
    return site;
  }

  async deleteSite(id: number) {
    await db.delete(sites).where(eq(sites.id, id));
  }

  async deleteAllSites() {
    await db.delete(sites);
  }

  async getLeasesBySite(siteId: number) {
    return db.select().from(leases).where(eq(leases.siteId, siteId)).orderBy(leases.leaseNumber);
  }

  async getLease(id: number) {
    const [lease] = await db.select().from(leases).where(eq(leases.id, id));
    return lease;
  }

  async getLeaseByNumber(siteId: number, leaseNumber: string) {
    const [lease] = await db.select().from(leases)
      .where(sql`${leases.siteId} = ${siteId} AND ${leases.leaseNumber} = ${leaseNumber}`);
    return lease;
  }

  async createLease(data: InsertLease) {
    const [lease] = await db.insert(leases).values(data).returning();
    return lease;
  }

  async updateLeaseStatus(id: number, status: string) {
    await db.update(leases).set({ status }).where(eq(leases.id, id));
  }

  async getFilesByLease(leaseId: number) {
    return db.select().from(files).where(eq(files.leaseId, leaseId));
  }

  async createFile(data: InsertFile) {
    const [file] = await db.insert(files).values(data).returning();
    return file;
  }

  async getTags() {
    return db.select().from(tags).orderBy(tags.name);
  }

  async getTag(id: number) {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }

  async createTag(data: InsertTag) {
    const [tag] = await db.insert(tags).values(data).returning();
    return tag;
  }

  async updateTag(id: number, data: Partial<InsertTag>) {
    const [tag] = await db.update(tags).set(data).where(eq(tags.id, id)).returning();
    return tag;
  }

  async deleteTag(id: number) {
    await db.delete(tags).where(eq(tags.id, id));
  }

  async deleteAllTags() {
    await db.delete(tags);
  }

  async getExtractions() {
    const result = await db.execute(sql`
      SELECT e.*, l.lease_number, s.site_id
      FROM extractions e
      JOIN leases l ON e.lease_id = l.id
      JOIN sites s ON l.site_id = s.id
      ORDER BY e.created_at DESC
    `);
    return (result.rows as any[]).map((r) => ({
      id: r.id,
      leaseId: r.lease_id,
      status: r.status,
      results: r.results,
      extractedAt: r.extracted_at,
      createdAt: r.created_at,
      leaseNumber: r.lease_number,
      siteId: r.site_id,
    }));
  }

  async getExtractionByLease(leaseId: number) {
    const [ext] = await db.select().from(extractions).where(eq(extractions.leaseId, leaseId));
    return ext;
  }

  async createExtraction(data: InsertExtraction) {
    const [ext] = await db.insert(extractions).values(data).returning();
    return ext;
  }

  async updateExtraction(id: number, data: Partial<{ status: string; results: Record<string, string>; extractedAt: Date }>) {
    await db.update(extractions).set(data).where(eq(extractions.id, id));
  }

  async deleteExtraction(id: number) {
    await db.delete(extractions).where(eq(extractions.id, id));
  }

  async deleteExtractions(ids: number[]) {
    await db.delete(extractions).where(inArray(extractions.id, ids));
  }

  async getFile(id: number) {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async getDashboardStats() {
    const [siteCount] = await db.select({ count: count() }).from(sites);
    const [leaseCount] = await db.select({ count: count() }).from(leases);
    const [fileCount] = await db.select({ count: count() }).from(files);
    const [tagCount] = await db.select({ count: count() }).from(tags);

    const extractionStatusResult = await db.execute(sql`
      SELECT status, COUNT(*)::int as count FROM extractions GROUP BY status
    `);
    const extractionStats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    (extractionStatusResult.rows as any[]).forEach((r) => {
      if (r.status in extractionStats) {
        (extractionStats as any)[r.status] = r.count;
      }
    });

    const recentResult = await db.execute(sql`
      SELECT e.*, l.lease_number, s.site_id
      FROM extractions e
      JOIN leases l ON e.lease_id = l.id
      JOIN sites s ON l.site_id = s.id
      ORDER BY e.created_at DESC
      LIMIT 5
    `);

    const fileTypeResult = await db.execute(sql`
      SELECT file_type, COUNT(*)::int as count FROM files GROUP BY file_type
    `);
    const fileTypeDistribution: Record<string, number> = {};
    (fileTypeResult.rows as any[]).forEach((r) => {
      fileTypeDistribution[r.file_type] = r.count;
    });

    return {
      totalSites: siteCount.count,
      totalLeases: leaseCount.count,
      totalFiles: fileCount.count,
      totalTags: tagCount.count,
      extractionStats,
      recentExtractions: (recentResult.rows as any[]).map((r) => ({
        id: r.id,
        leaseId: r.lease_id,
        status: r.status,
        results: r.results,
        extractedAt: r.extracted_at,
        createdAt: r.created_at,
        leaseNumber: r.lease_number,
        siteId: r.site_id,
      })),
      fileTypeDistribution,
    };
  }
}

export const storage = new DatabaseStorage();
