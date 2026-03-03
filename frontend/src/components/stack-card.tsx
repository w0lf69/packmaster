import type { Stack, StackUpdateResult } from "../lib/types.ts";
import { useStackAction } from "../lib/hooks.ts";

const statusColors = {
  running: "bg-emerald-500",
  partial: "bg-amber-500",
  stopped: "bg-slate-500",
} as const;

const statusLabels = {
  running: "Running",
  partial: "Partial",
  stopped: "Stopped",
} as const;

type ActionResult = { action: string; name: string; success: boolean; output: string };

export function StackCard({
  stack,
  onSelect,
  updateInfo,
  onActionComplete,
}: {
  stack: Stack;
  onSelect: () => void;
  updateInfo?: StackUpdateResult;
  onActionComplete?: (result: ActionResult) => void;
}) {
  const action = useStackAction(onActionComplete);
  const busy = action.isPending;

  return (
    <div
      onClick={onSelect}
      className="bg-slate-800 border border-slate-700/50 rounded-lg p-4 cursor-pointer hover:border-slate-600 transition-colors relative"
    >
      {/* Update available badge */}
      {updateInfo?.has_updates && (
        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-full ring-2 ring-slate-900" title="Update available" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white truncate">{stack.name}</h3>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColors[stack.status]}`} />
          <span className="text-xs text-slate-400">{statusLabels[stack.status]}</span>
        </div>
      </div>

      {/* Container count + update hint */}
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm text-slate-400">
          {stack.running}/{stack.total} containers
        </p>
        {updateInfo?.has_updates && (
          <span className="text-xs text-blue-400">update available</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {stack.status === "stopped" ? (
          <ActionBtn
            label="Start"
            disabled={busy}
            onClick={() => action.mutate({ action: "up", name: stack.name })}
            className="bg-emerald-600 hover:bg-emerald-500"
          />
        ) : (
          <>
            <ActionBtn
              label="Restart"
              disabled={busy}
              onClick={() => action.mutate({ action: "restart", name: stack.name })}
              className="bg-slate-600 hover:bg-slate-500"
            />
            <ActionBtn
              label="Stop"
              disabled={busy}
              onClick={() => action.mutate({ action: "down", name: stack.name })}
              className="bg-red-600/80 hover:bg-red-500"
            />
          </>
        )}
        <ActionBtn
          label={busy ? "..." : "Update"}
          disabled={busy}
          onClick={() => action.mutate({ action: "update", name: stack.name })}
          className="bg-blue-600 hover:bg-blue-500"
        />
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}
