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

export function useStackAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, name }: { action: "up" | "down" | "restart" | "pull" | "update"; name: string }) => {
      return api[action](name);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stacks"] });
      qc.invalidateQueries({ queryKey: ["stack"] });
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
