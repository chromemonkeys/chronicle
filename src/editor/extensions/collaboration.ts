/**
 * TipTap extension wrapping y-prosemirror's ySyncPlugin.
 * Syncs editor content with a Yjs Y.Doc XmlFragment.
 */
import { Extension } from "@tiptap/core";
import { ySyncPlugin } from "y-prosemirror";
import type * as Y from "yjs";

export interface CollaborationOptions {
  document: Y.Doc;
  field: string;
}

export const Collaboration = Extension.create<CollaborationOptions>({
  name: "collaboration",

  addOptions() {
    return {
      document: null as unknown as Y.Doc,
      field: "prosemirror",
    };
  },

  addProseMirrorPlugins() {
    const fragment = this.options.document.getXmlFragment(this.options.field);
    return [ySyncPlugin(fragment)];
  },
});
