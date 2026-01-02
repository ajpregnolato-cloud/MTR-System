import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import * as xlsx from "xlsx";
import { storage } from "./storage";
import { sessionStorage, type SessionMtr, type SendResult } from "./session-storage";
import { generateResultLog, getLogFilename } from "./result-log-generator";
import { api } from "@shared/routes";
import { z } from "zod";
import { SinirService } from "./sinir";
import type { Platform } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

// Helper to parse Excel dates (can be string or number)
function parseExcelDate(value: any): Date | undefined {
  if (!value) return undefined;
  
  // If already a Date
  if (value instanceof Date) return value;
  
  // If string, try parsing
  if (typeof value === 'string') {
    // Try ISO format or Brazilian format (dd/mm/yyyy)
    const parts = value.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  // If number (Excel serial date)
  if (typeof value === 'number') {
    // Excel dates are days since 1900-01-01 (with a bug for 1900 leap year)
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  }
  
  return undefined;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === Upload / Import ===
  app.post(api.upload.import.path, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded", imported: 0, skipped: 0, errors: [] });
      }

      // Get platform from form data (defaults to SINIR)
      const platform = (req.body.platform as "SINIR" | "IEMA") || "SINIR";

      const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json<any>(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      await storage.createLog({
        level: 'INFO',
        category: 'IMPORT',
        message: `Iniciada importação ${platform} de ${req.file.originalname}`,
        details: { rowCount: data.length, platform }
      });

      // Group rows by MTR code to handle multiple residues per MTR
      const mtrGroups = new Map<string, any[]>();
      
      for (const row of data) {
        const status = row["Situação"];
        const normalizedStatus = String(status || "").toUpperCase().trim();
        
        // Business Rule: ONLY "SALVO" (case-insensitive)
        if (normalizedStatus !== "SALVO") {
          skipped++;
          continue;
        }

        const mtrCode = row["Nº MTR"];
        if (!mtrCode) {
          errors.push("Row missing MTR Code");
          continue;
        }

        const key = String(mtrCode);
        if (!mtrGroups.has(key)) {
          mtrGroups.set(key, []);
        }
        mtrGroups.get(key)!.push(row);
      }

      // Clear previous session data before new import
      sessionStorage.clearMtrs();
      sessionStorage.clearResults();

      // Process each MTR with its items (in-memory storage)
      for (const [mtrCode, rows] of Array.from(mtrGroups.entries())) {
        // Check duplicate in session
        const existing = sessionStorage.getMtrByCode(mtrCode);
        if (existing) {
          skipped++;
          continue; 
        }

        const firstRow = rows[0];
        const items = rows.map((row: any) => ({
          code: row["Resíduo Cód/Descrição"] ? String(row["Resíduo Cód/Descrição"]).split('-')[0].trim() : undefined,
          description: row["Resíduo Cód/Descrição"],
          quantity: String(parseFloat(String(row["Quantidade indicada"] || "0").replace(",", ".")) || 0),
          quantityReceived: row["Quantidade recebida"] ? String(parseFloat(String(row["Quantidade recebida"]).replace(",", "."))) : undefined,
          unit: row["Unidade"],
          treatment: row["Tratamento"],
          class: row["Classe"],
        }));

        try {
          sessionStorage.addMtr({
            mtrCode: mtrCode,
            platform: platform,
            manifestType: firstRow["Tipo Manifesto"],
            emissionDate: firstRow["Data de Emissão"] ? parseExcelDate(firstRow["Data de Emissão"]) : undefined,
            generatorName: firstRow["Gerador (Nome)"],
            generatorCnpj: firstRow["Gerador (CNPJ/CPF)"],
            transporterName: firstRow["Transportador (Nome)"],
            transporterCnpj: firstRow["Transportador (CNPJ/CPF)"],
            receiverName: firstRow["Destinador (Nome)"],
            receiverCnpj: firstRow["Destinador (CNPJ/CPF)"],
            motorista: firstRow["Nome Motorista"],
            placa: firstRow["Placa Veículo"],
            responsavelRecebimento: firstRow["Responsável Recebimento"],
            justificativa: firstRow["Justificativa"],
            observations: firstRow["Observação Destinador"] || firstRow["Observação Gerador"],
            sinirStatus: firstRow["Situação"] || firstRow["Situacao"],
            systemStatus: "PENDENTE",
            isValid: false,
          }, items);
          imported++;
        } catch (err: any) {
          errors.push(`Error importing ${mtrCode}: ${err.message}`);
          await storage.createLog({
            level: 'ERROR',
            category: 'IMPORT',
            message: `Failed to import MTR ${mtrCode}`,
            details: { error: err.message }
          });
        }
      }

      await storage.createLog({
        level: 'INFO',
        category: 'IMPORT',
        message: `Importação ${platform} concluída`,
        details: { imported, skipped, errors: errors.length, platform }
      });

      res.json({ message: `Importação ${platform} concluída`, imported, skipped, errors });
    } catch (err: any) {
      res.status(500).json({ message: err.message, imported: 0, skipped: 0, errors: [err.message] });
    }
  });

  // === MTRs CRUD (In-memory session storage) ===
  app.get(api.mtrs.list.path, async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;
    
    let mtrs = sessionStorage.getMtrs();
    
    // Filter by status
    if (status) {
      mtrs = mtrs.filter(m => m.systemStatus === status);
    }
    
    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      mtrs = mtrs.filter(m => 
        m.mtrCode.toLowerCase().includes(searchLower) ||
        (m.generatorName && m.generatorName.toLowerCase().includes(searchLower))
      );
    }
    
    const total = mtrs.length;
    const start = (page - 1) * limit;
    const paged = mtrs.slice(start, start + limit);
    
    res.json({
      data: paged.map(m => sessionStorage.toMtrWithItems(m)),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  });

  app.get(api.mtrs.get.path, async (req, res) => {
    const mtr = sessionStorage.getMtr(Number(req.params.id));
    if (!mtr) return res.status(404).json({ message: "Not found" });
    res.json(sessionStorage.toMtrWithItems(mtr));
  });

  app.put(api.mtrs.update.path, async (req, res) => {
    try {
      const input = api.mtrs.update.input.parse(req.body);
      const id = Number(req.params.id);
      
      // Update MTR header
      const { items, ...headerUpdates } = input;
      let updated = sessionStorage.updateMtr(id, headerUpdates as any);
      
      // Update items if provided
      if (items && items.length > 0 && updated) {
        for (const item of items) {
          if (item.id) {
            const { id: itemId, quantity, quantityReceived, ...rest } = item;
            const itemUpdates: Record<string, any> = { ...rest };
            if (quantity !== undefined) itemUpdates.quantity = String(quantity);
            if (quantityReceived !== undefined) itemUpdates.quantityReceived = quantityReceived !== null ? String(quantityReceived) : null;
            sessionStorage.updateMtrItem(id, itemId, itemUpdates);
          }
        }
        updated = sessionStorage.getMtr(id);
      }
      
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(sessionStorage.toMtrWithItems(updated));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: err.message });
      }
    }
  });

  app.delete(api.mtrs.delete.path, async (req, res) => {
    sessionStorage.deleteMtr(Number(req.params.id));
    res.status(204).send();
  });

  // Delete all MTRs (clear session data) and logs
  app.delete("/api/mtrs", async (req, res) => {
    const mtrCount = sessionStorage.clearMtrs();
    const resultsCount = sessionStorage.clearResults();
    const logCount = await storage.deleteAllLogs();
    res.json({ 
      success: true, 
      deleted: mtrCount, 
      resultsCleared: resultsCount,
      logsDeleted: logCount,
      message: `${mtrCount} MTRs e ${logCount} logs removidos com sucesso` 
    });
  });
  
  // === Session Stats ===
  app.get("/api/session/stats", async (req, res) => {
    const stats = sessionStorage.getStats();
    res.json(stats);
  });

  // === Results Log Download ===
  app.get("/api/results", async (req, res) => {
    const results = sessionStorage.getResults();
    res.json(results);
  });

  app.get("/api/results/download", async (req, res) => {
    const format = (req.query.format as 'xlsx' | 'txt') || 'xlsx';
    const results = sessionStorage.getResults();
    
    if (results.length === 0) {
      return res.status(404).json({ message: "Nenhum resultado para download. Envie MTRs primeiro." });
    }
    
    const buffer = generateResultLog(results, { format });
    const filename = getLogFilename(format);
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', format === 'xlsx' 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/plain; charset=utf-8');
    res.send(buffer);
  });

  // === Validation (In-memory) ===
  app.post(api.mtrs.validate.path, async (req, res) => {
    const ids = req.body.ids as number[] | undefined;
    
    let mtrsToValidate = sessionStorage.getMtrs();
    if (ids && ids.length > 0) {
      mtrsToValidate = mtrsToValidate.filter(m => ids.includes(m.id));
    }
    
    let processed = 0;
    let valid = 0;
    let errors = 0;

    for (const mtr of mtrsToValidate) {
      processed++;
      const validationErrors: string[] = [];
      
      // Rule 1: Quantity > 0
      mtr.items.forEach(item => {
        if (!item.quantity || Number(item.quantity) <= 0) {
          validationErrors.push(`Item ${item.code}: Quantidade deve ser > 0`);
        }
        // Rule 2: Valid Unit (Simplified check)
        if (!item.unit) {
          validationErrors.push(`Item ${item.code}: Unidade não informada`);
        }
      });

      // Rule 3: SALVO (case-insensitive check)
      const normalizedSinirStatus = String(mtr.sinirStatus || "").toUpperCase().trim();
      if (normalizedSinirStatus !== "SALVO") {
        validationErrors.push("Status do MTR no SINIR não é SALVO");
      }

      const isValid = validationErrors.length === 0;
      if (isValid) valid++; else errors++;

      sessionStorage.updateMtr(mtr.id, {
        systemStatus: isValid ? "VALIDO" : "ERRO",
        isValid,
        validationErrors,
      });
    }

    res.json({ processed, valid, errors });
  });

  // === Batch Send (with result logging) ===
  app.post(api.batch.send.path, async (req, res) => {
    const { mtrIds, mode, platform = 'SINIR' } = req.body;
    
    const jobId = `job_${Date.now()}`;
    
    // Clear previous results before new batch
    sessionStorage.clearResults();
    
    (async () => {
      await storage.createLog({
        level: 'INFO',
        category: 'BATCH',
        message: `Batch ${jobId} started`,
        details: { mode, platform, count: mtrIds.length }
      });

      let sent = 0;
      let failed = 0;

      for (const id of mtrIds) {
        try {
          const sessionMtr = sessionStorage.getMtr(id);
          if (!sessionMtr) continue;
          
          const mtr = sessionStorage.toMtrWithItems(sessionMtr);
          let resultMessage = "";
          let success = false;

          if (mode === 'REAL') {
            let result: { success: boolean; message?: string; details?: any };
            
            if (platform === 'IEMA') {
              const { IemaService } = await import("./iema");
              const iema = new IemaService();
              result = await iema.sendMtrWithDetails(mtr);
            } else {
              const sinir = new SinirService();
              result = await sinir.sendMtrWithDetails(mtr);
            }
            
            success = result.success;
            resultMessage = result.message || (success ? "Recebido com sucesso" : "Falha no recebimento");
            
            await storage.createLog({
              level: success ? 'INFO' : 'ERROR',
              category: platform,
              message: `MTR ${mtr.mtrCode}: ${success ? 'Enviado com sucesso' : 'Falha no envio'}`,
              details: { mtrCode: mtr.mtrCode, response: result.details }
            });

            if (!success) {
              failed++;
              sessionStorage.updateMtr(id, {
                systemStatus: "ERRO",
                isValid: false,
                validationErrors: [resultMessage],
              });
            } else {
              sessionStorage.updateMtr(id, { systemStatus: "ENVIADO", isValid: true, validationErrors: [] });
              sent++;
            }
          } else {
            // Simulated mode
            await new Promise(r => setTimeout(r, 200));
            success = true;
            resultMessage = "Simulado - Recebido com sucesso";
            sessionStorage.updateMtr(id, { systemStatus: "ENVIADO", isValid: true, validationErrors: [] });
            sent++;
          }

          // Record result for download log
          sessionStorage.addResult({
            mtrCode: mtr.mtrCode,
            platform: platform as Platform,
            success,
            message: resultMessage,
            timestamp: new Date(),
          });

        } catch (err: any) {
          const sessionMtr = sessionStorage.getMtr(id);
          const mtrCode = sessionMtr?.mtrCode || `ID:${id}`;
          
          failed++;
          sessionStorage.addResult({
            mtrCode,
            platform: platform as Platform,
            success: false,
            message: err.message || "Erro desconhecido",
            timestamp: new Date(),
          });
          
          await storage.createLog({
            level: 'ERROR',
            category: 'BATCH',
            message: `Failed to send MTR ${mtrCode}`,
            details: { error: err.message }
          });
        }
      }

      await storage.createLog({
        level: 'INFO',
        category: 'BATCH',
        message: `Batch ${jobId} completed`,
        details: { sent, failed, platform }
      });
    })();

    res.json({ jobId, message: "Batch processing started", platform });
  });

  // === Logs ===
  app.get(api.logs.list.path, async (req, res) => {
    const logs = await storage.getLogs(Number(req.query.limit) || 100);
    res.json(logs);
  });
  
  app.get(api.logs.stats.path, async (req, res) => {
    const stats = await storage.getLogStats();
    res.json(stats);
  });

  // === SINIR API Direct Access ===
  
  // Test SINIR connection
  app.get("/api/sinir/test", async (req, res) => {
    const sinir = new SinirService();
    const result = await sinir.testConnection();
    
    await storage.createLog({
      level: result.success ? 'INFO' : 'ERROR',
      category: 'SINIR',
      message: `Teste de conexão: ${result.message}`,
      details: result
    });
    
    res.json(result);
  });

  // Fetch MTR from SINIR by code
  app.get("/api/sinir/mtr/:code", async (req, res) => {
    const sinir = new SinirService();
    const mtrData = await sinir.getMtrByCode(req.params.code);
    
    if (!mtrData) {
      return res.status(404).json({ message: "MTR não encontrado no SINIR" });
    }
    
    res.json(mtrData);
  });

  // Get SINIR reference lists
  app.get("/api/sinir/units", async (req, res) => {
    const sinir = new SinirService();
    const units = await sinir.getUnits();
    res.json(units);
  });

  app.get("/api/sinir/treatments", async (req, res) => {
    const sinir = new SinirService();
    const treatments = await sinir.getTreatments();
    res.json(treatments);
  });

  app.get("/api/sinir/classes", async (req, res) => {
    const sinir = new SinirService();
    const classes = await sinir.getResidueClasses();
    res.json(classes);
  });

  app.get("/api/sinir/responsaveis", async (req, res) => {
    const sinir = new SinirService();
    const result = await sinir.getUnitResponsibles();
    res.json(result);
  });

  // === SINIR Configuration ===
  app.get("/api/config", async (req, res) => {
    const config = await storage.getSinirConfig();
    if (config) {
      res.json({
        cnpj: config.cnpj || "",
        usuario: config.usuario || "",
        senha: config.senha ? "********" : "",
        unidade: config.unidade || "",
        token: config.token ? config.token.substring(0, 20) + "..." : "",
        responsavelNome: config.responsavelNome || "",
        hasPassword: !!config.senha,
        hasToken: !!config.token,
        updatedAt: config.updatedAt
      });
    } else {
      res.json({ cnpj: "", usuario: "", senha: "", unidade: "", token: "", responsavelNome: "", hasPassword: false, hasToken: false });
    }
  });

  app.post("/api/config", async (req, res) => {
    try {
      const { cnpj, usuario, senha, unidade, token, responsavelNome } = req.body;
      
      const existing = await storage.getSinirConfig();
      const config: any = {
        cnpj: cnpj || null,
        usuario: usuario || null,
        unidade: unidade || null,
        responsavelNome: responsavelNome || null,
      };
      
      if (senha && senha !== "********") {
        config.senha = senha;
      } else if (existing) {
        config.senha = existing.senha;
      }
      
      if (token && !token.endsWith("...")) {
        config.token = token;
      } else if (existing) {
        config.token = existing.token;
      }
      
      const saved = await storage.saveSinirConfig(config);
      
      await storage.createLog({
        level: 'INFO',
        category: 'CONFIG',
        message: 'Configuração SINIR atualizada',
        details: { cnpj: config.cnpj, usuario: config.usuario }
      });
      
      res.json({ message: "Configuração salva com sucesso", updatedAt: saved.updatedAt });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === IEMA Configuration ===
  app.get("/api/iema/config", async (req, res) => {
    const config = await storage.getIemaConfig();
    if (config) {
      res.json({
        pessoaCodigo: config.pessoaCodigo || null,
        pessoaCnpj: config.pessoaCnpj || "",
        usuarioCpf: config.usuarioCpf || "",
        senha: config.senha ? "********" : "",
        ambiente: config.ambiente || "producao",
        responsavelNome: config.responsavelNome || "",
        hasPassword: !!config.senha,
        hasToken: !!config.token,
        updatedAt: config.updatedAt
      });
    } else {
      res.json({ pessoaCodigo: null, pessoaCnpj: "", usuarioCpf: "", senha: "", ambiente: "producao", responsavelNome: "", hasPassword: false, hasToken: false });
    }
  });

  app.post("/api/iema/config", async (req, res) => {
    try {
      const { pessoaCodigo, pessoaCnpj, usuarioCpf, senha, ambiente, responsavelNome } = req.body;
      
      const existing = await storage.getIemaConfig();
      const config: any = {
        pessoaCodigo: pessoaCodigo || null,
        pessoaCnpj: pessoaCnpj || null,
        usuarioCpf: usuarioCpf || null,
        ambiente: ambiente || "producao",
        responsavelNome: responsavelNome || null,
      };
      
      if (senha && senha !== "********") {
        config.senha = senha;
      } else if (existing) {
        config.senha = existing.senha;
      }
      
      const saved = await storage.saveIemaConfig(config);
      
      await storage.createLog({
        level: 'INFO',
        category: 'CONFIG',
        message: 'Configuração IEMA atualizada',
        details: { pessoaCnpj: config.pessoaCnpj, usuarioCpf: config.usuarioCpf }
      });
      
      res.json({ message: "Configuração IEMA salva com sucesso", updatedAt: saved.updatedAt });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // IEMA Test Connection
  app.post("/api/iema/test", async (req, res) => {
    try {
      const { IemaService } = await import("./iema");
      const iema = new IemaService();
      const result = await iema.testConnection();
      
      await storage.createLog({
        level: result.success ? 'INFO' : 'ERROR',
        category: 'IEMA',
        message: `Teste de conexão: ${result.message}`,
        details: result
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // IEMA Reference Lists
  app.get("/api/iema/lists", async (req, res) => {
    try {
      const { IemaService } = await import("./iema");
      const iema = new IemaService();
      const lists = await iema.getLists();
      res.json(lists);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // === Classification Import ===
  app.post("/api/classification/import", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo enviado", imported: 0, errors: [] });
      }

      // Get platform from form data (defaults to SINIR)
      const platform = (req.body.platform as "SINIR" | "IEMA") || "SINIR";

      const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json<any>(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

      // Clear existing classification data before importing new
      await storage.clearClassificationData();

      const records: any[] = [];
      const errors: string[] = [];

      for (const row of data) {
        const mtrCode = row["iMTR"];
        if (!mtrCode) {
          errors.push("Linha sem código iMTR ignorada");
          continue;
        }

        const parseNumeric = (val: any): string | null => {
          if (val === null || val === undefined || val === '') return null;
          const numStr = String(val).replace(',', '.');
          const num = parseFloat(numStr);
          return isNaN(num) ? null : String(num);
        };
        
        records.push({
          mtrCode: String(mtrCode).trim(),
          platform: platform,
          placa: row["Placa (Transp)"] || null,
          cnpj: row["CNPJ"] || null,
          quantityEstimated: parseNumeric(row["Qde Estimada"]),
          movementDate: row["Data da Movimentação"] ? parseExcelDate(row["Data da Movimentação"]) : null,
          quantity: parseNumeric(row["Qtd."]),
          productCode: row["Produto"] || null,
          productName: row["Nome do Produto"] || null,
          transporterName: row["Transportadora"] || null,
          unit: row["UDM"] || null,
          customerWeight: parseNumeric(row["Peso (Cliente)"]),
          supplyWeight: parseNumeric(row["Peso (Supply)"]),
          ibamaName: row["ibama_name"] || null,
        });
      }

      const imported = await storage.saveClassificationData(records);

      await storage.createLog({
        level: 'INFO',
        category: 'CLASSIFICATION',
        message: `Planilha de classificação ${platform} importada`,
        details: { imported, errors: errors.length, platform }
      });

      res.json({ message: `Importação ${platform} concluída`, imported, errors, platform });
    } catch (err: any) {
      res.status(500).json({ message: err.message, imported: 0, errors: [err.message] });
    }
  });

  // Get classification data
  app.get("/api/classification", async (req, res) => {
    const data = await storage.getClassificationData();
    res.json(data);
  });

  // Compare classification data with MTRs and return differences
  app.get("/api/classification/compare", async (req, res) => {
    try {
      const classificationData = await storage.getClassificationData();
      const { data: mtrs } = await storage.getMtrs(1, 1000); // Get all MTRs
      
      // Determine classification platform (from first record)
      const classificationPlatform = classificationData.length > 0 ? (classificationData[0].platform || 'SINIR') : null;
      
      const comparisons: any[] = [];
      const platformMismatches: string[] = [];
      
      // Group classification data by mtrCode
      const classificationByMtr = new Map<string, any[]>();
      for (const cd of classificationData) {
        if (!classificationByMtr.has(cd.mtrCode)) {
          classificationByMtr.set(cd.mtrCode, []);
        }
        classificationByMtr.get(cd.mtrCode)!.push(cd);
      }
      
      // Compare each MTR with classification data
      for (const mtr of mtrs) {
        const classData = classificationByMtr.get(mtr.mtrCode);
        if (!classData || classData.length === 0) continue;
        
        // First classification row for this MTR (for header-level fields)
        const firstClass = classData[0];
        
        // Check platform match
        const mtrPlatform = mtr.platform || 'SINIR';
        const classPlatform = firstClass.platform || 'SINIR';
        if (mtrPlatform !== classPlatform) {
          platformMismatches.push(`MTR ${mtr.mtrCode}: importado como ${mtrPlatform}, classificação é ${classPlatform}`);
          continue; // Skip this MTR - platform mismatch
        }
        
        const differences: any = {
          mtrId: mtr.id,
          mtrCode: mtr.mtrCode,
          fields: []
        };
        
        // Compare placa
        if (firstClass.placa && firstClass.placa !== mtr.placa) {
          differences.fields.push({
            field: 'placa',
            fieldLabel: 'Placa',
            sinirValue: mtr.placa || '',
            classificationValue: firstClass.placa,
          });
        }
        
        // Compare items (quantity, unit, etc.)
        for (const ci of classData) {
          for (const item of mtr.items) {
            // Try to match by product name or IBAMA code
            const ibamaCode = ci.ibamaName ? ci.ibamaName.match(/\d+/)?.[0] : null;
            const itemCode = item.code?.split(' ')[0];
            
            if (ibamaCode && itemCode && ibamaCode === itemCode) {
              // Match found - compare quantities
              const classQty = Number(ci.quantity || 0);
              const mtrQty = Number(item.quantityReceived || item.quantity || 0);
              
              if (classQty !== mtrQty && classQty > 0) {
                differences.fields.push({
                  field: 'quantityReceived',
                  fieldLabel: `Quantidade - ${item.description?.substring(0, 30) || item.code}`,
                  itemId: item.id,
                  sinirValue: mtrQty,
                  classificationValue: classQty,
                });
              }
              
              // Compare unit
              if (ci.unit && ci.unit !== item.unit) {
                differences.fields.push({
                  field: 'unit',
                  fieldLabel: `Unidade - ${item.description?.substring(0, 30) || item.code}`,
                  itemId: item.id,
                  sinirValue: item.unit || '',
                  classificationValue: ci.unit,
                });
              }
            }
          }
        }
        
        if (differences.fields.length > 0) {
          comparisons.push(differences);
        }
      }
      
      res.json({ 
        comparisons,
        totalMtrs: mtrs.length,
        totalWithDifferences: comparisons.length,
        classificationRows: classificationData.length,
        classificationPlatform,
        platformMismatches
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Apply selected corrections from classification
  app.post("/api/classification/apply", async (req, res) => {
    try {
      const { corrections } = req.body;
      // corrections: Array<{ mtrId: number, fields: Array<{ field: string, value: any, itemId?: number }> }>
      
      let applied = 0;
      
      // Helper to convert numeric values to strings for decimal columns
      const normalizeValue = (field: string, value: any): any => {
        const numericFields = ['quantity', 'quantityReceived', 'customerWeight', 'supplyWeight'];
        if (numericFields.includes(field) && value !== null && value !== undefined) {
          return String(value);
        }
        return value;
      };
      
      for (const correction of corrections) {
        const mtrUpdate: any = {};
        const itemUpdates: any[] = [];
        
        for (const field of correction.fields) {
          const normalizedValue = normalizeValue(field.field, field.value);
          
          if (field.itemId) {
            // Item-level field
            itemUpdates.push({
              id: field.itemId,
              [field.field]: normalizedValue
            });
          } else {
            // MTR header field
            mtrUpdate[field.field] = normalizedValue;
          }
        }
        
        if (Object.keys(mtrUpdate).length > 0 || itemUpdates.length > 0) {
          await storage.updateMtr(correction.mtrId, {
            ...mtrUpdate,
            items: itemUpdates.length > 0 ? itemUpdates : undefined
          });
          applied++;
        }
      }
      
      await storage.createLog({
        level: 'INFO',
        category: 'CLASSIFICATION',
        message: `Correções aplicadas`,
        details: { applied }
      });
      
      res.json({ message: "Correções aplicadas com sucesso", applied });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Clear classification data
  app.delete("/api/classification", async (req, res) => {
    const deleted = await storage.clearClassificationData();
    res.json({ success: true, deleted });
  });

  // Import MTR from SINIR into session storage (in-memory)
  app.post("/api/sinir/import/:code", async (req, res) => {
    const mtrCode = req.params.code;
    
    try {
      // Check if already exists in session
      const existing = sessionStorage.getMtrByCode(mtrCode);
      if (existing) {
        return res.status(400).json({ message: "MTR já existe na sessão" });
      }

      // Fetch from SINIR
      const sinir = new SinirService();
      const sinirData = await sinir.getMtrByCode(mtrCode);
      
      if (!sinirData) {
        return res.status(404).json({ message: "MTR não encontrado no SINIR" });
      }

      // Map SINIR data to session storage format
      // Use manResponsavel from SINIR as default responsible (avoids encoding issues with accents)
      const mtrData = {
        mtrCode: sinirData.manNumero || mtrCode,
        platform: "SINIR" as const,
        manifestType: sinirData.tipoManifesto || "MTR",
        emissionDate: sinirData.dataEmissao ? new Date(sinirData.dataEmissao) : new Date(),
        generatorName: sinirData.parceiroGerador?.parDescricao || sinirData.geradorNome || sinirData.gerNome,
        generatorCnpj: sinirData.parceiroGerador?.parCnpj || sinirData.geradorCnpj || sinirData.gerCpfCnpj,
        transporterName: sinirData.parceiroTransportador?.parDescricao || sinirData.transportadorNome || sinirData.traNome,
        transporterCnpj: sinirData.parceiroTransportador?.parCnpj || sinirData.transportadorCnpj || sinirData.traCpfCnpj,
        receiverName: sinirData.parceiroDestinador?.parDescricao || sinirData.destinadorNome || sinirData.desNome,
        receiverCnpj: sinirData.parceiroDestinador?.parCnpj || sinirData.destinadorCnpj || sinirData.desCpfCnpj,
        motorista: sinirData.manNomeMotorista || null,
        placa: sinirData.manPlacaVeiculo || null,
        responsavelRecebimento: sinirData.manResponsavel || null, // Capture original from SINIR API
        sinirStatus: sinirData.situacaoManifesto?.simDescricao || sinirData.situacao || "SALVO",
        systemStatus: "PENDENTE" as const,
        observations: sinirData.manObservacao || null,
        isValid: false,
        validationErrors: null,
      };

      // Map residues from SINIR response with original codes
      const residues = sinirData.listaManifestoResiduo || sinirData.listaManifestoResiduos || sinirData.residuos || [];
      const items = residues.map((r: any) => ({
        code: r.residuo?.resCodigoIbama || r.resCodigoIbama || r.resCodigo,
        description: r.residuo?.resDescricao || r.resDescricao || r.descricao,
        quantity: String(r.marQuantidade || r.quantidade || 0),
        unit: r.unidade?.uniDescricao || r.uniDescricao || r.unidade || "Tonelada",
        treatment: r.tratamento?.traDescricao || r.traDescricao || r.tratamento,
        class: r.classe?.claDescricao || r.claDescricao || r.classe,
        // Preserve original SINIR codes for sending back
        uniCodigo: r.unidade?.uniCodigo || r.uniCodigo || null,
        traCodigo: r.tratamento?.traCodigo || r.traCodigo || null,
        tieCodigo: r.tipoEstado?.tieCodigo || r.tieCodigo || null,
        claCodigo: r.classe?.claCodigo || r.claCodigo || null,
        tiaCodigo: r.tipoAcondicionamento?.tiaCodigo || r.tiaCodigo || null,
        resCodigo: r.residuo?.resCodigo || r.resCodigo || null,
      }));

      // Add to session storage
      const newMtr = sessionStorage.addMtr(mtrData, items);

      await storage.createLog({
        level: 'INFO',
        category: 'SINIR',
        message: `MTR ${mtrCode} importado do SINIR`,
        details: { mtrId: newMtr.id }
      });

      res.json({ message: `MTR ${mtrCode} importado com sucesso`, mtr: sessionStorage.toMtrWithItems(newMtr) });
    } catch (error: any) {
      await storage.createLog({
        level: 'ERROR',
        category: 'SINIR',
        message: `Erro ao importar MTR ${mtrCode}`,
        details: { error: error.message }
      });
      res.status(500).json({ message: error.message });
    }
  });

  // Import MTR from IEMA into session storage (in-memory)
  // Manual section 16: retornaManifesto/{CODIGO_BARRA} response structure
  app.post("/api/iema/import/:code", async (req, res) => {
    const mtrCode = req.params.code;
    
    try {
      // Check if already exists in session
      const existing = sessionStorage.getMtrByCode(mtrCode);
      if (existing) {
        return res.status(400).json({ message: "MTR já existe na sessão" });
      }

      // Fetch from IEMA
      const { IemaService } = await import("./iema");
      const iema = new IemaService();
      const iemaData = await iema.getManifestByBarcode(mtrCode);
      
      if (!iemaData) {
        return res.status(404).json({ message: "MTR não encontrado no IEMA" });
      }

      // Map IEMA API response (section 16) to local schema
      // Fields per manual: manifestoCodigo, cnpGerador, cnpTransportador, cnpDestinador,
      // situacaoManifestoCodigo, manifData, manifDataExpedicao, manifTransportadorNomeMotorista,
      // manifTransportadorPlacaVeiculo, itemManifestoJSONs
      
      // Parse date from YYYYMMDD format
      const parseIemaDate = (dateStr: string | null | undefined): Date => {
        if (!dateStr) return new Date();
        const match = dateStr.match(/(\d{4})(\d{2})(\d{2})/);
        if (match) {
          return new Date(`${match[1]}-${match[2]}-${match[3]}`);
        }
        return new Date();
      };
      
      // Map IEMA situacaoManifestoCodigo to status string
      const mapIemaStatus = (code: number | null): string => {
        switch (code) {
          case 1: return "SALVO";
          case 3: return "RECEBIDO";
          case 4: return "CANCELADO";
          case 9: return "EM ARMAZENAMENTO";
          default: return "SALVO";
        }
      };
      
      // Map unit code to text
      const mapUnitCode = (code: number | null): string => {
        switch (code) {
          case 1: return "m³";
          case 2: return "Litro";
          case 3: return "Quilograma";
          case 4: return "Tonelada";
          case 5: return "Unidade";
          default: return "Tonelada";
        }
      };

      const mtrData = {
        mtrCode: mtrCode, // Use the barcode as MTR code
        platform: "IEMA" as const,
        manifestType: "MTR",
        emissionDate: parseIemaDate(iemaData.manifData || iemaData.manifDataExpedicao),
        generatorCnpj: iemaData.cnpGerador,
        transporterCnpj: iemaData.cnpTransportador,
        receiverCnpj: iemaData.cnpDestinador,
        motorista: iemaData.manifTransportadorNomeMotorista || null,
        placa: iemaData.manifTransportadorPlacaVeiculo || null,
        responsavelRecebimento: iemaData.manifGeradorNomeResponsavel || null,
        sinirStatus: mapIemaStatus(iemaData.situacaoManifestoCodigo),
        systemStatus: "PENDENTE" as const,
        observations: iemaData.manifObservacao || null,
        isValid: false,
        validationErrors: null,
      };

      // Map residues from itemManifestoJSONs
      const items = (iemaData.itemManifestoJSONs || []).map((r: any) => ({
        code: r.residuo, // IBAMA code like "010102"
        description: r.manifestoItemObservacao || `Resíduo ${r.residuo}`,
        quantity: String(r.quantidade || 0),
        unit: mapUnitCode(r.codigoUnidade),
        treatment: r.codigoTecnologia ? `Tecnologia ${r.codigoTecnologia}` : null,
        class: r.codigoClasse ? `Classe ${r.codigoClasse}` : null,
      }));

      // Add to session storage
      const newMtr = sessionStorage.addMtr(mtrData, items);

      await storage.createLog({
        level: 'INFO',
        category: 'IEMA',
        message: `MTR ${mtrCode} importado do IEMA`,
        details: { mtrId: newMtr.id, manifestoCodigo: iemaData.manifestoCodigo }
      });

      res.json({ message: `MTR ${mtrCode} importado com sucesso`, mtr: sessionStorage.toMtrWithItems(newMtr) });
    } catch (error: any) {
      await storage.createLog({
        level: 'ERROR',
        category: 'IEMA',
        message: `Erro ao importar MTR ${mtrCode}`,
        details: { error: error.message }
      });
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
