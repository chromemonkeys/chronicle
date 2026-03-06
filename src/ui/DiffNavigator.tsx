import { useMemo, useState } from "react";
import type { DocumentComparePayload } from "../api/types";

type Change = NonNullable<DocumentComparePayload["changes"]>[number];

type ChangeTypeFilter = "" | "inserted" | "deleted" | "modified" | "moved" | "format_only";
type ChangeStateFilter = "" | "pending" | "accepted" | "rejected" | "deferred";

interface DiffNavigatorProps {
  changes: Change[];
  activeChangeId: string;
  diffMode: "split" | "unified";
  onChangeClick: (change: Change) => void;
  onStepChange: (direction: 1 | -1) => void;
  onReviewAction: (changeId: string, action: "accepted" | "rejected" | "deferred") => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DiffNavigator({
  changes,
  activeChangeId,
  diffMode: _diffMode,
  onChangeClick,
  onStepChange,
  onReviewAction,
}: DiffNavigatorProps) {
  const [typeFilter, setTypeFilter] = useState<ChangeTypeFilter>("");
  const [stateFilter, setStateFilter] = useState<ChangeStateFilter>("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);

  const filtered = useMemo(() => {
    let result = changes;
    if (typeFilter) {
      result = result.filter((c) => c.type === typeFilter);
    }
    if (stateFilter) {
      result = result.filter((c) => c.reviewState === stateFilter);
    }
    if (unresolvedOnly) {
      result = result.filter((c) => c.reviewState === "pending");
    }
    return result;
  }, [changes, typeFilter, stateFilter, unresolvedOnly]);

  if (changes.length === 0) {
    return (
      <div className="cm-panel-scroll">
        <div className="cm-diffnav-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="9" y="2" width="6" height="4" rx="1" stroke="var(--ink-4)" strokeWidth="1.5"/>
          </svg>
          <p>No changes</p>
          <span>Compare two commits to see individual changes listed here.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-panel-content active">
      <div className="cm-panel-scroll cm-diffnav">
        {/* ── Header with count + nav ── */}
        <div className="cm-diffnav-head">
          <div className="cm-diffnav-count">
            <span className="cm-diffnav-num">{filtered.length}</span>
            {filtered.length !== changes.length && <span className="cm-diffnav-of">/ {changes.length}</span>}
            <span className="cm-diffnav-label">changes</span>
          </div>
          <div className="cm-diffnav-nav">
            <button className="cm-diffnav-step" type="button" onClick={() => onStepChange(-1)} aria-label="Previous change">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="cm-diffnav-step" type="button" onClick={() => onStepChange(1)} aria-label="Next change">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>

        {/* ── Compact filters ── */}
        <div className="cm-diffnav-filters">
          <select className="cm-diffnav-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ChangeTypeFilter)}>
            <option value="">All types</option>
            <option value="inserted">Inserted</option>
            <option value="deleted">Deleted</option>
            <option value="modified">Modified</option>
            <option value="moved">Moved</option>
            <option value="format_only">Format only</option>
          </select>
          <select className="cm-diffnav-select" value={stateFilter} onChange={(e) => setStateFilter(e.target.value as ChangeStateFilter)}>
            <option value="">All states</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="deferred">Deferred</option>
          </select>
          <label className="cm-diffnav-check">
            <input type="checkbox" checked={unresolvedOnly} onChange={(e) => setUnresolvedOnly(e.target.checked)} />
            Unresolved
          </label>
        </div>

        {/* ── Change list ── */}
        {filtered.length === 0 ? (
          <p className="cm-diffnav-none">No changes match filters.</p>
        ) : (
          <div className="cm-diffnav-list">
            {filtered.map((change) => {
              const isActive = change.id === activeChangeId;
              return (
                <button
                  key={change.id}
                  className={`cm-diffnav-item ${isActive ? "cm-diffnav-item--active" : ""}`}
                  type="button"
                  onClick={() => onChangeClick(change)}
                >
                  <div className="cm-diffnav-item-head">
                    <span className={`cm-diffnav-type cm-diffnav-ct--${change.type}`}>{change.type.replace("_", " ")}</span>
                    <span className={`cm-diffnav-state cm-diffnav-cs--${change.reviewState}`}>{change.reviewState}</span>
                  </div>
                  <div className="cm-diffnav-snippet">{change.snippet || "(empty)"}</div>
                  <div className="cm-diffnav-meta">
                    <span>{change.author.name}</span>
                    <span>{formatRelativeTime(change.editedAt)}</span>
                    {change.threadIds.length > 0 && (
                      <span className="cm-diffnav-threads">{change.threadIds.length} thread{change.threadIds.length > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {change.reviewState === "pending" && (
                    <div className="cm-diffnav-actions">
                      <button className="cm-diffnav-action cm-diffnav-action--accept" type="button" onClick={(e) => { e.stopPropagation(); onReviewAction(change.id, "accepted"); }}>Accept</button>
                      <button className="cm-diffnav-action cm-diffnav-action--reject" type="button" onClick={(e) => { e.stopPropagation(); onReviewAction(change.id, "rejected"); }}>Reject</button>
                      <button className="cm-diffnav-action" type="button" onClick={(e) => { e.stopPropagation(); onReviewAction(change.id, "deferred"); }}>Defer</button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export type { DiffNavigatorProps, Change as DiffChange };
