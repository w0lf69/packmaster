import { useStack, useStackAction, useUnregisterStack } from "../lib/hooks.ts";
import type { Container } from "../lib/types.ts";

const stateColors: Record<string, string> = {
  running: "text-emerald-400",
  exited: "text-red-400",
  restarting: "text-amber-400",
  paused: "text-slate-400",
  created: "text-slate-400",
};

export function StackDetail({
  name,
  onBack,
  onEditCompose,
  onViewLogs,
}: {
  name: string;
  onBack: () => void;
  onEditCompose: () => void;
  onViewLogs: () => void;
}) {
  const { data, isLoading, error } = useStack(name);
  const action = useStackAction();
  const unregister = useUnregisterStack();
  const busy = action.isPending;

  if (isLoading) {
    return <div className="text-slate-400 py-10 text-center">Loading stack...</div>;
  }

  if (error || !data) {
    return (
      <div className="text-center py-10">
        <p className="text-red-400 mb-4">Failed to load stack: {error?.message ?? "not found"}</p>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">Back</button>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white transition-colors">
          All Stacks
        </button>
        <span className="text-slate-600 mx-2">/</span>
        <span className="text-sm text-white font-medium">{name}</span>
      </div>

      {/* Stack header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">{name}</h2>
          <p className="text-sm text-slate-500 mt-1 font-mono">{data.path}</p>
        </div>
        <div className="flex gap-2">
          <ActionBtn label="Start" disabled={busy} onClick={() => action.mutate({ action: "up", name })} className="bg-emerald-600 hover:bg-emerald-500" />
          <ActionBtn label="Restart" disabled={busy} onClick={() => action.mutate({ action: "restart", name })} className="bg-slate-600 hover:bg-slate-500" />
          <ActionBtn label="Pull" disabled={busy} onClick={() => action.mutate({ action: "pull", name })} className="bg-indigo-600 hover:bg-indigo-500" />
          <ActionBtn label="Update" disabled={busy} onClick={() => action.mutate({ action: "update", name })} className="bg-blue-600 hover:bg-blue-500" />
          <ActionBtn label="Stop" disabled={busy} onClick={() => action.mutate({ action: "down", name })} className="bg-red-600/80 hover:bg-red-500" />
        </div>
      </div>

      {/* Quick links */}
      <div className="flex gap-3 mb-6">
        <button onClick={onEditCompose} className="px-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded hover:border-slate-500 transition-colors">
          Edit Compose
        </button>
        <button onClick={onViewLogs} className="px-4 py-2 text-sm bg-slate-800 border border-slate-700 rounded hover:border-slate-500 transition-colors">
          View Logs
        </button>
        <button
          onClick={() => {
            if (confirm(`Unregister "${name}" from PackMaster? (Containers won't be affected)`)) {
              unregister.mutate(name, { onSuccess: onBack });
            }
          }}
          className="px-4 py-2 text-sm text-red-400 bg-slate-800 border border-slate-700 rounded hover:border-red-500/50 transition-colors ml-auto"
        >
          Unregister
        </button>
      </div>

      {/* Action result */}
      {action.data && (
        <div className={`mb-4 p-3 rounded text-sm font-mono whitespace-pre-wrap ${action.data.success ? "bg-emerald-900/30 border border-emerald-700/50 text-emerald-300" : "bg-red-900/30 border border-red-700/50 text-red-300"}`}>
          {action.data.output || (action.data.success ? "Done" : "Failed")}
        </div>
      )}

      {/* Containers */}
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Containers ({data.containers.length})
      </h3>

      {data.containers.length === 0 ? (
        <p className="text-slate-500 text-sm">No containers. Stack may be stopped.</p>
      ) : (
        <div className="space-y-2">
          {data.containers.map((c) => (
            <ContainerRow key={c.ID} container={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerRow({ container: c }: { container: Container }) {
  const state = (c.State ?? "").toLowerCase();
  const color = stateColors[state] ?? "text-slate-400";

  return (
    <div className="bg-slate-800 border border-slate-700/50 rounded-lg p-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-white text-sm truncate">{c.Service || c.Name}</span>
          <span className={`text-xs ${color}`}>{c.State}</span>
        </div>
        <p className="text-xs text-slate-500 truncate font-mono">{c.Image}</p>
      </div>
      {c.Ports && (
        <div className="text-xs text-slate-400 font-mono shrink-0">{c.Ports}</div>
      )}
      <div className="text-xs text-slate-500 font-mono shrink-0">{c.Status}</div>
    </div>
  );
}

function ActionBtn({ label, onClick, disabled, className }: { label: string; onClick: () => void; disabled: boolean; className: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`px-3 py-1.5 text-sm font-medium text-white rounded transition-colors disabled:opacity-50 ${className}`}>
      {label}
    </button>
  );
}
