import type { ApprovalWorkflow, MergeGate } from "../api/types";

const gateLabels: Record<keyof MergeGate, string> = {
  security: "Security",
  architectureCommittee: "Architecture Committee",
  legal: "Legal",
};

type Props = {
  gate: MergeGate;
  workflow?: ApprovalWorkflow;
  className?: string;
};

export function MergeGateBadge({ gate, workflow, className = "" }: Props) {
  // V2: Dynamic workflow groups
  if (workflow && workflow.groups.length > 0) {
    const sorted = [...workflow.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    const approvedCount = sorted.filter((g) => g.status === "approved").length;
    const totalCount = sorted.length;
    const allApproved = workflow.allApproved;

    return (
      <div className={`cm-mgb ${className}`.trim()}>
        <div className="cm-mgb-summary">
          <span className={`cm-mgb-indicator ${allApproved ? "ready" : "pending"}`} />
          <span className="cm-mgb-count">
            {approvedCount}/{totalCount} groups
          </span>
        </div>
        <div className="cm-mgb-groups">
          {sorted.map((group) => (
            <div className="cm-mgb-group" key={group.groupId}>
              <span className={`cm-mgb-dot ${group.status}`} />
              <span className="cm-mgb-group-name">{group.groupName}</span>
              <span className="cm-mgb-group-progress">
                {group.approvalCount}/{group.minApprovals}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // V1 legacy fallback
  const entries = Object.keys(gateLabels) as (keyof MergeGate)[];
  const pendingCount = entries.filter((key) => gate[key] === "Pending").length;

  return (
    <ul className={`thread-list ${className}`.trim()}>
      {entries.map((key) => (
        <li key={key}>
          {gateLabels[key]}:{" "}
          <span className={`status-pill ${gate[key] === "Approved" ? "accepted" : "deferred"}`}>
            {gate[key]}
          </span>
        </li>
      ))}
      {pendingCount > 0 && (
        <li className="muted">Awaiting {pendingCount} approval{pendingCount > 1 ? "s" : ""}</li>
      )}
    </ul>
  );
}
