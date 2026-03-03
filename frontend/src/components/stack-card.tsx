import { useState } from "react";
import type { Stack, StackUpdateResult } from "../lib/types.ts";
import { useStackAction } from "../lib/hooks.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";

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
  const activeAction = busy ? action.variables?.action : null;
  const [confirmStop, setConfirmStop] = useState(false);

  return (
    <>
    <ConfirmDialog
      open={confirmStop}
      title={`Stop ${stack.name}?`}
      message="All containers in this stack will be stopped and removed."
      confirmLabel="Stop"
      onConfirm={() => { setConfirmStop(false); action.mutate({ action: "down", name: stack.name }); }}
      onCancel={() => setConfirmStop(false)}
    />
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
            loading={activeAction === "up"}
            disabled={busy}
            onClick={() => action.mutate({ action: "up", name: stack.name })}
            className="bg-emerald-600 hover:bg-emerald-500"
          />
        ) : (
          <>
            <ActionBtn
              label="Restart"
              loading={activeAction === "restart"}
              disabled={busy}
              onClick={() => action.mutate({ action: "restart", name: stack.name })}
              className="bg-slate-600 hover:bg-slate-500"
            />
            <ActionBtn
              label="Stop"
              loading={activeAction === "down"}
              disabled={busy}
              onClick={() => setConfirmStop(true)}
              className="bg-red-600/80 hover:bg-red-500"
            />
          </>
        )}
        <ActionBtn
          label="Update"
          loading={activeAction === "update"}
          disabled={busy}
          onClick={() => action.mutate({ action: "update", name: stack.name })}
          className="bg-blue-600 hover:bg-blue-500"
        />
      </div>
    </div>
    </>
  );
}

function ActionBtn({
  label,
  loading,
  onClick,
  disabled,
  className,
}: {
  label: string;
  loading?: boolean;
  onClick: () => void;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5 ${className}`}
    >
      {loading && <Spinner />}
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
