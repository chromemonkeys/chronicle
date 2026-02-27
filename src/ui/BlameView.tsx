import type { BlameEntry } from "../api/types";

export type BlameViewProps = {
  entries: BlameEntry[];
  nodeId?: string | null;
  onSelectCommit?: (commitHash: string) => void;
  onSelectThread?: (threadId: string) => void;
  loading?: boolean;
  error?: string | null;
};

function formatRelativeTime(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const diffMs = Date.now() - then;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));
  
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.round(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

function initialsFromName(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toneFromName(name: string): "green" | "red" | "blue" | "purple" | "amber" {
  if (name.includes("Sarah")) return "green";
  if (name.includes("Marcus")) return "red";
  if (name.includes("Jamie")) return "blue";
  if (name.includes("Priya")) return "purple";
  return "amber";
}

function toneClasses(tone: string): string {
  switch (tone) {
    case "green":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "red":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "blue":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "purple":
      return "bg-violet-100 text-violet-700 border-violet-200";
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
}

function threadStatusClasses(status: string): string {
  switch (status) {
    case "OPEN":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "RESOLVED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "ORPHANED":
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

// Virtual list constants (for future windowing implementation)
// const ITEM_HEIGHT = 80; // Approximate height per item
// const OVERSCAN = 5; // Number of items to render outside viewport

export function BlameView({ 
  entries, 
  nodeId, 
  onSelectCommit, 
  onSelectThread,
  loading, 
  error 
}: BlameViewProps) {

  if (loading) {
    return (
      <div className="p-4 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading blame data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-rose-600 bg-rose-50 rounded-lg">
        <div className="font-medium mb-1">Failed to load blame data</div>
        <div className="text-rose-500">{error}</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500 text-center">
        No blame data available for this document.
      </div>
    );
  }

  // Group entries by author for summary
  const authorCounts = entries.reduce((acc, entry) => {
    acc[entry.author] = (acc[entry.author] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const uniqueAuthors = Object.keys(authorCounts);
  
  // Count total threads
  const totalThreads = entries.reduce((acc, entry) => acc + (entry.threads?.length || 0), 0);
  const openThreads = entries.reduce(
    (acc, entry) => acc + (entry.threads?.filter(t => t.status === "OPEN").length || 0), 
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Summary header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Contributors ({uniqueAuthors.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {uniqueAuthors.map((author) => (
            <div
              key={author}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white border border-slate-200 text-xs"
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-medium border ${toneClasses(
                  toneFromName(author)
                )}`}
              >
                {initialsFromName(author)}
              </span>
              <span className="text-slate-700">{author}</span>
              <span className="text-slate-400">({authorCounts[author]})</span>
            </div>
          ))}
        </div>
        
        {/* Thread summary */}
        {totalThreads > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Discussion Threads
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {openThreads} open
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                {totalThreads - openThreads} resolved
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Blame entries list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide flex justify-between">
          <span>Block-level attribution</span>
          <span className="text-slate-400">{entries.length} blocks</span>
        </div>
        <div className="divide-y divide-slate-100">
          {entries.map((entry, index) => {
            const isActive = entry.nodeId === nodeId;
            const tone = toneFromName(entry.author);
            const hasThreads = entry.threads && entry.threads.length > 0;
            
            return (
              <div
                key={entry.nodeId}
                data-index={index}
                className={`w-full px-4 py-3 transition-colors ${
                  isActive ? "bg-sky-50" : "hover:bg-slate-50"
                }`}
              >
                <button
                  onClick={() => onSelectCommit?.(entry.commitHash)}
                  className="w-full text-left focus:outline-none"
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-medium border shrink-0 ${toneClasses(
                        tone
                      )}`}
                      title={entry.author}
                    >
                      {initialsFromName(entry.author)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {entry.author}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatRelativeTime(entry.editedAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {entry.commitMessage}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <code
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            isActive
                              ? "bg-sky-100 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                          title={entry.nodeId}
                        >
                          {entry.nodeId.slice(0, 8)}…
                        </code>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {entry.commitHash.slice(0, 7)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
                
                {/* Thread links */}
                {hasThreads && (
                  <div className="mt-2 ml-9 space-y-1">
                    {entry.threads!.map((thread) => (
                      <button
                        key={thread.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectThread?.(thread.id);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-white hover:shadow-sm transition-all"
                        type="button"
                      >
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${threadStatusClasses(thread.status)}`}>
                          {thread.status === "OPEN" ? "Open" : thread.status === "RESOLVED" ? "Resolved" : "Orphaned"}
                        </span>
                        <span className="text-slate-600 truncate flex-1">
                          {thread.author}
                          {thread.replyCount > 0 && (
                            <span className="text-slate-400 ml-1">({thread.replyCount} replies)</span>
                          )}
                        </span>
                        <span className="text-slate-400 text-[10px]">View →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Performance note for large documents */}
        {entries.length > 100 && (
          <div className="px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100">
            Showing {entries.length} blocks. Scroll to view all.
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        Hover over blocks to see attribution. Click commit to jump to history, thread to jump to discussion.
      </div>
    </div>
  );
}
