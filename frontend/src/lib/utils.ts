import type { Stack, StackStatus } from "./types.ts";

// ─── Status Maps ────────────────────────────────────────────────────────

export const statusColors: Record<StackStatus, string> = {
  running: "bg-emerald-500",
  partial: "bg-amber-500",
  stopped: "bg-slate-500",
};

export const statusLabels: Record<StackStatus, string> = {
  running: "Running",
  partial: "Partial",
  stopped: "Stopped",
};

export const stateColors: Record<string, string> = {
  running: "text-emerald-400",
  exited: "text-red-400",
  restarting: "text-amber-400",
  paused: "text-slate-400",
  created: "text-slate-400",
};

export const toastTypeStyles: Record<string, string> = {
  success: "bg-emerald-900/90 border-emerald-700/60 text-emerald-200",
  error: "bg-red-900/90 border-red-700/60 text-red-200",
  info: "bg-blue-900/90 border-blue-700/60 text-blue-200",
};

// ─── Sorting & Filtering ────────────────────────────────────────────────

const statusOrder: Record<StackStatus, number> = {
  running: 0,
  partial: 1,
  stopped: 2,
};

/** Sort stacks: running first, then partial, then stopped. Alphabetical within each group. */
export function sortStacks(stacks: Stack[]): Stack[] {
  return [...stacks].sort((a, b) => {
    const diff = statusOrder[a.status] - statusOrder[b.status];
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

/** Filter stacks by search term (case-insensitive name match). */
export function filterStacks(stacks: Stack[], search: string): Stack[] {
  if (!search) return stacks;
  const lower = search.toLowerCase();
  return stacks.filter((s) => s.name.toLowerCase().includes(lower));
}

// ─── Formatting ─────────────────────────────────────────────────────────

/** Turn a Watchtower 6-field cron schedule into a readable string. */
export function formatCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length >= 6) {
    const hour = parts[2];
    if (hour !== "*" && !hour.includes("/")) {
      const h = parseInt(hour, 10);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `daily ${h12}${ampm}`;
    }
  }
  return cron;
}

/** Format an ISO timestamp as a relative time string. */
export function formatTimestamp(iso: string, now?: Date): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const ref = now ?? new Date();
    const diff = ref.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

// ─── Action Verbs ───────────────────────────────────────────────────────

/** Derive a past-tense verb for a Docker action. */
export function actionVerb(action: string): string {
  if (action === "up") return "started";
  if (action === "down") return "stopped";
  if (action === "update") return "updated";
  return action + "ed";
}

// ─── URL Building ───────────────────────────────────────────────────────

const API = "/plugins/packmaster/api.php";

/** Build a logs SSE URL. Pure function (no fetch). */
export function buildLogsUrl(
  origin: string,
  name: string,
  container?: string,
  tail = 100,
): string {
  const url = new URL(API, origin);
  url.searchParams.set("action", "logs");
  url.searchParams.set("name", name);
  if (container) url.searchParams.set("container", container);
  url.searchParams.set("tail", String(tail));
  return url.toString();
}

// ─── Container State ────────────────────────────────────────────────────

/** Get the CSS class for a container state. */
export function containerStateColor(state: string): string {
  return stateColors[(state ?? "").toLowerCase()] ?? "text-slate-400";
}

// ─── Update Counting ────────────────────────────────────────────────────

/** Count how many stacks have updates available. */
export function countUpdatesAvailable(
  stacks: Record<string, { has_updates: boolean }>,
): number {
  return Object.values(stacks).filter((s) => s.has_updates).length;
}

/** Format an update count into a display string. */
export function formatUpdateCount(count: number): string {
  if (count > 0) {
    return `${count} stack${count !== 1 ? "s" : ""} with updates available`;
  }
  return "All images up to date";
}
