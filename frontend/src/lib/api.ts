import type {
  StacksResponse,
  StackDetail,
  ComposeFile,
  ActionResult,
  DiscoverResponse,
  RegistryInfo,
  WatchtowerStatus,
  StackUpdateResult,
  AllUpdatesResponse,
} from "./types.ts";

const API = "/plugins/packmaster/api.php";

function getCsrfToken(): string {
  try {
    // Unraid sets `var csrf_token = "..."` in the parent frame
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (parent as any).csrf_token ?? "";
  } catch {
    return "";
  }
}

async function get<T>(action: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(API, window.location.origin);
  url.searchParams.set("action", action);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(action: string, name?: string, body?: unknown): Promise<T> {
  const url = new URL(API, window.location.origin);
  url.searchParams.set("action", action);
  if (name) url.searchParams.set("name", name);

  // Unraid requires csrf_token in $_POST (form-encoded).
  // Send csrf_token + optional JSON payload as form fields.
  const formData = new URLSearchParams();
  formData.set("csrf_token", getCsrfToken());
  if (body) formData.set("data", JSON.stringify(body));

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  stacks: () => get<StacksResponse>("stacks"),
  stack: (name: string) => get<StackDetail>("stack", { name }),
  up: (name: string) => post<ActionResult>("up", name),
  down: (name: string) => post<ActionResult>("down", name),
  restart: (name: string) => post<ActionResult>("restart", name),
  pull: (name: string) => post<ActionResult>("pull", name),
  update: (name: string) => post<ActionResult>("update", name),
  compose: (name: string) => get<ComposeFile>("compose", { name }),
  save: (name: string, content: string) => post<ActionResult>("save", name, { content }),
  register: (path: string, name?: string) => post<ActionResult>("register", undefined, { path, name }),
  registerBulk: (stacks: { path: string; name: string }[]) => post<ActionResult>("register", undefined, { stacks }),
  unregister: (name: string) => post<ActionResult>("unregister", name),
  discover: () => get<DiscoverResponse>("discover"),
  registries: () => get<RegistryInfo>("registries"),

  logsUrl: (name: string, container?: string, tail = 100) => {
    const url = new URL(API, window.location.origin);
    url.searchParams.set("action", "logs");
    url.searchParams.set("name", name);
    if (container) url.searchParams.set("container", container);
    url.searchParams.set("tail", String(tail));
    return url.toString();
  },

  // Watchtower
  watchtowerStatus: () => get<WatchtowerStatus>("watchtower_status"),
  imageUpdates: (name: string) => get<StackUpdateResult>("image_updates", { name }),
  allUpdateCache: () => get<AllUpdatesResponse>("image_updates"),
  checkAllUpdates: () => post<AllUpdatesResponse>("check_all_updates"),
  watchtowerCheck: () => post<{ success: boolean; error?: string; hint?: string; response?: string }>("watchtower_check"),
};
