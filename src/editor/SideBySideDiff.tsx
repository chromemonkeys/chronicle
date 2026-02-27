/**
 * Side-by-side diff view with synchronized scrolling.
 * Shows two documents side by side like GitHub or Microsoft Word compare.
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
}

export function SideBySideDiff({
  beforeDoc,
  afterDoc,
  beforeLabel = "Before",
  afterLabel = "After",
  beforeHash,
  afterHash,
}: SideBySideDiffProps) {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef<"left" | "right" | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Compute diff manifest for highlighting
  const diffManifest = diffDocs(beforeDoc, afterDoc);
  const isSameDoc = JSON.stringify(beforeDoc) === JSON.stringify(afterDoc);

  // Create before editor (read-only)
  const beforeEditor = useEditor({
    extensions: [
      StarterKit,
      NodeId,
      DiffDecorations.configure({
        getDiffState: () => ({
          manifest: diffManifest,
          visible: true,
          mode: "split",
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
          manifest: diffManifest,
          visible: true,
          mode: "split",
        }),
      }),
    ],
    content: afterDoc,
    editable: false,
  });

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
