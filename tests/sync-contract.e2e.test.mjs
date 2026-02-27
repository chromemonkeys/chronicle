import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { WebSocket } from "ws";

const API_PORT = 9810;
const SYNC_PORT = 9811;
const SYNC_TOKEN = "chronicle-sync-test-token";
const TOKEN_SECRET = "chronicle-sync-ws-secret";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startApi(port) {
  return spawn("node", ["backend/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CHRONICLE_SYNC_TOKEN: SYNC_TOKEN,
      CHRONICLE_TOKEN_SECRET: TOKEN_SECRET
    },
    stdio: "pipe"
  });
}

function startSync(port, apiPort, dataDir) {
  return spawn("node", ["backend/sync.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SYNC_PORT: String(port),
      API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      CHRONICLE_SYNC_TOKEN: SYNC_TOKEN,
      CHRONICLE_TOKEN_SECRET: TOKEN_SECRET,
      SYNC_DATA_DIR: dataDir
    },
    stdio: "pipe"
  });
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
  throw new Error(`timed out waiting for health endpoint: ${url}`);
}

async function login(apiBaseUrl, name) {
  const response = await fetch(`${apiBaseUrl}/api/session/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const raw = await response.text();
  assert.equal(response.status, 200, raw);
  const body = JSON.parse(raw);
  return body.token;
}

async function getWorkspace(apiBaseUrl, token, documentId) {
  const response = await fetch(`${apiBaseUrl}/api/workspace/${encodeURIComponent(documentId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const raw = await response.text();
  assert.equal(response.status, 200, raw);
  return JSON.parse(raw);
}

async function openSocket(syncBaseUrl, { token, documentId, proposalId }) {
  const url = new URL(syncBaseUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("documentId", documentId);
  url.searchParams.set("branchId", proposalId);
  const ws = new WebSocket(url.toString());
  await new Promise((resolve, reject) => {
    const onOpen = () => {
      ws.removeEventListener("error", onError);
      resolve();
    };
    const onError = (error) => {
      ws.removeEventListener("open", onOpen);
      reject(error);
    };
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onError, { once: true });
  });
  return ws;
}

function waitForEvent(ws, predicate, timeoutMs = 6_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for websocket event"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);
    };

    const onMessage = (event) => {
      let payload;
      try {
        const raw = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      if (!predicate(payload)) {
        return;
      }
      cleanup();
      resolve(payload);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("websocket closed before expected event"));
    };

    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  });
}

function closeSocket(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.addEventListener("close", () => resolve(), { once: true });
    ws.close();
  });
}

function makeLargeDoc(marker) {
  const content = [];
  for (let i = 0; i < 800; i += 1) {
    content.push({
      type: "paragraph",
      attrs: { nodeId: `node-${marker}-${i}` },
      content: [{ type: "text", text: `${marker}-${i} `.repeat(8) }]
    });
  }
  return { type: "doc", content };
}

