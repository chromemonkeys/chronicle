import { forwardRef } from "react";
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
  onReply?: (id: string) => void;
  onResolve?: (id: string) => void;
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
  const reactionItems = thread.reactions ?? [];
  const visibilityLabel = thread.visibility === "EXTERNAL" ? "External" : "Internal";

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
              onReply?.(thread.id);
            }}
          >
            ↩ Reply
          </button>
          <button
            className="cm-thread-action-btn resolve"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onResolve?.(thread.id);
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
        </div>
      )}
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
      {thread.replies.length > 0 && (
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
