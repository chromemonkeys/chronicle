import { useState, useRef, useEffect } from "react";
import type { Editor } from "@tiptap/react";

type Props = {
  editor: Editor | null;
  diffVisible: boolean;
  onToggleDiff: () => void;
  diffMode: "split" | "unified";
  onSetDiffMode: (mode: "split" | "unified") => void;
};

const FONT_FAMILIES = [
  { label: "Sans", value: "Inter, system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Mono", value: "ui-monospace, monospace" },
];

const TEXT_COLORS = [
  "#000000", "#374151", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#2563eb", "#7c3aed", "#db2777",
];

const HIGHLIGHT_COLORS = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
];

function DropdownPicker({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="cm-toolbar-dropdown" ref={ref}>
      <button
        className="cm-tool-btn"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <div className="cm-toolbar-dropdown-menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function EditorToolbar({
  editor,
  diffVisible,
  onToggleDiff,
  diffMode,
  onSetDiffMode,
}: Props) {
  if (!editor) return null;

  return (
    <div className="cm-doc-toolbar" role="toolbar" aria-label="Editor toolbar">
      <div className="cm-doc-toolbar-group">
        <button
          className="cm-tool-btn"
          type="button"
          onClick={() => editor.chain().focus().splitBlock().run()}
          title="Add a new block below the cursor"
        >
          + Block
        </button>
      </div>
      <div className="cm-doc-toolbar-group" role="group" aria-label="Text formatting">
        <button
          className={`cm-tool-btn ${editor.isActive("bold") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
        >
          <strong>B</strong>
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("italic") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
        >
          <em>I</em>
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("underline") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
          aria-pressed={editor.isActive("underline")}
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("strike") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Strikethrough"
          aria-pressed={editor.isActive("strike")}
        >
          <span style={{ textDecoration: "line-through" }}>S</span>
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("code") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          aria-label="Inline code"
          aria-pressed={editor.isActive("code")}
        >
          &lt;/&gt;
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("heading", { level: 2 }) ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Heading 2"
          aria-pressed={editor.isActive("heading", { level: 2 })}
        >
          H2
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("heading", { level: 3 }) ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Heading 3"
          aria-pressed={editor.isActive("heading", { level: 3 })}
        >
          H3
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("bulletList") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
          aria-pressed={editor.isActive("bulletList")}
        >
          ⋮
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive("blockquote") ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Blockquote"
          aria-pressed={editor.isActive("blockquote")}
        >
          ❝
        </button>
      </div>
      <div className="cm-doc-toolbar-group" role="group" aria-label="Font and color">
        <DropdownPicker label="Font">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.value}
              className={`cm-dropdown-item ${editor.isActive("textStyle", { fontFamily: f.value }) ? "active" : ""}`}
              type="button"
              onClick={() => editor.chain().focus().setFontFamily(f.value).run()}
              style={{ fontFamily: f.value }}
            >
              {f.label}
            </button>
          ))}
          <button
            className="cm-dropdown-item"
            type="button"
            onClick={() => editor.chain().focus().unsetFontFamily().run()}
          >
            Default
          </button>
        </DropdownPicker>
        <DropdownPicker label="A">
          <div className="cm-color-grid">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                className="cm-color-swatch"
                type="button"
                style={{ backgroundColor: c }}
                title={c}
                onClick={() => editor.chain().focus().setColor(c).run()}
              />
            ))}
          </div>
          <button
            className="cm-dropdown-item"
            type="button"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            Default color
          </button>
        </DropdownPicker>
        <DropdownPicker label="⬒">
          {HIGHLIGHT_COLORS.map((h) => (
            <button
              key={h.value}
              className="cm-dropdown-item"
              type="button"
              onClick={() => editor.chain().focus().toggleHighlight({ color: h.value }).run()}
            >
              <span className="cm-highlight-preview" style={{ backgroundColor: h.value }} />
              {h.label}
            </button>
          ))}
          <button
            className="cm-dropdown-item"
            type="button"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
          >
            No highlight
          </button>
        </DropdownPicker>
      </div>
      <div className="cm-doc-toolbar-group" role="group" aria-label="Alignment">
        <button
          className={`cm-tool-btn ${editor.isActive({ textAlign: "left" }) ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          aria-label="Align left"
        >
          ≡
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive({ textAlign: "center" }) ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          aria-label="Align center"
        >
          ≡̃
        </button>
        <button
          className={`cm-tool-btn ${editor.isActive({ textAlign: "right" }) ? "active" : ""}`}
          type="button"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          aria-label="Align right"
        >
          ≡̄
        </button>
      </div>
      <div className="cm-doc-toolbar-group">
        <button
          className={`cm-tool-btn ${diffVisible ? "active" : ""}`}
          type="button"
          onClick={onToggleDiff}
        >
          {diffVisible ? "⦿ Diff On" : "⦿ Show Diff"}
        </button>
      </div>
      <div className="cm-toolbar-spacer" />
      <div className="cm-diff-toggle">
        <button
          className={diffMode === "split" ? "active" : ""}
          type="button"
          onClick={() => onSetDiffMode("split")}
        >
          Split
        </button>
        <button
          className={diffMode === "unified" ? "active" : ""}
          type="button"
          onClick={() => onSetDiffMode("unified")}
        >
          Unified
        </button>
      </div>
    </div>
  );
}
