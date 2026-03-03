import { useDiscover, useRegisterStack, useRegisterBulk } from "../lib/hooks.ts";

export function StackDiscovery({ onBack }: { onBack: () => void }) {
  const { data, isLoading, error, refetch } = useDiscover();
  const register = useRegisterStack();
  const registerBulk = useRegisterBulk();

  if (isLoading) {
    return <div className="text-slate-400 py-10 text-center">Scanning directories...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-red-400 mb-4">Discovery failed: {error.message}</p>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">Back</button>
      </div>
    );
  }

  const stacks = data?.stacks ?? [];
  const unregistered = stacks.filter((s) => !s.registered);
  const registered = stacks.filter((s) => s.registered);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Discover Stacks</h2>
          <p className="text-sm text-slate-400 mt-1">
            Scanning: {(data?.scan_dirs ?? []).join(", ") || "no directories configured"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
          >
            Rescan
          </button>
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Back
          </button>
        </div>
      </div>

      {/* Unregistered */}
      {unregistered.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Available ({unregistered.length})
          </h3>
          <div className="space-y-2">
            {unregistered.map((s) => (
              <div key={s.path} className="bg-slate-800 border border-slate-700/50 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="text-white text-sm font-medium">{s.name}</span>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{s.path}</p>
                </div>
                <button
                  onClick={() => register.mutate({ path: s.path, name: s.name })}
                  disabled={register.isPending}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
                >
                  Register
                </button>
              </div>
            ))}
          </div>

          {unregistered.length > 1 && (
            <button
              onClick={() => {
                registerBulk.mutate(unregistered.map((s) => ({ path: s.path, name: s.name })));
              }}
              disabled={registerBulk.isPending}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
            >
              {registerBulk.isPending ? "Registering..." : `Register All (${unregistered.length})`}
            </button>
          )}
        </div>
      )}

      {/* Already registered */}
      {registered.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Already Registered ({registered.length})
          </h3>
          <div className="space-y-2">
            {registered.map((s) => (
              <div key={s.path} className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <span className="text-slate-300 text-sm">{s.name}</span>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">{s.path}</p>
                </div>
                <span className="text-xs text-emerald-500">Registered</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stacks.length === 0 && (
        <div className="text-center py-10">
          <p className="text-slate-500">No compose files found in scan directories.</p>
        </div>
      )}
    </div>
  );
}
