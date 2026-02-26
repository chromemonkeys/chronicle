/**
 * Doc diff computation: compare two ProseMirror JSON docs by nodeId,
 * produce a diff manifest.
 */
import type { DocumentContent, DocNode } from "./schema";

export type NodeDiffStatus = "added" | "removed" | "changed" | "unchanged";

export type NodeDiff = {
  nodeId: string;
  status: NodeDiffStatus;
  inlineChanges?: InlineChange[];
  beforeText?: string;
  afterText?: string;
};

export type InlineChange = {
  type: "insert" | "delete";
  text: string;
};

export type DiffManifest = {
  nodes: NodeDiff[];
  addedIds: Set<string>;
  removedIds: Set<string>;
  changedIds: Set<string>;
};

function extractText(node: DocNode): string {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

function collectNodes(doc: DocumentContent): Map<string, DocNode> {
  const map = new Map<string, DocNode>();
  for (const node of doc.content) {
    const nodeId = node.attrs?.nodeId as string | undefined;
    if (nodeId) {
      map.set(nodeId, node);
    }
  }
  return map;
}

/**
 * Simple word-level diff between two strings.
 */
function wordDiff(before: string, after: string): InlineChange[] {
  const beforeWords = before.split(/(\s+)/);
  const afterWords = after.split(/(\s+)/);
  const changes: InlineChange[] = [];

  const maxLen = Math.max(beforeWords.length, afterWords.length);
  for (let i = 0; i < maxLen; i++) {
    const bw = beforeWords[i] ?? "";
    const aw = afterWords[i] ?? "";
    if (bw === aw) continue;
    if (bw) changes.push({ type: "delete", text: bw });
    if (aw) changes.push({ type: "insert", text: aw });
  }

  return changes;
}

/**
 * Compare two ProseMirror JSON docs, returning a diff manifest.
 */
export function diffDocs(base: DocumentContent, head: DocumentContent): DiffManifest {
  const baseNodes = collectNodes(base);
  const headNodes = collectNodes(head);

  const nodes: NodeDiff[] = [];
  const addedIds = new Set<string>();
  const removedIds = new Set<string>();
  const changedIds = new Set<string>();

  // Check all head nodes against base
  for (const [nodeId, headNode] of headNodes) {
    const baseNode = baseNodes.get(nodeId);
    if (!baseNode) {
      addedIds.add(nodeId);
      nodes.push({ nodeId, status: "added", afterText: extractText(headNode) });
    } else {
      const baseText = extractText(baseNode);
      const headText = extractText(headNode);
      if (baseText !== headText) {
        changedIds.add(nodeId);
        nodes.push({
          nodeId,
          status: "changed",
          inlineChanges: wordDiff(baseText, headText),
          beforeText: baseText,
          afterText: headText,
        });
      } else {
        nodes.push({ nodeId, status: "unchanged" });
      }
    }
  }

  // Check for removed nodes
  for (const nodeId of baseNodes.keys()) {
    if (!headNodes.has(nodeId)) {
      removedIds.add(nodeId);
      nodes.push({ nodeId, status: "removed", beforeText: extractText(baseNodes.get(nodeId)!) });
    }
  }

  return { nodes, addedIds, removedIds, changedIds };
}
