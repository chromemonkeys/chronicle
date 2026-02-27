/**
 * Unit Tests for Blame Mapping Algorithm
 * 
 * These tests verify the core blame attribution logic:
 * - Walking commit history from newest to oldest
 * - Finding the most recent commit that modified each node
 * - Handling nodes that appear in multiple commits
 */

describe("Blame Mapping Algorithm", () => {
  // Simulated commit structure matching backend format
  interface MockCommit {
    hash: string;
    author: string;
    createdAt: string;
    message: string;
    content: {
      doc: {
        content: Array<{
          attrs?: { nodeId?: string };
          [key: string]: unknown;
        }>;
      };
    };
  }

  interface MockThread {
    id: string;
    anchorNodeId?: string;
    author: string;
    status: "OPEN" | "RESOLVED" | "ORPHANED";
    replies: Array<{ id: string }>;
  }

  function buildBlameEntries(
    commits: MockCommit[],
    threads: MockThread[] = []
  ): Array<{
    nodeId: string;
    author: string;
    editedAt: string;
    commitHash: string;
    commitMessage: string;
    threads?: Array<{
      id: string;
      author: string;
      status: "OPEN" | "RESOLVED" | "ORPHANED";
      replyCount: number;
    }>;
  }> {
    const headCommit = commits[commits.length - 1];
    const entries = [];
    const doc = headCommit?.content?.doc;

    if (doc && Array.isArray(doc.content)) {
      const nodeBlameMap = new Map();

      // Walk through commits from newest to oldest
      for (let i = commits.length - 1; i >= 0; i--) {
        const commit = commits[i];
        const commitDoc = commit.content?.doc;

        if (!commitDoc || !Array.isArray(commitDoc.content)) {
          continue;
        }

        for (const node of commitDoc.content) {
          const nodeId = node.attrs?.nodeId;
          if (!nodeId || nodeBlameMap.has(nodeId)) {
            continue;
          }

          nodeBlameMap.set(nodeId, {
            nodeId,
            author: commit.author,
            editedAt: commit.createdAt,
            commitHash: commit.hash,
            commitMessage: commit.message,
          });
        }
      }

      for (const node of doc.content) {
        const nodeId = node.attrs?.nodeId;
        if (!nodeId) continue;

        const blame = nodeBlameMap.get(nodeId);
        if (blame) {
          const nodeThreads = threads
            .filter((t) => t.anchorNodeId === nodeId)
            .map((t) => ({
              id: t.id,
              author: t.author,
              status: t.status,
              replyCount: t.replies?.length || 0,
            }));

          entries.push({
            ...blame,
            threads: nodeThreads.length > 0 ? nodeThreads : undefined,
          });
        }
      }
    }

    return entries;
  }

  describe("basic attribution", () => {
    it("should attribute each node to its most recent editor", () => {
      const commits: MockCommit[] = [
        {
          hash: "abc123",
          author: "Alice",
          createdAt: "2024-01-01T10:00:00Z",
          message: "Initial commit",
          content: {
            doc: {
              content: [
                { attrs: { nodeId: "node-1" } },
                { attrs: { nodeId: "node-2" } },
              ],
            },
          },
        },
        {
          hash: "def456",
          author: "Bob",
          createdAt: "2024-01-02T10:00:00Z",
          message: "Edit node-2",
          content: {
            doc: {
              content: [
                { attrs: { nodeId: "node-1" } },
                { attrs: { nodeId: "node-2" } },
              ],
            },
          },
        },
      ];

      const entries = buildBlameEntries(commits);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        nodeId: "node-1",
        author: "Alice",
        commitHash: "abc123",
      });
      expect(entries[1]).toMatchObject({
        nodeId: "node-2",
        author: "Bob",
        commitHash: "def456",
      });
    });

    it("should handle nodes added in later commits", () => {
      const commits: MockCommit[] = [
        {
          hash: "abc123",
          author: "Alice",
          createdAt: "2024-01-01T10:00:00Z",
          message: "Initial commit",
          content: {
            doc: {
              content: [{ attrs: { nodeId: "node-1" } }],
            },
          },
        },
        {
          hash: "def456",
          author: "Bob",
          createdAt: "2024-01-02T10:00:00Z",
          message: "Add node-2",
          content: {
            doc: {
              content: [
                { attrs: { nodeId: "node-1" } },
                { attrs: { nodeId: "node-2" } },
              ],
            },
          },
        },
      ];

      const entries = buildBlameEntries(commits);

      expect(entries).toHaveLength(2);
      expect(entries[1]).toMatchObject({
        nodeId: "node-2",
        author: "Bob",
        commitHash: "def456",
      });
    });
  });

  describe("thread association", () => {
    it("should associate threads with their anchor nodes", () => {
      const commits: MockCommit[] = [
        {
          hash: "abc123",
          author: "Alice",
          createdAt: "2024-01-01T10:00:00Z",
          message: "Initial commit",
          content: {
            doc: {
              content: [
                { attrs: { nodeId: "node-1" } },
                { attrs: { nodeId: "node-2" } },
              ],
            },
          },
        },
      ];

      const threads: MockThread[] = [
        {
          id: "thread-1",
          anchorNodeId: "node-1",
          author: "Charlie",
          status: "OPEN",
          replies: [{ id: "reply-1" }, { id: "reply-2" }],
        },
      ];

      const entries = buildBlameEntries(commits, threads);

      expect(entries[0].threads).toHaveLength(1);
      expect(entries[0].threads?.[0]).toMatchObject({
        id: "thread-1",
        author: "Charlie",
        status: "OPEN",
        replyCount: 2,
      });
      expect(entries[1].threads).toBeUndefined();
    });

    it("should handle multiple threads on the same node", () => {
      const commits: MockCommit[] = [
        {
          hash: "abc123",
          author: "Alice",
          createdAt: "2024-01-01T10:00:00Z",
          message: "Initial commit",
          content: {
            doc: {
              content: [{ attrs: { nodeId: "node-1" } }],
            },
          },
        },
      ];

      const threads: MockThread[] = [
        {
          id: "thread-1",
          anchorNodeId: "node-1",
          author: "Charlie",
          status: "OPEN",
          replies: [],
        },
        {
          id: "thread-2",
          anchorNodeId: "node-1",
          author: "Dave",
          status: "RESOLVED",
          replies: [{ id: "reply-1" }],
        },
      ];

      const entries = buildBlameEntries(commits, threads);

      expect(entries[0].threads).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("should handle empty commit history", () => {
      const entries = buildBlameEntries([]);
      expect(entries).toHaveLength(0);
    });

    it("should handle commits without nodeIds", () => {
      const commits: MockCommit[] = [
        {
          hash: "abc123",
          author: "Alice",
          createdAt: "2024-01-01T10:00:00Z",
          message: "Initial commit",
          content: {
            doc: {
              content: [
                { attrs: {} },
                { text: "Plain text node" },
              ],
            },
          },
        },
      ];

      const entries = buildBlameEntries(commits);
      expect(entries).toHaveLength(0);
    });

    it("should handle missing doc content", () => {
      const commits: MockCommit[] = [
        {
          hash: "abc123",
          author: "Alice",
          createdAt: "2024-01-01T10:00:00Z",
          message: "Initial commit",
          content: {
            doc: {
              content: [],
            },
          },
        },
      ];

      const entries = buildBlameEntries(commits);
      expect(entries).toHaveLength(0);
    });
  });

  describe("performance", () => {
    it("should handle many commits efficiently", () => {
      const commits: MockCommit[] = [];
      for (let i = 0; i < 100; i++) {
        commits.push({
          hash: `commit-${i}`,
          author: `Author ${i % 5}`,
          createdAt: `2024-01-${String((i % 30) + 1).padStart(2, "0")}T10:00:00Z`,
          message: `Commit ${i}`,
          content: {
            doc: {
              content: Array.from({ length: 50 }, (_, j) => ({
                attrs: { nodeId: `node-${j}` },
              })),
            },
          },
        });
      }

      const startTime = Date.now();
      const entries = buildBlameEntries(commits);
      const endTime = Date.now();

      // Should complete in under 100ms for 100 commits with 50 nodes each
      expect(endTime - startTime).toBeLessThan(100);
      expect(entries).toHaveLength(50);
    });
  });
});
