import { MtrWithItems } from "@shared/schema";

// SINIR API Integration based on official documentation
// API Docs: https://admin.sinir.gov.br/apiws/rest

export interface SinirAuthResponse {
  mensagem: string;
  objetoResposta: string; // Bearer token
  erro: boolean;
}

export interface SinirManifestoResponse {
  mensagem: string;
  objetoResposta: any;
  erro: boolean;
}

export class SinirService {
  private baseUrl = "https://admin.sinir.gov.br/apiws/rest";
  private token: string | null = null;

  constructor() {}

  // Get credentials from environment
  private getCredentials() {
    const cnpj = process.env.SINIR_CNPJ?.replace(/\D/g, ''); // Remove formatting
    const senha = process.env.SINIR_PASSWORD;
    const user = process.env.SINIR_USER;
    const preToken = process.env.SINIR_TOKEN; // Pre-generated token if available
    
    return { cnpj, senha, user, preToken };
  }

  // Authenticate with SINIR API
  async authenticate(): Promise<boolean> {
    const { cnpj, senha, preToken } = this.getCredentials();
    
    // If we have a pre-generated token, use it
    if (preToken) {
      this.token = `Bearer ${preToken}`;
      console.log("[SINIR] Using pre-configured token");
      return true;
    }

    if (!cnpj || !senha) {
      console.error("[SINIR] Missing credentials (CNPJ or PASSWORD)");
      return false;
    }

    try {
      // According to docs: POST /gettoken
      // Note: API may require "unidade" (unit code) - we'll need to get this from the system
      const response = await fetch(`${this.baseUrl}/gettoken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cpfCnpj: cnpj,
          senha: senha,
          // unidade might be required - needs to be obtained from the system
        }),
      });

      const data: SinirAuthResponse = await response.json();

      if (data.erro) {
        console.error("[SINIR] Authentication failed:", data.mensagem);
        return false;
      }

      this.token = data.objetoResposta; // Already includes "Bearer " prefix
      console.log("[SINIR] Authentication successful");
      return true;
    } catch (error: any) {
      console.error("[SINIR] Authentication error:", error.message);
      return false;
    }
  }

  // Get MTR details by code - Endpoint: retornaManifesto/{codigo}
  async getMtrByCode(mtrCode: string): Promise<any | null> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/retornaManifesto/${mtrCode}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });

      const data: SinirManifestoResponse = await response.json();

      if (data.erro) {
        console.error(`[SINIR] Error fetching MTR ${mtrCode}:`, data.mensagem);
        return null;
      }

      return data.objetoResposta;
    } catch (error: any) {
      console.error(`[SINIR] Error fetching MTR ${mtrCode}:`, error.message);
      return null;
    }
  }

  // Helper to map unit text to SINIR unit code
  private getUnitCode(unitText: string | null): number {
    if (!unitText) return 1; // Default to Tonelada
    const normalized = unitText.toLowerCase().trim();
    const unitMap: Record<string, number> = {
      'tonelada': 1,
      'kg': 2,
      'quilograma': 2,
      'litro': 21,
      'lt': 21,
      'm³': 20,
      'm3': 20,
      'unidade': 22,
      'un': 22,
    };
    return unitMap[normalized] || 1;
  }

  // Receive MTR in batch - Endpoint: receberManifestoLote
  // According to SINIR Manual section 14
  async receiveMtrBatch(mtrs: MtrWithItems[]): Promise<{ success: boolean; results: any[]; details?: any }> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, results: [{ error: "Falha na autenticação" }] };
      }
    }

    // Build payload according to SINIR manual
    const payload = {
      listaManifesto: mtrs.map(mtr => ({
        codigoManifesto: mtr.mtrCode,
        dataRecebimento: new Date().getTime(), // Timestamp em milissegundos
        recebido: true,
        nomeResponsavelRecebimento: "Sistema MTR Receiver",
        observacoes: `Recebido em lote via integração - ${new Date().toLocaleDateString('pt-BR')}`,
        listaManifestoResiduo: mtr.items.map((item, index) => ({
          // marQuantidade is the quantity actually received
          marQuantidade: Number(item.quantity) || 0,
          // Include IBAMA residue code if available (extracted from description)
          resCodigoIbama: item.code?.match(/^\d{6}/)?.[0] || undefined,
          // Unit code from reference table
          uniCodigo: this.getUnitCode(item.unit),
        })),
      })),
    };

    console.log("[SINIR] Sending batch receive payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(`${this.baseUrl}/receberManifestoLote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
        body: JSON.stringify(payload),
      });

      const data: SinirManifestoResponse = await response.json();

      console.log("[SINIR] Batch receive response:", JSON.stringify(data, null, 2));

      if (data.erro) {
        console.error("[SINIR] Batch receive error:", data.mensagem);
        return { success: false, results: [{ error: data.mensagem }], details: data };
      }

      return { success: true, results: data.objetoResposta || [], details: data };
    } catch (error: any) {
      console.error("[SINIR] Batch receive error:", error.message);
      return { success: false, results: [{ error: error.message }] };
    }
  }

  // Send single MTR for receiving
  async sendMtr(mtr: MtrWithItems): Promise<boolean> {
    const result = await this.receiveMtrBatch([mtr]);
    return result.success;
  }

  // Get list of residue classes
  async getResidueClasses(): Promise<any[]> {
    if (!this.token) await this.authenticate();
    
    try {
      const response = await fetch(`${this.baseUrl}/retornaListaClasse`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });
      const data = await response.json();
      return data.objetoResposta || [];
    } catch (error) {
      console.error("[SINIR] Error fetching classes:", error);
      return [];
    }
  }

  // Get list of units
  async getUnits(): Promise<any[]> {
    if (!this.token) await this.authenticate();
    
    try {
      const response = await fetch(`${this.baseUrl}/retornaListaUnidade`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });
      const data = await response.json();
      return data.objetoResposta || [];
    } catch (error) {
      console.error("[SINIR] Error fetching units:", error);
      return [];
    }
  }

  // Get list of treatments
  async getTreatments(): Promise<any[]> {
    if (!this.token) await this.authenticate();
    
    try {
      const response = await fetch(`${this.baseUrl}/retornaListaTratamento`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });
      const data = await response.json();
      return data.objetoResposta || [];
    } catch (error) {
      console.error("[SINIR] Error fetching treatments:", error);
      return [];
    }
  }

  // Test connection
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação com SINIR" };
      }

      // Try to fetch a simple list to confirm connectivity
      const classes = await this.getResidueClasses();
      if (classes.length > 0) {
        return { success: true, message: `Conexão OK. ${classes.length} classes de resíduos carregadas.` };
      }

      return { success: true, message: "Autenticação bem-sucedida, mas nenhum dado retornado" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
