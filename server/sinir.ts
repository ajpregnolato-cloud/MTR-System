import { MtrWithItems, sinirConfig } from "@shared/schema";
import { db } from "./db";

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

  // Get credentials from database first, fallback to environment
  private async getCredentials() {
    // Try database config first
    const dbConfig = await db.select().from(sinirConfig).limit(1);
    if (dbConfig.length > 0) {
      const config = dbConfig[0];
      return {
        cnpj: config.cnpj?.replace(/\D/g, '') || undefined,
        senha: config.senha || undefined,
        usuario: config.usuario || undefined,
        preToken: config.token || undefined,
        unidade: config.unidade || undefined,
      };
    }
    
    // Fallback to environment variables
    const cnpj = process.env.SINIR_CNPJ?.replace(/\D/g, '');
    const senha = process.env.SINIR_PASSWORD;
    const usuario = process.env.SINIR_USER;
    const preToken = process.env.SINIR_TOKEN;
    const unidade = process.env.SINIR_UNIDADE;
    
    return { cnpj, senha, usuario, preToken, unidade };
  }

  // Authenticate with SINIR API - use credentials to get JWT token
  // forceCredentials: if true, ignore Token API WS and always use credentials
  async authenticate(forceCredentials: boolean = false): Promise<boolean> {
    const credentials = await this.getCredentials();
    const { usuario, senha, preToken, cnpj, unidade } = credentials;
    
    // Check if pre-configured token exists
    if (preToken && preToken.length > 10 && !forceCredentials) {
      const tokenValue = preToken.startsWith('Bearer ') ? preToken.substring(7) : preToken;
      const dotCount = (tokenValue.match(/\./g) || []).length;
      
      if (dotCount === 2) {
        // Valid JWT token
        this.token = preToken.startsWith('Bearer ') ? preToken : `Bearer ${preToken}`;
        console.log("[SINIR] Using pre-configured JWT token");
        return true;
      } else {
        // Token API WS - NOT a JWT, we need to authenticate with credentials
        console.log("[SINIR] Token API WS detected (not JWT) - must authenticate with credentials");
      }
    }
    
    if (!usuario || !senha || !cnpj) {
      console.error("[SINIR] Missing credentials (usuario, senha, or cnpj)");
      return false;
    }

    try {
      console.log("[SINIR] Attempting authentication with credentials...");
      
      // Try different payload formats - SINIR documentation shows different formats
      const payloadFormats = [
        // Format 1: gettoken documented format (cpfCnpj, senha, unidade)
        { cpfCnpj: cnpj, senha: senha, unidade: unidade || '' },
        // Format 2: with usuario as CPF
        { cpfCnpj: cnpj, usuario: usuario.replace(/\D/g, ''), senha: senha, unidade: unidade || '' },
        // Format 3: cpfCnpj as usuario CPF instead of company CNPJ
        { cpfCnpj: usuario.replace(/\D/g, ''), senha: senha, unidade: unidade || '' },
      ];
      
      const authPayload = payloadFormats[0]; // Start with documented format
      console.log("[SINIR] Auth payload:", JSON.stringify({ ...authPayload, senha: "***" }));
      
      // Try multiple auth endpoints - gettoken is the documented SINIR endpoint
      const authEndpoints = [
        { url: `${this.legacyBaseUrl}/gettoken`, name: 'gettoken' },
        { url: `${this.baseUrl}/autenticar`, name: 'autenticar' },
      ];

      // Try each endpoint with each payload format
      for (const endpoint of authEndpoints) {
        for (let i = 0; i < payloadFormats.length; i++) {
          const payload = payloadFormats[i];
          try {
            console.log(`[SINIR] Trying ${endpoint.name} format ${i + 1}: ${endpoint.url}`);
            console.log(`[SINIR] Payload: ${JSON.stringify({ ...payload, senha: "***" })}`);
            const response = await fetch(endpoint.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            });

            const text = await response.text();
            console.log(`[SINIR] ${endpoint.name} format ${i + 1} response status: ${response.status}`);
            
            // Skip HTML error pages
            if (text.startsWith('<!') || text.startsWith('<html')) {
              console.log(`[SINIR] ${endpoint.name} returned HTML, trying next...`);
              continue;
            }

            const data: SinirAuthResponse = JSON.parse(text);
            console.log("[SINIR] Auth response:", JSON.stringify(data, null, 2));

            if (data.erro) {
              console.log(`[SINIR] ${endpoint.name} format ${i + 1} failed: ${data.mensagem}`);
              continue;
            }

            // Extract token from response - gettoken returns Bearer token as string
            if (typeof data.objetoResposta === 'string' && data.objetoResposta.length > 10) {
              // gettoken returns the token with "Bearer " prefix already included
              this.token = data.objetoResposta.startsWith('Bearer ') 
                ? data.objetoResposta 
                : `Bearer ${data.objetoResposta}`;
              console.log("[SINIR] Authentication successful - got token from " + endpoint.name);
              return true;
            } else if (typeof data.objetoResposta === 'object' && data.objetoResposta?.token) {
              this.token = `${data.objetoResposta.tipo || 'Bearer'} ${data.objetoResposta.token}`;
              console.log("[SINIR] Authentication successful - got JWT token object");
              return true;
            }
          } catch (error: any) {
            console.log(`[SINIR] ${endpoint.name} format ${i + 1} error: ${error.message}`);
            continue;
          }
        }
      }

      console.error("[SINIR] All authentication endpoints and formats failed");
      return false;
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

  // Helper to map treatment text to SINIR treatment code (traCodigo)
  private getTreatmentCode(treatmentText: string | null): number {
    if (!treatmentText) return 1;
    const normalized = treatmentText.toLowerCase().trim();
    const treatmentMap: Record<string, number> = {
      'rerrefino': 1,
      'reciclagem': 2,
      'coprocessamento': 3,
      'blendagem para coprocessamento': 3,
      'incineração': 4,
      'blendagem para incineração': 4,
      'aterro industrial': 5,
      'aterro': 5,
      'tratamento de efluentes': 6,
      'autoclave': 7,
      'triagem': 8,
      'triagem com armazenamento': 8,
      'armazenamento': 9,
      'compostagem': 10,
      'biodigestão': 11,
      'descontaminação': 12,
      'neutralização': 13,
      'recuperação': 14,
      'dessorção térmica': 15,
      'pirólise': 16,
      'processamento': 17,
    };
    
    // Try exact match first
    if (treatmentMap[normalized]) return treatmentMap[normalized];
    
    // Try partial match
    for (const [key, value] of Object.entries(treatmentMap)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }
    
    return 1; // Default to Rerrefino if unknown
  }

  // Extract IBAMA code from residue code/description
  private extractIbamaCode(code: string | null): string {
    if (!code) return '';
    // IBAMA codes are typically 6 digits
    const match = code.match(/(\d{6})/);
    return match ? match[1] : code.replace(/\D/g, '').substring(0, 6);
  }

  // Normalize name by removing accents (SINIR API may not handle accents well)
  private normalizeNameForSinir(name: string | null | undefined): string | undefined {
    if (!name) return undefined;
    // Remove accents using normalize + replace
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Receive MTR in batch - Endpoint: /receberManifestoLote
  // Based on SINIR Swagger documentation
  async receiveMtrBatch(mtrs: MtrWithItems[]): Promise<{ success: boolean; results: any[]; details?: any }> {
    // For actual MTR operations, we MUST have a valid JWT token
    // Token API WS won't work - force credentials authentication
    const isJwtToken = this.token && (this.token.match(/\./g) || []).length >= 2;
    if (!isJwtToken) {
      console.log("[SINIR] Need JWT for MTR operations - forcing credentials auth");
      this.token = null; // Clear any non-JWT token
      const authenticated = await this.authenticate(true); // Force credentials
      if (!authenticated) {
        return { success: false, results: [{ error: "Falha na autenticação - não foi possível obter JWT" }] };
      }
    }

    // Get configured default responsible name from database
    const dbConfig = await db.select().from(sinirConfig).limit(1);
    const defaultResponsavel = dbConfig.length > 0 ? dbConfig[0].responsavelNome : null;

    // Build payload as array according to SINIR docs
    // Keep names as-is - SINIR requires exact match with registered name
    const payload: ManifestoRecebimento[] = mtrs.map(mtr => ({
      manNumero: mtr.mtrCode,
      dataRecebimento: new Date().getTime(),
      nomeMotorista: mtr.motorista || undefined,
      placaVeiculo: mtr.placa || undefined,
      nomeResponsavelRecebimento: mtr.responsavelRecebimento || defaultResponsavel || "Responsável Técnico",
      observacoes: mtr.observations || `Recebido via integração - ${new Date().toLocaleDateString('pt-BR')}`,
      listaManifestoResiduos: mtr.items.map(item => {
        const qty = Number(item.quantity) || 0;
        const qtyReceived = item.quantityReceived ? Number(item.quantityReceived) : qty;
        // Use original SINIR codes if available, otherwise fall back to mapping
        const itemAny = item as any;
        return {
          resCodigoIbama: this.extractIbamaCode(item.code),
          marQuantidade: qty,
          marQuantidadeRecebida: qtyReceived,
          uniCodigo: itemAny.uniCodigo || this.getUnitCode(item.unit),
          traCodigo: itemAny.traCodigo || this.getTreatmentCode(item.treatment),
          marJustificativa: mtr.justificativa || undefined,
        };
      }),
    }));

    console.log("[SINIR] Sending batch receive payload:", JSON.stringify(payload, null, 2));

    // Try both API endpoints
    const endpoints = [
      `${this.legacyBaseUrl}/receberManifestoLote`,
      `${this.baseUrl}/receberManifestoLote`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`[SINIR] Trying receive endpoint: ${endpoint}`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.token!,
          },
          body: JSON.stringify(payload),
        });

        const text = await response.text();
        console.log(`[SINIR] Response status: ${response.status}`);
        console.log(`[SINIR] Raw response (first 2000 chars): ${text.substring(0, 2000)}`);
        
        // Check if response is HTML (error page)
        if (text.startsWith('<!') || text.startsWith('<html')) {
          console.log(`[SINIR] Endpoint returned HTML, trying next...`);
          continue;
        }

        const data: SinirManifestoResponse = JSON.parse(text);
        console.log("[SINIR] Batch receive response:", JSON.stringify(data, null, 2));

        if (data.erro) {
          console.error("[SINIR] Batch receive error:", data.mensagem);
          return { success: false, results: [{ error: data.mensagem }], details: data };
        }

        return { success: true, results: data.objetoResposta || [], details: data };
      } catch (error: any) {
        console.log(`[SINIR] Endpoint failed: ${error.message}`);
        continue;
      }
    }

    console.error("[SINIR] All receive endpoints failed");
    return { success: false, results: [{ error: "Todos os endpoints falharam" }] };
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

  // Get unit responsible parties (users who can receive MTRs)
  async getUnitResponsibles(): Promise<{ success: boolean; responsaveis: any[]; message?: string }> {
    if (!this.token) {
      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, responsaveis: [], message: "Falha na autenticação" };
      }
    }
    
    const credentials = await this.getCredentials();
    const unidade = credentials.unidade;
    
    if (!unidade) {
      return { success: false, responsaveis: [], message: "Código da unidade não configurado" };
    }
    
    // Try different endpoints that might return unit users
    const endpoints = [
      `${this.baseUrl}/retornaUsuariosUnidade/${unidade}`,
      `${this.baseUrl}/retornaResponsaveisUnidade/${unidade}`,
      `${this.baseUrl}/unidade/${unidade}/usuarios`,
      `${this.legacyBaseUrl}/retornaUsuariosUnidade/${unidade}`,
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`[SINIR] Trying to fetch responsibles from: ${endpoint}`);
        const response = await fetch(endpoint, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.token!,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          const responsaveis = data.objetoResposta || data.usuarios || data || [];
          if (Array.isArray(responsaveis) && responsaveis.length > 0) {
            console.log(`[SINIR] Found ${responsaveis.length} responsibles`);
            return { success: true, responsaveis };
          }
        }
      } catch (error) {
        console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
      }
    }
    
    return { 
      success: false, 
      responsaveis: [], 
      message: "Não foi possível buscar responsáveis. Verifique o nome manualmente no portal SINIR." 
    };
  }

  // Test connection - tries authentication and a real API call to validate
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const { usuario, preToken, cnpj } = await this.getCredentials();
      
      if (!usuario && !preToken) {
        return { 
          success: false, 
          message: "Credenciais não configuradas. Preencha as configurações em Configurações > Credenciais SINIR" 
        };
      }

      const authenticated = await this.authenticate();
      if (!authenticated) {
        return { success: false, message: "Falha na autenticação com SINIR API" };
      }

      // Make a real API call to validate the token works
      const testResponse = await fetch(`${this.baseUrl}/retornaListaClasse`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });

      if (!testResponse.ok) {
        return { 
          success: false, 
          message: `Token autenticado mas API retornou erro: ${testResponse.status}` 
        };
      }

      const testData = await testResponse.json();
      const classCount = testData.objetoResposta?.length || 0;

      return { 
        success: true, 
        message: "Conexão com SINIR API validada com sucesso!",
        details: { 
          tokenValido: true,
          cnpj: cnpj ? `${cnpj.substring(0, 4)}...` : 'não configurado',
          classesEncontradas: classCount
        }
      };
    } catch (error: any) {
      return { success: false, message: `Erro: ${error.message}` };
    }
  }

  // CDF (Certificado de Destinação Final) Methods

  // List open MTRs (pending receipt) by period - max 30 days
  async listarMtrsAbertos(dataInicio: string, dataFim: string): Promise<{ success: boolean; mtrs: any[]; message?: string }> {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { success: false, mtrs: [], message: "Falha na autenticação" };
    }

    try {
      // Validate max 30 days period
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
        return { success: false, mtrs: [], message: "Datas inválidas" };
      }
      
      if (inicio > fim) {
        return { success: false, mtrs: [], message: "Data início deve ser anterior à data fim" };
      }
      
      const diffDays = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 30) {
        return { success: false, mtrs: [], message: "Período máximo de 30 dias excedido" };
      }

      const credentials = await this.getCredentials();
      const unidade = credentials.unidade;
      
      // Build query params - use original date strings as SINIR expects
      const params = new URLSearchParams();
      params.append('dataInicio', dataInicio);
      params.append('dataFim', dataFim);
      if (unidade) params.append('unidade', unidade);
      params.append('status', 'ABERTO');

      const queryString = `?${params.toString()}`;
      
      // Try different endpoints for open/pending MTRs
      const endpoints = [
        `${this.legacyBaseUrl}/retornaListaManifestoPendente${queryString}`,
        `${this.legacyBaseUrl}/listaManifestosPendentes${queryString}`,
        `${this.baseUrl}/manifesto/pendentes${queryString}`,
        `${this.legacyBaseUrl}/retornaListaManifesto${queryString}`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[SINIR] Trying to list open MTRs from: ${endpoint}`);
          const response = await fetch(endpoint, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.token!,
            },
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[SINIR] Open MTRs response:`, JSON.stringify(data, null, 2).substring(0, 500));
            const mtrs = data.objetoResposta || data.listaManifestos || data.manifestos || [];
            if (Array.isArray(mtrs)) {
              // Filter only open/pending MTRs (status not received)
              const openMtrs = mtrs.filter((m: any) => 
                !m.dataRecebimento && 
                (m.manStatus !== 'RECEBIDO' && m.status !== 'RECEBIDO')
              );
              console.log(`[SINIR] Found ${openMtrs.length} open MTRs (filtered from ${mtrs.length})`);
              return { success: true, mtrs: openMtrs };
            }
          }
        } catch (error) {
          console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
        }
      }

      return { success: false, mtrs: [], message: "Não foi possível buscar MTRs abertos. API pode não suportar esta consulta." };
    } catch (error: any) {
      return { success: false, mtrs: [], message: error.message };
    }
  }

  // List received MTRs without CDF by period
  async listarMtrsRecebidosSemCdf(dataInicio: string, dataFim: string): Promise<{ success: boolean; mtrs: any[]; message?: string }> {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { success: false, mtrs: [], message: "Falha na autenticação" };
    }

    try {
      // Validate max 30 days period
      const inicio = new Date(dataInicio);
      const fim = new Date(dataFim);
      
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
        return { success: false, mtrs: [], message: "Datas inválidas" };
      }
      
      if (inicio > fim) {
        return { success: false, mtrs: [], message: "Data início deve ser anterior à data fim" };
      }
      
      const diffDays = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 30) {
        return { success: false, mtrs: [], message: "Período máximo de 30 dias excedido" };
      }

      const credentials = await this.getCredentials();
      const unidade = credentials.unidade;
      
      // Build query params - use original date strings as SINIR expects
      const params = new URLSearchParams();
      params.append('dataInicio', dataInicio);
      params.append('dataFim', dataFim);
      if (unidade) params.append('unidade', unidade);
      params.append('semCdf', 'true');

      const queryString = `?${params.toString()}`;
      
      const endpoints = [
        `${this.legacyBaseUrl}/retornaListaManifestoRecebidoSemCdf${queryString}`,
        `${this.legacyBaseUrl}/listaManifestosRecebidosSemCdf${queryString}`,
        `${this.baseUrl}/manifesto/recebidos-sem-cdf${queryString}`,
        `${this.legacyBaseUrl}/retornaListaManifestoRecebido${queryString}`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[SINIR] Trying to list received MTRs without CDF from: ${endpoint}`);
          const response = await fetch(endpoint, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.token!,
            },
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[SINIR] Received MTRs without CDF response:`, JSON.stringify(data, null, 2).substring(0, 500));
            const mtrs = data.objetoResposta || data.listaManifestos || data.manifestos || [];
            if (Array.isArray(mtrs)) {
              // Filter MTRs that don't have CDF
              const mtrsWithoutCdf = mtrs.filter((m: any) => 
                !m.cdfNumero && !m.cdfCodigo && m.cdfStatus !== 'EMITIDO'
              );
              console.log(`[SINIR] Found ${mtrsWithoutCdf.length} received MTRs without CDF`);
              return { success: true, mtrs: mtrsWithoutCdf };
            }
          }
        } catch (error) {
          console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
        }
      }

      return { success: false, mtrs: [], message: "Não foi possível buscar MTRs sem CDF. API pode não suportar esta consulta." };
    } catch (error: any) {
      return { success: false, mtrs: [], message: error.message };
    }
  }

  // List received MTRs that can be included in a CDF
  async listarMtrsRecebidos(dataInicio?: string, dataFim?: string): Promise<{ success: boolean; mtrs: any[]; message?: string }> {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { success: false, mtrs: [], message: "Falha na autenticação" };
    }

    try {
      const credentials = await this.getCredentials();
      const unidade = credentials.unidade;
      
      // Build query params
      const params = new URLSearchParams();
      if (dataInicio) params.append('dataInicio', dataInicio);
      if (dataFim) params.append('dataFim', dataFim);
      if (unidade) params.append('unidade', unidade);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      
      // Try different endpoints for received MTRs
      const endpoints = [
        `${this.legacyBaseUrl}/retornaListaManifestoRecebido${queryString}`,
        `${this.legacyBaseUrl}/listaManifestosRecebidos${queryString}`,
        `${this.baseUrl}/manifesto/recebidos${queryString}`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[SINIR] Trying to list received MTRs from: ${endpoint}`);
          const response = await fetch(endpoint, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.token!,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const mtrs = data.objetoResposta || data.listaManifestos || data.manifestos || [];
            if (Array.isArray(mtrs)) {
              console.log(`[SINIR] Found ${mtrs.length} received MTRs`);
              return { success: true, mtrs };
            }
          }
        } catch (error) {
          console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
        }
      }

      return { success: false, mtrs: [], message: "Não foi possível buscar MTRs recebidos" };
    } catch (error: any) {
      return { success: false, mtrs: [], message: error.message };
    }
  }

  // List existing CDFs
  async listarCdfs(dataInicio?: string, dataFim?: string): Promise<{ success: boolean; cdfs: any[]; message?: string }> {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { success: false, cdfs: [], message: "Falha na autenticação" };
    }

    try {
      const credentials = await this.getCredentials();
      const unidade = credentials.unidade;

      const params = new URLSearchParams();
      if (dataInicio) params.append('dataInicio', dataInicio);
      if (dataFim) params.append('dataFim', dataFim);
      if (unidade) params.append('unidade', unidade);

      const queryString = params.toString() ? `?${params.toString()}` : '';

      const endpoints = [
        `${this.legacyBaseUrl}/retornaListaCdf${queryString}`,
        `${this.legacyBaseUrl}/listaCdfs${queryString}`,
        `${this.baseUrl}/cdf/listar${queryString}`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[SINIR] Trying to list CDFs from: ${endpoint}`);
          const response = await fetch(endpoint, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.token!,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const cdfs = data.objetoResposta || data.listaCdfs || data.cdfs || [];
            if (Array.isArray(cdfs)) {
              console.log(`[SINIR] Found ${cdfs.length} CDFs`);
              return { success: true, cdfs };
            }
          }
        } catch (error) {
          console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
        }
      }

      return { success: false, cdfs: [], message: "Não foi possível buscar CDFs" };
    } catch (error: any) {
      return { success: false, cdfs: [], message: error.message };
    }
  }

  // Save CDF draft
  async salvarCdf(cdfData: {
    periodoInicio: string;
    periodoFim: string;
    responsavelTecnico: { cpf: string; nome: string };
    manifestos: string[];
    observacoes?: string;
  }): Promise<{ success: boolean; cdfNumero?: string; message: string; details?: any }> {
    const authenticated = await this.authenticate(true); // Force JWT
    if (!authenticated) {
      return { success: false, message: "Falha na autenticação" };
    }

    try {
      const credentials = await this.getCredentials();

      // Build CDF payload based on SINIR documentation
      const payload = {
        periodoInicio: new Date(cdfData.periodoInicio).getTime(),
        periodoFim: new Date(cdfData.periodoFim).getTime(),
        responsavelTecnico: {
          cpf: cdfData.responsavelTecnico.cpf.replace(/\D/g, ''),
          nome: cdfData.responsavelTecnico.nome,
        },
        listaManifestos: cdfData.manifestos.map(m => ({ manNumero: m })),
        observacoes: cdfData.observacoes || '',
        unidade: credentials.unidade,
      };

      console.log("[SINIR] Saving CDF with payload:", JSON.stringify(payload, null, 2));

      const endpoints = [
        `${this.legacyBaseUrl}/salvarCdf`,
        `${this.legacyBaseUrl}/cdf/salvar`,
        `${this.baseUrl}/cdf/salvar`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[SINIR] Trying to save CDF at: ${endpoint}`);
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.token!,
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json();
          console.log(`[SINIR] Save CDF response:`, JSON.stringify(data, null, 2));

          if (!data.erro && response.ok) {
            return {
              success: true,
              cdfNumero: data.objetoResposta?.cdfNumero || data.objetoResposta?.numero,
              message: data.mensagem || "CDF salvo com sucesso",
              details: data.objetoResposta,
            };
          } else if (data.mensagem) {
            return { success: false, message: data.mensagem, details: data };
          }
        } catch (error) {
          console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
        }
      }

      return { success: false, message: "Não foi possível salvar o CDF" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Emit (finalize) CDF - uses /emiteCDF endpoint from SINIR API
  async emitirCdf(cdfData: {
    responsavelTecnico: { cpf: string; nome: string };
    manifestos: string[];
    observacoes?: string;
  }): Promise<{ success: boolean; cdfNumero?: string; cdfCodigo?: number; message: string; details?: any }> {
    const authenticated = await this.authenticate(true); // Force JWT
    if (!authenticated) {
      return { success: false, message: "Falha na autenticação" };
    }

    try {
      // Build CDF payload based on official SINIR Swagger documentation
      // Endpoint: POST /emiteCDF
      const payload = {
        listaManifestos: cdfData.manifestos, // Array of MTR numbers
        dataEmissao: new Date().getTime(), // Current timestamp
        nomeResponsavel: cdfData.responsavelTecnico.nome,
        observacoes: cdfData.observacoes || '',
      };

      console.log("[SINIR] Emitting CDF with payload:", JSON.stringify(payload, null, 2));

      // Use the official endpoint from Swagger: /emiteCDF
      const endpoint = `${this.baseUrl}/emiteCDF`;
      console.log(`[SINIR] Calling: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log(`[SINIR] Emit CDF response:`, JSON.stringify(data, null, 2));

      if (!data.erro && response.ok) {
        return {
          success: true,
          cdfNumero: data.objetoResposta?.cdfNumero || data.objetoResposta?.numero,
          cdfCodigo: data.objetoResposta?.cdfCodigo,
          message: data.mensagem || "CDF emitido com sucesso",
          details: data.objetoResposta,
        };
      } else {
        return { 
          success: false, 
          message: data.mensagem || "Erro ao emitir CDF", 
          details: data 
        };
      }
    } catch (error: any) {
      console.log(`[SINIR] Emit CDF error:`, error);
      return { success: false, message: error.message };
    }
  }

  // Download CDF PDF
  async downloadCdfPdf(cdfCodigo: string): Promise<{ success: boolean; pdf?: Buffer; message?: string }> {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { success: false, message: "Falha na autenticação" };
    }

    try {
      const endpoint = `${this.baseUrl}/downloadCertificado/${cdfCodigo}`;
      console.log(`[SINIR] Downloading CDF PDF from: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.token!,
        },
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return { success: true, pdf: Buffer.from(buffer) };
      } else {
        return { success: false, message: `Erro ao baixar PDF: ${response.status}` };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Get CDF details by number
  async getCdf(cdfNumero: string): Promise<{ success: boolean; cdf?: any; message?: string }> {
    const authenticated = await this.authenticate();
    if (!authenticated) {
      return { success: false, message: "Falha na autenticação" };
    }

    try {
      const endpoints = [
        `${this.legacyBaseUrl}/retornaCdf/${cdfNumero}`,
        `${this.baseUrl}/cdf/${cdfNumero}`,
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[SINIR] Fetching CDF from: ${endpoint}`);
          const response = await fetch(endpoint, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': this.token!,
            },
          });

          if (response.ok) {
            const data = await response.json();
            if (data.objetoResposta) {
              return { success: true, cdf: data.objetoResposta };
            }
          }
        } catch (error) {
          console.log(`[SINIR] Endpoint ${endpoint} failed:`, error);
        }
      }

      return { success: false, message: "CDF não encontrado" };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
