import { MtrWithItems, iemaConfig } from "@shared/schema";
import { db } from "./db";

// IEMA API Integration (Espírito Santo)
// API Docs from manual provided
// Homologation: https://apps.iema.es.gov.br:8443/api
// Production: https://mtr.iema.es.gov.br/api

export interface IemaAuthResponse {
  pessoaCodigo: number;
  pessoaCnpj: string;
  usuarioCpf: string;
  token: string;
  retornoCodigo: number;
  retorno: string;
}

export interface IemaManifestoResponse {
  manifestoJSONDtos?: any[];
  retornoCodigo?: number;
  retorno?: string;
}

interface ManifestoRecebimentoIema {
  codigoBarras: string;
  dataRecebimento: string; // format: YYYYMMDD
  nomeResponsavelRecebimento: string;
  cargoResponsavelRecebimento?: string;
  observacao?: string;
  itemManifestoJSONs: ItemRecebimentoIema[];
}

interface ItemRecebimentoIema {
  codigoSequencial: number;
  quantidadeRecebida: number;
  justificativa?: string;
}

export class IemaService {
  private baseUrlHomolog = "https://apps.iema.es.gov.br:8443/api";
  private baseUrlProd = "https://mtr.iema.es.gov.br/api";
  private token: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor() {}

  private getBaseUrl(ambiente: string): string {
    return ambiente === "homologacao" ? this.baseUrlHomolog : this.baseUrlProd;
  }

  private async getCredentials() {
    const dbConfig = await db.select().from(iemaConfig).limit(1);
    if (dbConfig.length > 0) {
      const config = dbConfig[0];
      return {
        pessoaCodigo: config.pessoaCodigo || undefined,
        pessoaCnpj: config.pessoaCnpj?.replace(/\D/g, '') || undefined,
        usuarioCpf: config.usuarioCpf?.replace(/\D/g, '') || undefined,
        senha: config.senha || undefined,
        token: config.token || undefined,
        tokenExpiresAt: config.tokenExpiresAt || undefined,
        ambiente: config.ambiente || "producao",
      };
    }
    return { 
      pessoaCodigo: undefined, 
      pessoaCnpj: undefined, 
      usuarioCpf: undefined, 
      senha: undefined, 
      token: undefined, 
      tokenExpiresAt: undefined,
      ambiente: "producao" 
    };
  }

  private isTokenValid(): boolean {
    if (!this.token || !this.tokenExpiresAt) return false;
    return new Date() < this.tokenExpiresAt;
  }

