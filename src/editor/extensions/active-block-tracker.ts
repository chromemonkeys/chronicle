import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const activeBlockKey = new PluginKey("activeBlockTracker");

export const ActiveBlockTracker = Extension.create({
  name: "activeBlockTracker",

  addOptions() {
    return {
      onActiveBlockChange: (_nodeId: string | null) => {},
    };
  },

  addProseMirrorPlugins() {
    const { onActiveBlockChange } = this.options;

    return [
      new Plugin({
        key: activeBlockKey,
        view() {
          return {
            update(view) {
              const { state } = view;
              const { selection } = state;
              const $pos = selection.$anchor;

              // Walk up from cursor to find the nearest block node with a nodeId
              for (let depth = $pos.depth; depth > 0; depth--) {
                const node = $pos.node(depth);
                if (node.attrs.nodeId) {
                  onActiveBlockChange(node.attrs.nodeId as string);
                  return;
                }
              }

              onActiveBlockChange(null);
            },
          };
        },
      }),
    ];
  },
});
