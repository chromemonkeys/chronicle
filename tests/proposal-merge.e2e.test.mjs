import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 9797;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SYNC_TOKEN = "chronicle-sync-test-token";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for health endpoint: ${url}`);
}

function apiRequest(token, path, options = {}) {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
}

async function ensureStatus(response, status, label) {
  if (response.status === status) {
    return;
  }
  const body = await response.text().catch(() => "");
  assert.fail(`${label} (status=${response.status}) ${body}`);
}

test("proposal merge journey enforces gate ordering and thread resolution", async (t) => {
  const server = spawn("node", ["backend/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      CHRONICLE_SYNC_TOKEN: SYNC_TOKEN
    },
    stdio: "pipe"
  });

  const serverLogs = [];
  server.stdout.on("data", (chunk) => serverLogs.push(chunk.toString()));
  server.stderr.on("data", (chunk) => serverLogs.push(chunk.toString()));

  await waitForHealth(`${BASE_URL}/api/health`);
  t.after(() => {
    server.kill();
  });

  const loginResponse = await apiRequest(null, "/api/session/login", {
    method: "POST",
    body: JSON.stringify({ name: "E2E User" })
  });
  await ensureStatus(loginResponse, 200, "login failed");
  const { token } = await loginResponse.json();
  assert.ok(token, "token missing");

  const workspaceResponse = await apiRequest(token, "/api/workspace/rfc-auth");
  await ensureStatus(workspaceResponse, 200, "workspace failed");
  const workspace = await workspaceResponse.json();
  const proposalId = workspace.document.proposalId;
  assert.ok(proposalId, "expected active proposal id");

  const blockedLegal = await apiRequest(token, `/api/documents/rfc-auth/proposals/${proposalId}/approvals`, {
    method: "POST",
    body: JSON.stringify({ role: "legal" })
  });
  assert.equal(blockedLegal.status, 409, "legal approval should be blocked before technical stage");
  const blockedLegalPayload = await blockedLegal.json();
  assert.equal(blockedLegalPayload.code, "APPROVAL_ORDER_BLOCKED");

  for (const role of ["security", "architectureCommittee", "legal"]) {
    const approveResponse = await apiRequest(token, `/api/documents/rfc-auth/proposals/${proposalId}/approvals`, {
      method: "POST",
      body: JSON.stringify({ role })
    });
    await ensureStatus(approveResponse, 200, `approval failed for ${role}`);
  }

  const blockedMerge = await apiRequest(token, `/api/documents/rfc-auth/proposals/${proposalId}/merge`, {
    method: "POST"
  });
  assert.equal(blockedMerge.status, 409, "merge should remain blocked while threads are open");
  const blockedMergePayload = await blockedMerge.json();
  assert.equal(blockedMergePayload.code, "MERGE_GATE_BLOCKED");
  assert.equal(blockedMergePayload.details.pendingApprovals, 0);
  assert.ok(blockedMergePayload.details.openThreads > 0);

  const resolveResponse = await apiRequest(
    token,
    `/api/documents/rfc-auth/proposals/${proposalId}/threads/purpose/resolve`,
    {
      method: "POST",
      body: JSON.stringify({ outcome: "Accepted", note: "Resolved for merge validation" })
    }
  );
  await ensureStatus(resolveResponse, 200, "thread resolution failed");

  const mergeResponse = await apiRequest(token, `/api/documents/rfc-auth/proposals/${proposalId}/merge`, {
    method: "POST"
  });
  await ensureStatus(mergeResponse, 200, "merge failed");
  const mergedWorkspace = await mergeResponse.json();
  assert.equal(mergedWorkspace.document.status, "Approved");
  assert.equal(mergedWorkspace.document.proposalId, null);

  const historyResponse = await apiRequest(token, `/api/documents/rfc-auth/history?proposalId=main`);
  await ensureStatus(historyResponse, 200, "main history failed");
  const historyPayload = await historyResponse.json();
  assert.equal(historyPayload.branch, "main");
  assert.ok(historyPayload.commits.length >= 2, "expected main branch to contain merge commit");
  assert.match(historyPayload.commits[0].message, /Merge proposal/);

  if (server.exitCode !== null && server.exitCode !== 0) {
    throw new Error(`server exited unexpectedly: ${serverLogs.join("")}`);
  }
});

test("internal sync session flush creates a proposal commit", async (t) => {
  const server = spawn("node", ["backend/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT + 1),
      CHRONICLE_SYNC_TOKEN: SYNC_TOKEN
    },
    stdio: "pipe"
  });

  const baseUrl = `http://127.0.0.1:${PORT + 1}`;
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => {
    server.kill();
  });

  const loginResponse = await fetch(`${baseUrl}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Sync E2E" })
  });
  assert.equal(loginResponse.status, 200);
  const { token } = await loginResponse.json();

  const workspaceResponse = await fetch(`${baseUrl}/api/workspace/policy-sec`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(workspaceResponse.status, 200);
  const workspace = await workspaceResponse.json();
  const proposalId = workspace.document.proposalId;
  assert.ok(proposalId);

  const beforeHistory = await fetch(
    `${baseUrl}/api/documents/policy-sec/history?proposalId=${encodeURIComponent(proposalId)}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const beforeHistoryPayload = await beforeHistory.json();
  const beforeCount = beforeHistoryPayload.commits.length;

  const flushResponse = await fetch(`${baseUrl}/api/internal/sync/session-ended`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chronicle-sync-token": SYNC_TOKEN
    },
    body: JSON.stringify({
      sessionId: "e2e-sync-session-1",
      documentId: "policy-sec",
      proposalId,
      actor: "Sync E2E",
      updateCount: 4,
      snapshot: {
        ...workspace.content,
        tiers: "Standard tier consumers are limited to 2,500 requests per minute."
      }
    })
  });
  await ensureStatus(flushResponse, 200, "flush failed");

  const afterHistory = await fetch(
    `${baseUrl}/api/documents/policy-sec/history?proposalId=${encodeURIComponent(proposalId)}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const afterHistoryPayload = await afterHistory.json();
  assert.equal(afterHistoryPayload.commits.length, beforeCount + 1);
  assert.match(afterHistoryPayload.commits[0].message, /Sync session flush/);
});

test("create document endpoint provisions a draft workspace", async (t) => {
  const server = spawn("node", ["backend/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT + 2),
      CHRONICLE_SYNC_TOKEN: SYNC_TOKEN
    },
    stdio: "pipe"
  });

  const baseUrl = `http://127.0.0.1:${PORT + 2}`;
  await waitForHealth(`${baseUrl}/api/health`);
  t.after(() => {
    server.kill();
  });

  const loginResponse = await fetch(`${baseUrl}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Create Doc E2E" })
  });
  assert.equal(loginResponse.status, 200);
  const { token } = await loginResponse.json();

  const createResponse = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: "E2E Fresh Policy", subtitle: "Created in end-to-end test" })
  });
  await ensureStatus(createResponse, 200, "create document failed");
  const createdWorkspace = await createResponse.json();
  assert.equal(createdWorkspace.document.status, "Draft");
  assert.equal(createdWorkspace.document.proposalId, null);
  assert.equal(createdWorkspace.document.title, "E2E Fresh Policy");
  assert.ok(createdWorkspace.document.id);

  const documentsResponse = await fetch(`${baseUrl}/api/documents`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  await ensureStatus(documentsResponse, 200, "documents list failed");
  const documentsPayload = await documentsResponse.json();
  assert.ok(
    documentsPayload.documents.some((item) => item.id === createdWorkspace.document.id),
    "created document should appear in documents list"
  );
});
