import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === ENUMS ===
export const mtrStatusEnum = pgEnum("mtr_status", ["PENDENTE", "VALIDO", "ERRO", "ENVIADO", "PROCESSADO"]);
export const logLevelEnum = pgEnum("log_level", ["INFO", "WARN", "ERROR"]);

// === TABLE DEFINITIONS ===

// Main MTR Header table
export const mtrs = pgTable("mtrs", {
  id: serial("id").primaryKey(),
  mtrCode: text("mtr_code").notNull().unique(), // Nº MTR
  manifestType: text("manifest_type"), // Tipo Manifesto
  emissionDate: timestamp("emission_date"), // Data de Emissão
  
  // Entities
  generatorName: text("generator_name"), // Gerador (Nome)
  generatorCnpj: text("generator_cnpj"), // Gerador (CNPJ/CPF)
  transporterName: text("transporter_name"),
  transporterCnpj: text("transporter_cnpj"),
  receiverName: text("receiver_name"),
  receiverCnpj: text("receiver_cnpj"),
  
  // Status & Workflow
  sinirStatus: text("sinir_status"), // Situação (from Excel)
  systemStatus: mtrStatusEnum("system_status").default("PENDENTE"), // Internal status
  
  // Validation flags
  isValid: boolean("is_valid").default(false),
  validationErrors: jsonb("validation_errors").$type<string[]>(),
  
  // Audit
  importedAt: timestamp("imported_at").defaultNow(),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
});

// MTR Items (Residuos)
export const mtrItems = pgTable("mtr_items", {
  id: serial("id").primaryKey(),
  mtrId: integer("mtr_id").references(() => mtrs.id).notNull(),
  
  code: text("code"), // Resíduo Cód
  description: text("description"), // Resíduo Descrição
  quantity: decimal("quantity", { precision: 10, scale: 3 }), // Quantidade indicada
  unit: text("unit"), // Unidade
  treatment: text("treatment"), // Tratamento
  class: text("class"), // Classe
});

// Logs (Application & Batch)
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  level: logLevelEnum("level").default("INFO"),
  category: text("category"), // e.g., 'IMPORT', 'VALIDATION', 'API'
  message: text("message").notNull(),
  details: jsonb("details"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// === RELATIONS ===
export const mtrsRelations = relations(mtrs, ({ many }) => ({
  items: many(mtrItems),
}));

export const mtrItemsRelations = relations(mtrItems, ({ one }) => ({
  mtr: one(mtrs, {
    fields: [mtrItems.mtrId],
    references: [mtrs.id],
  }),
}));

// === SCHEMAS ===
export const insertMtrSchema = createInsertSchema(mtrs).omit({ 
  id: true, 
  importedAt: true, 
  lastUpdatedAt: true 
});

export const insertMtrItemSchema = createInsertSchema(mtrItems).omit({ 
  id: true 
});

export const insertLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  timestamp: true
});

// === API TYPES ===
export type Mtr = typeof mtrs.$inferSelect;
export type MtrItem = typeof mtrItems.$inferSelect;
export type SystemLog = typeof systemLogs.$inferSelect;

export type MtrWithItems = Mtr & { items: MtrItem[] };

// Request types
export type UpdateMtrRequest = Partial<z.infer<typeof insertMtrSchema>> & {
  items?: Partial<z.infer<typeof insertMtrItemSchema>>[];
};

export type BatchProcessRequest = {
  mtrIds: number[];
  mode: 'SIMULATED' | 'REAL';
};

export type LogStats = {
  total: number;
  errors: number;
  warnings: number;
};
