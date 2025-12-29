import { useState } from "react";
import { 
  FileSpreadsheet, 
  Send, 
  AlertOctagon, 
  Upload, 
  CheckCheck,
  Search,
  RefreshCw,
  MoreVertical,
  Trash2,
  Play,
  Wifi,
  WifiOff
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MtrEditDialog } from "@/components/MtrEditDialog";
import { useMtrs, useUploadSinir, useBatchProcess, useDeleteMtr, useValidateMtrs, useTestSinirConnection } from "@/hooks/use-mtrs";
import { useLogStats } from "@/hooks/use-logs";

export default function Dashboard() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: mtrsData, isLoading } = useMtrs({ page, limit: 10, search });
  const { data: stats } = useLogStats();

  const uploadMutation = useUploadSinir();
  const batchMutation = useBatchProcess();
  const deleteMutation = useDeleteMtr();
  const validateMutation = useValidateMtrs();
  const testSinirMutation = useTestSinirConnection();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && mtrsData?.data) {
      setSelectedIds(mtrsData.data.map(m => m.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleBatchSend = (mode: 'SIMULATED' | 'REAL') => {
    if (selectedIds.length === 0) return;
    batchMutation.mutate({ mtrIds: selectedIds, mode });
    setSelectedIds([]);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-8 space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-display">MTR Receiver</h1>
          <p className="text-slate-500 mt-1">Gerencie, valide e processe manifestos de resíduos do SINIR.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => testSinirMutation.mutate()}
            disabled={testSinirMutation.isPending}
            data-testid="button-test-sinir"
          >
            {testSinirMutation.isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="mr-2 h-4 w-4" />
            )}
            Testar SINIR
          </Button>
          <Button variant="outline" onClick={() => validateMutation.mutate(selectedIds.length ? selectedIds : undefined)}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Validar {selectedIds.length > 0 ? `(${selectedIds.length})` : 'Todos'}
          </Button>
          <div className="relative">
            <input 
              type="file" 
              id="file-upload" 
              className="hidden" 
              accept=".xlsx,.xls" 
              onChange={handleFileUpload}
              disabled={uploadMutation.isPending}
              data-testid="input-file-upload"
            />
            <Button asChild className="bg-primary shadow-lg shadow-primary/25 hover:shadow-primary/40">
              <label htmlFor="file-upload" className="cursor-pointer" data-testid="button-import-excel">
                {uploadMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Importar Excel SINIR
              </label>
            </Button>
          </div>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Processados" 
          value={stats?.total || 0} 
          icon={FileSpreadsheet} 
          color="primary" 
        />
        <MetricCard 
          title="MTRs Válidos" 
          value={mtrsData?.total || 0} 
          icon={CheckCheck} 
          color="success" 
        />
        <MetricCard 
          title="Erros" 
          value={stats?.errors || 0} 
          icon={AlertOctagon} 
          color="destructive"
        />
        <MetricCard 
          title="Enviados para API" 
          value={0}
          icon={Send} 
          color="warning" 
        />
      </div>

      {/* Tabela Principal */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {/* Barra de Ferramentas */}
          <div className="p-4 border-b flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-t-xl">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar MTRs por código, gerador..." 
                  className="pl-9 bg-background border-border/60"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-mtrs"
                />
              </div>
              
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                  <span className="text-sm font-medium text-muted-foreground border-r pr-3 mr-1">
                    {selectedIds.length} selecionado(s)
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleBatchSend('SIMULATED')} data-testid="button-simulate-send">
                    <Play className="mr-2 h-3 w-3" />
                    Simular Envio
                  </Button>
                  <Button size="sm" onClick={() => handleBatchSend('REAL')} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-send-batch">
                    <Send className="mr-2 h-3 w-3" />
                    Enviar Lote
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Tabela de Dados */}
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={mtrsData?.data?.length === selectedIds.length && mtrsData?.data?.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Nº MTR</TableHead>
                  <TableHead>Data Emissão</TableHead>
                  <TableHead>Gerador</TableHead>
                  <TableHead>Resíduos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7} className="h-16 animate-pulse bg-slate-100/50" />
                    </TableRow>
                  ))
                ) : mtrsData?.data.map((mtr) => (
                  <TableRow key={mtr.id} className="group hover:bg-slate-50/80 transition-colors" data-testid={`row-mtr-${mtr.id}`}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedIds.includes(mtr.id)}
                        onCheckedChange={(checked) => handleSelectOne(mtr.id, checked as boolean)}
                        data-testid={`checkbox-mtr-${mtr.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium font-mono text-xs" data-testid={`text-mtr-code-${mtr.id}`}>{mtr.mtrCode}</TableCell>
                    <TableCell className="text-slate-600">
                      {mtr.emissionDate ? format(new Date(mtr.emissionDate), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{mtr.generatorName}</span>
                        <span className="text-xs text-muted-foreground">{mtr.generatorCnpj}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-600">
                        {mtr.items.length} {mtr.items.length === 1 ? 'item' : 'itens'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={mtr.systemStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(mtr.id)} data-testid={`button-edit-mtr-${mtr.id}`}>Editar</Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-more-mtr-${mtr.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(mtr.id)} className="text-red-600" data-testid={`button-delete-mtr-${mtr.id}`}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && (!mtrsData?.data || mtrsData.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Nenhum MTR encontrado. Importe um arquivo Excel para começar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Exibindo {(page - 1) * 10 + 1} a {Math.min(page * 10, mtrsData?.total || 0)} de {mtrsData?.total || 0} registros
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-previous-page"
              >
                Anterior
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (mtrsData?.totalPages || 1)}
                data-testid="button-next-page"
              >
                Próximo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Modal de Edição */}
      <MtrEditDialog 
        mtrId={editingId} 
        open={!!editingId} 
        onOpenChange={(open) => !open && setEditingId(null)} 
      />
    </div>
  );
}
