import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";

type EditorContextValue = {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
  activeNodeId: string | null;
  setActiveNodeId: (id: string | null) => void;
  scrollToNode: (nodeId: string) => void;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const scrollToNode = useCallback(
    (nodeId: string) => {
      if (!editor) return;

      const { doc } = editor.state;
      let targetPos: number | null = null;

      doc.descendants((node, pos) => {
        if (node.attrs.nodeId === nodeId && targetPos === null) {
          targetPos = pos;
        }
      });

      if (targetPos !== null) {
        const domNode = editor.view.nodeDOM(targetPos);
        if (domNode instanceof HTMLElement) {
          domNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        // Move cursor into the node
        editor.commands.setTextSelection(targetPos + 1);
        setActiveNodeId(nodeId);
      }
    },
    [editor]
  );

  return (
    <EditorContext.Provider
      value={{ editor, setEditor, activeNodeId, setActiveNodeId, scrollToNode }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorContext() {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditorContext must be used within an EditorProvider");
  }
  return ctx;
}
