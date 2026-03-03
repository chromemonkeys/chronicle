/**
 * Side-by-side diff view with synchronized scrolling.
 * Shows two documents side by side like GitHub or Microsoft Word compare.
 * Supports an expanded fullscreen mode for a proper two-page reading experience.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { DocumentContent } from "./schema";
import { NodeId } from "./extensions/node-id";
import { DiffDecorations } from "./extensions/diff-decorations";
import { diffDocs } from "./diff";

interface SideBySideDiffProps {
  beforeDoc: DocumentContent;
  afterDoc: DocumentContent;
  beforeLabel?: string;
  afterLabel?: string;
  beforeHash?: string;
  afterHash?: string;
  scrollToNodeId?: string | null;
  activeChangeNodeId?: string | null;
  isExpanded?: boolean;
  onExpand?: () => void;
  onClose?: () => void;
}

export function SideBySideDiff({
  beforeDoc,
  afterDoc,
  beforeLabel = "Before",
  afterLabel = "After",
  beforeHash,
  afterHash,
  scrollToNodeId = null,
  activeChangeNodeId = null,
  isExpanded = false,
  onExpand,
  onClose,
}: SideBySideDiffProps) {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef<"left" | "right" | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Compute diff manifest for highlighting
  const diffManifest = diffDocs(beforeDoc, afterDoc);
  const isSameDoc = JSON.stringify(beforeDoc) === JSON.stringify(afterDoc);

  // Mutable refs so ProseMirror plugin closures always read latest values
  const diffManifestRef = useRef(diffManifest);
  diffManifestRef.current = diffManifest;
  const activeNodeIdRef = useRef(activeChangeNodeId);
  activeNodeIdRef.current = activeChangeNodeId;

  // Create before editor (read-only)
  const beforeEditor = useEditor({
    extensions: [
      StarterKit,
      NodeId,
      DiffDecorations.configure({
        getDiffState: () => ({
          manifest: diffManifestRef.current,
          visible: true,
          mode: "split",
          activeChangeNodeId: activeNodeIdRef.current,
        }),
      }),
    ],
    content: beforeDoc,
    editable: false,
  });

  // Create after editor (read-only)
  const afterEditor = useEditor({
    extensions: [
      StarterKit,
      NodeId,
      DiffDecorations.configure({
        getDiffState: () => ({
          manifest: diffManifestRef.current,
          visible: true,
          mode: "split",
          activeChangeNodeId: activeNodeIdRef.current,
        }),
      }),
    ],
    content: afterDoc,
    editable: false,
  });

  // Force decoration recalculation when activeChangeNodeId changes
  useEffect(() => {
    if (beforeEditor) {
      beforeEditor.view.dispatch(beforeEditor.state.tr.setMeta("diffUpdate", true));
    }
    if (afterEditor) {
      afterEditor.view.dispatch(afterEditor.state.tr.setMeta("diffUpdate", true));
    }
  }, [beforeEditor, afterEditor, activeChangeNodeId]);

  // Scroll to node when scrollToNodeId changes
  useEffect(() => {
    if (!scrollToNodeId) return;
    // Try to find the node in the after editor first, then before
    for (const editorRef of [rightScrollRef, leftScrollRef]) {
      const container = editorRef.current;
      if (!container) continue;
      const el = container.querySelector(`[data-node-id="${CSS.escape(scrollToNodeId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }, [scrollToNodeId]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!isExpanded || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, onClose]);

  // Synchronized scrolling handler
  const handleScroll = useCallback((source: "left" | "right") => {
    if (!syncEnabled) return;
    if (isScrollingRef.current && isScrollingRef.current !== source) return;

    isScrollingRef.current = source;

    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      isScrollingRef.current = null;
    }, 100);

    if (source === "left" && rightScrollRef.current && leftScrollRef.current) {
      const scrollPercent = leftScrollRef.current.scrollTop / (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
      rightScrollRef.current.scrollTop = scrollPercent * (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
    } else if (source === "right" && leftScrollRef.current && rightScrollRef.current) {
      const scrollPercent = rightScrollRef.current.scrollTop / (rightScrollRef.current.scrollHeight - rightScrollRef.current.clientHeight);
      leftScrollRef.current.scrollTop = scrollPercent * (leftScrollRef.current.scrollHeight - leftScrollRef.current.clientHeight);
    }
  }, [syncEnabled]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Sync scroll toggle button (shared between inline and fullscreen)
  const syncToggle = (
    <button
      className={`cm-diff-sync-toggle ${syncEnabled ? "active" : ""}`}
      onClick={() => setSyncEnabled(!syncEnabled)}
      title={syncEnabled ? "Disable synchronized scrolling" : "Enable synchronized scrolling"}
      type="button"
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d={syncEnabled
            ? "M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7 10l2 2 4-4"
            : "M10 3.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z"
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Sync scroll
    </button>
  );

  // Expand button for inline toolbar
  const expandBtn = onExpand ? (
    <button
      className="cm-diff-expand-btn"
      onClick={onExpand}
      title="Expand to full page"
      type="button"
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  ) : null;

  // If viewing same doc on both sides, show simplified single-pane view
  if (isSameDoc) {
    return (
      <div className="cm-side-by-side-diff">
        <div className="cm-diff-toolbar">
          <div className="cm-diff-toolbar-left">
            <span className="cm-diff-title">Viewing Version</span>
            <span className="cm-diff-meta">{beforeHash?.slice(0, 7) || afterHash?.slice(0, 7)}</span>
          </div>
        </div>

        <div className="cm-diff-panels cm-diff-panels--single">
          <div className="cm-diff-panel cm-diff-panel--viewing">
            <div className="cm-diff-panel-header">
              <span className="cm-diff-panel-label">Document Version</span>
              {(beforeHash || afterHash) && (
                <span className="cm-diff-panel-hash">
                  {(beforeHash || afterHash)?.slice(0, 7)}
                </span>
              )}
            </div>
            <div className="cm-diff-panel-content">
              {beforeEditor && <EditorContent editor={beforeEditor} />}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Fullscreen expanded view ──
  if (isExpanded) {
    return (
      <div className="cm-diff-fullscreen-overlay">
        <div className="cm-diff-fullscreen-toolbar">
          <div className="cm-diff-toolbar-left">
            <span className="cm-diff-title">Compare Changes</span>
            <span className="cm-diff-meta">
              {diffManifest.addedIds.size} additions, {diffManifest.removedIds.size} deletions, {diffManifest.changedIds.size} changes
            </span>
          </div>
          <div className="cm-diff-toolbar-right">
            {syncToggle}
            {onClose && (
              <button
                className="bg-close-btn"
                onClick={onClose}
                title="Close fullscreen (Esc)"
                type="button"
              >
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="cm-diff-fullscreen-panels">
          {/* Before panel */}
          <div className="cm-diff-fullscreen-panel cm-diff-fullscreen-panel--before">
            <div className="cm-diff-fullscreen-panel-header">
              <span className="cm-diff-panel-label cm-diff-panel-label--before">
                {beforeLabel}
              </span>
              {beforeHash && (
                <span className="cm-diff-panel-hash">{beforeHash.slice(0, 7)}</span>
              )}
            </div>
            <div
              className="cm-diff-fullscreen-panel-content"
              ref={leftScrollRef}
              onScroll={() => handleScroll("left")}
            >
              <div className="cm-diff-fullscreen-page">
                {beforeEditor && <EditorContent editor={beforeEditor} />}
              </div>
            </div>
          </div>

          {/* After panel */}
          <div className="cm-diff-fullscreen-panel">
            <div className="cm-diff-fullscreen-panel-header">
              <span className="cm-diff-panel-label cm-diff-panel-label--after">
                {afterLabel}
              </span>
              {afterHash && (
                <span className="cm-diff-panel-hash">{afterHash.slice(0, 7)}</span>
              )}
            </div>
            <div
              className="cm-diff-fullscreen-panel-content"
              ref={rightScrollRef}
              onScroll={() => handleScroll("right")}
            >
              <div className="cm-diff-fullscreen-page">
                {afterEditor && <EditorContent editor={afterEditor} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Inline view (default) ──
  return (
    <div className="cm-side-by-side-diff">
      <div className="cm-diff-toolbar">
        <div className="cm-diff-toolbar-left">
          <span className="cm-diff-title">Compare Changes</span>
          <span className="cm-diff-meta">
            {diffManifest.addedIds.size} additions, {diffManifest.removedIds.size} deletions, {diffManifest.changedIds.size} changes
          </span>
        </div>
        <div className="cm-diff-toolbar-right">
          {syncToggle}
          {expandBtn}
        </div>
      </div>

      <div className="cm-diff-panels">
        {/* Before panel */}
        <div className="cm-diff-panel cm-diff-panel--before">
          <div className="cm-diff-panel-header">
            <span className="cm-diff-panel-label cm-diff-panel-label--before">
              {beforeLabel}
            </span>
            {beforeHash && (
              <span className="cm-diff-panel-hash">{beforeHash.slice(0, 7)}</span>
            )}
          </div>
          <div
            className="cm-diff-panel-content"
            ref={leftScrollRef}
            onScroll={() => handleScroll("left")}
          >
            {beforeEditor && <EditorContent editor={beforeEditor} />}
          </div>
        </div>

        {/* Divider with change indicators */}
        <div className="cm-diff-divider">
          <div className="cm-diff-divider-line" />
          <div className="cm-diff-change-counts">
            {diffManifest.addedIds.size > 0 && (
              <span className="cm-diff-count cm-diff-count--added" title={`${diffManifest.addedIds.size} additions`}>
                +{diffManifest.addedIds.size}
              </span>
            )}
            {diffManifest.removedIds.size > 0 && (
              <span className="cm-diff-count cm-diff-count--removed" title={`${diffManifest.removedIds.size} deletions`}>
                −{diffManifest.removedIds.size}
              </span>
            )}
            {diffManifest.changedIds.size > 0 && (
              <span className="cm-diff-count cm-diff-count--changed" title={`${diffManifest.changedIds.size} changes`}>
                ~{diffManifest.changedIds.size}
              </span>
            )}
          </div>
        </div>

        {/* After panel */}
        <div className="cm-diff-panel cm-diff-panel--after">
          <div className="cm-diff-panel-header">
            <span className="cm-diff-panel-label cm-diff-panel-label--after">
              {afterLabel}
            </span>
            {afterHash && (
              <span className="cm-diff-panel-hash">{afterHash.slice(0, 7)}</span>
            )}
          </div>
          <div
            className="cm-diff-panel-content"
            ref={rightScrollRef}
            onScroll={() => handleScroll("right")}
          >
            {afterEditor && <EditorContent editor={afterEditor} />}
          </div>
        </div>
      </div>

      {/* Change summary */}
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
