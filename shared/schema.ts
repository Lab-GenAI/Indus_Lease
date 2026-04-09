import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  siteId: text("site_id").notNull().unique(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSiteSchema = createInsertSchema(sites).omit({ id: true, createdAt: true });
export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;

export const leases = pgTable("leases", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
  leaseNumber: text("lease_number").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertLeaseSchema = createInsertSchema(leases).omit({ id: true, createdAt: true });
export type Lease = typeof leases.$inferSelect;
export type InsertLease = z.infer<typeof insertLeaseSchema>;

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  leaseId: integer("lease_id").notNull().references(() => leases.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true });
export type LeaseFile = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  category: text("category"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTagSchema = createInsertSchema(tags).omit({ id: true, createdAt: true });
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

export const extractions = pgTable("extractions", {
  id: serial("id").primaryKey(),
  leaseId: integer("lease_id").notNull().references(() => leases.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  results: jsonb("results").$type<Record<string, string>>(),
  extractedAt: timestamp("extracted_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertExtractionSchema = createInsertSchema(extractions).omit({ id: true, createdAt: true });
export type Extraction = typeof extractions.$inferSelect;
export type InsertExtraction = z.infer<typeof insertExtractionSchema>;

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  leaseId: integer("lease_id").notNull().references(() => leases.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  fileName: text("file_name").notNull(),
});

export type DocumentChunk = typeof documentChunks.$inferSelect;

export const costLogs = pgTable("cost_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  leaseId: integer("lease_id").references(() => leases.id, { onDelete: "cascade" }),
  siteId: integer("site_id").references(() => sites.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  costInr: real("cost_inr").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCostLogSchema = createInsertSchema(costLogs).omit({ id: true, createdAt: true });
export type CostLog = typeof costLogs.$inferSelect;
export type InsertCostLog = z.infer<typeof insertCostLogSchema>;

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

export { conversations, messages } from "./models/chat";
