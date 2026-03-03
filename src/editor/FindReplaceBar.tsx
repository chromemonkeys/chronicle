import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { FindReplaceState } from "./extensions/find-replace";

type Props = {
  editor: Editor;
  visible: boolean;
  onClose: () => void;
};

export function FindReplaceBar({ editor, visible, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [replace, setReplace] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      editor.commands.setSearchTerm("");
    }
  }, [visible, editor]);

  useEffect(() => {
    editor.commands.setSearchTerm(search);
  }, [search, editor]);

  const state: FindReplaceState = (editor.storage as any).findReplace ?? {
    searchTerm: "",
    matchIndex: 0,
    matchCount: 0,
  };

  if (!visible) return null;

  return (
    <div className="cm-find-bar">
      <div className="cm-find-bar-row">
        <input
          ref={inputRef}
          className="cm-find-input"
          type="text"
          placeholder="Find..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              editor.commands.nextMatch();
            }
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              editor.commands.prevMatch();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <span className="cm-find-count">
          {state.matchCount > 0
            ? `${state.matchIndex + 1} of ${state.matchCount}`
            : search
              ? "No results"
              : ""}
        </span>
        <button
          className="cm-find-btn"
          type="button"
          onClick={() => editor.commands.prevMatch()}
          disabled={state.matchCount === 0}
          title="Previous (Shift+Enter)"
        >
          ▲
        </button>
        <button
          className="cm-find-btn"
          type="button"
          onClick={() => editor.commands.nextMatch()}
          disabled={state.matchCount === 0}
          title="Next (Enter)"
        >
          ▼
        </button>
        <button className="cm-find-btn" type="button" onClick={onClose} title="Close (Escape)">
          ✕
        </button>
      </div>
      <div className="cm-find-bar-row">
        <input
          className="cm-find-input"
          type="text"
          placeholder="Replace..."
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <button
          className="cm-find-btn"
          type="button"
          onClick={() => editor.commands.replaceMatch(replace)}
          disabled={state.matchCount === 0}
          title="Replace"
        >
          Replace
        </button>
        <button
          className="cm-find-btn"
          type="button"
          onClick={() => editor.commands.replaceAll(replace)}
          disabled={state.matchCount === 0}
          title="Replace all"
        >
          All
        </button>
      </div>
    </div>
  );
}
