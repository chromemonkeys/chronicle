import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import { verifyAuthToken } from "./auth-token.mjs";

const PORT = Number(process.env.SYNC_PORT ?? 8788);
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8787";
const SYNC_INTERNAL_TOKEN = process.env.CHRONICLE_SYNC_TOKEN ?? "chronicle-sync-dev-token";
const DATA_ROOT = path.resolve(process.cwd(), process.env.SYNC_DATA_DIR ?? "backend/.sync-data");
const YJS_STATE_DIR = path.join(DATA_ROOT, "yjs-state");

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

const PERSIST_INTERVAL_MS = 5_000;

const rooms = new Map();

// ---------------------------------------------------------------------------
// Y.Doc → ProseMirror JSON conversion (server-side, no DOM needed)
// ---------------------------------------------------------------------------

function yDocToJSON(ydoc) {
  const fragment = ydoc.getXmlFragment("prosemirror");
  if (fragment.length === 0) return null;

  const content = [];
  fragment.forEach((child) => {
    if (child instanceof Y.XmlText) {
      content.push(...yTextToNodes(child));
    } else {
      content.push(yXmlToJSON(child));
    }
  });

  return { type: "doc", content };
}

function yXmlToJSON(element) {
  const result = { type: element.nodeName };

  const attrs = element.getAttributes();
  if (Object.keys(attrs).length > 0) {
    result.attrs = {};
    for (const [key, value] of Object.entries(attrs)) {
      result.attrs[key] = value;
    }
  }

  const content = [];
  element.forEach((child) => {
    if (child instanceof Y.XmlText) {
      content.push(...yTextToNodes(child));
    } else {
      content.push(yXmlToJSON(child));
    }
  });

  if (content.length > 0) {
    result.content = content;
  }

  return result;
}

function yTextToNodes(xmlText) {
  const delta = xmlText.toDelta();
  return delta
    .filter((op) => typeof op.insert === "string" && op.insert.length > 0)
    .map((op) => {
      const node = { type: "text", text: op.insert };
      if (op.attributes && Object.keys(op.attributes).length > 0) {
        node.marks = Object.entries(op.attributes).map(([type, attrs]) => {
          const mark = { type };
          if (
            typeof attrs === "object" &&
            attrs !== null &&
            Object.keys(attrs).length > 0
          ) {
            mark.attrs = attrs;
          }
          return mark;
        });
      }
      return node;
    });
}

// ---------------------------------------------------------------------------
// ProseMirror JSON → legacy flat-string content (mirrors schema.ts)
// ---------------------------------------------------------------------------

function extractText(node) {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}

function docToLegacyContent(doc) {
  const result = { title: "", subtitle: "", purpose: "", tiers: "", enforce: "" };
  if (!doc || !doc.content) return result;

  const nodes = doc.content;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const text = extractText(node);

    if (node.type === "heading" && node.attrs?.level === 1) {
      result.title = text;
      continue;
    }

    if (node.type === "paragraph" && result.title && !result.subtitle && !result.purpose) {
      result.subtitle = text;
      continue;
    }

    if (node.type === "heading") {
      const headingText = text.toLowerCase();
      const next = nodes[i + 1];
      if (next && next.type === "paragraph") {
        const nextText = extractText(next);
        if (headingText.includes("purpose")) { result.purpose = nextText; i++; }
        else if (headingText.includes("tier")) { result.tiers = nextText; i++; }
        else if (headingText.includes("enforce")) { result.enforce = nextText; i++; }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// WebSocket frame helpers (raw WebSocket protocol)
// ---------------------------------------------------------------------------

function socketKey(roomKey, userName) {
  return `${roomKey}:${userName}:${Math.random().toString(36).slice(2, 8)}`;
}

function roomStorageKey(roomKey) {
  return Buffer.from(roomKey, "utf8").toString("base64url");
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

function sendBinary(client, data) {
  writeFrame(client.socket, data, 0x02);
}

function parseFrames(buffer) {
  const messages = [];
  const binaryMessages = [];
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
    } else if (opcode === 0x2) {
      binaryMessages.push(payload);
    }

    offset += totalLength;
  }

  return {
    messages,
    binaryMessages,
    pings,
    shouldClose,
    remaining: buffer.subarray(offset)
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function ensureStorage() {
  await fs.mkdir(YJS_STATE_DIR, { recursive: true });
}

function yjsStatePath(roomKey) {
  return path.join(YJS_STATE_DIR, `${roomStorageKey(roomKey)}.bin`);
}

async function loadYjsState(roomKey) {
  try {
    const data = await fs.readFile(yjsStatePath(roomKey));
    return new Uint8Array(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`[sync] failed to load Yjs state for ${roomKey}`, error);
    }
    return null;
  }
}

async function persistYjsState(room) {
  try {
    await ensureStorage();
    const state = Y.encodeStateAsUpdate(room.ydoc);
    await fs.writeFile(yjsStatePath(room.roomKey), Buffer.from(state));
  } catch (error) {
    console.error(`[sync] failed to persist Yjs state for room=${room.roomKey}`, error);
  }
}

// Periodic persistence for dirty rooms
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.dirty) {
      room.dirty = false;
      void persistYjsState(room);
    }
  }
}, PERSIST_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------------

