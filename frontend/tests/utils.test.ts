import { describe, it, expect } from "vitest";
import {
  statusColors,
  statusLabels,
  stateColors,
  toastTypeStyles,
  sortStacks,
  filterStacks,
  formatCron,
  formatTimestamp,
  actionVerb,
  buildLogsUrl,
  containerStateColor,
  countUpdatesAvailable,
  formatUpdateCount,
} from "../src/lib/utils.ts";
import type { Stack, StackStatus } from "../src/lib/types.ts";

// ─── Helper: build a minimal Stack object ───────────────────────────────

function makeStack(name: string, status: StackStatus, running = 0, total = 1): Stack {
  return {
    name,
    path: `/stacks/${name}`,
    running,
    total,
    status,
    containers: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Status Color / Label Maps
// ═══════════════════════════════════════════════════════════════════════

describe("statusColors", () => {
  it("maps running to emerald", () => {
    expect(statusColors.running).toBe("bg-emerald-500");
  });

  it("maps partial to amber", () => {
    expect(statusColors.partial).toBe("bg-amber-500");
  });

  it("maps stopped to slate", () => {
    expect(statusColors.stopped).toBe("bg-slate-500");
  });

  it("covers all three StackStatus values", () => {
    expect(Object.keys(statusColors)).toEqual(["running", "partial", "stopped"]);
  });
});

describe("statusLabels", () => {
  it("maps running to Running", () => {
    expect(statusLabels.running).toBe("Running");
  });

  it("maps partial to Partial", () => {
    expect(statusLabels.partial).toBe("Partial");
  });

  it("maps stopped to Stopped", () => {
    expect(statusLabels.stopped).toBe("Stopped");
  });

  it("has same keys as statusColors", () => {
    expect(Object.keys(statusLabels).sort()).toEqual(Object.keys(statusColors).sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Container State Colors
// ═══════════════════════════════════════════════════════════════════════

describe("stateColors", () => {
  it("maps running to emerald", () => {
    expect(stateColors.running).toBe("text-emerald-400");
  });

  it("maps exited to red", () => {
    expect(stateColors.exited).toBe("text-red-400");
  });

  it("maps restarting to amber", () => {
    expect(stateColors.restarting).toBe("text-amber-400");
  });

  it("maps paused to slate", () => {
    expect(stateColors.paused).toBe("text-slate-400");
  });

  it("maps created to slate", () => {
    expect(stateColors.created).toBe("text-slate-400");
  });

  it("covers 5 known Docker container states", () => {
    expect(Object.keys(stateColors)).toHaveLength(5);
  });
});

describe("containerStateColor", () => {
  it("returns correct color for running", () => {
    expect(containerStateColor("running")).toBe("text-emerald-400");
  });

  it("is case-insensitive", () => {
    expect(containerStateColor("Running")).toBe("text-emerald-400");
    expect(containerStateColor("EXITED")).toBe("text-red-400");
  });

  it("returns fallback for unknown states", () => {
    expect(containerStateColor("dead")).toBe("text-slate-400");
    expect(containerStateColor("removing")).toBe("text-slate-400");
  });

  it("handles empty string", () => {
    expect(containerStateColor("")).toBe("text-slate-400");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Toast Type Styles
// ═══════════════════════════════════════════════════════════════════════

describe("toastTypeStyles", () => {
  it("has success, error, and info keys", () => {
    expect(Object.keys(toastTypeStyles).sort()).toEqual(["error", "info", "success"]);
  });

  it("success style contains emerald", () => {
    expect(toastTypeStyles.success).toContain("emerald");
  });

  it("error style contains red", () => {
    expect(toastTypeStyles.error).toContain("red");
  });

  it("info style contains blue", () => {
    expect(toastTypeStyles.info).toContain("blue");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// sortStacks
// ═══════════════════════════════════════════════════════════════════════

describe("sortStacks", () => {
  it("puts running stacks first", () => {
    const stacks = [
      makeStack("zeta", "stopped"),
      makeStack("alpha", "running"),
    ];
    const sorted = sortStacks(stacks);
    expect(sorted[0].name).toBe("alpha");
    expect(sorted[1].name).toBe("zeta");
  });

  it("puts partial stacks between running and stopped", () => {
    const stacks = [
      makeStack("c-stopped", "stopped"),
      makeStack("b-partial", "partial"),
      makeStack("a-running", "running"),
    ];
    const sorted = sortStacks(stacks);
    expect(sorted.map((s) => s.status)).toEqual(["running", "partial", "stopped"]);
  });

  it("sorts alphabetically within same status group", () => {
    const stacks = [
      makeStack("nginx", "running"),
      makeStack("authelia", "running"),
      makeStack("mariadb", "running"),
    ];
    const sorted = sortStacks(stacks);
    expect(sorted.map((s) => s.name)).toEqual(["authelia", "mariadb", "nginx"]);
  });

  it("handles mixed statuses with alphabetical tie-breaking", () => {
    const stacks = [
      makeStack("z-stopped", "stopped"),
      makeStack("b-running", "running"),
      makeStack("a-partial", "partial"),
      makeStack("c-partial", "partial"),
      makeStack("a-running", "running"),
    ];
    const sorted = sortStacks(stacks);
    expect(sorted.map((s) => s.name)).toEqual([
      "a-running",
      "b-running",
      "a-partial",
      "c-partial",
      "z-stopped",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(sortStacks([])).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const stacks = [makeStack("b", "stopped"), makeStack("a", "running")];
    const original = [...stacks];
    sortStacks(stacks);
    expect(stacks[0].name).toBe(original[0].name);
    expect(stacks[1].name).toBe(original[1].name);
  });

  it("handles single stack", () => {
    const stacks = [makeStack("only", "partial")];
    const sorted = sortStacks(stacks);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].name).toBe("only");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// filterStacks
// ═══════════════════════════════════════════════════════════════════════

describe("filterStacks", () => {
  const stacks = [
    makeStack("nginx-proxy", "running"),
    makeStack("mariadb", "running"),
    makeStack("nextcloud", "partial"),
    makeStack("nginx-extra", "stopped"),
  ];

  it("returns all stacks when search is empty", () => {
    expect(filterStacks(stacks, "")).toHaveLength(4);
  });

  it("filters by partial name match", () => {
    const result = filterStacks(stacks, "nginx");
    expect(result.map((s) => s.name)).toEqual(["nginx-proxy", "nginx-extra"]);
  });

  it("is case-insensitive", () => {
    const result = filterStacks(stacks, "NGINX");
    expect(result).toHaveLength(2);
  });

  it("returns empty for no matches", () => {
    expect(filterStacks(stacks, "postgresql")).toEqual([]);
  });

  it("matches single character", () => {
    const result = filterStacks(stacks, "m");
    expect(result.map((s) => s.name)).toEqual(["mariadb"]);
  });

  it("matches full name exactly", () => {
    const result = filterStacks(stacks, "mariadb");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("mariadb");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// formatCron (Watchtower 6-field cron)
// ═══════════════════════════════════════════════════════════════════════

describe("formatCron", () => {
  it("formats midnight (hour 0) as daily 12AM", () => {
    expect(formatCron("0 0 0 * * *")).toBe("daily 12AM");
  });

  it("formats 3AM correctly", () => {
    expect(formatCron("0 0 3 * * *")).toBe("daily 3AM");
  });

  it("formats noon (hour 12) as daily 12PM", () => {
    expect(formatCron("0 0 12 * * *")).toBe("daily 12PM");
  });

  it("formats 15:00 as daily 3PM", () => {
    expect(formatCron("0 0 15 * * *")).toBe("daily 3PM");
  });

  it("formats 23:00 as daily 11PM", () => {
    expect(formatCron("0 0 23 * * *")).toBe("daily 11PM");
  });

  it("formats 1PM correctly", () => {
    expect(formatCron("0 0 13 * * *")).toBe("daily 1PM");
  });

  it("returns raw cron when hour is wildcard", () => {
    expect(formatCron("0 */5 * * * *")).toBe("0 */5 * * * *");
  });

  it("returns raw cron when hour contains /", () => {
    expect(formatCron("0 0 */2 * * *")).toBe("0 0 */2 * * *");
  });

  it("returns raw cron for 5-field (standard) cron", () => {
    expect(formatCron("0 3 * * *")).toBe("0 3 * * *");
  });

  it("handles extra whitespace", () => {
    expect(formatCron("  0  0  4  *  *  *  ")).toBe("daily 4AM");
  });

  it("handles hour 11 as 11AM", () => {
    expect(formatCron("0 0 11 * * *")).toBe("daily 11AM");
  });

  it("handles hour 1 as 1AM", () => {
    expect(formatCron("0 0 1 * * *")).toBe("daily 1AM");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// formatTimestamp
// ═══════════════════════════════════════════════════════════════════════

describe("formatTimestamp", () => {
  it("returns 'just now' for timestamps less than 1 minute ago", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 30_000).toISOString(); // 30 seconds ago
    expect(formatTimestamp(iso, now)).toBe("just now");
  });

  it("returns minutes ago for recent timestamps", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 5 * 60_000).toISOString(); // 5 minutes ago
    expect(formatTimestamp(iso, now)).toBe("5m ago");
  });

  it("returns hours ago for timestamps within a day", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 3 * 3600_000).toISOString(); // 3 hours ago
    expect(formatTimestamp(iso, now)).toBe("3h ago");
  });

  it("returns localized date for timestamps older than 24 hours", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 48 * 3600_000).toISOString(); // 2 days ago
    const result = formatTimestamp(iso, now);
    // Should be a date string, not "Xh ago"
    expect(result).not.toContain("ago");
    expect(result).not.toBe("just now");
  });

  it("returns the raw string for invalid dates", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });

  it("returns 59m ago at the boundary", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 59 * 60_000).toISOString();
    expect(formatTimestamp(iso, now)).toBe("59m ago");
  });

  it("returns 1h ago at 60 minutes", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 60 * 60_000).toISOString();
    expect(formatTimestamp(iso, now)).toBe("1h ago");
  });

  it("returns 23h ago at 23 hours", () => {
    const now = new Date("2026-03-13T10:00:00Z");
    const iso = new Date(now.getTime() - 23 * 3600_000).toISOString();
    expect(formatTimestamp(iso, now)).toBe("23h ago");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// actionVerb
// ═══════════════════════════════════════════════════════════════════════

describe("actionVerb", () => {
  it("maps 'up' to 'started'", () => {
    expect(actionVerb("up")).toBe("started");
  });

  it("maps 'down' to 'stopped'", () => {
    expect(actionVerb("down")).toBe("stopped");
  });

  it("appends 'ed' to 'restart'", () => {
    expect(actionVerb("restart")).toBe("restarted");
  });

  it("appends 'ed' to 'pull'", () => {
    expect(actionVerb("pull")).toBe("pulled");
  });

  it("appends 'ed' to 'update'", () => {
    expect(actionVerb("update")).toBe("updated");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// buildLogsUrl
// ═══════════════════════════════════════════════════════════════════════

describe("buildLogsUrl", () => {
  const origin = "https://unraid.local";

  it("builds URL with required params", () => {
    const url = buildLogsUrl(origin, "nginx");
    expect(url).toContain("action=logs");
    expect(url).toContain("name=nginx");
    expect(url).toContain("tail=100");
  });

  it("includes container param when provided", () => {
    const url = buildLogsUrl(origin, "nginx", "web");
    expect(url).toContain("container=web");
  });

  it("omits container param when not provided", () => {
    const url = buildLogsUrl(origin, "nginx");
    expect(url).not.toContain("container=");
  });

  it("uses custom tail value", () => {
    const url = buildLogsUrl(origin, "nginx", undefined, 500);
    expect(url).toContain("tail=500");
  });

  it("defaults tail to 100", () => {
    const url = buildLogsUrl(origin, "nginx");
    expect(url).toContain("tail=100");
  });

  it("uses the correct API path", () => {
    const url = buildLogsUrl(origin, "test");
    expect(url).toContain("/plugins/packmaster/api.php");
  });

  it("builds a valid URL with the given origin", () => {
    const url = buildLogsUrl(origin, "test");
    expect(url).toMatch(/^https:\/\/unraid\.local/);
  });

  it("URL-encodes special characters in stack name", () => {
    const url = buildLogsUrl(origin, "my stack");
    expect(url).toContain("name=my+stack");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// countUpdatesAvailable
// ═══════════════════════════════════════════════════════════════════════

describe("countUpdatesAvailable", () => {
  it("counts stacks with updates", () => {
    const stacks = {
      nginx: { has_updates: true },
      mariadb: { has_updates: false },
      redis: { has_updates: true },
    };
    expect(countUpdatesAvailable(stacks)).toBe(2);
  });

  it("returns 0 when no updates available", () => {
    const stacks = {
      nginx: { has_updates: false },
      mariadb: { has_updates: false },
    };
    expect(countUpdatesAvailable(stacks)).toBe(0);
  });

  it("returns 0 for empty object", () => {
    expect(countUpdatesAvailable({})).toBe(0);
  });

  it("returns total count when all have updates", () => {
    const stacks = {
      a: { has_updates: true },
      b: { has_updates: true },
      c: { has_updates: true },
    };
    expect(countUpdatesAvailable(stacks)).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// formatUpdateCount
// ═══════════════════════════════════════════════════════════════════════

describe("formatUpdateCount", () => {
  it("singular form for 1 update", () => {
    expect(formatUpdateCount(1)).toBe("1 stack with updates available");
  });

  it("plural form for multiple updates", () => {
    expect(formatUpdateCount(3)).toBe("3 stacks with updates available");
  });

  it("returns 'All images up to date' for 0", () => {
    expect(formatUpdateCount(0)).toBe("All images up to date");
  });

  it("plural form for 2 updates", () => {
    expect(formatUpdateCount(2)).toBe("2 stacks with updates available");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Type Shape Validation (compile-time + runtime checks)
// ═══════════════════════════════════════════════════════════════════════

describe("type shapes", () => {
  it("Stack has required fields", () => {
    const stack: Stack = makeStack("test", "running", 2, 3);
    expect(stack).toHaveProperty("name");
    expect(stack).toHaveProperty("path");
    expect(stack).toHaveProperty("running");
    expect(stack).toHaveProperty("total");
    expect(stack).toHaveProperty("status");
    expect(stack).toHaveProperty("containers");
  });

  it("Stack containers is an array", () => {
    const stack = makeStack("test", "running");
    expect(Array.isArray(stack.containers)).toBe(true);
  });

  it("StackStatus is one of three values", () => {
    const valid: StackStatus[] = ["running", "partial", "stopped"];
    valid.forEach((s) => {
      expect(statusColors[s]).toBeDefined();
      expect(statusLabels[s]).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Integration: sortStacks + filterStacks pipeline
// ═══════════════════════════════════════════════════════════════════════

describe("sortStacks + filterStacks pipeline", () => {
  const stacks = [
    makeStack("nginx-proxy", "running"),
    makeStack("nginx-extra", "stopped"),
    makeStack("mariadb", "running"),
    makeStack("nextcloud", "partial"),
    makeStack("authelia", "stopped"),
  ];

  it("filter then sort: nginx stacks sorted by status", () => {
    const filtered = filterStacks(stacks, "nginx");
    const sorted = sortStacks(filtered);
    expect(sorted.map((s) => s.name)).toEqual(["nginx-proxy", "nginx-extra"]);
    expect(sorted[0].status).toBe("running");
    expect(sorted[1].status).toBe("stopped");
  });

  it("sort then filter preserves sort order", () => {
    const sorted = sortStacks(stacks);
    const filtered = filterStacks(sorted, "a");
    // "mariadb" (running) should come before "authelia" (stopped)
    expect(filtered[0].name).toBe("mariadb");
    expect(filtered[1].name).toBe("authelia");
  });

  it("full pipeline with no filter returns all sorted", () => {
    const result = filterStacks(sortStacks(stacks), "");
    expect(result).toHaveLength(5);
    // Running first (alphabetical), then partial, then stopped (alphabetical)
    expect(result.map((s) => s.name)).toEqual([
      "mariadb",
      "nginx-proxy",
      "nextcloud",
      "authelia",
      "nginx-extra",
    ]);
  });
});
