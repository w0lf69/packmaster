import { useState, useEffect } from "react";
import { useCompose, useSaveCompose } from "../lib/hooks.ts";

export function ComposeEditor({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useCompose(name);
  const save = useSaveCompose();
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.content) {
      setContent(data.content);
      setDirty(false);
    }
  }, [data?.content]);

  if (isLoading) {
    return <div className="text-slate-400 py-10 text-center">Loading compose file...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-red-400 mb-4">Failed to load: {error.message}</p>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">Back</button>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4">
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white transition-colors">
          {name}
        </button>
        <span className="text-slate-600 mx-2">/</span>
        <span className="text-sm text-white font-medium">{data?.file ?? "compose.yaml"}</span>
        {dirty && <span className="text-amber-400 text-xs ml-2">(unsaved)</span>}
      </div>

      {/* Editor */}
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        onKeyDown={(e) => {
          // Ctrl/Cmd+S to save
          if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            if (dirty && !save.isPending) {
              save.mutate({ name, content });
              setDirty(false);
            }
          }
          // Tab inserts spaces
          if (e.key === "Tab") {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const val = e.currentTarget.value;
            setContent(val.substring(0, start) + "  " + val.substring(end));
            setDirty(true);
            // Restore cursor position after React re-render
            requestAnimationFrame(() => {
              e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
            });
          }
        }}
        spellCheck={false}
        className="w-full h-[calc(100vh-220px)] bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-sm text-slate-200 resize-none focus:outline-none focus:border-blue-500/50"
      />

      {/* Save bar */}
      <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-slate-500">
          Ctrl+S to save. Backup created on each save.
        </div>
        <div className="flex items-center gap-3">
          {save.data && (
            <span className={`text-xs ${save.data.success ? "text-emerald-400" : "text-red-400"}`}>
              {save.data.success ? `Saved (backup: ${save.data.backup})` : "Save failed"}
            </span>
          )}
          <button
            onClick={() => {
              save.mutate({ name, content });
              setDirty(false);
            }}
            disabled={!dirty || save.isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
          >
            {save.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
