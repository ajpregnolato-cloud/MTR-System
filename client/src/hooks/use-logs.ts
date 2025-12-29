import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useLogs(limit = 50) {
  return useQuery({
    queryKey: [api.logs.list.path, limit],
    queryFn: async () => {
      const url = `${api.logs.list.path}?limit=${limit}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
  });
}

export function useLogStats() {
  return useQuery({
    queryKey: [api.logs.stats.path],
    queryFn: async () => {
      const res = await fetch(api.logs.stats.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch log stats");
      return api.logs.stats.responses[200].parse(await res.json());
    },
    refetchInterval: 10000, // Refresh every 10s
  });
}
