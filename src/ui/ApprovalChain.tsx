import type {
  ApprovalDetail,
  ApprovalGroupProgress,
  ApprovalStage,
  ApprovalWorkflow,
  MergeGate,
  MergeGateRole,
} from "../api/types";

// V1 gate entries removed — approval groups are now configured dynamically via V2 workflow.

type Props = {
  // V1 legacy props (backward compatible)
  gate: MergeGate;
  details?: Record<MergeGateRole, ApprovalDetail>;
  stages?: ApprovalStage[];
  approvingRole?: MergeGateRole | null;
  onApprove?: (role: MergeGateRole) => void;
  // V2 flexible workflow props
  workflow?: ApprovalWorkflow;
  approvingGroupId?: string | null;
  onApproveGroup?: (groupId: string) => void;
  onRejectGroup?: (groupId: string) => void;
  currentUserId?: string | null;
  // Shared props
  onMerge?: () => void;
  canMerge?: boolean;
  mergeLabel?: string;
  className?: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── V2 Dynamic Group Row ───────────────────────────────────────────────
function ApprovalGroupRow({
  group,
  isBlocked,
  isCurrentUserGroup,
  approvingGroupId,
  onApprove,
  onReject,
}: {
  group: ApprovalGroupProgress;
  isBlocked: boolean;
  isCurrentUserGroup: boolean;
  approvingGroupId?: string | null;
  onApprove?: (groupId: string) => void;
  onReject?: (groupId: string) => void;
}) {
  const isBusy = approvingGroupId === group.groupId;
  const approved = group.approvals.filter((a) => a.status === "approved");
  const rejected = group.approvals.filter((a) => a.status === "rejected");
  const staleApprovals = approved.filter((a) => a.isStale);
  const progress = `${group.approvalCount} / ${group.minApprovals}`;

  const statusIcon =
    group.status === "approved"
      ? "approved"
      : group.status === "rejected"
        ? "rejected"
        : isBlocked
          ? "blocked"
          : "pending";

  return (
    <div className={`cm-ag-row ${statusIcon}`}>
      {/* Group header */}
      <div className="cm-ag-header">
        <div className={`cm-ag-status-indicator ${statusIcon}`} aria-label={statusIcon}>
          {statusIcon === "approved" && (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <circle cx="8" cy="8" r="7" fill="var(--green)" opacity="0.12" />
              <path d="M5 8l2 2 4-4" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {statusIcon === "rejected" && (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <circle cx="8" cy="8" r="7" fill="var(--red)" opacity="0.12" />
              <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          {statusIcon === "blocked" && (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <circle cx="8" cy="8" r="7" fill="var(--ink-4)" opacity="0.12" />
              <rect x="5" y="7" width="6" height="2" rx="1" fill="var(--ink-4)" />
            </svg>
          )}
          {statusIcon === "pending" && (
            <svg viewBox="0 0 16 16" width="14" height="14">
              <circle cx="8" cy="8" r="7" fill="var(--yellow)" opacity="0.12" />
              <circle cx="8" cy="8" r="2" fill="var(--yellow)" />
            </svg>
          )}
        </div>

        <div className="cm-ag-header-text">
          <span className="cm-ag-name">{group.groupName}</span>
          {staleApprovals.length > 0 && (
            <span className="cm-ag-stale-badge" title="Content changed since approval — re-approval may be needed">
              stale
            </span>
          )}
        </div>

        <div className="cm-ag-progress">
          <span className="cm-ag-progress-text">{progress}</span>
          <div className="cm-ag-progress-bar">
            <div
              className={`cm-ag-progress-fill ${statusIcon}`}
              style={{
                width: `${Math.min(100, (group.approvalCount / group.minApprovals) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Member list */}
      <div className="cm-ag-members">
        {group.members.map((member) => {
          const approval = group.approvals.find(
            (a) => a.approvedBy === member.userId
          );
          const memberStatus = approval?.status ?? "pending";

          return (
            <div className={`cm-ag-member ${memberStatus}`} key={member.userId}>
              <span
                className={`cm-ag-member-avatar ${memberStatus}`}
                title={member.displayName}
              >
                {initials(member.displayName)}
              </span>
              <span className="cm-ag-member-name">{member.displayName}</span>
              <span className="cm-ag-member-status">
                {memberStatus === "approved" && (
                  <>
                    <svg viewBox="0 0 12 12" width="10" height="10">
                      <path d="M3 6l2 2 4-4" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {approval && <span className="cm-ag-member-time">{timeAgo(approval.createdAt)}</span>}
                    {approval?.isStale && <span className="cm-ag-stale-dot" title="Stale — content changed" />}
                  </>
                )}
                {memberStatus === "rejected" && (
                  <>
                    <svg viewBox="0 0 12 12" width="10" height="10">
                      <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    {approval && <span className="cm-ag-member-time">{timeAgo(approval.createdAt)}</span>}
                  </>
                )}
                {memberStatus === "pending" && !isBlocked && (
                  <span className="cm-ag-member-waiting">awaiting</span>
                )}
                {memberStatus === "pending" && isBlocked && (
                  <span className="cm-ag-member-waiting blocked">blocked</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action buttons for current user */}
      {isCurrentUserGroup && group.status !== "approved" && !isBlocked && (
        <div className="cm-ag-actions">
          {onApprove && (
            <button
              type="button"
              className="cm-ag-approve-btn"
              disabled={isBusy}
              onClick={() => onApprove(group.groupId)}
            >
              {isBusy ? "Submitting…" : "Approve"}
            </button>
          )}
          {onReject && (
            <button
              type="button"
              className="cm-ag-reject-btn"
              disabled={isBusy}
              onClick={() => onReject(group.groupId)}
            >
              Request changes
            </button>
          )}
        </div>
      )}

      {/* Rejection comments */}
      {rejected.length > 0 && (
        <div className="cm-ag-rejections">
          {rejected.map((r) => (
            <div className="cm-ag-rejection-note" key={r.id}>
              <svg viewBox="0 0 12 12" width="10" height="10">
                <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="cm-ag-rejection-author">{r.approvedByName}</span>
              {r.comment && <span className="cm-ag-rejection-text">{r.comment}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────
export function ApprovalChain({
  gate: _gate,
  details: _details,
  stages: _stages,
  approvingRole: _approvingRole = null,
  onApprove: _onApprove,
  workflow,
  approvingGroupId,
  onApproveGroup,
  onRejectGroup,
  currentUserId,
  onMerge,
  canMerge,
  mergeLabel,
  className = "",
}: Props) {
  // V2 workflow available — render dynamic groups
  if (workflow && workflow.groups.length > 0) {
    return (
      <V2ApprovalChain
        workflow={workflow}
        approvingGroupId={approvingGroupId}
        onApproveGroup={onApproveGroup}
        onRejectGroup={onRejectGroup}
        currentUserId={currentUserId}
        onMerge={onMerge}
        canMerge={canMerge}
        mergeLabel={mergeLabel}
        className={className}
      />
    );
  }

  // V1 legacy fallback — no approval groups configured
  const mergeEnabled = canMerge ?? false;
  const mergeText = mergeLabel ?? (mergeEnabled ? "Ready to merge" : "Resolve open threads");

  return (
    <div className={className}>
      <div className="cm-approval-fallback" style={{ padding: "12px" }}>
        <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--ink-3, #888)" }}>
          No approval groups configured.
        </p>
      </div>
      <button
        className={`cm-merge-btn ${mergeEnabled ? "" : "disabled"}`}
        type="button"
        disabled={!mergeEnabled}
        onClick={mergeEnabled ? onMerge : undefined}
        title={mergeEnabled ? "Merge proposal into main" : "Resolve merge-gate blockers to enable merge."}
      >
        {mergeText}
      </button>
    </div>
  );
}

// ─── V2 Dynamic Approval Chain ──────────────────────────────────────────
function V2ApprovalChain({
  workflow,
  approvingGroupId,
  onApproveGroup,
  onRejectGroup,
  currentUserId,
  onMerge,
  canMerge,
  mergeLabel,
  className = "",
}: {
  workflow: ApprovalWorkflow;
  approvingGroupId?: string | null;
  onApproveGroup?: (groupId: string) => void;
  onRejectGroup?: (groupId: string) => void;
  currentUserId?: string | null;
  onMerge?: () => void;
  canMerge?: boolean;
  mergeLabel?: string;
  className?: string;
}) {
  const sorted = [...workflow.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalGroups = sorted.length;
  const approvedGroups = sorted.filter((g) => g.status === "approved").length;
  const mergeEnabled = canMerge ?? workflow.allApproved;

  const mergeText =
    mergeLabel ??
    (workflow.allApproved
      ? mergeEnabled
        ? "Ready to merge"
        : "Resolve open threads"
      : `${approvedGroups} of ${totalGroups} groups approved`);

  function isGroupBlocked(_group: ApprovalGroupProgress, idx: number): boolean {
    if (workflow.mode === "parallel") return false;
    // In sequential mode, a group is blocked if any prior group isn't approved
    for (let i = 0; i < idx; i++) {
      if (sorted[i].status !== "approved") return true;
    }
    return false;
  }

  return (
    <div className={`cm-ag-chain ${className}`}>
      {/* Workflow mode indicator */}
      <div className="cm-ag-mode-bar">
        <span className="cm-ag-mode-icon">
          {workflow.mode === "sequential" ? (
            <svg viewBox="0 0 14 14" width="12" height="12">
              <path d="M2 4h3l2 3-2 3H2l2-3L2 4ZM7 4h3l2 3-2 3H7l2-3L7 4Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" width="12" height="12">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" />
            </svg>
          )}
        </span>
        <span className="cm-ag-mode-label">
          {workflow.mode === "sequential" ? "Sequential" : "Parallel"} approval
        </span>
        <span className="cm-ag-mode-count">
          {approvedGroups}/{totalGroups}
        </span>
      </div>

      {/* Group rows */}
      {sorted.map((group, idx) => (
        <ApprovalGroupRow
          key={group.groupId}
          group={group}
          isBlocked={isGroupBlocked(group, idx)}
          isCurrentUserGroup={
            workflow.currentUserGroups.includes(group.groupId) ||
            (!!currentUserId && group.members.some((m) => m.userId === currentUserId))
          }
          approvingGroupId={approvingGroupId}
          onApprove={onApproveGroup}
          onReject={onRejectGroup}
        />
      ))}

      {/* Merge button */}
      <button
        className={`cm-merge-btn ${mergeEnabled ? "" : "disabled"}`}
        type="button"
        disabled={!mergeEnabled}
        onClick={mergeEnabled ? onMerge : undefined}
        title={
          mergeEnabled
            ? "Merge proposal into main"
            : "Resolve merge-gate blockers to enable merge."
        }
      >
        {mergeText}
      </button>
    </div>
  );
}
