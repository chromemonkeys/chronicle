import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 9799;
const SYNC_TOKEN = "chronicle-sync-test-token";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for health endpoint: ${url}`);
}

function startServer(port) {
  return spawn("node", ["backend/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CHRONICLE_SYNC_TOKEN: SYNC_TOKEN
    },
    stdio: "pipe"
  });
}

async function apiRequest(baseUrl, token, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
}

async function ensureStatus(response, status, label) {
  if (response.status === status) return;
  const body = await response.text().catch(() => "");
  assert.fail(`${label} (status=${response.status}) ${body}`);
}

const sampleDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1, nodeId: "test-title" },
      content: [{ type: "text", text: "Test Policy" }]
    },
    {
      type: "paragraph",
      attrs: { nodeId: "test-subtitle" },
      content: [{ type: "text", text: "A test subtitle" }]
    },
    {
      type: "heading",
      attrs: { level: 2, nodeId: "test-overview" },
      content: [{ type: "text", text: "Overview" }]
    },
    {
      type: "heading",
      attrs: { level: 3, nodeId: "test-purpose-h" },
      content: [{ type: "text", text: "Purpose" }]
    },
    {
      type: "paragraph",
      attrs: { nodeId: "test-purpose" },
      content: [{ type: "text", text: "Testing doc round-trip" }]
    },
    {
      type: "bulletList",
      attrs: { nodeId: "test-list" },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Item one" }] }
          ]
        },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Item two" }] }
          ]
        }
      ]
    },
    {
      type: "codeBlock",
      attrs: { nodeId: "test-code" },
      content: [{ type: "text", text: "const x = 42;" }]
    }
  ]
};

// --- Unit-style tests (via API calls) ---

test("POST workspace with doc persists and returns same doc", async (t) => {
  const port = PORT;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Doc Test User" })
  });
  await ensureStatus(loginRes, 200, "login");
  const { token } = await loginRes.json();

  // Save with doc
  const saveRes = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ title: "Test Policy", doc: sampleDoc })
  });
  await ensureStatus(saveRes, 200, "save with doc");
  const saved = await saveRes.json();

  assert.ok(saved.doc, "response must include doc");
  assert.equal(saved.doc.type, "doc");
  assert.equal(saved.doc.content.length, sampleDoc.content.length, "doc content node count must match");

  // Verify node types preserved
  for (let i = 0; i < sampleDoc.content.length; i++) {
    assert.equal(saved.doc.content[i].type, sampleDoc.content[i].type,
      `node[${i}] type must match: expected ${sampleDoc.content[i].type}`);
  }

  // Verify nodeIds extracted
  assert.ok(saved.nodeIds, "response must include nodeIds");
  assert.ok(saved.nodeIds["test-title"], "nodeIds must contain test-title");
  assert.ok(saved.nodeIds["test-list"], "nodeIds must contain test-list");
});

test("GET workspace returns persisted doc after save", async (t) => {
  const port = PORT + 1;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Doc Test User" })
  });
  const { token } = await loginRes.json();

  // Save with doc
  await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ title: "Test Policy", doc: sampleDoc })
  });

  // Reload workspace
  const getRes = await apiRequest(baseUrl, token, "/api/workspace/adr-142");
  await ensureStatus(getRes, 200, "get workspace");
  const workspace = await getRes.json();

  assert.ok(workspace.doc, "GET must return doc");
  assert.equal(workspace.doc.type, "doc");
  assert.equal(workspace.doc.content.length, sampleDoc.content.length);

  // Verify rich nodes survived round-trip
  const bulletList = workspace.doc.content.find((n) => n.type === "bulletList");
  assert.ok(bulletList, "bulletList must survive round-trip");
  const codeBlock = workspace.doc.content.find((n) => n.type === "codeBlock");
  assert.ok(codeBlock, "codeBlock must survive round-trip");
});

test("diffContent detects doc change when legacy fields are identical", async (t) => {
  const port = PORT + 2;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Diff Test User" })
  });
  const { token } = await loginRes.json();

  // First save with doc
  const save1Res = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ doc: sampleDoc })
  });
  const save1 = await save1Res.json();
  const historyCount1 = save1.history.length;

  // Second save with modified doc but same legacy fields
  const modifiedDoc = JSON.parse(JSON.stringify(sampleDoc));
  modifiedDoc.content.push({
    type: "blockquote",
    attrs: { nodeId: "test-quote" },
    content: [{ type: "paragraph", content: [{ type: "text", text: "A new quote block" }] }]
  });

  const save2Res = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ doc: modifiedDoc })
  });
  const save2 = await save2Res.json();

  assert.ok(save2.history.length > historyCount1, "new commit must be created for doc-only change");
});

test("sync session-ended persists doc from snapshot", async (t) => {
  const port = PORT + 3;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Sync Doc User" })
  });
  const { token } = await loginRes.json();

  // Get workspace to get proposal ID
  const wsRes = await apiRequest(baseUrl, token, "/api/workspace/policy-sec");
  const workspace = await wsRes.json();
  const proposalId = workspace.document.proposalId;

  // Flush with doc in snapshot
  const flushRes = await fetch(`${baseUrl}/api/internal/sync/session-ended`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chronicle-sync-token": SYNC_TOKEN
    },
    body: JSON.stringify({
      sessionId: "doc-roundtrip-session-1",
      documentId: "policy-sec",
      proposalId,
      actor: "Sync Doc User",
      updateCount: 3,
      snapshot: {
        ...workspace.content,
        tiers: "Updated via sync with doc",
        doc: sampleDoc
      }
    })
  });
  await ensureStatus(flushRes, 200, "flush with doc");
  const flushResult = await flushRes.json();
  assert.ok(flushResult.ok);

  // Verify doc survived flush by loading workspace
  const reloadRes = await apiRequest(baseUrl, token, "/api/workspace/policy-sec");
  const reloaded = await reloadRes.json();
  assert.ok(reloaded.doc, "workspace after flush must contain doc");
  assert.equal(reloaded.doc.type, "doc");
  assert.equal(reloaded.doc.content.length, sampleDoc.content.length);
});

test("malformed doc returns validation error", async (t) => {
  const port = PORT + 4;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Validation Test" })
  });
  const { token } = await loginRes.json();

  // Test 1: doc.type is not "doc"
  const badType = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ doc: { type: "paragraph", content: [] } })
  });
  assert.equal(badType.status, 422, "wrong doc.type should return 422");
  const badTypeBody = await badType.json();
  assert.equal(badTypeBody.code, "VALIDATION_ERROR");

  // Test 2: doc.content is not an array
  const badContent = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ doc: { type: "doc", content: "not-an-array" } })
  });
  assert.equal(badContent.status, 422, "non-array content should return 422");

  // Test 3: doc.content entries missing type
  const badNode = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ doc: { type: "doc", content: [{ attrs: {} }] } })
  });
  assert.equal(badNode.status, 422, "content entry without type should return 422");
});

test("legacy fallback works when no doc is present", async (t) => {
  const port = PORT + 5;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Legacy Test" })
  });
  const { token } = await loginRes.json();

  // Save with only legacy fields, no doc
  const saveRes = await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({
      title: "Legacy Title",
      purpose: "Legacy purpose text"
    })
  });
  await ensureStatus(saveRes, 200, "legacy save");
  const saved = await saveRes.json();

  // Should still work — content fields updated
  assert.equal(saved.content.title, "Legacy Title");
  assert.equal(saved.content.purpose, "Legacy purpose text");
});

test("health endpoint exposes doc metrics", async (t) => {
  const port = PORT + 6;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = startServer(port);
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => server.kill());

  const loginRes = await apiRequest(baseUrl, null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "Metrics Test" })
  });
  const { token } = await loginRes.json();

  // First save: legacy only (no doc), on a fresh document that has no prior doc
  await apiRequest(baseUrl, token, "/api/workspace/rfc-auth", {
    method: "POST",
    body: JSON.stringify({ purpose: "Metrics legacy test" })
  });

  // Second save: with doc
  await apiRequest(baseUrl, token, "/api/workspace/adr-142", {
    method: "POST",
    body: JSON.stringify({ doc: sampleDoc })
  });

  const healthRes = await fetch(`${baseUrl}/api/health`);
  const health = await healthRes.json();

  assert.ok(health.metrics, "health must expose metrics");
  assert.ok(health.metrics["workspace.save.with_doc"] >= 1, "with_doc counter must be >= 1");
  assert.ok(health.metrics["workspace.save.legacy_only"] >= 1, "legacy_only counter must be >= 1");
});
