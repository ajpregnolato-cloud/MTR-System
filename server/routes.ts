import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import * as xlsx from "xlsx";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { SinirService } from "./sinir"; // We'll create this

const upload = multer({ storage: multer.memoryStorage() });

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

      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json<any>(sheet);

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      await storage.createLog({
        level: 'INFO',
        category: 'IMPORT',
        message: `Started import of ${req.file.originalname}`,
        details: { rowCount: data.length }
      });

      for (const row of data) {
        // Business Rule: ONLY "SALVO" (case-insensitive)
        const status = row["Situação"];
        const normalizedStatus = String(status || "").toUpperCase().trim();
        if (normalizedStatus !== "SALVO") {
          skipped++;
          continue;
        }

        const mtrCode = row["Nº MTR"];
        if (!mtrCode) {
          errors.push("Row missing MTR Code");
          continue;
        }

        // Check duplicate
        const existing = await storage.getMtrByCode(mtrCode);
        if (existing) {
          skipped++; // Or update? Assuming skip for now or we could overwrite
          continue; 
        }

        try {
          await storage.createMtr({
            mtrCode: String(mtrCode),
            manifestType: row["Tipo Manifesto"],
            emissionDate: row["Data de Emissão"] ? new Date(row["Data de Emissão"]) : undefined,
            generatorName: row["Gerador (Nome)"],
            generatorCnpj: row["Gerador (CNPJ/CPF)"],
            transporterName: row["Transportador (Nome)"],
            transporterCnpj: row["Transportador (CNPJ/CPF)"],
            receiverName: row["Destinador (Nome)"],
            receiverCnpj: row["Destinador (CNPJ/CPF)"],
            sinirStatus: status,
            systemStatus: "PENDENTE",
            isValid: false,
          }, [{
            code: row["Resíduo Cód/Descrição"] ? String(row["Resíduo Cód/Descrição"]).split(' - ')[0] : undefined,
            description: row["Resíduo Cód/Descrição"],
            quantity: row["Quantidade indicada"],
            unit: row["Unidade"],
            treatment: row["Tratamento"],
            class: row["Classe"]
          }]);
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
          validationErrors.push(`Item ${item.code}: Quantity must be > 0`);
        }
        // Rule 2: Valid Unit (Simplified check)
        if (!item.unit) {
          validationErrors.push(`Item ${item.code}: Unit is missing`);
        }
      });

      // Rule 3: SALVO (Already filtered on import, but check for consistency)
      if (mtr.sinirStatus !== "SALVO") {
        validationErrors.push("MTR Status in SINIR is not SALVO");
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
             await sinir.sendMtr(mtr);
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

  return httpServer;
}
