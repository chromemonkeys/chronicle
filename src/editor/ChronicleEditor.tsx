import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import { useCallback, useEffect, useRef } from "react";
import { NodeId } from "./extensions/node-id";
import { ActiveBlockTracker } from "./extensions/active-block-tracker";
import { SlashCommands } from "./extensions/slash-commands";
import { SuggestionInsert, SuggestionDelete, SuggestionMode } from "./extensions/suggestion-mode";
import { DiffDecorations, type DiffState } from "./extensions/diff-decorations";
import { ThreadMarkers, type ThreadAnchor } from "./extensions/thread-markers";
import type { DiffManifest } from "./diff";
import type { DocumentContent } from "./schema";

type Props = {
  content: DocumentContent;
  editable?: boolean;
  onUpdate?: (doc: DocumentContent) => void;
  onSelectionChange?: (nodeId: string | null) => void;
  onEditorReady?: (editor: Editor) => void;
  suggestionMode?: boolean;
  diffManifest?: DiffManifest | null;
  diffVisible?: boolean;
  diffMode?: "split" | "unified";
  threadAnchors?: ThreadAnchor[];
  className?: string;
};

export function ChronicleEditor({
  content,
  editable = true,
  onUpdate,
  onSelectionChange,
  onEditorReady,
  suggestionMode = false,
  diffManifest = null,
  diffVisible = false,
  diffMode = "unified",
  threadAnchors = [],
  className = "",
}: Props) {
  const serializedContent = JSON.stringify(content);

  // Mutable ref for diff state so the ProseMirror plugin always reads latest values
  const diffStateRef = useRef<DiffState>({ manifest: diffManifest, visible: diffVisible, mode: diffMode });
  const threadAnchorsRef = useRef<ThreadAnchor[]>(threadAnchors);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      NodeId,
      ActiveBlockTracker.configure({
        onActiveBlockChange: (nodeId: string | null) => {
          onSelectionChange?.(nodeId);
        },
      }),
      SlashCommands,
      SuggestionInsert,
      SuggestionDelete,
      SuggestionMode.configure({
        enabled: suggestionMode,
      }),
      DiffDecorations.configure({
        getDiffState: () => diffStateRef.current,
      }),
      ThreadMarkers.configure({
        getAnchors: () => threadAnchorsRef.current,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor: ed }) => {
      onUpdate?.(ed.getJSON() as DocumentContent);
    },
    onCreate: ({ editor: ed }) => {
      onEditorReady?.(ed);
    },
  });

  // Update diff state ref and force decoration recalculation
  useEffect(() => {
    diffStateRef.current = { manifest: diffManifest, visible: diffVisible, mode: diffMode };
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta("diffUpdate", true));
    }
  }, [editor, diffManifest, diffVisible, diffMode]);

  // Update thread anchors ref and force decoration recalculation
  useEffect(() => {
    threadAnchorsRef.current = threadAnchors;
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta("threadMarkersUpdate", true));
    }
  }, [editor, threadAnchors]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const current = JSON.stringify(editor.getJSON());
    if (current !== serializedContent) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, serializedContent, content]);

  // Tab/Shift+Tab escapes the editor for keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // Let Tab escape the editor to move to next focusable element
      editor?.commands.blur();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`chronicle-editor ${className}`.trim()}
      role="textbox"
      aria-multiline="true"
      aria-label="Document editor"
      aria-readonly={!editable}
      onKeyDown={handleKeyDown}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

export { useEditor } from "@tiptap/react";
export type { Props as ChronicleEditorProps };
