import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const activeBlockHighlightKey = new PluginKey("activeBlockHighlight");

export const ActiveBlockHighlight = Extension.create({
  name: "activeBlockHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: activeBlockHighlightKey,
        props: {
          decorations(state) {
            const { selection } = state;
            const $pos = selection.$anchor;
            for (let depth = $pos.depth; depth > 0; depth--) {
              const node = $pos.node(depth);
              const nodeId = node.attrs?.nodeId as string | undefined;
              if (!nodeId) {
                continue;
              }
              const from = $pos.start(depth) - 1;
              const to = from + node.nodeSize;
              return DecorationSet.create(state.doc, [
                Decoration.node(from, to, { class: "block-active" }),
              ]);
            }
            return DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