  async authenticate(): Promise<boolean> {
    const credentials = await this.getCredentials();
    const { pessoaCodigo, pessoaCnpj, usuarioCpf, senha, token, tokenExpiresAt, ambiente } = credentials;

    if (token && tokenExpiresAt && new Date() < tokenExpiresAt) {
      this.token = token;
      this.tokenExpiresAt = tokenExpiresAt;
      console.log("[IEMA] Using cached token from database");
      return true;
    }

    if (!pessoaCnpj || !usuarioCpf || !senha) {
      console.error("[IEMA] Missing credentials (pessoaCnpj, usuarioCpf, or senha)");
      return false;
    }

    try {
      console.log("[IEMA] Authenticating with IEMA API...");
      const baseUrl = this.getBaseUrl(ambiente);
      
      const payload: any = {
        pessoaCnpj,
        usuarioCpf,
        senha,
      };
      
      if (pessoaCodigo) {
        payload.pessoaCodigo = pessoaCodigo;
      }
      
      console.log("[IEMA] Auth payload:", JSON.stringify({ ...payload, senha: "***" }));

      const response = await fetch(`${baseUrl}/gettoken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data: IemaAuthResponse = await response.json();
      console.log("[IEMA] Auth response:", JSON.stringify({ ...data, token: data.token ? "***" : undefined }));

      if (data.retornoCodigo !== 0) {
        console.error("[IEMA] Authentication failed:", data.retorno);
        return false;
      }

      this.token = data.token;
      this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

      await db.update(iemaConfig)
        .set({ 
          token: this.token, 
          tokenExpiresAt: this.tokenExpiresAt,
          updatedAt: new Date()
        })
        .where(db.sql`1=1`);

      console.log("[IEMA] Authentication successful");
      return true;
    } catch (error: any) {
      console.error("[IEMA] Authentication error:", error.message);
      return false;
    }
  }

  private getUnitCode(unitText: string | null): number {
    if (!unitText) return 4;
    const normalized = unitText.toLowerCase().trim();
    const unitMap: Record<string, number> = {
      'tonelada': 4,
      'ton': 4,
      't': 4,
      'kg': 3,
      'quilograma': 3,
      'litro': 2,
      'lt': 2,
      'l': 2,
      'm³': 1,
      'm3': 1,
      'metro cúbico': 1,
      'unidade': 5,
      'un': 5,
    };
    return unitMap[normalized] || 4;
  }

  private getTechnologyCode(treatmentText: string | null): number {
    if (!treatmentText) return 7;
    const normalized = treatmentText.toLowerCase().trim();
    const techMap: Record<string, number> = {
      'reciclagem': 7,
      'coprocessamento': 3,
      'incineração': 4,
      'aterro industrial': 31,
      'aterro classe i': 31,
      'aterro classe iia': 32,
      'aterro': 32,
      'tratamento de efluentes': 6,
      'autoclave': 5,
      'compostagem': 10,
    };
    
    for (const [key, value] of Object.entries(techMap)) {
      if (normalized.includes(key)) return value;
    }
    return 7;
  }

  private extractIbamaCode(code: string | null): string {
    if (!code) return '';
    const match = code.match(/(\d{6})/);
    return match ? match[1] : code.replace(/\D/g, '').substring(0, 6);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  async receiveMtrBatch(mtrs: MtrWithItems[]): Promise<{ success: boolean; results: any[]; details?: any }> {
    if (!this.isTokenValid()) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, results: [{ error: "Falha na autenticação IEMA" }] };
      }
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);

    const payload: ManifestoRecebimentoIema[] = mtrs.map((mtr, mtrIndex) => ({
      codigoBarras: mtr.mtrCode,
      dataRecebimento: this.formatDate(new Date()),
      nomeResponsavelRecebimento: mtr.responsavelRecebimento || "Responsável Técnico",
      cargoResponsavelRecebimento: "Responsável Técnico",
      observacao: mtr.observations || `Recebido via integração - ${new Date().toLocaleDateString('pt-BR')}`,
      itemManifestoJSONs: mtr.items.map((item, itemIndex) => {
        const qty = Number(item.quantity) || 0;
        const qtyReceived = item.quantityReceived ? Number(item.quantityReceived) : qty;
        return {
          codigoSequencial: itemIndex + 1,
          quantidadeRecebida: qtyReceived,
          justificativa: mtr.justificativa || undefined,
        };
      }),
    }));

    console.log("[IEMA] Sending batch receive payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(`${baseUrl}/recebeManifestoLote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ manifestoJSONDtos: payload }),
      });

      const text = await response.text();
      console.log(`[IEMA] Response status: ${response.status}`);
      console.log(`[IEMA] Raw response (first 2000 chars): ${text.substring(0, 2000)}`);

      if (text.startsWith('<!') || text.startsWith('<html')) {
        return { success: false, results: [{ error: "IEMA API retornou página HTML de erro" }] };
      }

      const data = JSON.parse(text);
      console.log("[IEMA] Batch receive response:", JSON.stringify(data, null, 2));

      const hasErrors = data.manifestoJSONDtos?.some((d: any) => d.retornoCodigo !== 0);
      
      return { 
        success: !hasErrors, 
        results: data.manifestoJSONDtos || [], 
        details: data 
      };
    } catch (error: any) {
      console.error("[IEMA] Batch receive error:", error.message);
      return { success: false, results: [{ error: error.message }] };
    }
  }

  async sendMtr(mtr: MtrWithItems): Promise<boolean> {
    const result = await this.receiveMtrBatch([mtr]);
    return result.success;
  }

  async sendMtrWithDetails(mtr: MtrWithItems): Promise<{ success: boolean; message?: string; details?: any }> {
    const result = await this.receiveMtrBatch([mtr]);
    return {
      success: result.success,
      message: result.results?.[0]?.retorno || result.results?.[0]?.error,
      details: result.details,
    };
  }

  async getManifestByBarcode(barcode: string): Promise<any | null> {
    if (!this.isTokenValid()) {
      const authenticated = await this.authenticate();
      if (!authenticated) return null;
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);

    try {
      const response = await fetch(`${baseUrl}/retornaManifestoPorCodigoBarras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ codigoBarras: barcode }),
      });

      const data = await response.json();
      console.log("[IEMA] Get manifest response:", JSON.stringify(data, null, 2));

      if (data.retornoCodigo !== 0) {
        console.error("[IEMA] Get manifest failed:", data.retorno);
        return null;
      }

      return data;
    } catch (error: any) {
      console.error("[IEMA] Get manifest error:", error.message);
      return null;
    }
  }

  async getManifestsByDate(date: string): Promise<any[]> {
    if (!this.isTokenValid()) {
      const authenticated = await this.authenticate();
      if (!authenticated) return [];
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);

    try {
      const response = await fetch(`${baseUrl}/retornaListaCodigoBarrasManifestosPorData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ data: date }),
      });

      const data = await response.json();
      return data || [];
    } catch (error: any) {
      console.error("[IEMA] Get manifests by date error:", error.message);
      return [];
    }
  }

  async downloadMtrPdf(barcode: string): Promise<Buffer | null> {
    if (!this.isTokenValid()) {
      const authenticated = await this.authenticate();
      if (!authenticated) return null;
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);

    try {
      const response = await fetch(`${baseUrl}/downloadPdfManifesto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ codigoBarras: barcode }),
      });

      if (!response.ok) {
        console.error(`[IEMA] Error downloading MTR PDF: ${response.statusText}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      console.error("[IEMA] Error downloading MTR PDF:", error.message);
      return null;
    }
  }

  async cancelMtr(barcode: string, justificativa: string): Promise<{ success: boolean; message: string }> {
    if (!this.isTokenValid()) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação" };
      }
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);

    try {
      const response = await fetch(`${baseUrl}/cancelaManifesto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          codigoBarras: barcode,
          justificativa: justificativa,
        }),
      });

      const data = await response.json();

      if (data.retornoCodigo !== 0) {
        return { success: false, message: data.retorno };
      }

      return { success: true, message: data.retorno || "Manifesto cancelado com sucesso" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async getLists(): Promise<{
    classes: any[];
    units: any[];
    technologies: any[];
    physicalStates: any[];
    residues: any[];
    packaging: any[];
  }> {
    if (!this.isTokenValid()) {
      await this.authenticate();
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };

    const fetchList = async (endpoint: string): Promise<any[]> => {
      try {
        const response = await fetch(`${baseUrl}/${endpoint}`, {
          method: 'POST',
          headers,
        });
        return await response.json();
      } catch {
        return [];
      }
    };

    const [classes, units, technologies, physicalStates, residues, packaging] = await Promise.all([
      fetchList('retornaListaClasse'),
      fetchList('retornaListaUnidade'),
      fetchList('retornaListaTecnologia'),
      fetchList('retornaListaEstadoFisico'),
      fetchList('retornaListaResiduo'),
      fetchList('retornaListaAcondicionamento'),
    ]);

    return { classes, units, technologies, physicalStates, residues, packaging };
  }

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const credentials = await this.getCredentials();
      
      if (!credentials.pessoaCnpj || !credentials.usuarioCpf) {
        return { 
          success: false, 
          message: "Credenciais IEMA não configuradas. Preencha em Configurações > Credenciais IEMA" 
        };
      }

      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação com IEMA API" };
      }

      return { 
        success: true, 
        message: "Conexão com IEMA API estabelecida com sucesso!",
        details: { 
          tokenConfigured: !!this.token,
          ambiente: credentials.ambiente,
          cnpj: credentials.pessoaCnpj ? `${credentials.pessoaCnpj.substring(0, 4)}...` : 'não configurado'
        }
      };
    } catch (error: any) {
      return { success: false, message: `Erro: ${error.message}` };
    }
  }
}
