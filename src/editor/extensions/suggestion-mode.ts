/**
 * Suggestion mode: tracked changes for proposal editing.
 * In proposal mode, wraps insertions in `suggestion-insert` mark
 * and deletions in `suggestion-delete` mark instead of actually deleting.
 */
import { Extension, Mark } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";

const suggestionModeKey = new PluginKey("suggestionMode");

export const SuggestionInsert = Mark.create({
  name: "suggestionInsert",

  parseHTML() {
    return [{ tag: "span.suggestion-insert" }];
  },

  renderHTML() {
    return ["span", { class: "suggestion-insert" }, 0];
  },
});

export const SuggestionDelete = Mark.create({
  name: "suggestionDelete",

  parseHTML() {
    return [{ tag: "span.suggestion-delete" }];
  },

  renderHTML() {
    return ["span", { class: "suggestion-delete" }, 0];
  },
});

export const SuggestionMode = Extension.create({
  name: "suggestionMode",

  addOptions() {
    return {
      enabled: false,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: suggestionModeKey,
        props: {
          handleTextInput(view, from, to, text) {
            if (!extension.options.enabled) return false;

            const { state } = view;
            const insertMark = state.schema.marks.suggestionInsert;
            if (!insertMark) return false;

            const tr = state.tr;

            // If there's a selection, mark the selected text as deleted
            if (from !== to) {
              const deleteMark = state.schema.marks.suggestionDelete;
              if (deleteMark) {
                tr.addMark(from, to, deleteMark.create());
              }
              // Insert new text after the "deleted" range with insert mark
              tr.insertText(text, to);
              tr.addMark(to, to + text.length, insertMark.create());
            } else {
              // Simple insertion with mark
              tr.insertText(text, from);
              tr.addMark(from, from + text.length, insertMark.create());
            }

            view.dispatch(tr);
            return true;
          },

          handleKeyDown(view, event) {
            if (!extension.options.enabled) return false;
            if (event.key !== "Backspace" && event.key !== "Delete") return false;

            const { state } = view;
            const deleteMark = state.schema.marks.suggestionDelete;
            if (!deleteMark) return false;

            const { from, to } = state.selection;

            if (from === to) {
              // Cursor position - mark the character before/after as deleted
              const deleteFrom = event.key === "Backspace" ? from - 1 : from;
              const deleteTo = event.key === "Backspace" ? from : from + 1;

              if (deleteFrom < 0 || deleteTo > state.doc.content.size) return false;

              const tr = state.tr.addMark(deleteFrom, deleteTo, deleteMark.create());
              // Move cursor past the "deleted" mark
              tr.setSelection(TextSelection.near(tr.doc.resolve(deleteTo)));
              view.dispatch(tr);
              return true;
            }

            // Selection - mark entire range as deleted
            const tr = state.tr.addMark(from, to, deleteMark.create());
            view.dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * Accept all suggestions in a range: remove insert marks (keep text),
 * remove delete-marked content.
 */
export function acceptSuggestions(
  editor: { state: { schema: { marks: Record<string, unknown> }; doc: { nodesBetween: (from: number, to: number, cb: (node: Node, pos: number) => void) => void }; tr: import("@tiptap/pm/state").Transaction }; selection: { from: number; to: number } },
  from: number,
  to: number
) {
  const { state } = editor;
  const insertType = state.schema.marks.suggestionInsert as import("@tiptap/pm/model").MarkType;
  const deleteType = state.schema.marks.suggestionDelete as import("@tiptap/pm/model").MarkType;
  if (!insertType || !deleteType) return null;

  const tr = state.tr;

  // Remove suggestion-insert marks (keep the text)
  tr.removeMark(from, to, insertType);

  // Remove suggestion-delete marked content
  state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
    if (node.isText && deleteType.isInSet(node.marks)) {
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      tr.delete(tr.mapping.map(start), tr.mapping.map(end));
    }
  });

  return tr;
}

/**
 * Reject all suggestions in a range: remove insert-marked content,
 * remove delete marks (restore text).
 */
export function rejectSuggestions(
  editor: { state: { schema: { marks: Record<string, unknown> }; doc: { nodesBetween: (from: number, to: number, cb: (node: Node, pos: number) => void) => void }; tr: import("@tiptap/pm/state").Transaction }; selection: { from: number; to: number } },
  from: number,
  to: number
) {
  const { state } = editor;
  const insertType = state.schema.marks.suggestionInsert as import("@tiptap/pm/model").MarkType;
  const deleteType = state.schema.marks.suggestionDelete as import("@tiptap/pm/model").MarkType;
  if (!insertType || !deleteType) return null;

  const tr = state.tr;

  // Remove suggestion-insert marked content
  state.doc.nodesBetween(from, to, (node: Node, pos: number) => {
    if (node.isText && insertType.isInSet(node.marks)) {
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      tr.delete(tr.mapping.map(start), tr.mapping.map(end));
    }
  });

  // Remove suggestion-delete marks (keep the text)
  tr.removeMark(tr.mapping.map(from), tr.mapping.map(to), deleteType);

  return tr;
}
