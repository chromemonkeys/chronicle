import { describe, it, expect } from "vitest";
import { findMatches } from "./find-replace";

/**
 * Creates a mock ProseMirror doc with a `descendants` method.
 * Each entry is { text, pos } where pos is the absolute starting position.
 */
function mockDoc(textNodes: Array<{ text: string; pos: number }>) {
  return {
    descendants(callback: (node: any, pos: number) => void) {
      for (const { text, pos } of textNodes) {
        callback({ isText: true, text }, pos);
      }
    },
  };
}

describe("findMatches", () => {
  it("finds a single match", () => {
    const doc = mockDoc([{ text: "Hello world", pos: 1 }]);
    const results = findMatches(doc, "world");
    expect(results).toEqual([{ from: 7, to: 12 }]);
  });

  it("finds multiple matches in one node", () => {
    const doc = mockDoc([{ text: "foo bar foo baz foo", pos: 0 }]);
    const results = findMatches(doc, "foo");
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ from: 0, to: 3 });
    expect(results[1]).toEqual({ from: 8, to: 11 });
    expect(results[2]).toEqual({ from: 16, to: 19 });
  });

  it("is case-insensitive", () => {
    const doc = mockDoc([{ text: "Hello HELLO hElLo", pos: 0 }]);
    const results = findMatches(doc, "hello");
    expect(results).toHaveLength(3);
  });

  it("finds matches across multiple text nodes", () => {
    const doc = mockDoc([
      { text: "Hello world", pos: 1 },
      { text: "Hello again", pos: 20 },
    ]);
    const results = findMatches(doc, "Hello");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ from: 1, to: 6 });
    expect(results[1]).toEqual({ from: 20, to: 25 });
  });

  it("returns empty array for empty search term", () => {
    const doc = mockDoc([{ text: "Hello world", pos: 0 }]);
    const results = findMatches(doc, "");
    expect(results).toEqual([]);
  });

  it("returns empty array when no matches found", () => {
    const doc = mockDoc([{ text: "Hello world", pos: 0 }]);
    const results = findMatches(doc, "xyz");
    expect(results).toEqual([]);
  });

  it("returns correct positions with non-zero pos offsets", () => {
    const doc = mockDoc([{ text: "abc", pos: 10 }]);
    const results = findMatches(doc, "bc");
    expect(results).toEqual([{ from: 11, to: 13 }]);
  });

  it("handles overlapping-capable patterns (finds non-overlapping)", () => {
    const doc = mockDoc([{ text: "aaa", pos: 0 }]);
    const results = findMatches(doc, "aa");
    // indexOf with idx+1 finds overlapping matches
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ from: 0, to: 2 });
    expect(results[1]).toEqual({ from: 1, to: 3 });
  });

  it("skips non-text nodes", () => {
    const doc = {
      descendants(callback: (node: any, pos: number) => void) {
        callback({ isText: false }, 0);
        callback({ isText: true, text: "Hello" }, 10);
      },
    };
    const results = findMatches(doc, "Hello");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ from: 10, to: 15 });
  });

  it("preserves search term length in result ranges", () => {
    const doc = mockDoc([{ text: "test", pos: 0 }]);
    const results = findMatches(doc, "TEST");
    expect(results).toHaveLength(1);
    // Search term length is used for the to position
    expect(results[0].to - results[0].from).toBe(4);
  });

  it("handles doc with no text nodes", () => {
    const doc = {
      descendants(_callback: (node: any, pos: number) => void) {
        // no nodes
      },
    };
    const results = findMatches(doc, "test");
    expect(results).toEqual([]);
  });
});
