import { MtrWithItems } from "@shared/schema";

// SINIR API Integration based on official Swagger documentation
// API Docs: https://admin.sinir.gov.br/api/swagger-ui.html
// Base URL: https://admin.sinir.gov.br/api

export interface SinirAuthResponse {
  mensagem: string;
  objetoResposta: {
    token: string;
    tipo: string;
    expiraEm: number;
  } | string;
  erro: boolean;
}

export interface SinirManifestoResponse {
  mensagem: string;
  objetoResposta: any;
  erro: boolean;
}

// Request structure for receiving manifests (based on Swagger docs)
interface ManifestoRecebimento {
  manNumero: string;
  dataRecebimento: number; // Unix timestamp in milliseconds
  nomeMotorista?: string;
  placaVeiculo?: string;
  nomeResponsavelRecebimento: string;
  observacoes?: string;
  listaManifestoResiduos: ManifestoResiduo[];
}

interface ManifestoResiduo {
  resCodigoIbama: string;
  marQuantidade: number;
  marQuantidadeRecebida: number;
  uniCodigo?: number;
  traCodigo?: number;
  marJustificativa?: string;
}

export class SinirService {
  // Use new API base URL from Swagger docs
  private baseUrl = "https://admin.sinir.gov.br/api";
  // Keep legacy URL as fallback
  private legacyBaseUrl = "https://admin.sinir.gov.br/apiws/rest";
  private token: string | null = null;

  constructor() {}

  // Get credentials from environment
  private getCredentials() {
    const cnpj = process.env.SINIR_CNPJ?.replace(/\D/g, '');
    const senha = process.env.SINIR_PASSWORD;
    const usuario = process.env.SINIR_USER;
    const preToken = process.env.SINIR_TOKEN;
    
    return { cnpj, senha, usuario, preToken };
  }

