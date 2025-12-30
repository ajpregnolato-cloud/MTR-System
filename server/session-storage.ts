import type { MtrWithItems, MtrItem, Platform } from "@shared/schema";

export interface SessionMtr {
  id: number;
  mtrCode: string;
  platform: Platform;
  manifestType?: string | null;
  emissionDate?: Date | null;
  generatorName?: string | null;
  generatorCnpj?: string | null;
  transporterName?: string | null;
  transporterCnpj?: string | null;
  receiverName?: string | null;
  receiverCnpj?: string | null;
  motorista?: string | null;
  placa?: string | null;
  responsavelRecebimento?: string | null;
  justificativa?: string | null;
  sinirStatus?: string | null;
  systemStatus: "PENDENTE" | "VALIDO" | "ERRO" | "ENVIADO" | "PROCESSADO";
  observations?: string | null;
  isValid: boolean;
  validationErrors?: string[] | null;
  items: SessionMtrItem[];
}

export interface SessionMtrItem {
  id: number;
  mtrId: number;
  code?: string | null;
  description?: string | null;
  quantity?: string | null;
  quantityReceived?: string | null;
  unit?: string | null;
  treatment?: string | null;
  class?: string | null;
}

export interface SendResult {
  mtrCode: string;
  platform: Platform;
  success: boolean;
  message: string;
  timestamp: Date;
  details?: any;
}

export interface SessionData {
  mtrs: Map<number, SessionMtr>;
  results: SendResult[];
  lastImportPlatform?: Platform;
  nextId: number;
  nextItemId: number;
}

class SessionStorage {
  private sessions: Map<string, SessionData> = new Map();
  private defaultSessionId = "default";

  private getSession(sessionId: string = this.defaultSessionId): SessionData {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        mtrs: new Map(),
        results: [],
        nextId: 1,
        nextItemId: 1,
      });
    }
    return this.sessions.get(sessionId)!;
  }

  addMtr(mtr: Omit<SessionMtr, "id" | "items">, items: Omit<SessionMtrItem, "id" | "mtrId">[], sessionId?: string): SessionMtr {
    const session = this.getSession(sessionId);
    const id = session.nextId++;
    
    const newItems: SessionMtrItem[] = items.map(item => ({
      ...item,
      id: session.nextItemId++,
      mtrId: id,
    }));

    const newMtr: SessionMtr = {
      ...mtr,
      id,
      items: newItems,
    };

    session.mtrs.set(id, newMtr);
    session.lastImportPlatform = mtr.platform;
    return newMtr;
  }

  getMtrs(sessionId?: string): SessionMtr[] {
    const session = this.getSession(sessionId);
    return Array.from(session.mtrs.values());
  }

  getMtr(id: number, sessionId?: string): SessionMtr | undefined {
    const session = this.getSession(sessionId);
    return session.mtrs.get(id);
  }

  getMtrByCode(code: string, sessionId?: string): SessionMtr | undefined {
    const session = this.getSession(sessionId);
    const mtrs = Array.from(session.mtrs.values());
    return mtrs.find(mtr => mtr.mtrCode === code);
  }

  updateMtr(id: number, updates: Partial<SessionMtr>, sessionId?: string): SessionMtr | undefined {
    const session = this.getSession(sessionId);
    const mtr = session.mtrs.get(id);
    if (!mtr) return undefined;

    const updated = { ...mtr, ...updates };
    session.mtrs.set(id, updated);
    return updated;
  }

  updateMtrItem(mtrId: number, itemId: number, updates: Partial<SessionMtrItem>, sessionId?: string): SessionMtr | undefined {
    const session = this.getSession(sessionId);
    const mtr = session.mtrs.get(mtrId);
    if (!mtr) return undefined;

    mtr.items = mtr.items.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    );
    session.mtrs.set(mtrId, mtr);
    return mtr;
  }

  deleteMtr(id: number, sessionId?: string): boolean {
    const session = this.getSession(sessionId);
    return session.mtrs.delete(id);
  }

  clearMtrs(sessionId?: string): number {
    const session = this.getSession(sessionId);
    const count = session.mtrs.size;
    session.mtrs.clear();
    session.nextId = 1;
    session.nextItemId = 1;
    return count;
  }

  addResult(result: SendResult, sessionId?: string): void {
    const session = this.getSession(sessionId);
    session.results.push(result);
  }

  getResults(sessionId?: string): SendResult[] {
    const session = this.getSession(sessionId);
    return session.results;
  }

  clearResults(sessionId?: string): number {
    const session = this.getSession(sessionId);
    const count = session.results.length;
    session.results = [];
    return count;
  }

  getLastImportPlatform(sessionId?: string): Platform | undefined {
    return this.getSession(sessionId).lastImportPlatform;
  }

  setLastImportPlatform(platform: Platform, sessionId?: string): void {
    this.getSession(sessionId).lastImportPlatform = platform;
  }

  getStats(sessionId?: string): { 
    totalMtrs: number; 
    pendente: number; 
    valido: number; 
    erro: number; 
    enviado: number; 
    processado: number;
    resultsCount: number;
  } {
    const session = this.getSession(sessionId);
    const mtrs = Array.from(session.mtrs.values());
    
    return {
      totalMtrs: mtrs.length,
      pendente: mtrs.filter(m => m.systemStatus === "PENDENTE").length,
      valido: mtrs.filter(m => m.systemStatus === "VALIDO").length,
      erro: mtrs.filter(m => m.systemStatus === "ERRO").length,
      enviado: mtrs.filter(m => m.systemStatus === "ENVIADO").length,
      processado: mtrs.filter(m => m.systemStatus === "PROCESSADO").length,
      resultsCount: session.results.length,
    };
  }

  toMtrWithItems(sessionMtr: SessionMtr): MtrWithItems {
    return {
      id: sessionMtr.id,
      mtrCode: sessionMtr.mtrCode,
      platform: sessionMtr.platform,
      manifestType: sessionMtr.manifestType || null,
      emissionDate: sessionMtr.emissionDate || null,
      generatorName: sessionMtr.generatorName || null,
      generatorCnpj: sessionMtr.generatorCnpj || null,
      transporterName: sessionMtr.transporterName || null,
      transporterCnpj: sessionMtr.transporterCnpj || null,
      receiverName: sessionMtr.receiverName || null,
      receiverCnpj: sessionMtr.receiverCnpj || null,
      motorista: sessionMtr.motorista || null,
      placa: sessionMtr.placa || null,
      responsavelRecebimento: sessionMtr.responsavelRecebimento || null,
      justificativa: sessionMtr.justificativa || null,
      sinirStatus: sessionMtr.sinirStatus || null,
      systemStatus: sessionMtr.systemStatus,
      observations: sessionMtr.observations || null,
      isValid: sessionMtr.isValid,
      validationErrors: sessionMtr.validationErrors || null,
      importedAt: new Date(),
      lastUpdatedAt: new Date(),
      items: sessionMtr.items.map(item => ({
        id: item.id,
        mtrId: item.mtrId,
        code: item.code || null,
        description: item.description || null,
        quantity: item.quantity || null,
        quantityReceived: item.quantityReceived || null,
        unit: item.unit || null,
        treatment: item.treatment || null,
        class: item.class || null,
      })),
    };
  }
}

export const sessionStorage = new SessionStorage();
