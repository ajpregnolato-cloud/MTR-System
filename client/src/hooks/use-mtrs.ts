import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type UpdateMtrRequest, type BatchProcessRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useMtrs(params?: { page?: number; limit?: number; status?: string; search?: string }) {
  // Serialize params for query key stability
  const queryKey = [api.mtrs.list.path, JSON.stringify(params)];
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Build URL with query params
      const url = new URL(api.mtrs.list.path, window.location.origin);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== "") {
            url.searchParams.append(key, String(value));
          }
        });
      }
      
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch MTRs");
      return api.mtrs.list.responses[200].parse(await res.json());
    },
  });
}

export function useMtr(id: number | null) {
  return useQuery({
    queryKey: [api.mtrs.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.mtrs.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch MTR details");
      return api.mtrs.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useUpdateMtr() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdateMtrRequest) => {
      const url = buildUrl(api.mtrs.update.path, { id });
      const validated = api.mtrs.update.input.parse(data);
      
      const res = await fetch(url, {
        method: api.mtrs.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update MTR");
      return api.mtrs.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.mtrs.get.path] });
      toast({ title: "Updated", description: "MTR updated successfully" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  });
}

export function useDeleteMtr() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.mtrs.delete.path, { id });
      const res = await fetch(url, { method: api.mtrs.delete.method, credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete MTR");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      toast({ title: "Deleted", description: "MTR removed successfully" });
    },
  });
}

export function useUploadSinir() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ file, platform }: { file: File; platform: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("platform", platform);
      
      const res = await fetch(api.upload.import.path, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Upload failed");
      return api.upload.import.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      toast({ 
        title: "Importação Concluída", 
        description: `${data.message} (${data.imported} importados, ${data.errors.length} erros)` 
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Falha no Upload", description: err.message });
    }
  });
}

export function useBatchProcess() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: BatchProcessRequest) => {
      const validated = api.batch.send.input.parse(data);
      const res = await fetch(api.batch.send.path, {
        method: api.batch.send.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Batch processing failed");
      return api.batch.send.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.stats.path] });
      toast({ title: "Batch Started", description: data.message });
    },
  });
}

export function useValidateMtrs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (ids?: number[]) => {
      const payload = ids ? { ids } : {};
      const res = await fetch(api.mtrs.validate.path, {
        method: api.mtrs.validate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Validation failed");
      return api.mtrs.validate.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      toast({ 
        title: "Validação Concluída", 
        description: `Processados ${data.processed} MTRs. ${data.valid} válidos, ${data.errors} erros.` 
      });
    },
  });
}

export function useTestSinirConnection() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sinir/test", { credentials: "include" });
      if (!res.ok) throw new Error("Teste falhou");
      return res.json() as Promise<{ success: boolean; message: string }>;
    },
    onSuccess: (data) => {
      toast({ 
        variant: data.success ? "default" : "destructive",
        title: data.success ? "Conexão OK" : "Erro de Conexão", 
        description: data.message 
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  });
}

export function useFetchMtrFromSinir() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (mtrCode: string) => {
      const res = await fetch(`/api/sinir/mtr/${encodeURIComponent(mtrCode)}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("MTR não encontrado no SINIR");
        throw new Error("Erro ao buscar MTR");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "MTR Encontrado", 
        description: `Manifesto ${data.manNumero || 'encontrado'} carregado do SINIR` 
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  });
}

export function useImportMtrFromSinir() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (mtrCode: string) => {
      const res = await fetch(`/api/sinir/import/${encodeURIComponent(mtrCode)}`, { 
        method: 'POST',
        credentials: "include" 
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao importar MTR");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      toast({ 
        title: "MTR Importado", 
        description: data.message || "Manifesto importado com sucesso" 
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  });
}

export function useImportMtrFromIema() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (mtrCode: string) => {
      const res = await fetch(`/api/iema/import/${encodeURIComponent(mtrCode)}`, { 
        method: 'POST',
        credentials: "include" 
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao importar MTR do IEMA");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      toast({ 
        title: "MTR Importado", 
        description: data.message || "Manifesto importado do IEMA com sucesso" 
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  });
}

export function useDeleteAllMtrs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/mtrs", { 
        method: 'DELETE',
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Erro ao limpar dados");
      return res.json() as Promise<{ success: boolean; deleted: number; message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.mtrs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
      toast({ 
        title: "Dados Limpos", 
        description: data.message 
      });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro", description: err.message });
    }
  });
}

export interface SendResult {
  mtrCode: string;
  platform: string;
  success: boolean;
  message: string;
  timestamp: string;
}

export function useResults() {
  return useQuery({
    queryKey: ["/api/results"],
    queryFn: async () => {
      const res = await fetch("/api/results", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json() as Promise<SendResult[]>;
    },
    refetchInterval: 2000,
  });
}

export function downloadResultsLog(format: 'xlsx' | 'txt' = 'xlsx') {
  const url = `/api/results/download?format=${format}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = `log_recebimento.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