  // Authenticate with SINIR API - New endpoint: /autenticar
  async authenticate(): Promise<boolean> {
    const { usuario, senha, preToken } = this.getCredentials();
    
    // If we have a pre-generated token, use it
    if (preToken) {
      this.token = preToken.startsWith('Bearer ') ? preToken : `Bearer ${preToken}`;
      console.log("[SINIR] Using pre-configured token");
      return true;
    }

    if (!usuario || !senha) {
      console.error("[SINIR] Missing credentials (SINIR_USER or SINIR_PASSWORD)");
      return false;
    }

    try {
      // Try new API endpoint first
      console.log("[SINIR] Attempting authentication with new API...");
      const response = await fetch(`${this.baseUrl}/autenticar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usuario: usuario,
          senha: senha,
        }),
      });

      const data: SinirAuthResponse = await response.json();
      console.log("[SINIR] Auth response:", JSON.stringify(data, null, 2));

      if (data.erro) {
        console.error("[SINIR] Authentication failed:", data.mensagem);
        return false;
      }

      // Extract token from response
      if (typeof data.objetoResposta === 'object' && data.objetoResposta.token) {
        this.token = `${data.objetoResposta.tipo} ${data.objetoResposta.token}`;
      } else if (typeof data.objetoResposta === 'string') {
        this.token = data.objetoResposta.startsWith('Bearer ') 
          ? data.objetoResposta 
          : `Bearer ${data.objetoResposta}`;
      }

      console.log("[SINIR] Authentication successful");
      return true;
    } catch (error: any) {
      console.error("[SINIR] Authentication error:", error.message);
      return false;
    }
  }

  // Helper to map unit text to SINIR unit code
  private getUnitCode(unitText: string | null): number {
    if (!unitText) return 1;
    const normalized = unitText.toLowerCase().trim();
    const unitMap: Record<string, number> = {
      'tonelada': 1,
      'ton': 1,
      't': 1,
      'kg': 2,
      'quilograma': 2,
      'litro': 21,
      'lt': 21,
      'l': 21,
      'm³': 20,
      'm3': 20,
      'metro cúbico': 20,
      'unidade': 22,
      'un': 22,
    };
    return unitMap[normalized] || 1;
  }

  // Extract IBAMA code from residue code/description
  private extractIbamaCode(code: string | null): string {
    if (!code) return '';
    // IBAMA codes are typically 6 digits
    const match = code.match(/(\d{6})/);
    return match ? match[1] : code.replace(/\D/g, '').substring(0, 6);
  }

  // Receive MTR in batch - Endpoint: /receberManifestoLote
  // Based on SINIR Swagger documentation
  async receiveMtrBatch(mtrs: MtrWithItems[]): Promise<{ success: boolean; results: any[]; details?: any }> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, results: [{ error: "Falha na autenticação" }] };
      }
    }

    // Build payload as array according to SINIR docs
    const payload: ManifestoRecebimento[] = mtrs.map(mtr => ({
      manNumero: mtr.mtrCode,
      dataRecebimento: new Date().getTime(),
      nomeResponsavelRecebimento: "Responsável Técnico",
      observacoes: mtr.observations || `Recebido via integração - ${new Date().toLocaleDateString('pt-BR')}`,
      listaManifestoResiduos: mtr.items.map(item => {
        const qty = Number(item.quantity) || 0;
        return {
          resCodigoIbama: this.extractIbamaCode(item.code),
          marQuantidade: qty,
          marQuantidadeRecebida: qty,
          uniCodigo: this.getUnitCode(item.unit),
        };
      }),
    }));

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

  // Send single MTR with full response details
  async sendMtrWithDetails(mtr: MtrWithItems): Promise<{ success: boolean; message?: string; details?: any }> {
    const result = await this.receiveMtrBatch([mtr]);
    return {
      success: result.success,
      message: result.results?.[0]?.error,
      details: result.details,
    };
  }

  // Download MTR PDF - Endpoint: /downloadManifesto/{manNumero}
  async downloadMtrPdf(mtrCode: string): Promise<Buffer | null> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/downloadManifesto/${mtrCode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });

      if (!response.ok) {
        console.error(`[SINIR] Error downloading MTR PDF: ${response.statusText}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error: any) {
      console.error("[SINIR] Error downloading MTR PDF:", error.message);
      return null;
    }
  }

  // Cancel manifest - Endpoint: /cancelarManifesto
  async cancelMtr(mtrCode: string, justificativa: string): Promise<{ success: boolean; message: string }> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação" };
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}/cancelarManifesto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
        body: JSON.stringify({
          manNumero: mtrCode,
          justificativa: justificativa,
        }),
      });

      const data: SinirManifestoResponse = await response.json();

      if (data.erro) {
        return { success: false, message: data.mensagem };
      }

      return { success: true, message: data.mensagem || "Manifesto cancelado com sucesso" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Fetch MTR details by code - tries multiple endpoints
  async getMtrByCode(mtrCode: string): Promise<any | null> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) return null;
    }

    // Try different API endpoints
    const endpoints = [
      `${this.legacyBaseUrl}/retornaManifesto/${mtrCode}`,
      `${this.baseUrl}/retornaManifesto/${mtrCode}`,
      `${this.legacyBaseUrl}/consultaManifesto/${mtrCode}`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`[SINIR] Trying endpoint: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.token!,
          },
        });

        const text = await response.text();
        
        // Check if response is HTML (error page)
        if (text.startsWith('<!') || text.startsWith('<html')) {
          console.log(`[SINIR] Endpoint returned HTML, trying next...`);
          continue;
        }

        const data: SinirManifestoResponse = JSON.parse(text);
        console.log("[SINIR] Fetch MTR response:", JSON.stringify(data, null, 2));

        if (!data.erro && data.objetoResposta) {
          return data.objetoResposta;
        }
      } catch (error: any) {
        console.log(`[SINIR] Endpoint failed: ${error.message}`);
        continue;
      }
    }

    console.error(`[SINIR] Could not fetch MTR ${mtrCode} from any endpoint`);
    return null;
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

  // Test connection - tries authentication and a simple API call
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const { usuario, preToken } = this.getCredentials();
      
      if (!usuario && !preToken) {
        return { 
          success: false, 
          message: "Credenciais não configuradas (SINIR_USER, SINIR_PASSWORD ou SINIR_TOKEN)" 
        };
      }

      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação com SINIR API" };
      }

      return { 
        success: true, 
        message: "Conexão com SINIR API estabelecida com sucesso!",
        details: { tokenConfigured: !!this.token }
      };
    } catch (error: any) {
      return { success: false, message: `Erro: ${error.message}` };
    }
  }
}
