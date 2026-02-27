import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type ThreadAnchor = {
  nodeId: string;
  threadCount: number;
  selected: boolean;
};

const threadMarkersKey = new PluginKey("threadMarkers");

export const ThreadMarkers = Extension.create({
  name: "threadMarkers",

  addOptions() {
    return {
      getAnchors: (() => []) as () => ThreadAnchor[],
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: threadMarkersKey,
        props: {
          decorations(state) {
            const anchors: ThreadAnchor[] = extension.options.getAnchors();
            if (anchors.length === 0) return DecorationSet.empty;

            const anchorMap = new Map(anchors.map((a) => [a.nodeId, a]));
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              const nodeId = node.attrs.nodeId as string | undefined;
              if (!nodeId) return;

              const anchor = anchorMap.get(nodeId);
              if (!anchor) return;

              const classes = ["has-thread"];
              if (anchor.selected) classes.push("selected");
              classes.push("thread-anchor");

              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: classes.join(" "),
                  "data-thread-count": String(anchor.threadCount),
                })
              );
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
