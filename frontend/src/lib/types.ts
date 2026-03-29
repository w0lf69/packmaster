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
  has_env: boolean;
  containers: Container[];
}

export interface ComposeFile {
  name: string;
  file: string;
  content: string;
}

export interface ActionResult {
  success: boolean;
  action?: string;
  stack?: string;
  output?: string;
  exit?: number;
  phase?: string;
  backup?: string;
  message?: string;
  // Registration fields
  added?: string[];
  errors?: string[];
  count?: number;
  // Write fields
  bytes?: number;
  created?: boolean;
  error?: string;
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

export interface EnvFile {
  name: string;
  exists: boolean;
  content: string;
}

export type View = "dashboard" | "detail" | "editor" | "env" | "logs" | "discover";

// ─── Watchtower ────────────────────────────────────────────────────────

export interface WatchtowerStatus {
  detected: boolean;
  running?: boolean;
  container_name?: string;
  image?: string;
  schedule?: string | null;
  monitor_only?: boolean;
  cleanup?: boolean;
  rolling_restart?: boolean;
  http_api?: boolean;
  api_token_set?: boolean;
  container_ip?: string;
}

export interface ImageUpdate {
  image: string;
  service?: string;
  status: "up_to_date" | "update_available" | "unknown";
  reason?: string;
  local_digest?: string;
  remote_digest?: string;
}

export interface StackUpdateResult {
  stack: string;
  updates: ImageUpdate[];
  checked_at: string;
  has_updates: boolean;
}

export interface AllUpdatesResponse {
  stacks: Record<string, StackUpdateResult>;
  checked_at?: string;
  total_updates?: number;
}
