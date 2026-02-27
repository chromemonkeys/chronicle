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

const typeColors: Record<Change["type"], string> = {
  inserted: "var(--green)",
  deleted: "var(--red)",
  modified: "var(--yellow)",
  moved: "var(--blue)",
  format_only: "var(--ink-4)",
};

const typeBgColors: Record<Change["type"], string> = {
  inserted: "var(--green-soft)",
  deleted: "var(--red-soft)",
  modified: "var(--yellow-soft)",
  moved: "var(--blue-soft)",
  format_only: "var(--paper-3)",
};

const stateLabels: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  deferred: "Deferred",
};

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
  diffMode,
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
        <div className="cm-panel-fallback-card">
          <h3>No changes</h3>
          <p>Compare two commits to see individual changes listed here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-panel-content active">
      <div className="cm-panel-scroll cm-change-filters">
        <div className="cm-change-summary">
          {filtered.length === changes.length
            ? `${changes.length} change${changes.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${changes.length} changes`}
          {" · "}{diffMode} mode
        </div>
        <label className="cm-compose-select-wrap">
          <span>Type</span>
          <select
            className="cm-compose-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ChangeTypeFilter)}
          >
            <option value="">All types</option>
            <option value="inserted">Inserted</option>
            <option value="deleted">Deleted</option>
            <option value="modified">Modified</option>
            <option value="moved">Moved</option>
            <option value="format_only">Format only</option>
          </select>
        </label>
        <label className="cm-compose-select-wrap">
          <span>State</span>
          <select
            className="cm-compose-select"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as ChangeStateFilter)}
          >
            <option value="">All states</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="deferred">Deferred</option>
          </select>
        </label>
        <button
          className={`cm-tool-btn ${unresolvedOnly ? "active" : ""}`}
          type="button"
          onClick={() => setUnresolvedOnly((v) => !v)}
          title="Show only unresolved (pending) changes"
        >
          Unresolved only
        </button>
        <div className="cm-compare-nav-actions">
          <button className="cm-thread-action-btn" type="button" onClick={() => onStepChange(-1)}>
            Prev
          </button>
          <button className="cm-thread-action-btn" type="button" onClick={() => onStepChange(1)}>
            Next
          </button>
        </div>
      </div>
      <div className="cm-panel-scroll">
        {filtered.length === 0 ? (
          <p className="cm-commit-meta" style={{ padding: "12px 10px" }}>No changes match current filters.</p>
        ) : filtered.map((change) => {
          const isActive = change.id === activeChangeId;
          return (
            <div
              key={change.id}
              className={`cm-change-row ${isActive ? "cm-change-row--active" : ""}`}
              onClick={() => onChangeClick(change)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChangeClick(change);
                }
              }}
            >
              <div className="cm-change-row-top">
                <span
                  className="cm-change-type"
                  style={{ color: typeColors[change.type], background: typeBgColors[change.type] }}
                >
                  {change.type}
                </span>
                <span
                  className={`cm-change-state cm-change-state--${change.reviewState}`}
                >
                  {stateLabels[change.reviewState] ?? change.reviewState}
                </span>
                {change.threadIds.length > 0 && (
                  <span className="cm-change-threads" title={`${change.threadIds.length} thread${change.threadIds.length === 1 ? "" : "s"}`}>
                    <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
                      <path d="M3 4.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.7L5 15.2v-2.7H5a2 2 0 0 1-2-2v-6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    {change.threadIds.length}
                  </span>
                )}
              </div>
              <div className="cm-change-snippet">{change.snippet || "(empty)"}</div>
              <div className="cm-change-meta">
                {change.author.name} · {formatRelativeTime(change.editedAt)}
              </div>
              {change.reviewState === "pending" && (
                <div className="cm-change-actions">
                  <button
                    className="cm-thread-action-btn"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onReviewAction(change.id, "accepted"); }}
                  >
                    Accept
                  </button>
                  <button
                    className="cm-thread-action-btn"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onReviewAction(change.id, "rejected"); }}
                  >
                    Reject
                  </button>
                  <button
                    className="cm-thread-action-btn"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onReviewAction(change.id, "deferred"); }}
                  >
                    Defer
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { DiffNavigatorProps, Change as DiffChange };
