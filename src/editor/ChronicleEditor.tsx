import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import { FontSize } from "./extensions/font-size";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import { FindReplace } from "./extensions/find-replace";
import { CollaborationCursors } from "./extensions/collaboration-cursors";
import type { Awareness } from "y-protocols/awareness";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useRef } from "react";

const lowlight = createLowlight(common);
import { NodeId } from "./extensions/node-id";
import { ActiveBlockTracker } from "./extensions/active-block-tracker";
import { ActiveBlockHighlight } from "./extensions/active-block-highlight";
import { HoverBlockTracker } from "./extensions/hover-block-tracker";
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
  onHoverBlockChange?: (nodeId: string | null) => void;
  onEditorReady?: (editor: Editor) => void;
  suggestionMode?: boolean;
  diffManifest?: DiffManifest | null;
  diffVisible?: boolean;
  diffMode?: "split" | "unified";
  activeChangeNodeId?: string | null;
  threadAnchors?: ThreadAnchor[];
  awareness?: Awareness | null;
  onLocalSelectionChange?: (anchor: number, head: number) => void;
  className?: string;
};

export function ChronicleEditor({
  content,
  editable = true,
  onUpdate,
  onSelectionChange,
  onHoverBlockChange,
  onEditorReady,
  suggestionMode = false,
  diffManifest = null,
  diffVisible = false,
  diffMode = "unified",
  activeChangeNodeId = null,
  threadAnchors = [],
  awareness = null,
  onLocalSelectionChange,
  className = "",
}: Props) {
  const serializedContent = JSON.stringify(content);

  // Mutable ref for diff state so the ProseMirror plugin always reads latest values
  const diffStateRef = useRef<DiffState>({ manifest: diffManifest, visible: diffVisible, mode: diffMode, activeChangeNodeId });
  const threadAnchorsRef = useRef<ThreadAnchor[]>(threadAnchors);
  const awarenessRef = useRef<Awareness | null>(awareness);
  const onLocalSelectionChangeRef = useRef(onLocalSelectionChange);
  const suppressCursorRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: "Start typing to begin your document...",
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      Underline,
      Subscript,
      Superscript,
      Typography,
      CharacterCount,
      FontSize,
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      FindReplace,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      NodeId,
      ActiveBlockTracker.configure({
        onActiveBlockChange: (nodeId: string | null) => {
          onSelectionChange?.(nodeId);
        },
      }),
      ActiveBlockHighlight,
      HoverBlockTracker.configure({
        onHoverBlockChange: (nodeId: string | null) => {
          onHoverBlockChange?.(nodeId);
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
      CollaborationCursors.configure({
        getAwareness: () => awarenessRef.current,
        onSelectionChange: (anchor: number, head: number) => {
          onLocalSelectionChangeRef.current?.(anchor, head);
        },
        isSuppressed: () => suppressCursorRef.current,
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
    diffStateRef.current = { manifest: diffManifest, visible: diffVisible, mode: diffMode, activeChangeNodeId };
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta("diffUpdate", true));
    }
  }, [editor, diffManifest, diffVisible, diffMode, activeChangeNodeId]);

  // Update awareness ref
  useEffect(() => {
    awarenessRef.current = awareness;
    onLocalSelectionChangeRef.current = onLocalSelectionChange;
  }, [awareness, onLocalSelectionChange]);

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
      suppressCursorRef.current = true;

      // Incremental diff-and-replace instead of setContent.
      // setContent replaces the entire document in one step, which
      // destroys all ProseMirror position mapping — the cursor jumps
      // to position 0 or end-of-doc.  By computing the minimal changed
      // region and applying a single replace step, ProseMirror's step
      // maps automatically preserve the cursor in unchanged regions.
      const newDoc = editor.schema.nodeFromJSON(content);
      const start = editor.state.doc.content.findDiffStart(newDoc.content);

      if (start !== null) {
        const endResult = editor.state.doc.content.findDiffEnd(newDoc.content);
        if (endResult) {
          let { a: endA, b: endB } = endResult;
          // Handle overlapping diff boundaries
          const overlap = start - Math.min(endA, endB);
          if (overlap > 0) {
            endA += overlap;
            endB += overlap;
          }
          editor.view.dispatch(
            editor.state.tr
              .replace(start, endA, newDoc.slice(start, endB))
              .setMeta("addToHistory", false)
              .setMeta("preventUpdate", true),
          );
        }
      }

      suppressCursorRef.current = false;
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
      className={`chronicle-editor ${!editable ? "chronicle-editor--readonly" : ""} ${className}`.trim()}
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
