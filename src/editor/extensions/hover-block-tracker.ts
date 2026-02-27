import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const hoverBlockKey = new PluginKey("hoverBlockTracker");
const hoverHighlightKey = new PluginKey("hoverBlockHighlight");

export interface HoverBlockTrackerOptions {
  onHoverBlockChange?: (nodeId: string | null, event?: MouseEvent) => void;
  enabled?: boolean;
}

export const HoverBlockTracker = Extension.create<HoverBlockTrackerOptions>({
  name: "hoverBlockTracker",

  addOptions() {
    return {
      onHoverBlockChange: (_nodeId: string | null) => {},
      enabled: true,
    };
  },

  addProseMirrorPlugins() {
    const { onHoverBlockChange, enabled } = this.options;

    if (!enabled) {
      return [];
    }

    let lastHoveredNodeId: string | null = null;

    return [
      // Track hover state
      new Plugin({
        key: hoverBlockKey,
        view() {
          return {
            update() {},
          };
        },
      }),
      // Handle mouse events and highlight
      new Plugin({
        key: hoverHighlightKey,
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              const target = event.target as HTMLElement;
              if (!target) return false;

              // Find the closest block element with a nodeId
              let element: HTMLElement | null = target;
              while (element && element !== view.dom) {
                const nodeId = element.getAttribute("data-node-id");
                if (nodeId) {
                  if (nodeId !== lastHoveredNodeId) {
                    lastHoveredNodeId = nodeId;
                    onHoverBlockChange?.(nodeId, event as MouseEvent);
                    // Force decoration update
                    view.updateState(view.state);
                  }
                  return false;
                }
                element = element.parentElement;
              }

              // Not hovering over a block with nodeId
              if (lastHoveredNodeId !== null) {
                lastHoveredNodeId = null;
                onHoverBlockChange?.(null);
                view.updateState(view.state);
              }
              return false;
            },
            mouseleave: (view) => {
              if (lastHoveredNodeId !== null) {
                lastHoveredNodeId = null;
                onHoverBlockChange?.(null);
                view.updateState(view.state);
              }
              return false;
            },
          },
          decorations(state) {
            const pluginState = hoverHighlightKey.getState(state) as { hoveredNodeId?: string } | undefined;
            const hoveredNodeId = pluginState?.hoveredNodeId;
            
            if (!hoveredNodeId) {
              return DecorationSet.empty;
            }

            // Find the node with this nodeId
            let foundDecoration: Decoration | null = null;
            state.doc.descendants((node, pos) => {
              if (foundDecoration) return false;
              if (node.attrs?.nodeId === hoveredNodeId) {
                const from = pos;
                const to = pos + node.nodeSize;
                foundDecoration = Decoration.node(from, to, { 
                  class: "block-hover-attribution",
                });
                return false;
              }
            });

            return foundDecoration 
              ? DecorationSet.create(state.doc, [foundDecoration])
              : DecorationSet.empty;
          },
        },
        state: {
          init() {
            return { hoveredNodeId: null as string | null };
          },
          apply(tr, value) {
            const meta = tr.getMeta(hoverHighlightKey);
            if (meta?.hoveredNodeId !== undefined) {
              return { hoveredNodeId: meta.hoveredNodeId };
            }
            return value;
          },
        },
      }),
    ];
  },
});
