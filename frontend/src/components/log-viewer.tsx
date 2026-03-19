import { useState, useEffect, useRef } from "react";
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
  const [connected, setConnected] = useState(true);
  const [container, setContainer] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);

  // Reset state when connection params change (render-time adjustment)
  const [prevParams, setPrevParams] = useState({ name, container, reconnectKey });
  if (name !== prevParams.name || container !== prevParams.container || reconnectKey !== prevParams.reconnectKey) {
    setPrevParams({ name, container, reconnectKey });
    setLines([]);
    setConnected(true);
  }

  useEffect(() => {
    retryCountRef.current = 0;

    const url = api.logsUrl(name, container || undefined);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      retryCountRef.current = 0;
    };

    es.onmessage = (event) => {
      retryCountRef.current = 0;
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
      retryCountRef.current++;
      // If we get 3 rapid errors without any successful messages, the stream is dead
      if (retryCountRef.current >= 3) {
        es.close();
        eventSourceRef.current = null;
        setConnected(false);
        setLines((prev) => [...prev, "[Stream ended — stack may be stopped]"]);
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [name, container, reconnectKey]);

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

          {!connected && (
            <button
              onClick={() => setReconnectKey((k) => k + 1)}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
            >
              Reconnect
            </button>
          )}

          <button
            onClick={() => setPaused(!paused)}
            disabled={!connected}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              paused
                ? "bg-amber-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            } disabled:opacity-50`}
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
        {lines.length} lines {paused && "(paused)"} {!connected && "(disconnected)"}
      </div>
    </div>
  );
}
