import { MtrWithItems, iemaConfig } from "@shared/schema";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";

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

// Correct structure per manual section 12 - Recebe Manifesto Lote
interface ManifestoRecebimentoIema {
  manifestoCodigo: string; // 10-digit manifest number
  cnpGerador: string;
  cnpTransportador: string;
  recebimentoMtrResponsavel: string;
  recebimentoMtrCargo: string;
  recebimentoMtrData: string; // format: YYYYMMDD
  recebimentoMtrObs?: string;
  nomeMotorista: string;
  placaVeiculo: string;
  transporteMtrData: string; // format: YYYYMMDD
  itemManifestoRecebimentoJSONs: ItemRecebimentoIema[];
}

interface ItemRecebimentoIema {
  codigoSequencial: number;
  justificativa?: string | null;
  codigoInterno?: string | null;
  qtdRecebida: number;
  residuo: string; // IBAMA code
  codigoTecnologia: number;
  codigoTipoEstado: number;
}

// Unit and technology lookup tables per IEMA manual
const IEMA_UNIT_MAP: Record<string, number> = {
  'm³': 1, 'm3': 1, 'metro cúbico': 1, 'metrocubico': 1,
  'litro': 2, 'lt': 2, 'l': 2,
  'kg': 3, 'quilograma': 3, 'quilogramas': 3,
  'tonelada': 4, 'ton': 4, 't': 4,
  'unidade': 5, 'un': 5,
};

const IEMA_TECHNOLOGY_MAP: Record<string, number> = {
  'reciclagem': 7,
  'coprocessamento': 3,
  'incineração': 4,
  'aterro industrial': 31, 'aterro classe i': 31,
  'aterro classe iia': 32, 'aterro classe iib': 32, 'aterro': 32,
  'tratamento de efluentes': 6,
  'autoclave': 5,
  'compostagem': 10,
  'rerrefino': 8,
  'blendagem': 9,
};

