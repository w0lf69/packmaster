import { useStacks, useWatchtowerStatus, useUpdateCache, useCheckAllUpdates } from "../lib/hooks.ts";
import { StackCard } from "./stack-card.tsx";
import type { StackUpdateResult } from "../lib/types.ts";

type ActionResult = { action: string; name: string; success: boolean; output: string };

export function Dashboard({
  onSelect,
  onActionComplete,
  onToast,
}: {
  onSelect: (name: string) => void;
  onActionComplete?: (result: ActionResult) => void;
  onToast?: (message: string, type: "success" | "error" | "info") => void;
}) {
  const { data, isLoading, error } = useStacks();
  const wt = useWatchtowerStatus();
  const updateCache = useUpdateCache();
  const checkAll = useCheckAllUpdates();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading stacks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">Failed to load stacks: {error.message}</div>
      </div>
    );
  }

  const stacks = data?.stacks ?? [];

  if (stacks.length === 0) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl text-slate-300 mb-2">No stacks registered</h2>
        <p className="text-slate-500">Use Discover to find and register Docker Compose stacks.</p>
      </div>
    );
  }

  // Sort: running first, then partial, then stopped. Alphabetical within each group.
  const sorted = [...stacks].sort((a, b) => {
    const order = { running: 0, partial: 1, stopped: 2 };
    const diff = order[a.status] - order[b.status];
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const running = stacks.filter((s) => s.status === "running").length;
  const total = stacks.length;

  // Count stacks with available updates from cache
  const cachedStacks = updateCache.data?.stacks ?? {};
  const cachedCount = Object.keys(cachedStacks).length;
  const updatesAvailable = Object.values(cachedStacks).filter(
    (s: StackUpdateResult) => s.has_updates
  ).length;

  const wtData = wt.data;

  const handleCheckAll = () => {
    checkAll.mutate(undefined, {
      onSuccess: (data) => {
        const count = data.total_updates ?? 0;
        if (count > 0) {
          onToast?.(`${count} stack${count !== 1 ? "s" : ""} with updates available`, "info");
        } else {
          onToast?.("All images up to date", "success");
        }
      },
      onError: () => {
        onToast?.("Failed to check for updates", "error");
      },
    });
  };

  return (
    <div>
      {/* Summary bar */}
      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-white">Stacks</h2>
          <span className="text-sm text-slate-400">
            {running}/{total} running
          </span>
        </div>

        {/* Watchtower status pill */}
        {wtData && wtData.detected && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700/50 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${wtData.running ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span className="text-slate-300">Watchtower</span>
            {wtData.schedule && (
              <span className="text-slate-500 ml-1">{formatCron(wtData.schedule)}</span>
            )}
          </div>
        )}

        {/* Update status badge */}
        {cachedCount > 0 && updatesAvailable > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/40 border border-blue-700/40 text-xs text-blue-300">
            {updatesAvailable} update{updatesAvailable !== 1 ? "s" : ""} available
          </div>
        )}
        {cachedCount > 0 && updatesAvailable === 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/30 border border-emerald-700/30 text-xs text-emerald-400">
            All up to date
          </div>
        )}

        {/* Check All button */}
        <button
          onClick={handleCheckAll}
          disabled={checkAll.isPending}
          className="ml-auto px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700/50 rounded hover:border-slate-500 transition-colors disabled:opacity-50"
        >
          {checkAll.isPending ? "Checking..." : "Check for Updates"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((stack) => (
          <StackCard
            key={stack.name}
            stack={stack}
            onSelect={() => onSelect(stack.name)}
            updateInfo={cachedStacks[stack.name]}
            onActionComplete={onActionComplete}
          />
        ))}
      </div>
    </div>
  );
}

/** Turn a cron schedule into a readable string. */
function formatCron(cron: string): string {
  // Watchtower uses 6-field cron: sec min hour dom month dow
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
