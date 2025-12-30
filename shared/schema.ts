import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === ENUMS ===
export const mtrStatusEnum = pgEnum("mtr_status", ["PENDENTE", "VALIDO", "ERRO", "ENVIADO", "PROCESSADO"]);
export const logLevelEnum = pgEnum("log_level", ["INFO", "WARN", "ERROR"]);
export const platformEnum = pgEnum("platform", ["SINIR", "IEMA"]);

// === TABLE DEFINITIONS ===

// Main MTR Header table
export const mtrs = pgTable("mtrs", {
  id: serial("id").primaryKey(),
  mtrCode: text("mtr_code").notNull().unique(), // Nº MTR
  platform: platformEnum("platform").default("SINIR"), // SINIR or IEMA
  manifestType: text("manifest_type"), // Tipo Manifesto
  emissionDate: timestamp("emission_date"), // Data de Emissão
  
  // Entities
  generatorName: text("generator_name"), // Gerador (Nome)
  generatorCnpj: text("generator_cnpj"), // Gerador (CNPJ/CPF)
  transporterName: text("transporter_name"),
  transporterCnpj: text("transporter_cnpj"),
  receiverName: text("receiver_name"),
  receiverCnpj: text("receiver_cnpj"),
  
  // Transport info for SINIR receiving
  motorista: text("motorista"), // Nome do motorista
  placa: text("placa"), // Placa do veículo
  responsavelRecebimento: text("responsavel_recebimento"), // Responsável pelo recebimento
  justificativa: text("justificativa"), // Justificativa (caso quantidade diferente)
  
  // Status & Workflow
  sinirStatus: text("sinir_status"), // Situação (from Excel)
  systemStatus: mtrStatusEnum("system_status").default("PENDENTE"), // Internal status
  
  // Observations for SINIR API
  observations: text("observations"), // Observações para envio ao SINIR
  
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
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 3 }), // Quantidade recebida
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

// SINIR Configuration
export const sinirConfig = pgTable("sinir_config", {
  id: serial("id").primaryKey(),
  cnpj: text("cnpj"),
  usuario: text("usuario"),
  senha: text("senha"),
  unidade: text("unidade"),
  token: text("token"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// IEMA Configuration (Espírito Santo)
export const iemaConfig = pgTable("iema_config", {
  id: serial("id").primaryKey(),
  pessoaCodigo: integer("pessoa_codigo"), // Código da Unidade
  pessoaCnpj: text("pessoa_cnpj"), // CNPJ da empresa
  usuarioCpf: text("usuario_cpf"), // CPF do usuário
  senha: text("senha"),
  token: text("token"),
  tokenExpiresAt: timestamp("token_expires_at"), // Token válido por 1 hora
  ambiente: text("ambiente").default("producao"), // homologacao ou producao
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Classification Data (from internal spreadsheet)
export const classificationData = pgTable("classification_data", {
  id: serial("id").primaryKey(),
  mtrCode: text("mtr_code").notNull(), // iMTR - key to match with MTRs
  platform: platformEnum("platform").default("SINIR"), // Platform this classification belongs to
  placa: text("placa"), // Placa (Transp)
  cnpj: text("cnpj"), // CNPJ do gerador
  quantityEstimated: decimal("quantity_estimated", { precision: 10, scale: 3 }), // Qde Estimada
  movementDate: timestamp("movement_date"), // Data da Movimentação
  quantity: decimal("quantity", { precision: 10, scale: 3 }), // Qtd.
  productCode: text("product_code"), // Produto
  productName: text("product_name"), // Nome do Produto
  transporterName: text("transporter_name"), // Transportadora
  unit: text("unit"), // UDM
  customerWeight: decimal("customer_weight", { precision: 10, scale: 3 }), // Peso (Cliente)
  supplyWeight: decimal("supply_weight", { precision: 10, scale: 3 }), // Peso (Supply)
  ibamaName: text("ibama_name"), // ibama_name (classificação IBAMA)
  importedAt: timestamp("imported_at").defaultNow(),
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

export const insertSinirConfigSchema = createInsertSchema(sinirConfig).omit({
  id: true,
  updatedAt: true
});

export const insertIemaConfigSchema = createInsertSchema(iemaConfig).omit({
  id: true,
  updatedAt: true
});

export const insertClassificationDataSchema = createInsertSchema(classificationData).omit({
  id: true,
  importedAt: true
});

// === API TYPES ===
export type Mtr = typeof mtrs.$inferSelect;
export type MtrItem = typeof mtrItems.$inferSelect;
export type SystemLog = typeof systemLogs.$inferSelect;
export type SinirConfig = typeof sinirConfig.$inferSelect;
export type IemaConfig = typeof iemaConfig.$inferSelect;
export type ClassificationData = typeof classificationData.$inferSelect;
export type InsertSinirConfig = z.infer<typeof insertSinirConfigSchema>;
export type InsertIemaConfig = z.infer<typeof insertIemaConfigSchema>;
export type InsertMtr = z.infer<typeof insertMtrSchema>;
export type InsertMtrItem = z.infer<typeof insertMtrItemSchema>;
export type InsertClassificationData = z.infer<typeof insertClassificationDataSchema>;
export type Platform = "SINIR" | "IEMA";

export type MtrWithItems = Mtr & { items: MtrItem[] };

// Request types - includes observations and properly typed items with id
export type UpdateMtrRequest = Partial<z.infer<typeof insertMtrSchema>> & {
  items?: Array<{
    id: number;
    quantity?: number | string;
    quantityReceived?: number | string | null;
    unit?: string | null;
    treatment?: string | null;
  }>;
};

export type BatchProcessRequest = {
  mtrIds: number[];
  mode: 'SIMULATED' | 'REAL';
  platform?: Platform;
};

export type LogStats = {
  total: number;
  errors: number;
  warnings: number;
};
