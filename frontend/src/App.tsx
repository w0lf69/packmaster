import { useState, useCallback } from "react";
import type { View } from "./lib/types.ts";
import { Dashboard } from "./components/dashboard.tsx";
import { StackDetail } from "./components/stack-detail.tsx";
import { ComposeEditor } from "./components/compose-editor.tsx";
import { EnvEditor } from "./components/env-editor.tsx";
import { LogViewer } from "./components/log-viewer.tsx";
import { StackDiscovery } from "./components/stack-discovery.tsx";
import { ToastContainer, useToasts } from "./components/toast.tsx";

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [selectedStack, setSelectedStack] = useState("");
  const { toasts, addToast, dismiss } = useToasts();

  const navigate = useCallback((v: View, stack?: string) => {
    setView(v);
    if (stack !== undefined) setSelectedStack(stack);
  }, []);

  const handleActionComplete = useCallback(
    (result: { action: string; name: string; success: boolean; output: string }) => {
      const verb = result.action === "up" ? "started" : result.action === "down" ? "stopped" : result.action + "ed";
      if (result.success) {
        addToast(`${result.name} ${verb} successfully`, "success");
      } else {
        addToast(`${result.name} ${result.action} failed`, "error");
      }
    },
    [addToast],
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate("dashboard")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-lg font-bold text-white">PackMaster</span>
          </button>

          <div className="flex items-center gap-2">
            {view !== "dashboard" && (
              <button
                onClick={() => navigate("dashboard")}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
              >
                All Stacks
              </button>
            )}
            <button
              onClick={() => navigate("discover")}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                view === "discover"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Discover
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === "dashboard" && (
          <Dashboard onSelect={(name) => navigate("detail", name)} onActionComplete={handleActionComplete} onToast={addToast} />
        )}
        {view === "detail" && (
          <StackDetail
            name={selectedStack}
            onBack={() => navigate("dashboard")}
            onEditCompose={() => navigate("editor", selectedStack)}
            onEditEnv={() => navigate("env", selectedStack)}
            onViewLogs={() => navigate("logs", selectedStack)}
            onActionComplete={handleActionComplete}
          />
        )}
        {view === "editor" && (
          <ComposeEditor
            name={selectedStack}
            onBack={() => navigate("detail", selectedStack)}
          />
        )}
        {view === "env" && (
          <EnvEditor
            name={selectedStack}
            onBack={() => navigate("detail", selectedStack)}
          />
        )}
        {view === "logs" && (
          <LogViewer
            name={selectedStack}
            onBack={() => navigate("detail", selectedStack)}
          />
        )}
        {view === "discover" && (
          <StackDiscovery onBack={() => navigate("dashboard")} />
        )}
      </main>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
