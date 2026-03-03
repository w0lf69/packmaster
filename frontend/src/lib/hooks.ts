import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";

export function useStacks() {
  return useQuery({
    queryKey: ["stacks"],
    queryFn: api.stacks,
    refetchInterval: 5000,
  });
}

export function useStack(name: string) {
  return useQuery({
    queryKey: ["stack", name],
    queryFn: () => api.stack(name),
    refetchInterval: 5000,
    enabled: !!name,
  });
}

export function useCompose(name: string) {
  return useQuery({
    queryKey: ["compose", name],
    queryFn: () => api.compose(name),
    enabled: !!name,
  });
}

export function useDiscover() {
  return useQuery({
    queryKey: ["discover"],
    queryFn: api.discover,
  });
}

export function useRegistries() {
  return useQuery({
    queryKey: ["registries"],
    queryFn: api.registries,
  });
}

export function useStackAction(onActionComplete?: (result: { action: string; name: string; success: boolean; output: string }) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, name }: { action: "up" | "down" | "restart" | "pull" | "update"; name: string }) => {
      return api[action](name);
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["stacks"] });
      qc.invalidateQueries({ queryKey: ["stack"] });
      // After pull/update, re-check that stack's images so the update badge clears
      if (vars.action === "pull" || vars.action === "update") {
        api.imageUpdates(vars.name).then(() => {
          qc.invalidateQueries({ queryKey: ["update-cache"] });
        });
      }
      onActionComplete?.({ action: vars.action, name: vars.name, success: data.success, output: data.output });
    },
  });
}

export function useEnv(name: string) {
  return useQuery({
    queryKey: ["env", name],
    queryFn: () => api.env(name),
    enabled: !!name,
  });
}

export function useSaveEnv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => {
      return api.saveEnv(name, content);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["env", vars.name] });
    },
  });
}

export function useSaveCompose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) => {
      return api.save(name, content);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["compose", vars.name] });
    },
  });
}

export function useRegisterStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, name }: { path: string; name?: string }) => {
      return api.register(path, name);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stacks"] });
      qc.invalidateQueries({ queryKey: ["discover"] });
    },
  });
}

export function useRegisterBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stacks: { path: string; name: string }[]) => {
      return api.registerBulk(stacks);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stacks"] });
      qc.invalidateQueries({ queryKey: ["discover"] });
    },
  });
}

export function useUnregisterStack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.unregister(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stacks"] });
      qc.invalidateQueries({ queryKey: ["discover"] });
    },
  });
}

// ─── Watchtower ────────────────────────────────────────────────────────

export function useWatchtowerStatus() {
  return useQuery({
    queryKey: ["watchtower"],
    queryFn: api.watchtowerStatus,
    staleTime: 30_000,
  });
}

export function useUpdateCache() {
  return useQuery({
    queryKey: ["update-cache"],
    queryFn: api.allUpdateCache,
    staleTime: 60_000,
  });
}

export function useCheckStackUpdates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.imageUpdates(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["update-cache"] });
    },
  });
}

export function useCheckAllUpdates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.checkAllUpdates(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["update-cache"] });
    },
  });
}

export function useWatchtowerCheck() {
  return useMutation({
    mutationFn: () => api.watchtowerCheck(),
  });
}
