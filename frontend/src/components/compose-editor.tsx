import { useState, useEffect, useRef, useCallback } from "react";
import { useCompose, useSaveCompose } from "../lib/hooks.ts";
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

/** Custom theme to blend with PackMaster's slate-950 background */
const packMasterTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "rgb(2 6 23)", // slate-950
    borderRight: "1px solid rgb(51 65 85 / 0.5)", // slate-700/50
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "rgb(96 165 250)", // blue-400
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgb(30 58 138 / 0.4) !important", // blue-900/40
  },
  ".cm-activeLine": {
    backgroundColor: "rgb(15 23 42 / 0.5)", // slate-900/50
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgb(15 23 42 / 0.5)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgb(202 138 4 / 0.3)", // amber highlight
    outline: "1px solid rgb(202 138 4 / 0.5)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgb(202 138 4 / 0.5)",
  },
}, { dark: true });

export function ComposeEditor({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useCompose(name);
  const save = useSaveCompose();
  const [dirty, setDirty] = useState(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);

  // Keep dirtyRef in sync
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const handleSave = useCallback(() => {
    if (!dirtyRef.current || save.isPending) return;
    save.mutate({ name, content: contentRef.current });
    setDirty(false);
  }, [name, save]);

  // Create CodeMirror instance when data loads
  useEffect(() => {
    if (!data?.content || !editorContainerRef.current) return;

    // Destroy previous instance
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
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        yaml(),
        oneDark,
        packMasterTheme,
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              handleSave();
              return true;
            },
          },
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            contentRef.current = update.state.doc.toString();
            setDirty(true);
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [data?.content, handleSave]);

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
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
          <span>&#8592;</span> {name}
        </button>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-white font-medium">{data?.file ?? "compose.yaml"}</span>
        {dirty && <span className="text-amber-400 text-xs ml-2">(unsaved)</span>}
      </div>

      {/* CodeMirror Editor */}
      <div
        ref={editorContainerRef}
        className="flex-1 min-h-0 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden [&_.cm-editor]:h-full"
      />

      {/* Save bar */}
      <div className="flex items-center justify-between mt-3 shrink-0">
        <div className="text-xs text-slate-500">
          Ctrl+S to save &middot; Ctrl+F to search &middot; Ctrl+Z undo &middot; Backup on save
        </div>
        <div className="flex items-center gap-3">
          {save.data && (
            <span className={`text-xs ${save.data.success ? "text-emerald-400" : "text-red-400"}`}>
              {save.data.success ? `Saved (backup: ${save.data.backup})` : "Save failed"}
            </span>
          )}
          <button
            onClick={handleSave}
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
