/**
 * TipTap extension wrapping y-prosemirror's yCursorPlugin.
 * Renders remote user cursors and selections in the editor.
 */
import { Extension } from "@tiptap/core";
import { yCursorPlugin } from "y-prosemirror";
import type { Awareness } from "y-protocols/awareness";

export interface CollaborationCursorOptions {
  awareness: Awareness;
}

export const CollaborationCursor = Extension.create<CollaborationCursorOptions>({
  name: "collaborationCursor",

  addOptions() {
    return {
      awareness: null as unknown as Awareness,
    };
  },

  addProseMirrorPlugins() {
    return [yCursorPlugin(this.options.awareness)];
  },
});
