import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { FindReplaceBar } from "./FindReplaceBar";

type Props = {
  editor: Editor | null;
  diffVisible: boolean;
  onToggleDiff: () => void;
  diffMode: "split" | "unified";
  onSetDiffMode: (mode: "split" | "unified") => void;
  documentId?: string;
};

const FONT_FAMILIES = [
  { label: "Inter", value: "Inter, system-ui, sans-serif", category: "Sans" },
  { label: "Open Sans", value: "'Open Sans', sans-serif", category: "Sans" },
  { label: "Lato", value: "Lato, sans-serif", category: "Sans" },
  { label: "Nunito", value: "Nunito, sans-serif", category: "Sans" },
  { label: "Literata", value: "Literata, serif", category: "Serif" },
  { label: "Lora", value: "Lora, serif", category: "Serif" },
  { label: "Merriweather", value: "Merriweather, serif", category: "Serif" },
  { label: "Playfair Display", value: "'Playfair Display', serif", category: "Serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace", category: "Mono" },
  { label: "Fira Code", value: "'Fira Code', monospace", category: "Mono" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace", category: "Mono" },
];

const FONT_SIZES = ["8", "9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "72"];

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

const BLOCK_TYPES = [
  { label: "Normal", value: "paragraph" },
  { label: "Heading 1", value: "heading-1" },
  { label: "Heading 2", value: "heading-2" },
  { label: "Heading 3", value: "heading-3" },
];

function DropdownPicker({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
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
        <div
          className="cm-toolbar-dropdown-menu"
          style={wide ? { minWidth: "180px" } : undefined}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
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

  const isActive = editor.isActive("link");
  const currentUrl = editor.getAttributes("link").href ?? "";

  const handleOpen = () => {
    setUrl(currentUrl);
    setOpen(true);
  };

  const handleSet = () => {
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setOpen(false);
  };

  const handleRemove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <div className="cm-toolbar-dropdown" ref={ref}>
      <button
        className={`cm-tool-btn ${isActive ? "active" : ""}`}
        type="button"
        onClick={handleOpen}
        title="Link (Ctrl+K)"
        aria-label="Link"
      >
        🔗
      </button>
      {open && (
        <div className="cm-link-popover" onClick={(e) => e.stopPropagation()}>
          <input
            type="url"
            className="cm-link-input"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSet();
              if (e.key === "Escape") setOpen(false);
            }}
            autoFocus
          />
          <div className="cm-link-actions">
            <button type="button" className="cm-link-btn" onClick={handleSet}>
              Set
            </button>
            {isActive && (
              <button type="button" className="cm-link-btn cm-link-btn-remove" onClick={handleRemove}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TableDropdown({ editor }: { editor: Editor }) {
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

  const inTable = editor.isActive("table");

  return (
    <div className="cm-toolbar-dropdown" ref={ref}>
      <button
        className={`cm-tool-btn ${inTable ? "active" : ""}`}
        type="button"
        onClick={() => setOpen(!open)}
        title="Table"
        aria-label="Table"
        aria-expanded={open}
      >
        ⊞ ▾
      </button>
      {open && (
        <div className="cm-toolbar-dropdown-menu" style={{ minWidth: "160px" }}>
          {!inTable ? (
            <button
              className="cm-dropdown-item"
              type="button"
              onClick={() => {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                setOpen(false);
              }}
            >
              Insert 3×3 table
            </button>
          ) : (
            <>
              <button
                className="cm-dropdown-item"
                type="button"
                onClick={() => { editor.chain().focus().addRowAfter().run(); setOpen(false); }}
              >
                + Row below
              </button>
              <button
                className="cm-dropdown-item"
                type="button"
                onClick={() => { editor.chain().focus().addColumnAfter().run(); setOpen(false); }}
              >
                + Column right
              </button>
              <button
                className="cm-dropdown-item"
                type="button"
                onClick={() => { editor.chain().focus().deleteRow().run(); setOpen(false); }}
              >
                − Delete row
              </button>
              <button
                className="cm-dropdown-item"
                type="button"
                onClick={() => { editor.chain().focus().deleteColumn().run(); setOpen(false); }}
              >
                − Delete column
              </button>
              <button
                className="cm-dropdown-item"
                type="button"
                onClick={() => { editor.chain().focus().mergeCells().run(); setOpen(false); }}
              >
                Merge cells
              </button>
              <button
                className="cm-dropdown-item"
                type="button"
                onClick={() => { editor.chain().focus().splitCell().run(); setOpen(false); }}
              >
                Split cell
              </button>
              <button
                className="cm-dropdown-item"
                type="button"
                style={{ color: "var(--red)" }}
                onClick={() => { editor.chain().focus().deleteTable().run(); setOpen(false); }}
              >
                Delete table
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function getActiveBlockType(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "heading-1";
  if (editor.isActive("heading", { level: 2 })) return "heading-2";
  if (editor.isActive("heading", { level: 3 })) return "heading-3";
  return "paragraph";
}

function getActiveBlockLabel(editor: Editor): string {
  const t = getActiveBlockType(editor);
  return BLOCK_TYPES.find((b) => b.value === t)?.label ?? "Normal";
}

async function uploadImage(documentId: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(`/api/documents/${documentId}/uploads`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

export function EditorToolbar({
  editor,
  diffVisible,
  onToggleDiff,
  diffMode,
  onSetDiffMode,
  documentId,
}: Props) {
  const [findOpen, setFindOpen] = useState(false);

  // Keyboard shortcut: Ctrl/Cmd+F
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!editor) return null;

  const wordCount = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <div className="cm-doc-toolbar" role="toolbar" aria-label="Editor toolbar">
      {/* === ROW 1: Undo/Redo | Inline marks | Font | Size | Color | Highlight | Alignment === */}
      <div className="cm-toolbar-row">
        <div className="cm-doc-toolbar-group" role="group" aria-label="History">
          <button
            className="cm-tool-btn"
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ↩
          </button>
          <button
            className="cm-tool-btn"
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            ↪
          </button>
        </div>
        <div className="cm-doc-toolbar-group" role="group" aria-label="Text formatting">
          <button
            className={`cm-tool-btn ${editor.isActive("bold") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            aria-pressed={editor.isActive("bold")}
          >
            <strong>B</strong>
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("italic") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
            aria-pressed={editor.isActive("italic")}
          >
            <em>I</em>
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("underline") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline (Ctrl+U)"
            aria-label="Underline"
            aria-pressed={editor.isActive("underline")}
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("strike") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough (Ctrl+Shift+S)"
            aria-label="Strikethrough"
            aria-pressed={editor.isActive("strike")}
          >
            <span style={{ textDecoration: "line-through" }}>S</span>
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("subscript") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            title="Subscript (Ctrl+,)"
            aria-label="Subscript"
            aria-pressed={editor.isActive("subscript")}
          >
            X<sub>₂</sub>
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("superscript") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            title="Superscript (Ctrl+.)"
            aria-label="Superscript"
            aria-pressed={editor.isActive("superscript")}
          >
            X<sup>²</sup>
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("code") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline code (Ctrl+E)"
            aria-label="Inline code"
            aria-pressed={editor.isActive("code")}
          >
            &lt;/&gt;
          </button>
        </div>
        <div className="cm-doc-toolbar-group" role="group" aria-label="Font and color">
          <DropdownPicker label="Font" wide>
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
          <DropdownPicker label="Size">
            <div className="cm-font-size-grid">
              {FONT_SIZES.map((s) => (
                <button
                  key={s}
                  className={editor.isActive("textStyle", { fontSize: `${s}pt` }) ? "active" : ""}
                  type="button"
                  onClick={() => editor.chain().focus().setFontSize(`${s}pt`).run()}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              className="cm-dropdown-item"
              type="button"
              onClick={() => editor.chain().focus().unsetFontSize().run()}
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
            title="Align left"
            aria-label="Align left"
          >
            ≡
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive({ textAlign: "center" }) ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            title="Align center"
            aria-label="Align center"
          >
            ≡̃
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive({ textAlign: "right" }) ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            title="Align right"
            aria-label="Align right"
          >
            ≡̄
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive({ textAlign: "justify" }) ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            title="Justify"
            aria-label="Justify"
          >
            ≡̄̃
          </button>
        </div>
      </div>

      {/* === ROW 2: Block type | Lists/HR | Link/Table/Image (placeholders) | Diff | word count === */}
      <div className="cm-toolbar-row">
        <div className="cm-doc-toolbar-group" role="group" aria-label="Block type">
          <DropdownPicker label={getActiveBlockLabel(editor)}>
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.value}
                className={`cm-dropdown-item ${getActiveBlockType(editor) === bt.value ? "active" : ""}`}
                type="button"
                onClick={() => {
                  if (bt.value === "paragraph") {
                    editor.chain().focus().setParagraph().run();
                  } else {
                    const level = parseInt(bt.value.split("-")[1]) as 1 | 2 | 3;
                    editor.chain().focus().toggleHeading({ level }).run();
                  }
                }}
              >
                {bt.label}
              </button>
            ))}
          </DropdownPicker>
        </div>
        <div className="cm-doc-toolbar-group" role="group" aria-label="Block elements">
          <button
            className={`cm-tool-btn ${editor.isActive("bulletList") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
            aria-label="Bullet list"
            aria-pressed={editor.isActive("bulletList")}
          >
            •
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("orderedList") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered list"
            aria-label="Ordered list"
            aria-pressed={editor.isActive("orderedList")}
          >
            1.
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("taskList") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="Task list"
            aria-label="Task list"
            aria-pressed={editor.isActive("taskList")}
          >
            ☐
          </button>
          <button
            className={`cm-tool-btn ${editor.isActive("blockquote") ? "active" : ""}`}
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
            aria-label="Blockquote"
            aria-pressed={editor.isActive("blockquote")}
          >
            ❝
          </button>
          <button
            className="cm-tool-btn"
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal rule"
            aria-label="Horizontal rule"
          >
            ―
          </button>
        </div>
        <div className="cm-doc-toolbar-group" role="group" aria-label="Insert">
          <LinkPopover editor={editor} />
          <TableDropdown editor={editor} />
          <button
            className="cm-tool-btn"
            type="button"
            title="Insert image"
            aria-label="Insert image"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                if (documentId) {
                  const url = await uploadImage(documentId, file);
                  if (url) {
                    editor.chain().focus().setImage({ src: url }).run();
                    return;
                  }
                }
                // Fallback: insert as data URI for local/offline usage
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") {
                    editor.chain().focus().setImage({ src: reader.result }).run();
                  }
                };
                reader.readAsDataURL(file);
              };
              input.click();
            }}
          >
            🖼
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
        <div className="cm-doc-toolbar-group" role="group" aria-label="Tools">
          <button
            className="cm-tool-btn"
            type="button"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            title="Clear formatting"
            aria-label="Clear formatting"
          >
            ⊘
          </button>
          <button
            className={`cm-tool-btn ${findOpen ? "active" : ""}`}
            type="button"
            onClick={() => setFindOpen(!findOpen)}
            title="Find & Replace (Ctrl+F)"
            aria-label="Find and replace"
          >
            🔍
          </button>
        </div>
        <div className="cm-toolbar-spacer" />
        <span className="cm-word-count">{wordCount} words</span>
      </div>
      {findOpen && (
        <FindReplaceBar editor={editor} visible={findOpen} onClose={() => setFindOpen(false)} />
      )}
    </div>
  );
}
