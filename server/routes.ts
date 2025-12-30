import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import * as xlsx from "xlsx";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { SinirService } from "./sinir"; // We'll create this

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
        message: `Started import of ${req.file.originalname}`,
        details: { rowCount: data.length }
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

      // Process each MTR with its items
      for (const [mtrCode, rows] of mtrGroups) {
        // Check duplicate
        const existing = await storage.getMtrByCode(mtrCode);
        if (existing) {
          skipped++;
          continue; 
        }

        const firstRow = rows[0];
        const items = rows.map((row: any) => ({
          code: row["Resíduo Cód/Descrição"] ? String(row["Resíduo Cód/Descrição"]).split('-')[0].trim() : undefined,
          description: row["Resíduo Cód/Descrição"],
          quantity: parseFloat(String(row["Quantidade indicada"] || "0").replace(",", ".")) || 0,
          quantityReceived: row["Quantidade Recebida"] ? parseFloat(String(row["Quantidade Recebida"]).replace(",", ".")) : undefined,
          unit: row["Unidade"],
          treatment: row["Tratamento"],
          class: row["Classe"]
        }));

        try {
          await storage.createMtr({
            mtrCode: mtrCode,
            manifestType: firstRow["Tipo Manifesto"],
            emissionDate: firstRow["Data de Emissão"] ? parseExcelDate(firstRow["Data de Emissão"]) : undefined,
            generatorName: firstRow["Gerador (Nome)"],
            generatorCnpj: firstRow["Gerador (CNPJ/CPF)"],
            transporterName: firstRow["Transportador (Nome)"],
            transporterCnpj: firstRow["Transportador (CNPJ/CPF)"],
            receiverName: firstRow["Destinador (Nome)"],
            receiverCnpj: firstRow["Destinador (CNPJ/CPF)"],
            motorista: firstRow["Motorista"],
            placa: firstRow["Placa"],
            responsavelRecebimento: firstRow["Responsável pelo Recebimento"] || firstRow["Responsavel pelo Recebimento"],
            justificativa: firstRow["Justificativa"],
            observations: firstRow["Observação"] || firstRow["Observacao"],
            sinirStatus: firstRow["Situação"],
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
        message: `Import completed`,
        details: { imported, skipped, errors: errors.length }
      });

      res.json({ message: "Import completed", imported, skipped, errors });
    } catch (err: any) {
      res.status(500).json({ message: err.message, imported: 0, skipped: 0, errors: [err.message] });
    }
  });

  // === MTRs CRUD ===
  app.get(api.mtrs.list.path, async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;
    
    const result = await storage.getMtrs(page, limit, status, search);
    res.json({
      data: result.data,
      total: result.total,
      page,
      totalPages: Math.ceil(result.total / limit)
    });
  });

  app.get(api.mtrs.get.path, async (req, res) => {
    const mtr = await storage.getMtr(Number(req.params.id));
    if (!mtr) return res.status(404).json({ message: "Not found" });
    res.json(mtr);
  });

  app.put(api.mtrs.update.path, async (req, res) => {
    try {
      const input = api.mtrs.update.input.parse(req.body);
      const updated = await storage.updateMtr(Number(req.params.id), input);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: err.message });
      }
    }
  });

  app.delete(api.mtrs.delete.path, async (req, res) => {
    await storage.deleteMtr(Number(req.params.id));
    res.status(204).send();
  });

  // Delete all MTRs (clear imported data)
  app.delete("/api/mtrs", async (req, res) => {
    const count = await storage.deleteAllMtrs();
    await storage.createLog({
      level: "INFO",
      message: `Todos os MTRs foram removidos (${count} registros)`,
      action: "DELETE_ALL",
    });
    res.json({ success: true, deleted: count, message: `${count} MTRs removidos com sucesso` });
  });

  // === Validation ===
  app.post(api.mtrs.validate.path, async (req, res) => {
    const ids = req.body.ids;
    const mtrsToValidate = await storage.getPendingValidationMtrs(ids);
    
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

      await storage.updateMtrStatus(
        mtr.id, 
        isValid ? "VALIDO" : "ERRO", 
        isValid, 
        validationErrors
      );
    }

    res.json({ processed, valid, errors });
  });

  // === Batch Send ===
  app.post(api.batch.send.path, async (req, res) => {
    const { mtrIds, mode } = req.body;
    
    // In a real app, this would be a background job (Bull/Queue)
    // For this demo, we'll process inline but return 'job started'
    
    const sinir = new SinirService();
    const jobId = `job_${Date.now()}`;
    
    // Fire and forget (or await if simple) - let's await for simplicity in this MVP
    // In production: queue.add({ mtrIds, mode })
    
    (async () => {
      await storage.createLog({
        level: 'INFO',
        category: 'BATCH',
        message: `Batch ${jobId} started`,
        details: { mode, count: mtrIds.length }
      });

      let sent = 0;
      let failed = 0;

      for (const id of mtrIds) {
        try {
          const mtr = await storage.getMtr(id);
          if (!mtr) continue;

          if (mode === 'REAL') {
            const result = await sinir.sendMtrWithDetails(mtr);
            
            await storage.createLog({
              level: result.success ? 'INFO' : 'ERROR',
              category: 'SINIR',
              message: `MTR ${mtr.mtrCode}: ${result.success ? 'Enviado com sucesso' : 'Falha no envio'}`,
              details: { mtrCode: mtr.mtrCode, response: result.details }
            });

            if (!result.success) {
              failed++;
              await storage.updateMtrStatus(id, "ERRO", false, [result.message || 'Erro ao enviar para SINIR']);
              continue;
            }
          } else {
            // Simulated
            await new Promise(r => setTimeout(r, 500)); // Fake latency
          }

          await storage.updateMtrStatus(id, "ENVIADO", true, []);
          sent++;
        } catch (err: any) {
          failed++;
          await storage.createLog({
            level: 'ERROR',
            category: 'BATCH',
            message: `Failed to send MTR ${id}`,
            details: { error: err.message }
          });
        }
      }

      await storage.createLog({
        level: 'INFO',
        category: 'BATCH',
        message: `Batch ${jobId} completed`,
        details: { sent, failed }
      });
    })();

    res.json({ jobId, message: "Batch processing started" });
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
        hasPassword: !!config.senha,
        hasToken: !!config.token,
        updatedAt: config.updatedAt
      });
    } else {
      res.json({ cnpj: "", usuario: "", senha: "", unidade: "", token: "", hasPassword: false, hasToken: false });
    }
  });

  app.post("/api/config", async (req, res) => {
    try {
      const { cnpj, usuario, senha, unidade, token } = req.body;
      
      const existing = await storage.getSinirConfig();
      const config: any = {
        cnpj: cnpj || null,
        usuario: usuario || null,
        unidade: unidade || null,
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

  // Import MTR from SINIR into local database
  app.post("/api/sinir/import/:code", async (req, res) => {
    const mtrCode = req.params.code;
    
    try {
      // Check if already exists
      const existing = await storage.getMtrByCode(mtrCode);
      if (existing) {
        return res.status(400).json({ message: "MTR já existe no sistema" });
      }

      // Fetch from SINIR
      const sinir = new SinirService();
      const sinirData = await sinir.getMtrByCode(mtrCode);
      
      if (!sinirData) {
        return res.status(404).json({ message: "MTR não encontrado no SINIR" });
      }

      // Map SINIR data to local schema
      const mtrData = {
        mtrCode: sinirData.manNumero || mtrCode,
        manifestType: sinirData.tipoManifesto || "MTR",
        emissionDate: sinirData.dataEmissao ? new Date(sinirData.dataEmissao) : new Date(),
        generatorName: sinirData.geradorNome || sinirData.gerNome,
        generatorCnpj: sinirData.geradorCnpj || sinirData.gerCpfCnpj,
        transporterName: sinirData.transportadorNome || sinirData.traNome,
        transporterCnpj: sinirData.transportadorCnpj || sinirData.traCpfCnpj,
        receiverName: sinirData.destinadorNome || sinirData.desNome,
        receiverCnpj: sinirData.destinadorCnpj || sinirData.desCpfCnpj,
        sinirStatus: sinirData.situacao || "SALVO",
        systemStatus: "PENDENTE" as const,
      };

      // Map residues
      const items = (sinirData.listaManifestoResiduos || sinirData.residuos || []).map((r: any) => ({
        code: r.resCodigoIbama || r.resCodigo,
        description: r.resDescricao || r.descricao,
        quantity: String(r.marQuantidade || r.quantidade || 0),
        unit: r.uniDescricao || r.unidade || "Tonelada",
        treatment: r.traDescricao || r.tratamento,
        class: r.claDescricao || r.classe,
      }));

      // Create in database
      const newMtr = await storage.createMtr(mtrData, items);

      await storage.createLog({
        level: 'INFO',
        category: 'SINIR',
        message: `MTR ${mtrCode} importado do SINIR`,
        details: { mtrId: newMtr.id }
      });

      res.json({ message: `MTR ${mtrCode} importado com sucesso`, mtr: newMtr });
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

  return httpServer;
}
