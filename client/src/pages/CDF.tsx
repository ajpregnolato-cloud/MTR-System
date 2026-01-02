import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Award,
  Calendar,
  FileText,
  Send,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Search,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MtrRecebido {
  manNumero: string;
  gerNome?: string;
  traQuantidade?: number;
  resCodigoIbama?: string;
  resNome?: string;
  dataRecebimento?: number;
}

interface CdfData {
  cdfNumero?: string;
  periodoInicio?: number;
  periodoFim?: number;
  status?: string;
  manifestos?: string[];
}

const formatCpf = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const isValidCpf = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11;
};

export default function CDF() {
  const { toast } = useToast();
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [responsavelCpf, setResponsavelCpf] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [selectedMtrs, setSelectedMtrs] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [mtrManual, setMtrManual] = useState("");

  const { data: mtrsRecebidos, isLoading: loadingMtrs, refetch: refetchMtrs } = useQuery<{ success: boolean; mtrs: MtrRecebido[]; message?: string }>({
    queryKey: ["/api/sinir/cdf/mtrs-recebidos", periodoInicio, periodoFim],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (periodoInicio) params.append('dataInicio', periodoInicio);
      if (periodoFim) params.append('dataFim', periodoFim);
      const url = `/api/sinir/cdf/mtrs-recebidos${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: false,
  });

  const { data: cdfsExistentes, isLoading: loadingCdfs, refetch: refetchCdfs } = useQuery<{ success: boolean; cdfs: CdfData[]; message?: string }>({
    queryKey: ["/api/sinir/cdf"],
    queryFn: async () => {
      const res = await fetch("/api/sinir/cdf");
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const salvarMutation = useMutation({
    mutationFn: async (data: { periodoInicio: string; periodoFim: string; responsavelTecnico: { cpf: string; nome: string }; manifestos: string[]; observacoes?: string }) => {
      const res = await apiRequest("POST", "/api/sinir/cdf/salvar", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "CDF salvo", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["/api/sinir/cdf"] });
      } else {
        toast({ title: "Erro ao salvar", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const emitirMutation = useMutation({
    mutationFn: async (data: { periodoInicio: string; periodoFim: string; responsavelTecnico: { cpf: string; nome: string }; manifestos: string[]; observacoes?: string }) => {
      const res = await apiRequest("POST", "/api/sinir/cdf/emitir", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "CDF emitido com sucesso!", description: `Numero: ${data.cdfNumero}` });
        queryClient.invalidateQueries({ queryKey: ["/api/sinir/cdf"] });
        setSelectedMtrs([]);
      } else {
        toast({ title: "Erro ao emitir", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handleBuscarMtrs = () => {
    if (!periodoInicio || !periodoFim) {
      toast({ title: "Atenção", description: "Informe o período de início e fim", variant: "destructive" });
      return;
    }
    refetchMtrs();
  };

  const handleAdicionarMtrManual = () => {
    const numero = mtrManual.trim();
    if (!numero) {
      toast({ title: "Atenção", description: "Digite o número do MTR", variant: "destructive" });
      return;
    }
    if (selectedMtrs.includes(numero)) {
      toast({ title: "Atenção", description: "MTR já adicionado", variant: "destructive" });
      return;
    }
    setSelectedMtrs((prev) => [...prev, numero]);
    setMtrManual("");
    toast({ title: "MTR adicionado", description: `MTR ${numero} adicionado à lista` });
  };

  const handleRemoverMtr = (numero: string) => {
    setSelectedMtrs((prev) => prev.filter((n) => n !== numero));
  };

  const handleSelectMtr = (numero: string, checked: boolean) => {
    if (checked) {
      setSelectedMtrs((prev) => [...prev, numero]);
    } else {
      setSelectedMtrs((prev) => prev.filter((n) => n !== numero));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && mtrsRecebidos?.mtrs) {
      const filtered = filteredMtrs.map((m) => m.manNumero);
      setSelectedMtrs(filtered);
    } else {
      setSelectedMtrs([]);
    }
  };

  const handleSalvar = () => {
    if (selectedMtrs.length === 0) {
      toast({ title: "Atenção", description: "Selecione pelo menos um MTR", variant: "destructive" });
      return;
    }

    salvarMutation.mutate({
      periodoInicio,
      periodoFim,
      responsavelTecnico: { cpf: responsavelCpf, nome: responsavelNome },
      manifestos: selectedMtrs,
      observacoes,
    });
  };

  const handleEmitir = () => {
    if (selectedMtrs.length === 0) {
      toast({ title: "Atenção", description: "Selecione pelo menos um MTR", variant: "destructive" });
      return;
    }
    if (!responsavelCpf || !responsavelNome) {
      toast({ title: "Atenção", description: "Informe o CPF e Nome do Responsável Técnico", variant: "destructive" });
      return;
    }

    emitirMutation.mutate({
      periodoInicio,
      periodoFim,
      responsavelTecnico: { cpf: responsavelCpf, nome: responsavelNome },
      manifestos: selectedMtrs,
      observacoes,
    });
  };

  const filteredMtrs = (mtrsRecebidos?.mtrs || []).filter((mtr) => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      mtr.manNumero?.toLowerCase().includes(search) ||
      mtr.gerNome?.toLowerCase().includes(search) ||
      mtr.resCodigoIbama?.toLowerCase().includes(search) ||
      mtr.resNome?.toLowerCase().includes(search)
    );
  });

  const formatTimestamp = (ts: number | undefined) => {
    if (!ts) return "-";
    try {
      return format(new Date(ts), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "-";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-display flex items-center gap-3">
            <Award className="h-8 w-8 text-primary" />
            CDF - Certificado de Destinação Final
          </h1>
          <p className="text-slate-500 mt-1">
            Emita certificados para comprovar a destinação final de resíduos recebidos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Período e Filtros
            </CardTitle>
            <CardDescription>
              Defina o período e busque os MTRs recebidos para incluir no CDF
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodo-inicio">Data Início</Label>
                <Input
                  id="periodo-inicio"
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                  data-testid="input-periodo-inicio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodo-fim">Data Fim</Label>
                <Input
                  id="periodo-fim"
                  type="date"
                  value={periodoFim}
                  onChange={(e) => setPeriodoFim(e.target.value)}
                  data-testid="input-periodo-fim"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleBuscarMtrs}
                  disabled={loadingMtrs || !periodoInicio || !periodoFim}
                  className="w-full"
                  data-testid="button-buscar-mtrs"
                >
                  {loadingMtrs ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar MTRs
                </Button>
              </div>
            </div>

            {mtrsRecebidos && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <Input
                    placeholder="Filtrar por numero, gerador, residuo..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="max-w-sm"
                    data-testid="input-filtro-mtrs"
                  />
                  <Badge variant="outline" className="px-3 py-1">
                    {selectedMtrs.length} de {filteredMtrs.length} selecionados
                  </Badge>
                </div>

                <div className="border rounded-lg max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedMtrs.length === filteredMtrs.length && filteredMtrs.length > 0}
                            onCheckedChange={handleSelectAll}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                        <TableHead>Numero MTR</TableHead>
                        <TableHead>Gerador</TableHead>
                        <TableHead>Residuo</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead>Recebido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMtrs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {mtrsRecebidos?.message || "Nenhum MTR encontrado no período"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMtrs.map((mtr) => (
                          <TableRow key={mtr.manNumero} data-testid={`row-mtr-${mtr.manNumero}`}>
                            <TableCell>
                              <Checkbox
                                checked={selectedMtrs.includes(mtr.manNumero)}
                                onCheckedChange={(checked) => handleSelectMtr(mtr.manNumero, !!checked)}
                                data-testid={`checkbox-mtr-${mtr.manNumero}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{mtr.manNumero}</TableCell>
                            <TableCell className="max-w-[150px] truncate" title={mtr.gerNome}>
                              {mtr.gerNome || "-"}
                            </TableCell>
                            <TableCell className="max-w-[150px]">
                              <div className="truncate" title={mtr.resNome}>
                                <span className="font-mono text-xs">{mtr.resCodigoIbama}</span>
                                {mtr.resNome && <span className="ml-1 text-muted-foreground">- {mtr.resNome}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{mtr.traQuantidade || "-"}</TableCell>
                            <TableCell>{formatTimestamp(mtr.dataRecebimento)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dados do CDF
            </CardTitle>
            <CardDescription>Preencha os dados do responsável técnico</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mtr-manual">Adicionar MTR Manualmente</Label>
              <div className="flex gap-2">
                <Input
                  id="mtr-manual"
                  placeholder="Numero do MTR (ex: 501028878271)"
                  value={mtrManual}
                  onChange={(e) => setMtrManual(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdicionarMtrManual()}
                  data-testid="input-mtr-manual"
                />
                <Button
                  size="icon"
                  onClick={handleAdicionarMtrManual}
                  data-testid="button-adicionar-mtr"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedMtrs.length > 0 && (
              <div className="space-y-2">
                <Label>MTRs Selecionados ({selectedMtrs.length})</Label>
                <div className="border rounded-md p-2 max-h-32 overflow-auto space-y-1">
                  {selectedMtrs.map((mtr) => (
                    <div key={mtr} className="flex items-center justify-between gap-2 bg-muted/50 rounded px-2 py-1">
                      <span className="font-mono text-xs">{mtr}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoverMtr(mtr)}
                        data-testid={`button-remover-mtr-${mtr}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t pt-4 space-y-2">
              <Label htmlFor="responsavel-cpf">CPF do Responsável Técnico</Label>
              <Input
                id="responsavel-cpf"
                placeholder="000.000.000-00"
                value={responsavelCpf}
                onChange={(e) => setResponsavelCpf(e.target.value)}
                data-testid="input-responsavel-cpf"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel-nome">Nome do Responsável Técnico</Label>
              <Input
                id="responsavel-nome"
                placeholder="Nome completo"
                value={responsavelNome}
                onChange={(e) => setResponsavelNome(e.target.value)}
                data-testid="input-responsavel-nome"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (opcional)</Label>
              <Textarea
                id="observacoes"
                placeholder="Informações adicionais..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                data-testid="input-observacoes"
              />
            </div>

            <div className="pt-4 space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSalvar}
                disabled={salvarMutation.isPending || selectedMtrs.length === 0}
                data-testid="button-salvar-cdf"
              >
                {salvarMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar Rascunho
              </Button>

              <Button
                className="w-full"
                onClick={handleEmitir}
                disabled={emitirMutation.isPending || selectedMtrs.length === 0 || !responsavelCpf || !responsavelNome}
                data-testid="button-emitir-cdf"
              >
                {emitirMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Emitir CDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              CDFs Emitidos
            </span>
            <Button variant="ghost" size="icon" onClick={() => refetchCdfs()} data-testid="button-refresh-cdfs">
              <RefreshCw className={`h-4 w-4 ${loadingCdfs ? "animate-spin" : ""}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCdfs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (cdfsExistentes?.cdfs?.length || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum CDF encontrado</p>
              {cdfsExistentes?.message && <p className="text-sm mt-1">{cdfsExistentes.message}</p>}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Manifestos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cdfsExistentes?.cdfs?.map((cdf) => (
                    <TableRow key={cdf.cdfNumero} data-testid={`row-cdf-${cdf.cdfNumero}`}>
                      <TableCell className="font-mono">{cdf.cdfNumero}</TableCell>
                      <TableCell>
                        {formatTimestamp(cdf.periodoInicio)} - {formatTimestamp(cdf.periodoFim)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cdf.status === "EMITIDO" ? "default" : "secondary"}>
                          {cdf.status === "EMITIDO" ? (
                            <CheckCircle className="mr-1 h-3 w-3" />
                          ) : (
                            <AlertCircle className="mr-1 h-3 w-3" />
                          )}
                          {cdf.status || "Rascunho"}
                        </Badge>
                      </TableCell>
                      <TableCell>{cdf.manifestos?.length || 0} MTRs</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