function roomParticipantNames(room) {
  const seen = new Set();
  const names = [];
  for (const c of room.clients) {
    if (!seen.has(c.userName)) {
      seen.add(c.userName);
      names.push(c.userName);
    }
  }
  return names;
}

function createRoom(roomKey, documentId, branchId, initialState) {
  const ydoc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(ydoc);

  // Load persisted state if available
  if (initialState) {
    Y.applyUpdate(ydoc, initialState);
  }

  const room = {
    roomKey,
    documentId,
    proposalId: branchId,
    ydoc,
    awareness,
    clients: new Set(),
    sessionId: randomUUID(),
    sessionStartedAt: new Date().toISOString(),
    sessionUpdateCount: 0,
    lastActor: null,
    cleanupScheduled: false,
    dirty: false,
  };

  // Broadcast Y.Doc updates to peers (excluding origin)
  ydoc.on("update", (update, origin) => {
    if (origin && origin.userName) {
      room.lastActor = origin.userName;
    }
    room.sessionUpdateCount++;
    room.dirty = true;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    for (const client of room.clients) {
      if (client !== origin) {
        sendBinary(client, message);
      }
    }
  });

  // Broadcast awareness changes to peers (excluding origin)
  awareness.on("update", ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated).concat(removed);
    if (changedClients.length === 0) return;

    // Track which awareness IDs belong to which connection
    if (origin && origin.awarenessClientIds) {
      for (const id of added.concat(updated)) {
        origin.awarenessClientIds.add(id);
      }
      for (const id of removed) {
        origin.awarenessClientIds.delete(id);
      }
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);

    for (const client of room.clients) {
      if (client !== origin) {
        sendBinary(client, message);
      }
    }
  });

  return room;
}

// ---------------------------------------------------------------------------
// Session flush (Y.Doc → JSON → Go API)
// ---------------------------------------------------------------------------

async function flushSession(room) {
  if (!room.sessionId || !room.documentId || !room.proposalId) return;
  if (room.sessionUpdateCount === 0) return;

  const doc = yDocToJSON(room.ydoc);
  if (!doc || !doc.content || doc.content.length === 0) return;

  const legacyContent = docToLegacyContent(doc);

  const payload = {
    sessionId: room.sessionId,
    documentId: room.documentId,
    proposalId: room.proposalId,
    actor: room.lastActor ?? "Sync Gateway",
    updateCount: room.sessionUpdateCount,
    startedAt: room.sessionStartedAt,
    endedAt: new Date().toISOString(),
    snapshot: {
      ...legacyContent,
      doc,
    },
  };

  const endpoint = `${API_BASE_URL.replace(/\/$/, "")}/api/internal/sync/session-ended`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-chronicle-sync-token": SYNC_INTERNAL_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[sync] session flush failed status=${response.status} room=${room.roomKey} body=${body}`);
    }
  } catch (error) {
    console.error(`[sync] session flush request failed room=${room.roomKey}`, error);
  }
}

