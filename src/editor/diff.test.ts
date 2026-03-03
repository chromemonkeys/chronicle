import { describe, it, expect } from "vitest";
import { diffDocs } from "./diff";
import type { DocumentContent } from "./schema";

function makeDoc(nodes: DocumentContent["content"]): DocumentContent {
  return { type: "doc", content: nodes };
}

function textNode(nodeId: string, text: string, type = "paragraph") {
  return {
    type,
    attrs: { nodeId },
    content: [{ type: "text", text }],
  };
}

describe("diffDocs", () => {
  it("marks identical docs as unchanged", () => {
    const doc = makeDoc([textNode("a", "Hello world")]);
    const result = diffDocs(doc, doc);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].status).toBe("unchanged");
    expect(result.addedIds.size).toBe(0);
    expect(result.removedIds.size).toBe(0);
    expect(result.changedIds.size).toBe(0);
  });

  it("detects added nodes", () => {
    const base = makeDoc([textNode("a", "Hello")]);
    const head = makeDoc([textNode("a", "Hello"), textNode("b", "World")]);
    const result = diffDocs(base, head);
    expect(result.addedIds.has("b")).toBe(true);
    const addedNode = result.nodes.find((n) => n.nodeId === "b");
    expect(addedNode?.status).toBe("added");
    expect(addedNode?.afterText).toBe("World");
  });

  it("detects removed nodes", () => {
    const base = makeDoc([textNode("a", "Hello"), textNode("b", "World")]);
    const head = makeDoc([textNode("a", "Hello")]);
    const result = diffDocs(base, head);
    expect(result.removedIds.has("b")).toBe(true);
    const removedNode = result.nodes.find((n) => n.nodeId === "b");
    expect(removedNode?.status).toBe("removed");
    expect(removedNode?.beforeText).toBe("World");
  });

  it("detects changed nodes with inline diff", () => {
    const base = makeDoc([textNode("a", "Hello world")]);
    const head = makeDoc([textNode("a", "Hello universe")]);
    const result = diffDocs(base, head);
    expect(result.changedIds.has("a")).toBe(true);
    const changed = result.nodes.find((n) => n.nodeId === "a");
    expect(changed?.status).toBe("changed");
    expect(changed?.beforeText).toBe("Hello world");
    expect(changed?.afterText).toBe("Hello universe");
    expect(changed?.inlineChanges).toBeDefined();
    expect(changed?.inlineChanges?.length).toBeGreaterThan(0);
  });

  it("produces word-level inline changes", () => {
    const base = makeDoc([textNode("a", "The quick brown fox")]);
    const head = makeDoc([textNode("a", "The slow brown fox")]);
    const result = diffDocs(base, head);
    const changed = result.nodes[0];
    expect(changed.inlineChanges).toEqual(
      expect.arrayContaining([
        { type: "delete", text: "quick" },
        { type: "insert", text: "slow" },
      ])
    );
  });

  it("handles empty base doc", () => {
    const base = makeDoc([]);
    const head = makeDoc([textNode("a", "New content")]);
    const result = diffDocs(base, head);
    expect(result.addedIds.has("a")).toBe(true);
    expect(result.nodes).toHaveLength(1);
  });

  it("handles empty head doc", () => {
    const base = makeDoc([textNode("a", "Old content")]);
    const head = makeDoc([]);
    const result = diffDocs(base, head);
    expect(result.removedIds.has("a")).toBe(true);
    expect(result.nodes).toHaveLength(1);
  });

  it("handles both docs empty", () => {
    const result = diffDocs(makeDoc([]), makeDoc([]));
    expect(result.nodes).toHaveLength(0);
    expect(result.addedIds.size).toBe(0);
    expect(result.removedIds.size).toBe(0);
    expect(result.changedIds.size).toBe(0);
  });

  it("handles all-different docs (no shared nodeIds)", () => {
    const base = makeDoc([textNode("a", "Hello")]);
    const head = makeDoc([textNode("b", "World")]);
    const result = diffDocs(base, head);
    expect(result.addedIds.has("b")).toBe(true);
    expect(result.removedIds.has("a")).toBe(true);
    expect(result.nodes).toHaveLength(2);
  });

  it("skips nodes without nodeId", () => {
    const base = makeDoc([
      { type: "paragraph", content: [{ type: "text", text: "no id" }] },
    ]);
    const head = makeDoc([textNode("a", "has id")]);
    const result = diffDocs(base, head);
    expect(result.addedIds.has("a")).toBe(true);
    // The node without ID is not tracked
    expect(result.nodes).toHaveLength(1);
  });

  it("handles nested content text extraction", () => {
    const base = makeDoc([
      {
        type: "paragraph",
        attrs: { nodeId: "a" },
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
    ]);
    const head = makeDoc([
      {
        type: "paragraph",
        attrs: { nodeId: "a" },
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
    ]);
    const result = diffDocs(base, head);
    expect(result.nodes[0].status).toBe("unchanged");
  });

  it("detects change in multi-text-node paragraph", () => {
    const base = makeDoc([
      {
        type: "paragraph",
        attrs: { nodeId: "a" },
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
    ]);
    const head = makeDoc([
      {
        type: "paragraph",
        attrs: { nodeId: "a" },
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "earth" },
        ],
      },
    ]);
    const result = diffDocs(base, head);
    expect(result.changedIds.has("a")).toBe(true);
    expect(result.nodes[0].beforeText).toBe("Hello world");
    expect(result.nodes[0].afterText).toBe("Hello earth");
  });
});
