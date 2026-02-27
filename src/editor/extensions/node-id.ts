import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
]);

const nodeIdPluginKey = new PluginKey("nodeId");

export const NodeId = Extension.create({
  name: "nodeId",

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          nodeId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-node-id"),
            renderHTML: (attributes) => {
              if (!attributes.nodeId) return {};
              return { "data-node-id": attributes.nodeId };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: nodeIdPluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          const { tr } = newState;
          let modified = false;
          const seenNodeIds = new Set<string>();

          newState.doc.descendants((node, pos) => {
            if (!BLOCK_TYPES.has(node.type.name)) {
              return;
            }

            const existingNodeId = typeof node.attrs.nodeId === "string" ? node.attrs.nodeId : "";
            const needsNewNodeId = !existingNodeId || seenNodeIds.has(existingNodeId);

            if (needsNewNodeId) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                nodeId: crypto.randomUUID(),
              });
              modified = true;
              return;
            }

            seenNodeIds.add(existingNodeId);
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
