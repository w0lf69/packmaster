import { useState, useEffect, useRef, useCallback } from "react";
import { useEnv, useSaveEnv } from "../lib/hooks.ts";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle, StreamLanguage } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { tags } from "@lezer/highlight";

/** Minimal .env syntax: comments (#), keys (KEY=), values */
const envLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.eat("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.sol()) {
      // Key before =
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
        return "variableName";
      }
    }
    if (stream.eat("=")) return "operator";
    // Quoted values
    if (stream.match(/^"[^"]*"/) || stream.match(/^'[^']*'/)) return "string";
    stream.next();
    return null;
  },
});

const envHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#6b7280" },
  { tag: tags.variableName, color: "#93c5fd" },
  { tag: tags.operator, color: "#9ca3af" },
  { tag: tags.string, color: "#86efac" },
]);

/** Custom theme matching PackMaster's slate-950 UI */
const packMasterTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "rgb(2 6 23)",
    borderRight: "1px solid rgb(51 65 85 / 0.5)",
  },
  "&.cm-focused .cm-cursor": { borderLeftColor: "rgb(96 165 250)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgb(30 58 138 / 0.4) !important",
  },
  ".cm-activeLine": { backgroundColor: "rgb(15 23 42 / 0.5)" },
  ".cm-activeLineGutter": { backgroundColor: "rgb(15 23 42 / 0.5)" },
  ".cm-searchMatch": {
    backgroundColor: "rgb(202 138 4 / 0.3)",
    outline: "1px solid rgb(202 138 4 / 0.5)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgb(202 138 4 / 0.5)",
  },
}, { dark: true });

export function EnvEditor({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useEnv(name);
  const save = useSaveEnv();
  const [dirty, setDirty] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);
  const saveRef = useRef(() => {});

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // Update save ref without triggering CodeMirror rebuild
  useEffect(() => {
    saveRef.current = () => {
      if (!dirtyRef.current || save.isPending) return;
      save.mutate({ name, content: contentRef.current });
      setDirty(false);
    };
  }, [name, save]);

  const handleSave = useCallback(() => {
    saveRef.current();
  }, []);

  // Warn on browser/tab close with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleBack = useCallback(() => {
    if (dirtyRef.current && !confirm("You have unsaved changes. Discard them?")) return;
    onBack();
  }, [onBack]);

  useEffect(() => {
    if (!data || !editorContainerRef.current) return;
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    contentRef.current = data.content;
    setDirty(false);

    const state = EditorState.create({
      doc: data.content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        envLanguage,
        syntaxHighlighting(envHighlight),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        packMasterTheme,
        keymap.of([
          { key: "Mod-s", run: () => { handleSave(); return true; } },
          indentWithTab,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            contentRef.current = update.state.doc.toString();
            setDirty(true);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorContainerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); viewRef.current = null; };
  }, [data?.content, data?.exists, handleSave]);

  if (isLoading) {
    return <div className="text-slate-400 py-10 text-center">Loading .env file...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-red-400 mb-4">Failed to load: {error.message}</p>
        <button onClick={handleBack} className="text-blue-400 hover:text-blue-300">Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <button onClick={handleBack} className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
          <span>&#8592;</span> {name}
        </button>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-white font-medium">.env</span>
        {dirty && <span className="text-amber-400 text-xs ml-2">(unsaved)</span>}
        {data && !data.exists && !dirty && (
          <span className="text-blue-400 text-xs ml-2">(new file)</span>
        )}
      </div>

      {/* CodeMirror Editor */}
      <div
        ref={editorContainerRef}
        className="flex-1 min-h-0 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden [&_.cm-editor]:h-full"
      />

      {/* Save bar */}
      <div className="flex items-center justify-between mt-3 shrink-0">
        <div className="text-xs text-slate-500">
          Ctrl+S to save &middot; Ctrl+F to search &middot; Ctrl+Z undo &middot; {data?.exists ? "Backup on save" : "Creates new .env file"}
        </div>
        <div className="flex items-center gap-3">
          {save.data && (
            <span className={`text-xs ${save.data.success ? "text-emerald-400" : "text-red-400"}`}>
              {save.data.success
                ? save.data.backup ? `Saved (backup: ${save.data.backup})` : "Created .env"
                : "Save failed"}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || save.isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50"
          >
            {save.isPending ? "Saving..." : data?.exists ? "Save" : "Create .env"}
          </button>
        </div>
      </div>
    </div>
  );
}
