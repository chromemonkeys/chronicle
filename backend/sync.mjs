import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

import { verifyAuthToken } from "./auth-token.mjs";

const PORT = Number(process.env.SYNC_PORT ?? 8788);
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";
const SYNC_INTERNAL_TOKEN = process.env.CHRONICLE_SYNC_TOKEN ?? "chronicle-sync-dev-token";
const DATA_ROOT = path.resolve(process.cwd(), process.env.SYNC_DATA_DIR ?? "backend/.sync-data");
const SNAPSHOT_DIR = path.join(DATA_ROOT, "snapshots");
const UPDATES_DIR = path.join(DATA_ROOT, "updates");

const rooms = new Map();

function socketKey(roomKey, userName) {
  return `${roomKey}:${userName}:${Math.random().toString(36).slice(2, 8)}`;
}

function roomStorageKey(roomKey) {
  return Buffer.from(roomKey, "utf8").toString("base64url");
}

function roomPaths(roomKey) {
  const key = roomStorageKey(roomKey);
  return {
    snapshot: path.join(SNAPSHOT_DIR, `${key}.json`),
    updates: path.join(UPDATES_DIR, `${key}.ndjson`)
  };
}

async function ensureStorage() {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  await fs.mkdir(UPDATES_DIR, { recursive: true });
}

function toWebSocketAcceptKey(key) {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function writeFrame(socket, payload, opcode = 0x1) {
  const bytes = Buffer.from(payload);
  const header = [];
  header.push(0x80 | opcode);

  if (bytes.length <= 125) {
    header.push(bytes.length);
  } else if (bytes.length <= 0xffff) {
    header.push(126, (bytes.length >> 8) & 0xff, bytes.length & 0xff);
  } else {
    const lengthBuffer = Buffer.allocUnsafe(8);
    lengthBuffer.writeBigUInt64BE(BigInt(bytes.length), 0);
    header.push(127, ...lengthBuffer);
  }

  socket.write(Buffer.concat([Buffer.from(header), bytes]));
}

function sendJson(client, payload) {
  writeFrame(client.socket, JSON.stringify(payload));
}

function parseFrames(buffer) {
  const messages = [];
  const pings = [];
  let offset = 0;
  let shouldClose = false;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        shouldClose = true;
        break;
      }
      payloadLength = Number(bigLength);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const totalLength = headerLength + maskLength + payloadLength;
    if (offset + totalLength > buffer.length) break;

    const payloadStart = offset + headerLength;
    let payload = buffer.subarray(payloadStart + maskLength, payloadStart + maskLength + payloadLength);

    if (masked) {
      const mask = buffer.subarray(payloadStart, payloadStart + 4);
      const unmasked = Buffer.allocUnsafe(payloadLength);
      for (let index = 0; index < payloadLength; index += 1) {
        unmasked[index] = payload[index] ^ mask[index % 4];
      }
      payload = unmasked;
    }

    if (opcode === 0x8) {
      shouldClose = true;
      offset += totalLength;
      break;
    }

    if (opcode === 0x9) {
      pings.push(payload);
    } else if (opcode === 0x1) {
      messages.push(payload.toString("utf8"));
    }

    offset += totalLength;
  }

  return {
    messages,
    pings,
    shouldClose,
    remaining: buffer.subarray(offset)
  };
}

function roomParticipantCount(roomKey) {
  const room = rooms.get(roomKey);
  return room ? room.clients.size : 0;
}

function queuePersistence(room, task) {
  room.persistChain = room.persistChain
    .then(task)
    .catch((error) => {
      console.error(`[sync] persistence failed for room=${room.roomKey}`, error);
    });
  return room.persistChain;
}

async function loadPersistedState(roomKey) {
  await ensureStorage();
  const paths = roomPaths(roomKey);
  const state = {
    snapshot: null,
    persistedUpdates: 0
  };

  try {
    const snapshotRaw = await fs.readFile(paths.snapshot, "utf8");
    state.snapshot = JSON.parse(snapshotRaw);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`[sync] failed to load snapshot for ${roomKey}`, error);
    }
  }

  try {
    const updatesRaw = await fs.readFile(paths.updates, "utf8");
    if (updatesRaw.trim().length > 0) {
      state.persistedUpdates = updatesRaw.trim().split("\n").length;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`[sync] failed to load update log for ${roomKey}`, error);
    }
  }

  return state;
}

function persistUpdate(room, update) {
  const paths = roomPaths(room.roomKey);
  return queuePersistence(room, async () => {
    await ensureStorage();
    await fs.appendFile(paths.updates, `${JSON.stringify(update)}\n`, "utf8");
    room.persistedUpdates += 1;
  });
}

function persistSnapshot(room, snapshot) {
  const paths = roomPaths(room.roomKey);
  return queuePersistence(room, async () => {
    await ensureStorage();
    await fs.writeFile(paths.snapshot, JSON.stringify(snapshot, null, 2), "utf8");
  });
}

