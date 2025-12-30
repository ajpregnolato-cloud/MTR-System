import { useState } from "react";
import { Upload, RefreshCw, ArrowRight, Check, XCircle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type ComparisonField = {
  field: string;
  fieldLabel: string;
  sinirValue: string | number;
  classificationValue: string | number;
  itemId?: number;
};

type ComparisonResult = {
  mtrId: number;
  mtrCode: string;
  fields: ComparisonField[];
};

type CompareResponse = {
  comparisons: ComparisonResult[];
  totalMtrs: number;
  totalWithDifferences: number;
  classificationRows: number;
};

export function ClassificationPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCorrections, setSelectedCorrections] = useState<Map<number, Set<number>>>(new Map());

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/classification/import', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Falha ao importar');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Planilha importada",
        description: `${data.imported} registros importados.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/classification/compare'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na importação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: compareData, isLoading: isComparing } = useQuery<CompareResponse>({
    queryKey: ['/api/classification/compare'],
  });

  const applyMutation = useMutation({
    mutationFn: async (corrections: any[]) => {
      const res = await apiRequest('POST', '/api/classification/apply', { corrections });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Correções aplicadas",
        description: `${data.applied} MTRs atualizados.`,
      });
      setSelectedCorrections(new Map());
      queryClient.invalidateQueries({ queryKey: ['/api/classification/compare'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mtrs'] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aplicar correções",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const toggleFieldSelection = (mtrId: number, fieldIndex: number) => {
    setSelectedCorrections(prev => {
      const newMap = new Map(prev);
      const currentSet = newMap.get(mtrId) || new Set();
      if (currentSet.has(fieldIndex)) {
        currentSet.delete(fieldIndex);
      } else {
        currentSet.add(fieldIndex);
      }
      if (currentSet.size === 0) {
        newMap.delete(mtrId);
      } else {
        newMap.set(mtrId, currentSet);
      }
      return newMap;
    });
  };

  const selectAllForMtr = (mtrId: number, fields: ComparisonField[]) => {
    setSelectedCorrections(prev => {
      const newMap = new Map(prev);
      const allSelected = new Set(fields.map((_, i) => i));
      newMap.set(mtrId, allSelected);
      return newMap;
    });
  };

  const handleApplyCorrections = () => {
    if (!compareData) return;
    
    const corrections: any[] = [];
    
    for (const comparison of compareData.comparisons) {
      const selectedFields = selectedCorrections.get(comparison.mtrId);
      if (!selectedFields || selectedFields.size === 0) continue;
      
      const fieldsToApply = Array.from(selectedFields).map(idx => {
        const field = comparison.fields[idx];
        return {
          field: field.field,
          value: field.classificationValue,
          itemId: field.itemId,
        };
      });
      
      corrections.push({
        mtrId: comparison.mtrId,
        fields: fieldsToApply,
      });
    }
    
    if (corrections.length > 0) {
      applyMutation.mutate(corrections);
    }
  };

  const totalSelected = Array.from(selectedCorrections.values()).reduce((sum, set) => sum + set.size, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5" />
            Comparar com Planilha de Classificação
          </CardTitle>
          <div className="relative">
            <input 
              type="file" 
              id="classification-upload" 
              className="hidden" 
              accept=".xlsx,.xls" 
              onChange={handleFileUpload}
              disabled={uploadMutation.isPending}
              data-testid="input-classification-upload"
            />
            <Button asChild variant="outline" size="sm">
              <label htmlFor="classification-upload" className="cursor-pointer" data-testid="button-import-classification">
                {uploadMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Importar Classificação
              </label>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isComparing ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : compareData && compareData.comparisons.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {compareData.classificationRows} registros na classificação | {compareData.totalWithDifferences} MTRs com diferenças
              </span>
              {totalSelected > 0 && (
                <Button 
                  size="sm" 
                  onClick={handleApplyCorrections}
                  disabled={applyMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-apply-corrections"
                >
                  {applyMutation.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Aplicar {totalSelected} correção(ões)
                </Button>
              )}
            </div>
            
            <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
              {compareData.comparisons.map((comparison) => (
                <div key={comparison.mtrId} className="p-3" data-testid={`comparison-mtr-${comparison.mtrId}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-medium">{comparison.mtrCode}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => selectAllForMtr(comparison.mtrId, comparison.fields)}
                      data-testid={`button-select-all-${comparison.mtrId}`}
                    >
                      Selecionar todos
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Campo</TableHead>
                        <TableHead>SINIR</TableHead>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Classificação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparison.fields.map((field, idx) => {
                        const isSelected = selectedCorrections.get(comparison.mtrId)?.has(idx) || false;
                        return (
                          <TableRow key={idx} className={isSelected ? "bg-emerald-50" : ""}>
                            <TableCell>
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => toggleFieldSelection(comparison.mtrId, idx)}
                                data-testid={`checkbox-field-${comparison.mtrId}-${idx}`}
                              />
                            </TableCell>
                            <TableCell className="text-sm">{field.fieldLabel}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {field.sinirValue || '-'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell>
                              <Badge variant="default" className="font-mono text-xs bg-emerald-100 text-emerald-800">
                                {field.classificationValue}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {compareData?.classificationRows === 0 
                ? "Importe uma planilha de classificação para comparar com os MTRs" 
                : "Nenhuma diferença encontrada entre os dados"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
