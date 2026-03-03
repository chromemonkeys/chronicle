import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface FindReplaceState {
  searchTerm: string;
  matchIndex: number;
  matchCount: number;
}

const findReplaceKey = new PluginKey<{ searchTerm: string; matchIndex: number }>("findReplace");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      setSearchTerm: (term: string) => ReturnType;
      nextMatch: () => ReturnType;
      prevMatch: () => ReturnType;
      replaceMatch: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

export function findMatches(doc: any, searchTerm: string): { from: number; to: number }[] {
  if (!searchTerm) return [];
  const results: { from: number; to: number }[] = [];
  const lower = searchTerm.toLowerCase();
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text!.toLowerCase();
    let idx = text.indexOf(lower);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + searchTerm.length });
      idx = text.indexOf(lower, idx + 1);
    }
  });
  return results;
}

export const FindReplace = Extension.create({
  name: "findReplace",

  addStorage() {
    return {
      searchTerm: "",
      matchIndex: 0,
      matchCount: 0,
    } as FindReplaceState;
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceKey, { searchTerm: term, matchIndex: 0 });
          }
          return true;
        },
      nextMatch:
        () =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state);
          if (!pluginState) return false;
          const matches = findMatches(state.doc, pluginState.searchTerm);
          if (matches.length === 0) return false;
          const next = (pluginState.matchIndex + 1) % matches.length;
          if (dispatch) {
            tr.setMeta(findReplaceKey, { ...pluginState, matchIndex: next });
          }
          return true;
        },
      prevMatch:
        () =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state);
          if (!pluginState) return false;
          const matches = findMatches(state.doc, pluginState.searchTerm);
          if (matches.length === 0) return false;
          const prev = (pluginState.matchIndex - 1 + matches.length) % matches.length;
          if (dispatch) {
            tr.setMeta(findReplaceKey, { ...pluginState, matchIndex: prev });
          }
          return true;
        },
      replaceMatch:
        (replacement: string) =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state);
          if (!pluginState) return false;
          const matches = findMatches(state.doc, pluginState.searchTerm);
          if (matches.length === 0) return false;
          const match = matches[pluginState.matchIndex];
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to);
            tr.setMeta(findReplaceKey, {
              searchTerm: pluginState.searchTerm,
              matchIndex: Math.min(pluginState.matchIndex, Math.max(0, matches.length - 2)),
            });
          }
          return true;
        },
      replaceAll:
        (replacement: string) =>
        ({ tr, state, dispatch }) => {
          const pluginState = findReplaceKey.getState(state);
          if (!pluginState) return false;
          const matches = findMatches(state.doc, pluginState.searchTerm);
          if (matches.length === 0) return false;
          if (dispatch) {
            // Replace from end to start to preserve positions
            for (let i = matches.length - 1; i >= 0; i--) {
              tr.insertText(replacement, matches[i].from, matches[i].to);
            }
            tr.setMeta(findReplaceKey, { searchTerm: pluginState.searchTerm, matchIndex: 0 });
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const ext = this;
    return [
      new Plugin({
        key: findReplaceKey,
        state: {
          init() {
            return { searchTerm: "", matchIndex: 0 };
          },
          apply(tr, value) {
            const meta = tr.getMeta(findReplaceKey);
            if (meta) return meta;
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = findReplaceKey.getState(state);
            if (!pluginState || !pluginState.searchTerm) {
              ext.storage.searchTerm = "";
              ext.storage.matchIndex = 0;
              ext.storage.matchCount = 0;
              return DecorationSet.empty;
            }

            const matches = findMatches(state.doc, pluginState.searchTerm);
            ext.storage.searchTerm = pluginState.searchTerm;
            ext.storage.matchIndex = pluginState.matchIndex;
            ext.storage.matchCount = matches.length;

            const decorations = matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === pluginState.matchIndex ? "cm-find-active" : "cm-find-match",
              }),
            );
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-f": () => {
        // The keyboard shortcut is handled by the React component
        // This just prevents default browser find
        return true;
      },
    };
  },
});