async function flushSession(room) {
  if (!room.sessionId || !room.documentId || !room.proposalId) {
    return;
  }
  if (!room.snapshot?.content) {
    return;
  }
  const payload = {
    sessionId: room.sessionId,
    documentId: room.documentId,
    proposalId: room.proposalId,
    actor: room.lastActor ?? "Sync Gateway",
    updateCount: room.sessionUpdateCount,
    startedAt: room.sessionStartedAt,
    endedAt: new Date().toISOString(),
    snapshot: {
      ...room.snapshot.content,
      ...(room.snapshot.doc ? { doc: room.snapshot.doc } : {})
    }
  };
  const endpoint = `${API_BASE_URL.replace(/\/$/, "")}/api/internal/sync/session-ended`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chronicle-sync-token": SYNC_INTERNAL_TOKEN
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[sync] session flush failed status=${response.status} room=${room.roomKey} body=${body}`);
    }
  } catch (error) {
    console.error(`[sync] session flush request failed room=${room.roomKey}`, error);
  }
}

function removeClient(client) {
  const room = rooms.get(client.roomKey);
  if (!room) {
    return;
  }
  room.clients.delete(client);
  if (room.clients.size === 0) {
    rooms.delete(client.roomKey);
    void room.persistChain.then(() => flushSession(room));
    return;
  }
  for (const peer of room.clients) {
    sendJson(peer, {
      type: "presence",
      action: "left",
      participants: room.clients.size,
      userName: client.userName
    });
  }
}

function handleDocumentUpdate(room, client, payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const content = payload.content;
  if (!content || typeof content !== "object") {
    return;
  }

  // Preserve canonical ProseMirror doc when provided
  const doc = payload.doc && typeof payload.doc === "object" ? payload.doc : undefined;

  const now = new Date().toISOString();
  const update = {
    id: randomUUID(),
    type: "doc_update",
    room: room.roomKey,
    actor: client.userName,
    at: now,
    content,
    ...(doc ? { doc } : {})
  };

  room.lastActor = client.userName;
  room.sessionUpdateCount += 1;
  room.snapshot = {
    content,
    ...(doc ? { doc } : {}),
    actor: client.userName,
    updatedAt: now
  };

  void persistUpdate(room, update);
  void persistSnapshot(room, room.snapshot);

  for (const peer of room.clients) {
    sendJson(peer, {
      type: "document_update",
      actor: client.userName,
      content,
      ...(doc ? { doc } : {}),
      at: now
    });
  }
}

function broadcastMessage(room, client, message) {
  if (message?.type === "doc_update") {
    handleDocumentUpdate(room, client, message);
    return;
  }

  const payload = {
    type: "message",
    from: client.userName,
    payload: message,
    receivedAt: new Date().toISOString()
  };
  for (const peer of room.clients) {
    sendJson(peer, payload);
  }
}

async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/api/health`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    return response.ok;
  } catch (error) {
    console.error(`[sync] API health check failed: ${error.message}`);
    return false;
  }
}

const server = createServer(async (req, res) => {
  // Basic health check - lightweight, returns immediately
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, service: "sync", rooms: rooms.size }));
    return;
  }

  // Readiness check - verifies API connectivity
  if (req.url === "/ready") {
    const apiHealthy = await checkAPIHealth();
    const status = apiHealthy ? "ready" : "not_ready";
    const statusCode = apiHealthy ? 200 : 503;

    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({
      ok: apiHealthy,
      status,
      service: "sync",
      checks: {
        api: { status: apiHealthy ? "ok" : "error" },
        rooms: { status: "ok", count: rooms.size }
      }
    }));
    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.on("upgrade", async (req, socket) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token");
  const documentId = url.searchParams.get("documentId");
  const branchId = url.searchParams.get("branchId");
  const key = req.headers["sec-websocket-key"];

  if (!token || !documentId || !branchId || typeof key !== "string") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const session = verifyAuthToken(token);
  if (!session) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const acceptKey = toWebSocketAcceptKey(key);
  const handshakeHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`
  ];

  socket.write(`${handshakeHeaders.join("\r\n")}\r\n\r\n`);

  const roomKey = `${documentId}:${branchId}`;
  let room = rooms.get(roomKey);
  if (!room) {
    const persisted = await loadPersistedState(roomKey);
    room = {
      roomKey,
      documentId,
      proposalId: branchId,
      clients: new Set(),
      snapshot: persisted.snapshot,
      persistedUpdates: persisted.persistedUpdates,
      persistChain: Promise.resolve(),
      sessionId: randomUUID(),
      sessionStartedAt: new Date().toISOString(),
      sessionUpdateCount: 0,
      lastActor: null
    };
    rooms.set(roomKey, room);
  }

  const client = {
    id: socketKey(roomKey, session.userName),
    roomKey,
    userName: session.userName,
    socket,
    buffer: Buffer.alloc(0)
  };

  room.clients.add(client);

  sendJson(client, {
    type: "connected",
    room: roomKey,
    participants: roomParticipantCount(roomKey),
    userName: session.userName,
    persistedUpdates: room.persistedUpdates
  });

  if (room.snapshot) {
    sendJson(client, {
      type: "snapshot",
      snapshot: room.snapshot
    });
  }

  for (const peer of room.clients) {
    if (peer.id === client.id) {
      continue;
    }
    sendJson(peer, {
      type: "presence",
      action: "joined",
      participants: room.clients.size,
      userName: session.userName
    });
  }

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    const parsed = parseFrames(client.buffer);
    client.buffer = parsed.remaining;

    for (const pingPayload of parsed.pings) {
      writeFrame(socket, pingPayload, 0x0a);
    }

    for (const raw of parsed.messages) {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { text: raw };
      }
      broadcastMessage(room, client, payload);
    }

    if (parsed.shouldClose) {
      socket.end();
    }
  });

  socket.on("close", () => {
    removeClient(client);
  });
  socket.on("end", () => {
    removeClient(client);
  });
  socket.on("error", () => {
    removeClient(client);
  });
});

server.listen(PORT, () => {
  console.log(`Chronicle sync gateway listening on ws://localhost:${PORT}/ws`);
});