const IEMA_STATE_MAP: Record<string, number> = {
  'sólido': 1, 'solido': 1, 'sól': 1, 'sol': 1,
  'líquido': 2, 'liquido': 2, 'líq': 2, 'liq': 2,
  'semi-sólido': 3, 'semi-solido': 3, 'pastoso': 3,
  'gasoso': 4, 'gas': 4,
};

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
        responsavelNome: config.responsavelNome || undefined,
      };
    }
    return { 
      pessoaCodigo: undefined, 
      pessoaCnpj: undefined, 
      usuarioCpf: undefined, 
      senha: undefined, 
      token: undefined, 
      tokenExpiresAt: undefined,
      ambiente: "producao",
      responsavelNome: undefined,
    };
  }

  private isTokenValid(): boolean {
    if (!this.token || !this.tokenExpiresAt) return false;
    return new Date() < this.tokenExpiresAt;
  }

  async authenticate(forceNew: boolean = false): Promise<boolean> {
    const credentials = await this.getCredentials();
    const { pessoaCodigo, pessoaCnpj, usuarioCpf, senha, token, tokenExpiresAt, ambiente } = credentials;

    if (!forceNew && token && tokenExpiresAt && new Date() < tokenExpiresAt) {
      this.token = token;
      this.tokenExpiresAt = tokenExpiresAt;
      console.log("[IEMA] Using cached token from database");
      return true;
    }
    
    if (forceNew) {
      console.log("[IEMA] Forcing new authentication (ignoring cache)");
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
        .where(sql`1=1`);

      console.log("[IEMA] Authentication successful");
      return true;
    } catch (error: any) {
      console.error("[IEMA] Authentication error:", error.message);
      return false;
    }
  }

  private getUnitCode(unitText: string | null): number {
    if (!unitText) return 4; // Default: Tonelada
    const normalized = unitText.toLowerCase().trim();
    return IEMA_UNIT_MAP[normalized] || 4;
  }

  private getTechnologyCode(treatmentText: string | null): number {
    if (!treatmentText) return 7; // Default: Reciclagem
    const normalized = treatmentText.toLowerCase().trim();
    
    for (const [key, value] of Object.entries(IEMA_TECHNOLOGY_MAP)) {
      if (normalized.includes(key)) return value;
    }
    return 7;
  }

  private getPhysicalStateCode(stateText: string | null, residue: string | null): number {
    // Special case per manual: Residue 200304 must be Líquido (2)
    if (residue && residue.includes('200304')) return 2;
    
    if (!stateText) return 1; // Default: Sólido
    const normalized = stateText.toLowerCase().trim();
    return IEMA_STATE_MAP[normalized] || 1;
  }

  private extractIbamaCode(code: string | null): string {
    if (!code) return '';
    // Try to extract 6-digit IBAMA code
    const match = code.match(/(\d{6})/);
    return match ? match[1] : code.replace(/\D/g, '').substring(0, 6);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // Extract 10-digit manifest code from barcode (first 10 chars) or use as-is if already 10 digits
  private extractManifestoCodigo(mtrCode: string): string {
    const cleanCode = mtrCode.replace(/\D/g, '');
    // If 34 digits (barcode), extract first 10
    if (cleanCode.length === 34) {
      return cleanCode.substring(0, 10);
    }
    // If already 10 digits, use as-is
    if (cleanCode.length === 10) {
      return cleanCode;
    }
    // Otherwise pad/truncate to 10
    return cleanCode.padStart(10, '0').substring(0, 10);
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
    const today = this.formatDate(new Date());
    
    // Get configured default responsible name
    const defaultResponsavel = credentials.responsavelNome || null;

    // Build payload per manual section 12
    // Validate required fields before building payload
    const errors: string[] = [];
    mtrs.forEach((mtr, idx) => {
      if (!mtr.generatorCnpj) errors.push(`MTR ${mtr.mtrCode}: CNPJ do gerador não informado`);
      if (!mtr.transporterCnpj) errors.push(`MTR ${mtr.mtrCode}: CNPJ do transportador não informado`);
      if (!mtr.motorista) errors.push(`MTR ${mtr.mtrCode}: Nome do motorista não informado`);
      if (!mtr.placa) errors.push(`MTR ${mtr.mtrCode}: Placa do veículo não informada`);
      if (!mtr.responsavelRecebimento && !defaultResponsavel) errors.push(`MTR ${mtr.mtrCode}: Responsável pelo recebimento não informado`);
      if (mtr.items.length === 0) errors.push(`MTR ${mtr.mtrCode}: Nenhum resíduo informado`);
    });
    
    if (errors.length > 0) {
      return { 
        success: false, 
        results: errors.map(e => ({ error: e })),
        details: { validationErrors: errors }
      };
    }
    
    const payload: ManifestoRecebimentoIema[] = mtrs.map((mtr) => {
      const manifestoCodigo = this.extractManifestoCodigo(mtr.mtrCode);
      
      return {
        manifestoCodigo,
        cnpGerador: mtr.generatorCnpj!.replace(/\D/g, ''),
        cnpTransportador: mtr.transporterCnpj!.replace(/\D/g, ''),
        recebimentoMtrResponsavel: mtr.responsavelRecebimento || defaultResponsavel!,
        recebimentoMtrCargo: "Responsável Técnico", // Default cargo per common usage
        recebimentoMtrData: today,
        recebimentoMtrObs: mtr.observations || "",
        nomeMotorista: mtr.motorista!,
        placaVeiculo: mtr.placa!.replace(/[^A-Z0-9]/gi, ''),
        transporteMtrData: today,
        itemManifestoRecebimentoJSONs: mtr.items.map((item, idx) => {
          const qty = Number(item.quantity) || 0;
          const qtyReceived = item.quantityReceived ? Number(item.quantityReceived) : qty;
          const residuo = this.extractIbamaCode(item.code || item.description || '');
          // Use class field for physical state if available (e.g., "Líquido", "Sólido")
          const stateHint = item.class?.toLowerCase().includes('líquido') ? 'líquido' : null;
          
          return {
            codigoSequencial: idx + 1,
            justificativa: qtyReceived !== qty ? (mtr.justificativa || "Quantidade ajustada") : null,
            codigoInterno: null,
            qtdRecebida: qtyReceived,
            residuo: residuo,
            codigoTecnologia: this.getTechnologyCode(item.treatment || null),
            codigoTipoEstado: this.getPhysicalStateCode(stateHint, residuo),
          };
        }),
      };
    });

    console.log("[IEMA] Sending batch receive payload:", JSON.stringify(payload, null, 2));

    try {
      // Correct endpoint per manual: receberManifestoLote (not recebeManifestoLote)
      const response = await fetch(`${baseUrl}/receberManifestoLote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ manifestoRecebimentoJSONs: payload }),
      });

      const text = await response.text();
      console.log(`[IEMA] Response status: ${response.status}`);
      console.log(`[IEMA] Raw response (first 2000 chars): ${text.substring(0, 2000)}`);

      if (text.startsWith('<!') || text.startsWith('<html')) {
        return { success: false, results: [{ error: "IEMA API retornou página HTML de erro" }] };
      }

      const data = JSON.parse(text);
      console.log("[IEMA] Batch receive response:", JSON.stringify(data, null, 2));

      const results = data.manifestoRecebimentoJSONs || [];
      const hasErrors = results.some((d: any) => d.retornoCodigo !== 0);
      
      return { 
        success: !hasErrors, 
        results, 
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
      // Correct endpoint per manual section 16: retornaManifesto/{CODIGO_BARRA}
      const response = await fetch(`${baseUrl}/retornaManifesto/${barcode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
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
      // Correct endpoint per manual section 17: retornaListaCodigoBarrasManifesto/{dataInicio}
      // Date format: YYYYMMDD
      const response = await fetch(`${baseUrl}/retornaListaCodigoBarrasManifesto/${date}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
      });

      const data = await response.json();
      console.log("[IEMA] Get manifests by date response:", JSON.stringify(data, null, 2));
      
      if (data.retornoCodigo === 0 && data.codigos) {
        return data.codigos;
      }
      return [];
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
      // Correct endpoint per manual section 9: buscaPdfManifestoPorCodigoBarras/{CODIGO_BARRA}
      const response = await fetch(`${baseUrl}/buscaPdfManifestoPorCodigoBarras/${barcode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'Authorization': `Bearer ${this.token}`,
        },
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

  async cancelMtr(mtrCodeOrBarcode: string, justificativa: string): Promise<{ success: boolean; message: string }> {
    if (!this.isTokenValid()) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação" };
      }
    }

    if (!justificativa || justificativa.trim().length === 0) {
      return { success: false, message: "Justificativa é obrigatória para cancelamento" };
    }

    const credentials = await this.getCredentials();
    const baseUrl = this.getBaseUrl(credentials.ambiente);

    try {
      // Extract 10-digit manifest code if barcode provided
      const manifestoCodigo = this.extractManifestoCodigo(mtrCodeOrBarcode);
      
      // Correct endpoint per manual section 15: cancelarManifesto
      const response = await fetch(`${baseUrl}/cancelarManifesto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          manifestoCodigo: manifestoCodigo,
          justificativa: justificativa.trim(),
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

      // Force new authentication for test (ignore cached token)
      const authenticated = await this.authenticate(true);
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação com IEMA API" };
      }

      // Make a real API call to validate the token works
      const baseUrl = this.getBaseUrl(credentials.ambiente);
      // Try without Bearer prefix first (IEMA may not use it)
      const tokenValue = this.token!;
      console.log("[IEMA] Test API call to:", `${baseUrl}/retornaListaClasse`);
      console.log("[IEMA] Token (first 30 chars):", tokenValue.substring(0, 30) + "...");
      
      // Try with just the token (no Bearer prefix)
      let testResponse = await fetch(`${baseUrl}/retornaListaClasse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenValue,
        },
      });
      
      // If 401, try with Bearer prefix
      if (testResponse.status === 401) {
        console.log("[IEMA] Trying with Bearer prefix...");
        testResponse = await fetch(`${baseUrl}/retornaListaClasse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenValue}`,
          },
        });
      }

      console.log("[IEMA] Test response status:", testResponse.status);
      
      if (!testResponse.ok) {
        const errorBody = await testResponse.text();
        console.log("[IEMA] Test response body:", errorBody);
        return { 
          success: false, 
          message: `Token autenticado mas API retornou erro: ${testResponse.status}`,
          details: { responseBody: errorBody }
        };
      }

      const testData = await testResponse.json();
      const classCount = Array.isArray(testData) ? testData.length : 0;

      return { 
        success: true, 
        message: "Conexão com IEMA API validada com sucesso!",
        details: { 
          tokenValido: true,
          ambiente: credentials.ambiente,
          cnpj: credentials.pessoaCnpj ? `${credentials.pessoaCnpj.substring(0, 4)}...` : 'não configurado',
          classesEncontradas: classCount
        }
      };
    } catch (error: any) {
      return { success: false, message: `Erro: ${error.message}` };
    }
  }
}
