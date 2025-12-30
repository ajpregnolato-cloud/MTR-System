import { db } from "./db";
import {
  mtrs, mtrItems, systemLogs, sinirConfig,
  type Mtr, type MtrItem, type InsertMtr, type InsertMtrItem, type SystemLog,
  type UpdateMtrRequest, type LogStats, type MtrWithItems, type SinirConfig, type InsertSinirConfig
} from "@shared/schema";
import { eq, inArray, desc, sql, and } from "drizzle-orm";

export interface IStorage {
  // MTRs
  createMtr(mtr: InsertMtr, items: InsertMtrItem[]): Promise<MtrWithItems>;
  getMtrs(page: number, limit: number, status?: string, search?: string): Promise<{ data: MtrWithItems[], total: number }>;
  getMtr(id: number): Promise<MtrWithItems | undefined>;
  getMtrByCode(code: string): Promise<Mtr | undefined>;
  updateMtr(id: number, update: UpdateMtrRequest): Promise<MtrWithItems>;
  deleteMtr(id: number): Promise<void>;
  deleteAllMtrs(): Promise<number>;
  
  // Validation & Batch
  getPendingValidationMtrs(ids?: number[]): Promise<MtrWithItems[]>;
  updateMtrStatus(id: number, status: string, isValid: boolean, errors: string[]): Promise<void>;
  
  // Logs
  createLog(log: Omit<SystemLog, "id" | "timestamp">): Promise<SystemLog>;
  getLogs(limit: number, level?: string): Promise<SystemLog[]>;
  getLogStats(): Promise<LogStats>;
  
  // SINIR Config
  getSinirConfig(): Promise<SinirConfig | null>;
  saveSinirConfig(config: InsertSinirConfig): Promise<SinirConfig>;
}

export class DatabaseStorage implements IStorage {
  async createMtr(mtr: InsertMtr, items: InsertMtrItem[]): Promise<MtrWithItems> {
    return await db.transaction(async (tx) => {
      const [newMtr] = await tx.insert(mtrs).values(mtr).returning();
      
      const newItems: MtrItem[] = [];
      if (items.length > 0) {
        const itemsWithId = items.map(item => ({ ...item, mtrId: newMtr.id }));
        const insertedItems = await tx.insert(mtrItems).values(itemsWithId).returning();
        newItems.push(...insertedItems);
      }
      
      return { ...newMtr, items: newItems };
    });
  }

  async getMtrs(page: number, limit: number, status?: string, search?: string): Promise<{ data: MtrWithItems[], total: number }> {
    const offset = (page - 1) * limit;
    
    // Build where clause
    const conditions = [];
    if (status) conditions.push(eq(mtrs.systemStatus, status as any));
    if (search) {
      conditions.push(sql`(${mtrs.mtrCode} ILIKE ${`%${search}%`} OR ${mtrs.generatorName} ILIKE ${`%${search}%`})`);
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`cast(count(*) as int)` })
      .from(mtrs)
      .where(whereClause);
      
    const rows = await db.query.mtrs.findMany({
      where: whereClause,
      limit,
      offset,
      orderBy: [desc(mtrs.emissionDate)],
      with: { items: true }
    });

    return { data: rows, total: countResult.count };
  }

  async getMtr(id: number): Promise<MtrWithItems | undefined> {
    return await db.query.mtrs.findFirst({
      where: eq(mtrs.id, id),
      with: { items: true }
    });
  }

  async getMtrByCode(code: string): Promise<Mtr | undefined> {
    return await db.query.mtrs.findFirst({
      where: eq(mtrs.mtrCode, code)
    });
  }

  async updateMtr(id: number, update: UpdateMtrRequest): Promise<MtrWithItems> {
    return await db.transaction(async (tx) => {
      // Update header
      const { items, ...headerUpdates } = update;
      if (Object.keys(headerUpdates).length > 0) {
        await tx.update(mtrs)
          .set({ ...headerUpdates, lastUpdatedAt: new Date() })
          .where(eq(mtrs.id, id));
      }

      // Update items if provided
      if (items && items.length > 0) {
        for (const item of items) {
          if (item.id) {
            const { id: itemId, quantity, quantityReceived, ...rest } = item;
            const itemUpdates: Record<string, any> = { ...rest };
            if (quantity !== undefined) {
              itemUpdates.quantity = String(quantity);
            }
            if (quantityReceived !== undefined) {
              itemUpdates.quantityReceived = quantityReceived !== null ? String(quantityReceived) : null;
            }
            if (Object.keys(itemUpdates).length > 0) {
              await tx.update(mtrItems)
                .set(itemUpdates)
                .where(eq(mtrItems.id, itemId));
            }
          }
        }
      }

      // Return updated
      const updated = await tx.query.mtrs.findFirst({
        where: eq(mtrs.id, id),
        with: { items: true }
      });
      
      if (!updated) throw new Error("MTR not found after update");
      return updated;
    });
  }

  async deleteMtr(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(mtrItems).where(eq(mtrItems.mtrId, id));
      await tx.delete(mtrs).where(eq(mtrs.id, id));
    });
  }

  async deleteAllMtrs(): Promise<number> {
    return await db.transaction(async (tx) => {
      await tx.delete(mtrItems);
      const result = await tx.delete(mtrs).returning({ id: mtrs.id });
      return result.length;
    });
  }

  async getPendingValidationMtrs(ids?: number[]): Promise<MtrWithItems[]> {
    const where = ids && ids.length > 0 
      ? inArray(mtrs.id, ids)
      : undefined; // If no IDs, usually we'd filter by status but user might want to re-validate any

    return await db.query.mtrs.findMany({
      where,
      with: { items: true }
    });
  }

  async updateMtrStatus(id: number, status: string, isValid: boolean, errors: string[]): Promise<void> {
    await db.update(mtrs)
      .set({ 
        systemStatus: status as any, 
        isValid, 
        validationErrors: errors,
        lastUpdatedAt: new Date()
      })
      .where(eq(mtrs.id, id));
  }

  async createLog(log: Omit<SystemLog, "id" | "timestamp">): Promise<SystemLog> {
    const [entry] = await db.insert(systemLogs).values(log).returning();
    return entry;
  }

  async getLogs(limit: number, level?: string): Promise<SystemLog[]> {
    const where = level ? eq(systemLogs.level, level as any) : undefined;
    return await db.select()
      .from(systemLogs)
      .where(where)
      .orderBy(desc(systemLogs.timestamp))
      .limit(limit);
  }

  async getLogStats(): Promise<LogStats> {
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(systemLogs);
    const [errors] = await db.select({ count: sql<number>`count(*)` }).from(systemLogs).where(eq(systemLogs.level, 'ERROR'));
    const [warnings] = await db.select({ count: sql<number>`count(*)` }).from(systemLogs).where(eq(systemLogs.level, 'WARN'));
    
    return {
      total: Number(total.count),
      errors: Number(errors.count),
      warnings: Number(warnings.count)
    };
  }
  
  async getSinirConfig(): Promise<SinirConfig | null> {
    const result = await db.select().from(sinirConfig).limit(1);
    return result.length > 0 ? result[0] : null;
  }
  
  async saveSinirConfig(config: InsertSinirConfig): Promise<SinirConfig> {
    const existing = await this.getSinirConfig();
    if (existing) {
      const [updated] = await db.update(sinirConfig)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(sinirConfig.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(sinirConfig).values(config).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
