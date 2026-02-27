import { forwardRef, useEffect, useState } from "react";
import type { WorkspaceThread } from "../api/types";

const toneColors: Record<WorkspaceThread["tone"], string> = {
  green: "#4a7c5a",
  red: "#7c4a4a",
  blue: "#4a5c7c",
  purple: "#6b3fa0",
  amber: "#8a6a2a",
};

type Props = {
  thread: WorkspaceThread;
  isActive: boolean;
  onSelect: (id: string) => void;
  onReply?: (id: string, body: string) => void;
  onResolve?: (
    id: string,
    resolution: {
      outcome: "ACCEPTED" | "REJECTED" | "DEFERRED";
      rationale?: string;
    }
  ) => void;
  onReopen?: (id: string) => void;
  onVote?: (id: string, direction: "up" | "down") => void;
  onReact?: (id: string, emoji: string) => void;
  onToggleVisibility?: (id: string) => void;
  className?: string;
};

export const ThreadCard = forwardRef<HTMLDivElement, Props>(function ThreadCard(
  { thread, isActive, onSelect, onReply, onResolve, onReopen, onVote, onReact, onToggleVisibility, className = "" },
  ref
) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveOutcome, setResolveOutcome] = useState<"ACCEPTED" | "REJECTED" | "DEFERRED">("ACCEPTED");
  const [resolveRationale, setResolveRationale] = useState("");
  // Progressive disclosure: expand when active or when there are replies/reactions
  const [isExpanded, setIsExpanded] = useState(() => {
    const hasReplies = thread.replies.length > 0;
    const hasReactions = (thread.reactions?.length ?? 0) > 0;
    return hasReplies || hasReactions;
  });
  const reactionItems = thread.reactions ?? [];
  const visibilityLabel = thread.visibility === "EXTERNAL" ? "External" : "Internal";
  const hasSecondaryContent = reactionItems.length > 0 || thread.replies.length > 0;

  // Auto-expand when thread becomes active
  useEffect(() => {
    if (isActive && hasSecondaryContent) {
      setIsExpanded(true);
    }
  }, [isActive, hasSecondaryContent]);

  return (
    <div
      ref={ref}
      className={`cm-thread-card ${isActive ? "active" : ""} ${className}`.trim()}
      onClick={() => onSelect(thread.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(thread.id);
        }
      }}
    >
      <div className="cm-thread-header">
        <div className="cm-thread-av" style={{ background: toneColors[thread.tone], color: "white" }}>
          {thread.initials}
        </div>
        <div className="cm-thread-meta">
          <div className="cm-thread-author">
            {thread.author}
            <span className="cm-thread-time">{thread.time}</span>
          </div>
          <div className="cm-thread-meta-row">
            {thread.type ? <span className="cm-thread-type">{thread.type}</span> : null}
            <button
              className="cm-thread-visibility"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleVisibility?.(thread.id);
              }}
            >
              {visibilityLabel}
            </button>
          </div>
          <div className="cm-thread-anchor">¶ {thread.anchor}</div>
          {thread.quote ? <div className="cm-thread-quote">{thread.quote}</div> : null}
          <p className="cm-thread-text">{thread.text}</p>
          {!isExpanded && hasSecondaryContent && (
            <div className="cm-thread-collapsed-hint">
              {thread.replies.length > 0 && (
                <span>{thread.replies.length} repl{thread.replies.length === 1 ? "y" : "ies"}</span>
              )}
              {thread.replies.length > 0 && reactionItems.length > 0 && <span> · </span>}
              {reactionItems.length > 0 && (
                <span>{reactionItems.length} reaction{reactionItems.length === 1 ? "" : "s"}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {thread.resolvedNote ? (
        <div className="cm-thread-resolved">
          ✓ {thread.resolvedOutcome ? `${thread.resolvedOutcome} · ` : ""}{thread.resolvedNote}
          <button
            className="cm-thread-action-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReopen?.(thread.id);
            }}
          >
            Reopen
          </button>
        </div>
      ) : (
        <div className="cm-thread-actions">
          <button
            className="cm-thread-action-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setResolveOpen(false);
              setReplyOpen((value) => !value);
            }}
          >
            ↩ Reply
          </button>
          <button
            className="cm-thread-action-btn resolve"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setReplyOpen(false);
              setResolveOpen((value) => !value);
            }}
          >
            ✓ Resolve
          </button>
          <span className="cm-vote-bar">
            <button
              className={`cm-vote-btn up ${thread.voted ? "voted" : ""}`.trim()}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onVote?.(thread.id, "up");
              }}
            >
              ▲
            </button>
            <span className="cm-vote-count">{thread.votes}</span>
            <button
              className="cm-vote-btn down"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onVote?.(thread.id, "down");
              }}
            >
              ▼
            </button>
          </span>
          {hasSecondaryContent && (
            <button
              className="cm-thread-expand-btn"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded((v) => !v);
              }}
              title={isExpanded ? "Show less" : "Show more"}
            >
              {isExpanded ? "−" : "+"}
              {!isExpanded && thread.replies.length > 0 && (
                <span className="cm-expand-count">{thread.replies.length}</span>
              )}
            </button>
          )}
        </div>
      )}
      {!thread.resolvedNote && replyOpen && (
        <div className="cm-thread-inline-form">
          <textarea
            className="cm-thread-inline-textarea"
            rows={2}
            value={replyBody}
            placeholder="Reply in thread..."
            onChange={(event) => setReplyBody(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="cm-thread-inline-actions">
            <button
              className="cm-thread-action-btn"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setReplyOpen(false);
                setReplyBody("");
              }}
            >
              Cancel
            </button>
            <button
              className="cm-thread-action-btn resolve"
              type="button"
              disabled={!replyBody.trim()}
              onClick={(event) => {
                event.stopPropagation();
                if (!replyBody.trim()) return;
                onReply?.(thread.id, replyBody.trim());
                setReplyOpen(false);
                setReplyBody("");
              }}
            >
              Send Reply
            </button>
          </div>
        </div>
      )}
      {!thread.resolvedNote && resolveOpen && (
        <div className="cm-thread-inline-form">
          <label className="cm-compose-select-wrap">
            <span>Outcome</span>
            <select
              className="cm-compose-select"
              value={resolveOutcome}
              onChange={(event) => setResolveOutcome(event.target.value as typeof resolveOutcome)}
              onClick={(event) => event.stopPropagation()}
            >
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
              <option value="DEFERRED">Deferred</option>
            </select>
          </label>
          <textarea
            className="cm-thread-inline-textarea"
            rows={2}
            value={resolveRationale}
            placeholder={resolveOutcome === "REJECTED" ? "Rationale is required for rejected outcomes" : "Optional rationale"}
            onChange={(event) => setResolveRationale(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="cm-thread-inline-actions">
            <button
              className="cm-thread-action-btn"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setResolveOpen(false);
                setResolveOutcome("ACCEPTED");
                setResolveRationale("");
              }}
            >
              Cancel
            </button>
            <button
              className="cm-thread-action-btn resolve"
              type="button"
              disabled={resolveOutcome === "REJECTED" && !resolveRationale.trim()}
              onClick={(event) => {
                event.stopPropagation();
                if (resolveOutcome === "REJECTED" && !resolveRationale.trim()) {
                  return;
                }
                onResolve?.(thread.id, {
                  outcome: resolveOutcome,
                  rationale: resolveRationale.trim() || undefined,
                });
                setResolveOpen(false);
                setResolveOutcome("ACCEPTED");
                setResolveRationale("");
              }}
            >
              Confirm Resolve
            </button>
          </div>
        </div>
      )}
      {isExpanded && (
        <div className="cm-thread-reactions">
          <button
            className="cm-thread-reaction-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReact?.(thread.id, "👍");
            }}
          >
            👍
          </button>
          <button
            className="cm-thread-reaction-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReact?.(thread.id, "🎯");
            }}
          >
            🎯
          </button>
          {reactionItems.map((reaction) => (
            <span key={`${thread.id}-${reaction.emoji}`} className="cm-thread-reaction-pill">
              {reaction.emoji} {reaction.count}
            </span>
          ))}
        </div>
      )}
      {isExpanded && thread.replies.length > 0 && (
        <div className="cm-thread-reply">
          {thread.replies.map((reply, index) => (
            <div className="cm-reply-item" key={`${thread.id}-reply-${index}`}>
              <div className="cm-thread-av" style={{ background: toneColors[reply.tone], color: "white" }}>
                {reply.initials}
              </div>
              <div>
                <div className="cm-reply-author">
                  {reply.author} <span className="cm-reply-time">{reply.time}</span>
                </div>
                <div className="cm-reply-text">{reply.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
