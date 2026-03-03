export type StackStatus = "running" | "partial" | "stopped";

export interface Container {
  ID: string;
  Name: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Service: string;
}

export interface Stack {
  name: string;
  path: string;
  running: number;
  total: number;
  status: StackStatus;
  containers: Container[];
}

export interface StacksResponse {
  stacks: Stack[];
  scan_dirs: string[];
}

export interface StackDetail {
  name: string;
  path: string;
  compose_file: string | null;
  containers: Container[];
}

export interface ComposeFile {
  name: string;
  file: string;
  content: string;
}

export interface ActionResult {
  success: boolean;
  action: string;
  stack: string;
  output: string;
  exit: number;
  phase?: string;
  backup?: string;
  message?: string;
}

export interface DiscoveredStack {
  name: string;
  path: string;
  registered: boolean;
}

export interface DiscoverResponse {
  stacks: DiscoveredStack[];
  scan_dirs: string[];
}

export interface RegistryInfo {
  configured: boolean;
  registries: { host: string; has_auth: boolean }[];
}

export type View = "dashboard" | "detail" | "editor" | "logs" | "discover";
