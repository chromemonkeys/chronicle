import type { MutableRefObject } from "react";
import type { WorkspaceThread } from "../api/types";
import { ThreadCard } from "./ThreadCard";

type Props = {
  threads: WorkspaceThread[];
  activeThreadId: string;
  onSelectThread: (id: string) => void;
  onReplyThread?: (id: string) => void;
  onResolveThread?: (id: string) => void;
  onReopenThread?: (id: string) => void;
  onVoteThread?: (id: string, direction: "up" | "down") => void;
  onReactThread?: (id: string, emoji: string) => void;
  onToggleThreadVisibility?: (id: string) => void;
  threadRefs?: MutableRefObject<Record<string, HTMLDivElement | null>>;
  className?: string;
};

export function ThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onReplyThread,
  onResolveThread,
  onReopenThread,
  onVoteThread,
  onReactThread,
  onToggleThreadVisibility,
  threadRefs,
  className = "",
}: Props) {
  return (
    <div className={`cm-panel-scroll ${className}`.trim()}>
      {threads.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          isActive={activeThreadId === thread.id}
          onSelect={onSelectThread}
          onReply={onReplyThread}
          onResolve={onResolveThread}
          onReopen={onReopenThread}
          onVote={onVoteThread}
          onReact={onReactThread}
          onToggleVisibility={onToggleThreadVisibility}
          ref={threadRefs ? (element) => { threadRefs.current[thread.id] = element; } : undefined}
        />
      ))}
    </div>
  );
}
