import { useState } from "react";
import { 
  BarChart, 
  FileSpreadsheet, 
  Send, 
  AlertOctagon, 
  Upload, 
  CheckCheck,
  Search,
  RefreshCw,
  MoreVertical,
  Trash2,
  Play
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MtrEditDialog } from "@/components/MtrEditDialog";
import { useMtrs, useUploadSinir, useBatchProcess, useDeleteMtr, useValidateMtrs } from "@/hooks/use-mtrs";
import { useLogStats } from "@/hooks/use-logs";

export default function Dashboard() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Queries
  const { data: mtrsData, isLoading } = useMtrs({ page, limit: 10, search });
  const { data: stats } = useLogStats();

  // Mutations
  const uploadMutation = useUploadSinir();
  const batchMutation = useBatchProcess();
  const deleteMutation = useDeleteMtr();
  const validateMutation = useValidateMtrs();

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
    setSelectedIds([]); // Clear selection after action
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 font-display">MTR Receiver</h1>
          <p className="text-slate-500 mt-1">Manage, validate, and process SINIR waste manifests.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => validateMutation.mutate(selectedIds.length ? selectedIds : undefined)}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Validate {selectedIds.length > 0 ? `(${selectedIds.length})` : 'All'}
          </Button>
          <div className="relative">
            <input 
              type="file" 
              id="file-upload" 
              className="hidden" 
              accept=".xlsx,.xls" 
              onChange={handleFileUpload}
              disabled={uploadMutation.isPending}
            />
            <Button asChild className="bg-primary shadow-lg shadow-primary/25 hover:shadow-primary/40">
              <label htmlFor="file-upload" className="cursor-pointer">
                {uploadMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Import SINIR Excel
              </label>
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Processed" 
          value={stats?.total || 0} 
          icon={FileSpreadsheet} 
          color="primary" 
        />
        <MetricCard 
          title="Valid MTRs" 
          value={mtrsData?.total || 0} 
          icon={CheckCheck} 
          color="success" 
        />
        <MetricCard 
          title="Errors" 
          value={stats?.errors || 0} 
          icon={AlertOctagon} 
          color="destructive"
          trend="+2.5%"
          trendUp={false}
        />
        <MetricCard 
          title="Sent to API" 
          value={0} // Placeholder for sent count
          icon={Send} 
          color="warning" 
        />
      </div>

      {/* Main Content Card */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          {/* Table Toolbar */}
          <div className="p-4 border-b flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-t-xl">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search MTRs by code, generator..." 
                  className="pl-9 bg-background border-border/60"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              
              {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                  <span className="text-sm font-medium text-muted-foreground border-r pr-3 mr-1">
                    {selectedIds.length} selected
                  </span>
                  <Button size="sm" variant="outline" onClick={() => handleBatchSend('SIMULATED')}>
                    <Play className="mr-2 h-3 w-3" />
                    Simulate Send
                  </Button>
                  <Button size="sm" onClick={() => handleBatchSend('REAL')} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Send className="mr-2 h-3 w-3" />
                    Send Batch
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Data Table */}
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={mtrsData?.data?.length === selectedIds.length && mtrsData?.data?.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>MTR Code</TableHead>
                  <TableHead>Emission Date</TableHead>
                  <TableHead>Generator</TableHead>
                  <TableHead>Waste Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                  <TableRow key={mtr.id} className="group hover:bg-slate-50/80 transition-colors">
                    <TableCell>
                      <Checkbox 
                        checked={selectedIds.includes(mtr.id)}
                        onCheckedChange={(checked) => handleSelectOne(mtr.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-medium font-mono text-xs">{mtr.mtrCode}</TableCell>
                    <TableCell className="text-slate-600">
                      {mtr.emissionDate ? format(new Date(mtr.emissionDate), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{mtr.generatorName}</span>
                        <span className="text-xs text-muted-foreground">{mtr.generatorCnpj}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-xs font-medium text-slate-600">
                        {mtr.items.length} items
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={mtr.systemStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(mtr.id)}>Edit</Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(mtr.id)} className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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
                      No MTRs found. Import an Excel file to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, mtrsData?.total || 0)} of {mtrsData?.total || 0} entries
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (mtrsData?.totalPages || 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Editor Modal */}
      <MtrEditDialog 
        mtrId={editingId} 
        open={!!editingId} 
        onOpenChange={(open) => !open && setEditingId(null)} 
      />
    </div>
  );
}
