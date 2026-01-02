import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Award,
  FileText,
  Send,
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const [responsavelCpf, setResponsavelCpf] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [selectedMtrs, setSelectedMtrs] = useState<string[]>([]);
  const [mtrManual, setMtrManual] = useState("");

  const { data: cdfsExistentes, isLoading: loadingCdfs } = useQuery<{ success: boolean; cdfs: CdfData[]; message?: string }>({
    queryKey: ["/api/sinir/cdf"],
    queryFn: async () => {
      const res = await fetch("/api/sinir/cdf");
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const emitirMutation = useMutation({
    mutationFn: async (data: { responsavelTecnico: { cpf: string; nome: string }; manifestos: string[]; observacoes?: string }) => {
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

  const handleEmitir = () => {
    if (selectedMtrs.length === 0) {
      toast({ title: "Atenção", description: "Adicione pelo menos um MTR", variant: "destructive" });
      return;
    }
    if (!responsavelCpf || !responsavelNome) {
      toast({ title: "Atenção", description: "Informe o CPF e Nome do Responsável Técnico", variant: "destructive" });
      return;
    }
    if (!isValidCpf(responsavelCpf)) {
      toast({ title: "Atenção", description: "CPF inválido", variant: "destructive" });
      return;
    }

    emitirMutation.mutate({
      responsavelTecnico: { cpf: responsavelCpf.replace(/\D/g, ''), nome: responsavelNome },
      manifestos: selectedMtrs,
      observacoes,
    });
  };

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
              <FileText className="h-5 w-5" />
              MTRs para o CDF
            </CardTitle>
            <CardDescription>
              Adicione os números dos MTRs recebidos que deseja incluir no certificado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Digite o número do MTR (ex: 501028878271)"
                value={mtrManual}
                onChange={(e) => setMtrManual(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdicionarMtrManual()}
                className="flex-1"
                data-testid="input-mtr-manual"
              />
              <Button onClick={handleAdicionarMtrManual} data-testid="button-adicionar-mtr">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {selectedMtrs.length > 0 && (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número MTR</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMtrs.map((mtr) => (
                      <TableRow key={mtr} data-testid={`row-mtr-${mtr}`}>
                        <TableCell className="font-mono">{mtr}</TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRemoverMtr(mtr)}
                            data-testid={`button-remover-${mtr}`}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedMtrs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                Nenhum MTR adicionado. Digite o número acima e clique em Adicionar.
              </div>
            )}

            <Badge variant="outline" className="px-3 py-1">
              {selectedMtrs.length} MTR(s) selecionado(s)
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Emitir CDF
            </CardTitle>
            <CardDescription>
              Preencha os dados do responsável técnico
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resp-cpf">CPF do Responsável</Label>
              <Input
                id="resp-cpf"
                placeholder="000.000.000-00"
                value={formatCpf(responsavelCpf)}
                onChange={(e) => setResponsavelCpf(e.target.value)}
                data-testid="input-cpf-responsavel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resp-nome">Nome do Responsável</Label>
              <Input
                id="resp-nome"
                placeholder="Nome completo"
                value={responsavelNome}
                onChange={(e) => setResponsavelNome(e.target.value)}
                data-testid="input-nome-responsavel"
              />
              <p className="text-xs text-muted-foreground">
                O nome deve ser exatamente igual ao cadastrado no SINIR
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (opcional)</Label>
              <Textarea
                id="observacoes"
                placeholder="Observações adicionais..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                data-testid="input-observacoes"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleEmitir}
              disabled={emitirMutation.isPending || selectedMtrs.length === 0}
              data-testid="button-emitir-cdf"
            >
              {emitirMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Emitir CDF no SINIR
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            CDFs Emitidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCdfs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cdfsExistentes?.cdfs && cdfsExistentes.cdfs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número CDF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>MTRs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cdfsExistentes.cdfs.map((cdf, idx) => (
                  <TableRow key={cdf.cdfNumero || idx} data-testid={`row-cdf-${cdf.cdfNumero || idx}`}>
                    <TableCell className="font-mono">{cdf.cdfNumero || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={cdf.status === 'EMITIDO' ? 'default' : 'secondary'}>
                        {cdf.status || "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatTimestamp(cdf.periodoInicio)} - {formatTimestamp(cdf.periodoFim)}
                    </TableCell>
                    <TableCell>{cdf.manifestos?.length || 0} MTR(s)</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {cdfsExistentes?.message || "Nenhum CDF encontrado"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
