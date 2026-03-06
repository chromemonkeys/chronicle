import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Awareness } from "y-protocols/awareness";

const collabCursorsKey = new PluginKey("collabCursors");

export const CollaborationCursors = Extension.create({
  name: "collaborationCursors",

  addOptions() {
    return {
      getAwareness: (() => null) as () => Awareness | null,
      onSelectionChange: ((_anchor: number, _head: number) => {}) as (
        anchor: number,
        head: number,
      ) => void,
      isSuppressed: (() => false) as () => boolean,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: collabCursorsKey,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, old) {
            if (tr.getMeta(collabCursorsKey) || tr.docChanged) {
              return buildDecorations(tr.doc, extension.options.getAwareness);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state) {
            return collabCursorsKey.getState(state) as DecorationSet;
          },
        },

        view(editorView) {
          // Track current awareness to re-subscribe when the instance changes
          // (e.g. provider created asynchronously after editor init)
          let currentAwareness: Awareness | null = null;
          let lastAnchor = -1;
          let lastHead = -1;

          const onChange = () => {
            editorView.dispatch(
              editorView.state.tr.setMeta(collabCursorsKey, true),
            );
          };

          const syncSubscription = () => {
            const next = extension.options.getAwareness() as Awareness | null;
            if (next === currentAwareness) return;
            currentAwareness?.off("change", onChange);
            currentAwareness = next;
            currentAwareness?.on("change", onChange);
          };

          syncSubscription();

          return {
            update(view) {
              // Re-subscribe if the awareness instance changed
              syncSubscription();

              // Only report selection changes from user interaction,
              // not from programmatic setContent (which shifts selection
              // as a side effect and makes the remote cursor "follow").
              if (extension.options.isSuppressed()) return;

              const { from, to } = view.state.selection;
              if (from !== lastAnchor || to !== lastHead) {
                lastAnchor = from;
                lastHead = to;
                extension.options.onSelectionChange(from, to);
              }
            },
            destroy() {
              currentAwareness?.off("change", onChange);
              currentAwareness = null;
            },
          };
        },
      }),
    ];
  },
});

function buildDecorations(
  doc: import("@tiptap/pm/model").Node,
  getAwareness: () => Awareness | null,
): DecorationSet {
  const awareness = getAwareness();
  if (!awareness) return DecorationSet.empty;

  const localClientId = awareness.doc.clientID;
  const maxPos = doc.content.size;
  const decorations: Decoration[] = [];

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === localClientId) return;

    const cursor = state.cursor;
    const user = state.user;
    if (!cursor || !user) return;

    const color: string = user.color ?? "#999";
    const name: string = user.name ?? "Anonymous";

    const anchor = clamp(cursor.anchor, 0, maxPos);
    const head = clamp(cursor.head, 0, maxPos);

    // Cursor line widget at head position
    decorations.push(
      Decoration.widget(head, () => {
        const cursorEl = document.createElement("span");
        cursorEl.className = "cm-collab-cursor";
        cursorEl.style.borderColor = color;

        const label = document.createElement("span");
        label.className = "cm-collab-cursor-label";
        label.style.backgroundColor = color;
        label.textContent = name;
        cursorEl.appendChild(label);

        return cursorEl;
      }, { side: 1, key: `cursor-${clientId}` }),
    );

    // Selection highlight when anchor !== head
    if (anchor !== head) {
      const from = Math.min(anchor, head);
      const to = Math.max(anchor, head);
      decorations.push(
        Decoration.inline(from, to, {
          style: `background-color: ${color}33`,
          class: "cm-collab-selection",
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
