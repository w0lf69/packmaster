import { useStacks } from "../lib/hooks.ts";
import { StackCard } from "./stack-card.tsx";

export function Dashboard({ onSelect }: { onSelect: (name: string) => void }) {
  const { data, isLoading, error } = useStacks();

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

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-white">Stacks</h2>
        <span className="text-sm text-slate-400">
          {running}/{total} running
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((stack) => (
          <StackCard key={stack.name} stack={stack} onSelect={() => onSelect(stack.name)} />
        ))}
      </div>
    </div>
  );
}
