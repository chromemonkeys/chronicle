import { useState } from "react";

type Props = {
  anchorLabel: string;
  anchorNodeId?: string;
  onSubmit?: (
    text: string,
    anchorNodeId: string | undefined,
    options: {
      visibility: "INTERNAL" | "EXTERNAL";
      type: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
    }
  ) => void;
  className?: string;
};

export function ThreadComposer({ anchorLabel, anchorNodeId, onSubmit, className = "" }: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");
  const [type, setType] = useState<"GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL">("GENERAL");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    onSubmit?.(trimmed, anchorNodeId, { visibility, type });
    setText("");
    setSubmitting(false);
  }

  return (
    <div className={`cm-compose-box ${className}`.trim()}>
      <textarea
        className="cm-compose-input"
        rows={2}
        placeholder="Add a comment… click a paragraph to anchor it"
        aria-label="Comment text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className="cm-compose-row">
        <span className="cm-compose-attach">@ ⊕</span>
        <label className="cm-compose-select-wrap">
          <span>Type</span>
          <select className="cm-compose-select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="GENERAL">General</option>
            <option value="LEGAL">Legal</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="TECHNICAL">Technical</option>
            <option value="SECURITY">Security</option>
            <option value="QUERY">Query</option>
            <option value="EDITORIAL">Editorial</option>
          </select>
        </label>
        <label className="cm-compose-select-wrap">
          <span>Visibility</span>
          <select className="cm-compose-select" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </select>
        </label>
        <span className="cm-compose-anchor">
          Anchored to: <strong>{anchorLabel}</strong>
        </span>
        <span className="cm-compose-spacer" />
        <button
          className="cm-compose-send"
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          Comment
        </button>
      </div>
    </div>
  );
}
