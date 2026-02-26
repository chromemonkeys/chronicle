import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { DiffManifest, NodeDiff } from "../diff";

const diffDecorationsKey = new PluginKey("diffDecorations");

export type DiffState = {
  manifest: DiffManifest | null;
  visible: boolean;
  mode: "split" | "unified";
};

export const DiffDecorations = Extension.create({
  name: "diffDecorations",

  addOptions() {
    return {
      getDiffState: (() => ({ manifest: null, visible: false, mode: "unified" })) as () => DiffState,
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: diffDecorationsKey,
        props: {
          decorations(state) {
            const diffState: DiffState = extension.options.getDiffState();
            const manifest = diffState.manifest;
            if (!manifest || !diffState.visible) {
              return DecorationSet.empty;
            }
            const mode = diffState.mode ?? "unified";

            const decorations: Decoration[] = [];
            const nodeDiffMap = new Map<string, NodeDiff>();
            for (const nd of manifest.nodes) {
              nodeDiffMap.set(nd.nodeId, nd);
            }

            state.doc.descendants((node, pos) => {
              const nodeId = node.attrs.nodeId as string | undefined;
              if (!nodeId) return;

              if (manifest.addedIds.has(nodeId)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "diff-added",
                  })
                );
              } else if (manifest.removedIds.has(nodeId)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "diff-removed",
                  })
                );
              } else if (manifest.changedIds.has(nodeId)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: mode === "split" ? "diff-changed diff-split-node" : "diff-changed",
                  })
                );

                const nodeDiff = nodeDiffMap.get(nodeId);
                if (mode === "unified") {
                  // Apply inline word-level decorations within changed nodes.
                  if (nodeDiff?.inlineChanges && node.isTextblock) {
                    const textContent = node.textContent;
                    const changes = nodeDiff.inlineChanges;
                    let searchOffset = 0;
                    for (const change of changes) {
                      if (change.type === "insert") {
                        const idx = textContent.indexOf(change.text, searchOffset);
                        if (idx >= 0) {
                          const from = pos + 1 + idx;
                          const to = from + change.text.length;
                          decorations.push(
                            Decoration.inline(from, to, { class: "cm-diff-ins" })
                          );
                          searchOffset = idx + change.text.length;
                        }
                      }
                    }
                  }
                } else if (mode === "split" && nodeDiff && node.isTextblock) {
                  decorations.push(
                    Decoration.widget(pos + node.nodeSize, () => {
                      const panel = document.createElement("div");
                      panel.className = "cm-diff-split-panel";
                      const beforeCol = document.createElement("div");
                      beforeCol.className = "cm-diff-split-col before";
                      const beforeLabel = document.createElement("div");
                      beforeLabel.className = "cm-diff-split-label";
                      beforeLabel.textContent = "Before";
                      const beforeText = document.createElement("pre");
                      beforeText.className = "cm-diff-split-text";
                      beforeText.textContent = nodeDiff.beforeText ?? "";
                      beforeCol.append(beforeLabel, beforeText);

                      const afterCol = document.createElement("div");
                      afterCol.className = "cm-diff-split-col after";
                      const afterLabel = document.createElement("div");
                      afterLabel.className = "cm-diff-split-label";
                      afterLabel.textContent = "After";
                      const afterText = document.createElement("pre");
                      afterText.className = "cm-diff-split-text";
                      afterText.textContent = nodeDiff.afterText ?? "";
                      afterCol.append(afterLabel, afterText);

                      panel.append(beforeCol, afterCol);
                      return panel;
                    }, { side: 1 })
                  );
                }
              }
            });

            if (mode === "split") {
              const removed = manifest.nodes
                .filter((item) => item.status === "removed" && (item.beforeText ?? "").trim() !== "")
                .map((item) => item.beforeText ?? "");
              if (removed.length > 0) {
                decorations.push(
                  Decoration.widget(state.doc.content.size, () => {
                    const panel = document.createElement("div");
                    panel.className = "cm-diff-split-removed";
                    const heading = document.createElement("div");
                    heading.className = "cm-diff-split-label";
                    heading.textContent = "Removed blocks";
                    panel.appendChild(heading);
                    for (const text of removed.slice(0, 6)) {
                      const row = document.createElement("pre");
                      row.className = "cm-diff-split-text";
                      row.textContent = text;
                      panel.appendChild(row);
                    }
                    return panel;
                  }, { side: 1 })
                );
              }
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
