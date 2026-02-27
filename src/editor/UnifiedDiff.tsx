/**
 * Unified (inline) diff view.
 * Shows changes in a single column with inline insert/delete/modify marks.
 */
import { useEffect, useRef, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { DocumentContent } from "./schema";
import { NodeId } from "./extensions/node-id";
import { DiffDecorations } from "./extensions/diff-decorations";
import { diffDocs } from "./diff";

interface UnifiedDiffProps {
  beforeDoc: DocumentContent;
  afterDoc: DocumentContent;
  fromLabel?: string;
  toLabel?: string;
  fromHash?: string;
  toHash?: string;
  scrollToNodeId?: string | null;
  activeChangeNodeId?: string | null;
}

export function UnifiedDiff({
  beforeDoc,
  afterDoc,
  fromLabel = "Before",
  toLabel = "After",
  fromHash,
  toHash,
  scrollToNodeId = null,
  activeChangeNodeId = null,
}: UnifiedDiffProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compute diff manifest for highlighting
  const diffManifest = useMemo(() => diffDocs(beforeDoc, afterDoc), [beforeDoc, afterDoc]);
  const isSameDoc = JSON.stringify(beforeDoc) === JSON.stringify(afterDoc);

  // Stats for display
  const stats = useMemo(() => ({
    added: diffManifest.addedIds.size,
    removed: diffManifest.removedIds.size,
    changed: diffManifest.changedIds.size,
  }), [diffManifest]);

  // Mutable refs so ProseMirror plugin closures always read latest values
  const diffManifestRef = useRef(diffManifest);
  diffManifestRef.current = diffManifest;
  const activeNodeIdRef = useRef(activeChangeNodeId);
  activeNodeIdRef.current = activeChangeNodeId;

  // Create unified editor showing the "after" state with diff decorations
  const editor = useEditor({
    extensions: [
      StarterKit,
      NodeId,
      DiffDecorations.configure({
        getDiffState: () => ({
          manifest: diffManifestRef.current,
          visible: true,
          mode: "unified",
          activeChangeNodeId: activeNodeIdRef.current,
        }),
      }),
    ],
    content: afterDoc,
    editable: false,
  });

  // Force decoration recalculation when activeChangeNodeId changes
  useEffect(() => {
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta("diffUpdate", true));
    }
  }, [editor, activeChangeNodeId]);

  // Scroll to node when scrollToNodeId changes
  useEffect(() => {
    if (!scrollToNodeId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-node-id="${CSS.escape(scrollToNodeId)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollToNodeId]);

  // If viewing same doc on both sides, show simplified single-pane view
  if (isSameDoc) {
    return (
      <div className="cm-unified-diff">
        <div className="cm-diff-toolbar">
          <div className="cm-diff-toolbar-left">
            <span className="cm-diff-title">Viewing Version</span>
            <span className="cm-diff-meta">{fromHash?.slice(0, 7) || toHash?.slice(0, 7)}</span>
          </div>
        </div>

        <div className="cm-diff-panel cm-diff-panel--single">
          <div className="cm-diff-panel-header">
            <span className="cm-diff-panel-label">Document Version</span>
            {(fromHash || toHash) && (
              <span className="cm-diff-panel-hash">
                {(fromHash || toHash)?.slice(0, 7)}
              </span>
            )}
          </div>
          <div className="cm-diff-panel-content" ref={scrollRef}>
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-unified-diff">
      <div className="cm-diff-toolbar">
        <div className="cm-diff-toolbar-left">
          <span className="cm-diff-title">Compare Changes</span>
          <span className="cm-diff-meta">
            <span className="cm-diff-stat cm-diff-stat--added">+{stats.added} additions</span>
            <span className="cm-diff-stat cm-diff-stat--removed">−{stats.removed} deletions</span>
            <span className="cm-diff-stat cm-diff-stat--changed">~{stats.changed} changes</span>
          </span>
        </div>
        <div className="cm-diff-toolbar-right">
          <span className="cm-diff-mode-label">Unified view</span>
        </div>
      </div>

      <div className="cm-diff-panel cm-diff-panel--unified">
        <div className="cm-diff-panel-header">
          <span className="cm-diff-panel-label">{fromLabel}</span>
          {fromHash && <span className="cm-diff-panel-hash">{fromHash.slice(0, 7)}</span>}
          <span className="cm-diff-arrow">→</span>
          <span className="cm-diff-panel-label cm-diff-panel-label--after">{toLabel}</span>
          {toHash && <span className="cm-diff-panel-hash">{toHash.slice(0, 7)}</span>}
        </div>
        <div className="cm-diff-panel-content" ref={scrollRef}>
          {editor && <EditorContent editor={editor} />}
        </div>
      </div>

      {/* Legend */}
      <div className="cm-diff-summary">
        <div className="cm-diff-legend">
          <span className="cm-diff-legend-item cm-diff-legend--added">
            <span className="cm-diff-legend-marker" /> Added
          </span>
          <span className="cm-diff-legend-item cm-diff-legend--removed">
            <span className="cm-diff-legend-marker" /> Removed
          </span>
          <span className="cm-diff-legend-item cm-diff-legend--changed">
            <span className="cm-diff-legend-marker" /> Changed
          </span>
        </div>
      </div>
    </div>
  );
}
