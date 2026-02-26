import type { ApprovalDetail, ApprovalStage, MergeGate, MergeGateRole } from "../api/types";

const gateEntries: { key: MergeGateRole; label: string; role: string }[] = [
  { key: "security", label: "Security", role: "Security Review" },
  { key: "architectureCommittee", label: "Architecture Committee", role: "Required approver" },
  { key: "legal", label: "Legal", role: "Required approver" },
];

type Props = {
  gate: MergeGate;
  details?: Record<MergeGateRole, ApprovalDetail>;
  stages?: ApprovalStage[];
  approvingRole?: MergeGateRole | null;
  onApprove?: (role: MergeGateRole) => void;
  onMerge?: () => void;
  canMerge?: boolean;
  mergeLabel?: string;
  className?: string;
};

export function ApprovalChain({
  gate,
  details,
  stages,
  approvingRole = null,
  onApprove,
  onMerge,
  canMerge,
  mergeLabel,
  className = ""
}: Props) {
  const total = gateEntries.length;
  const approvedCount = gateEntries.filter((entry) => gate[entry.key] === "Approved").length;
  const pendingCount = total - approvedCount;
  const allApproved = pendingCount === 0;
  const mergeEnabled = canMerge ?? allApproved;
  const mergeText =
    mergeLabel ??
    (!allApproved
      ? `⊘ Awaiting ${pendingCount} approvals`
      : mergeEnabled
        ? "✓ Ready to merge"
        : "⊘ Resolve open threads");
  const roleToStage = new Map<MergeGateRole, ApprovalStage>();
  for (const stage of stages ?? []) {
    for (const role of stage.roles) {
      roleToStage.set(role, stage);
    }
  }

  function roleBlocked(role: MergeGateRole) {
    const stage = roleToStage.get(role);
    if (!stage?.dependsOn) {
      return false;
    }
    const dependencyStage = (stages ?? []).find((item) => item.id === stage.dependsOn);
    if (!dependencyStage) {
      return false;
    }
    return dependencyStage.roles.some((depRole) => gate[depRole] !== "Approved");
  }

  return (
    <div className={className}>
      {gateEntries.map((entry) => (
        <div className="cm-approver-row" key={entry.key}>
          <div className="cm-approver-status">{gate[entry.key] === "Approved" ? "✅" : "⏳"}</div>
          <div>
            <div className="cm-approver-name">{entry.label}</div>
            <div className="cm-approver-role">
              {entry.role}
              {roleBlocked(entry.key) ? " · waiting on prior stage" : ""}
            </div>
          </div>
          <div className="cm-approver-time">
            {gate[entry.key] === "Approved"
              ? `${details?.[entry.key]?.approvedBy ?? "approved"}`
              : roleBlocked(entry.key)
                ? "blocked"
                : "pending"}
          </div>
          {gate[entry.key] !== "Approved" && onApprove ? (
            <button
              className="cm-thread-action-btn"
              type="button"
              disabled={approvingRole === entry.key || roleBlocked(entry.key)}
              onClick={() => onApprove(entry.key)}
            >
              {roleBlocked(entry.key) ? "Blocked" : approvingRole === entry.key ? "Approving..." : "Approve"}
            </button>
          ) : null}
        </div>
      ))}
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
