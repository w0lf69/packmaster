import { useState, useEffect, useRef, useCallback } from "react";
import { useStack } from "../lib/hooks.ts";
import { api } from "../lib/api.ts";

export function LogViewer({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const { data: stackData } = useStack(name);
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [container, setContainer] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    eventSourceRef.current?.close();
    setLines([]);

    const url = api.logsUrl(name, container || undefined);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as { line?: string; error?: string };
      if (data.error) {
        setLines((prev) => [...prev, `[ERROR] ${data.error}`]);
        return;
      }
      if (data.line !== undefined) {
        setLines((prev) => {
          const next = [...prev, data.line!];
          // Keep last 2000 lines
          return next.length > 2000 ? next.slice(-2000) : next;
        });
      }
    };

    es.onerror = () => {
      setLines((prev) => [...prev, "[Connection lost. Reconnecting...]"]);
    };
  }, [name, container]);

  useEffect(() => {
    connect();
    return () => eventSourceRef.current?.close();
  }, [connect]);

  // Auto-scroll
  useEffect(() => {
    if (!paused && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const services = stackData?.containers.map((c) => c.Service || c.Name).filter(Boolean) ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
            <span>&#8592;</span> {name}
          </button>
          <span className="text-slate-600">/</span>
          <span className="text-sm text-white font-medium">Logs</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Container filter */}
          {services.length > 1 && (
            <select
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded px-2 py-1 focus:outline-none"
            >
              <option value="">All containers</option>
              {services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setPaused(!paused)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              paused
                ? "bg-amber-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>

          <button
            onClick={() => setLines([])}
            className="px-3 py-1 text-xs font-medium bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 overflow-y-auto font-mono text-xs leading-5 text-slate-300"
      >
        {lines.length === 0 ? (
          <span className="text-slate-500">Waiting for logs...</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all hover:bg-slate-900/50">
              {line}
            </div>
          ))
        )}
      </div>

      <div className="mt-2 text-xs text-slate-500">
        {lines.length} lines {paused && "(paused)"}
      </div>
    </div>
  );
}