test("sync gateway rebroadcasts canonical document_update payload", async (t) => {
  const apiPort = API_PORT;
  const syncPort = SYNC_PORT;
  const dataDir = path.join(os.tmpdir(), `chronicle-sync-contract-${Date.now()}-a`);
  const api = startApi(apiPort);
  const sync = startSync(syncPort, apiPort, dataDir);
  t.after(async () => {
    api.kill();
    sync.kill();
    await rm(dataDir, { recursive: true, force: true });
  });

  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const syncBaseUrl = `ws://127.0.0.1:${syncPort}/ws`;
  await waitForHealth(`${apiBaseUrl}/api/health`);
  await waitForHealth(`http://127.0.0.1:${syncPort}/health`);

  const tokenA = await login(apiBaseUrl, "Avery");
  const tokenB = await login(apiBaseUrl, "Jamie");
  const workspace = await getWorkspace(apiBaseUrl, tokenA, "adr-142");
  assert.ok(workspace.document.proposalId);

  const wsA = await openSocket(syncBaseUrl, {
    token: tokenA,
    documentId: "adr-142",
    proposalId: workspace.document.proposalId
  });
  const wsB = await openSocket(syncBaseUrl, {
    token: tokenB,
    documentId: "adr-142",
    proposalId: workspace.document.proposalId
  });
  t.after(async () => {
    await closeSocket(wsA);
    await closeSocket(wsB);
  });

  await waitForEvent(wsA, (event) => event.type === "connected");
  await waitForEvent(wsB, (event) => event.type === "connected");

  const doc = makeLargeDoc("broadcast");
  const received = waitForEvent(wsB, (event) => event.type === "document_update");

  wsA.send(
    JSON.stringify({
      type: "doc_update",
      content: {
        title: "Broadcast title",
        subtitle: "Broadcast subtitle",
        purpose: "Broadcast purpose",
        tiers: "Broadcast tiers",
        enforce: "Broadcast enforce"
      },
      doc
    })
  );

  const event = await received;
  assert.equal(event.type, "document_update");
  assert.equal(event.actor, "Avery");
  assert.equal(event.content.title, "Broadcast title");
  assert.equal(event.doc?.type, "doc");
  assert.equal(event.doc?.content?.[0]?.attrs?.nodeId, "node-broadcast-0");
  assert.ok(typeof event.at === "string" && event.at.length > 0);
});

test("sync gateway reconnect returns latest snapshot after rapid reconnect", async (t) => {
  const apiPort = API_PORT + 2;
  const syncPort = SYNC_PORT + 2;
  const dataDir = path.join(os.tmpdir(), `chronicle-sync-contract-${Date.now()}-b`);
  const api = startApi(apiPort);
  const sync = startSync(syncPort, apiPort, dataDir);
  t.after(async () => {
    api.kill();
    sync.kill();
    await rm(dataDir, { recursive: true, force: true });
  });

  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const syncBaseUrl = `ws://127.0.0.1:${syncPort}/ws`;
  await waitForHealth(`${apiBaseUrl}/api/health`);
  await waitForHealth(`http://127.0.0.1:${syncPort}/health`);

  const token = await login(apiBaseUrl, "Avery");
  const workspace = await getWorkspace(apiBaseUrl, token, "policy-sec");
  const proposalId = workspace.document.proposalId;
  assert.ok(proposalId);

  const ws1 = await openSocket(syncBaseUrl, { token, documentId: "policy-sec", proposalId });
  await waitForEvent(ws1, (event) => event.type === "connected");

  ws1.send(
    JSON.stringify({
      type: "doc_update",
      content: {
        ...workspace.content,
        tiers: "Snapshot baseline"
      },
      doc: makeLargeDoc("baseline")
    })
  );
  await waitForEvent(
    ws1,
    (event) => event.type === "document_update" && event.content?.tiers === "Snapshot baseline"
  );
  await closeSocket(ws1);

  const ws2 = await openSocket(syncBaseUrl, { token, documentId: "policy-sec", proposalId });
  await waitForEvent(ws2, (event) => event.type === "connected");
  await waitForEvent(
    ws2,
    (event) => event.type === "snapshot" && event.snapshot?.content?.tiers === "Snapshot baseline"
  );

  ws2.send(
    JSON.stringify({
      type: "doc_update",
      content: {
        ...workspace.content,
        tiers: "Snapshot latest"
      },
      doc: makeLargeDoc("latest")
    })
  );
  await waitForEvent(
    ws2,
    (event) => event.type === "document_update" && event.content?.tiers === "Snapshot latest"
  );

  const ws3Promise = openSocket(syncBaseUrl, { token, documentId: "policy-sec", proposalId });
  await closeSocket(ws2);
  const ws3 = await ws3Promise;
  t.after(async () => {
    await closeSocket(ws3);
  });
  await waitForEvent(ws3, (event) => event.type === "connected");
  const snapshot = await waitForEvent(ws3, (event) => event.type === "snapshot");

  assert.equal(snapshot.snapshot.content.tiers, "Snapshot latest");
  assert.equal(snapshot.snapshot.doc?.type, "doc");
  assert.equal(snapshot.snapshot.doc?.content?.[0]?.attrs?.nodeId, "node-latest-0");
});
