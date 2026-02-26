import type { WorkspaceDecisionItem } from "../api/types";

type Props = {
  items: WorkspaceDecisionItem[];
  note?: string;
  className?: string;
};

const toneClassMap: Record<string, string> = {
  approved: "cm-dt-approved",
  blue: "cm-dt-blue",
  rejected: "cm-dt-rejected",
  deferred: "cm-dt-deferred",
};

export function DecisionLogTable({ items, note, className = "" }: Props) {
  return (
    <div className={className}>
      {note && <div className="cm-decision-note">{note}</div>}
      {items.map((item, index) => (
        <div className="cm-decision-item" key={`${item.date}-${index}`}>
          <div className="cm-decision-date">{item.date}</div>
          <div>
            {item.tags.map((tag) => (
              <span key={tag.label} className={`cm-decision-tag ${toneClassMap[tag.tone] ?? ""}`}>
                {tag.label}
              </span>
            ))}
          </div>
          <div className="cm-decision-text">{item.text}</div>
          <div className="cm-decision-by">{item.by}</div>
        </div>
      ))}
    </div>
  );
}
