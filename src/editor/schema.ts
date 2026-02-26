/**
 * ProseMirror JSON content types and legacy content conversion.
 */

export type NodeAttrs = Record<string, unknown>;

export type DocNode = {
  type: string;
  attrs?: NodeAttrs;
  content?: DocNode[];
  marks?: Array<{ type: string; attrs?: NodeAttrs }>;
  text?: string;
};

export type DocumentContent = {
  type: "doc";
  content: DocNode[];
};

/**
 * Convert legacy flat-string WorkspaceContent to ProseMirror JSON.
 * Each section becomes a heading + paragraph pair with a stable nodeId.
 */
export function legacyContentToDoc(legacy: {
  title: string;
  subtitle: string;
  purpose: string;
  tiers: string;
  enforce: string;
}, nodeIds?: Record<string, string>): DocumentContent {
  const id = (key: string) => nodeIds?.[key] ?? crypto.randomUUID();

  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, nodeId: id("title") },
        content: [{ type: "text", text: legacy.title }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: id("subtitle") },
        content: [{ type: "text", text: legacy.subtitle }],
      },
      {
        type: "heading",
        attrs: { level: 2, nodeId: id("overview") },
        content: [{ type: "text", text: "Overview" }],
      },
      {
        type: "heading",
        attrs: { level: 3, nodeId: id("purpose-heading") },
        content: [{ type: "text", text: "Purpose" }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: id("purpose") },
        content: [{ type: "text", text: legacy.purpose }],
      },
      {
        type: "heading",
        attrs: { level: 3, nodeId: id("tiers-heading") },
        content: [{ type: "text", text: "Tier Definitions" }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: id("tiers") },
        content: [{ type: "text", text: legacy.tiers }],
      },
      {
        type: "heading",
        attrs: { level: 3, nodeId: id("enforce-heading") },
        content: [{ type: "text", text: "Enforcement" }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: id("enforce") },
        content: [{ type: "text", text: legacy.enforce }],
      },
    ],
  };
}

/**
 * Extract flat-string content from a ProseMirror doc for backward-compatible saves.
 */
export function docToLegacyContent(doc: DocumentContent): {
  title: string;
  subtitle: string;
  purpose: string;
  tiers: string;
  enforce: string;
} {
  const result = { title: "", subtitle: "", purpose: "", tiers: "", enforce: "" };

  const nodes = doc.content;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const text = extractText(node);

    if (node.type === "heading" && node.attrs?.level === 1) {
      result.title = text;
      continue;
    }

    // Subtitle is the first paragraph after the h1
    if (node.type === "paragraph" && result.title && !result.subtitle && !result.purpose) {
      result.subtitle = text;
      continue;
    }

    // Match sections by preceding heading text
    if (node.type === "heading") {
      const headingText = text.toLowerCase();
      const next = nodes[i + 1];
      if (next && next.type === "paragraph") {
        const nextText = extractText(next);
        if (headingText.includes("purpose")) {
          result.purpose = nextText;
          i++;
        } else if (headingText.includes("tier")) {
          result.tiers = nextText;
          i++;
        } else if (headingText.includes("enforce")) {
          result.enforce = nextText;
          i++;
        }
      }
    }
  }

  return result;
}

function extractText(node: DocNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}