// ---------------------------------------------------------------------------
// Client lifecycle
// ---------------------------------------------------------------------------

function removeClient(client) {
  const room = rooms.get(client.roomKey);
  if (!room) return;

  room.clients.delete(client);

  // Remove awareness states controlled by this connection
  if (client.awarenessClientIds.size > 0) {
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      [...client.awarenessClientIds],
      null
    );
  }

  if (room.clients.size === 0) {
    if (room.cleanupScheduled) return;
    room.cleanupScheduled = true;

    void (async () => {
      try {
        await persistYjsState(room);
        await flushSession(room);
      } finally {
        room.cleanupScheduled = false;
        if (room.clients.size === 0 && rooms.get(client.roomKey) === room) {
          room.awareness.destroy();
          room.ydoc.destroy();
          rooms.delete(client.roomKey);
        }
      }
    })();
    return;
  }

}

function handleBinaryMessage(room, client, data) {
  const decoder = decoding.createDecoder(new Uint8Array(data));
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MSG_SYNC: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, room.ydoc, client);
      if (encoding.length(encoder) > 1) {
        sendBinary(client, encoding.toUint8Array(encoder));
      }
      break;
    }
    case MSG_AWARENESS: {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(room.awareness, update, client);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/api/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch (error) {
    console.error(`[sync] API health check failed: ${error.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, service: "sync", rooms: rooms.size }));
    return;
  }

  if (req.url === "/ready") {
    const apiHealthy = await checkAPIHealth();
    const statusCode = apiHealthy ? 200 : 503;
    res.writeHead(statusCode, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(
      JSON.stringify({
        ok: apiHealthy,
        status: apiHealthy ? "ready" : "not_ready",
        service: "sync",
        checks: {
          api: { status: apiHealthy ? "ok" : "error" },
          rooms: { status: "ok", count: rooms.size },
        },
      })
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
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
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
    ].join("\r\n") + "\r\n\r\n"
  );

  const roomKey = `${documentId}:${branchId}`;
  let room = rooms.get(roomKey);
  if (!room) {
    await ensureStorage();
    const persistedState = await loadYjsState(roomKey);
    room = createRoom(roomKey, documentId, branchId, persistedState);
    rooms.set(roomKey, room);
  }

  const client = {
    id: socketKey(roomKey, session.userName),
    roomKey,
    userName: session.userName,
    socket,
    buffer: Buffer.alloc(0),
    awarenessClientIds: new Set(),
  };

  room.clients.add(client);

  // Send Yjs sync step 1 (server's state vector → client sends missing updates)
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, room.ydoc);
    sendBinary(client, encoding.toUint8Array(encoder));
  }

  // Also send sync step 2 (full server state → client applies missing data)
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep2(encoder, room.ydoc);
    sendBinary(client, encoding.toUint8Array(encoder));
  }

  // Send current awareness states so new client sees existing users
  if (room.awareness.getStates().size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        [...room.awareness.getStates().keys()]
      )
    );
    sendBinary(client, encoding.toUint8Array(encoder));
  }

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    const parsed = parseFrames(client.buffer);
    client.buffer = parsed.remaining;

    for (const pingPayload of parsed.pings) {
      writeFrame(socket, pingPayload, 0x0a);
    }

    // Handle binary messages (Yjs sync/awareness protocol)
    for (const binaryData of parsed.binaryMessages) {
      handleBinaryMessage(room, client, binaryData);
    }

    // Handle text messages (legacy JSON — ignored for now)
    for (const raw of parsed.messages) {
      // JSON messages are no longer used for document sync.
      // Keep ping/pong and ignore doc_update messages.
      void raw;
    }

    if (parsed.shouldClose) {
      socket.end();
    }
  });

  socket.on("close", () => removeClient(client));
  socket.on("end", () => removeClient(client));
  socket.on("error", () => removeClient(client));
});

server.listen(PORT, () => {
  console.log(`Chronicle sync gateway listening on ws://localhost:${PORT}/ws`);
});
