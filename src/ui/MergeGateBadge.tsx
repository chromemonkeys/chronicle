import type { MergeGate } from "../api/types";

const gateLabels: Record<keyof MergeGate, string> = {
  security: "Security",
  architectureCommittee: "Architecture Committee",
  legal: "Legal",
};

type Props = {
  gate: MergeGate;
  className?: string;
};

export function MergeGateBadge({ gate, className = "" }: Props) {
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
