/**
 * Yjs WebSocket sync provider for Chronicle.
 * Connects an *existing* Y.Doc + Awareness to the Chronicle sync gateway
 * using the standard Yjs sync protocol (y-protocols/sync + y-protocols/awareness).
 *
 * The caller owns the Y.Doc and Awareness lifecycles — this provider only
 * manages the WebSocket connection and protocol messages.
 */
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export class WebSocketSyncProvider {
  private doc: Y.Doc;
  private awareness: Awareness;
  private ws: WebSocket | null = null;
  private _connected = false;
  private url: string;
  private onStatusChange?: (status: ConnectionStatus) => void;
  private onJsonMessage?: (data: unknown) => void;
  private updateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessHandler: (changes: { added: number[]; updated: number[]; removed: number[] }) => void;

  constructor(
    url: string,
    doc: Y.Doc,
    awareness: Awareness,
    options?: {
      onStatusChange?: (status: ConnectionStatus) => void;
      onJsonMessage?: (data: unknown) => void;
    }
  ) {
    this.url = url;
    this.doc = doc;
    this.awareness = awareness;
    this.onStatusChange = options?.onStatusChange;
    this.onJsonMessage = options?.onJsonMessage;

    // Send local Y.Doc updates to server
    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === this) return; // Don't echo server updates back
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.ws.send(encoding.toUint8Array(encoder));
    };
    this.doc.on("update", this.updateHandler);

    // Send local awareness changes to server
    this.awarenessHandler = ({ added, updated, removed }) => {
      const changedClients = added.concat(updated).concat(removed);
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      this.ws.send(encoding.toUint8Array(encoder));
    };
    this.awareness.on("update", this.awarenessHandler);
  }

  connect(): void {
    if (this.ws) return;

    this.onStatusChange?.("connecting");

    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this._connected = true;
      this.onStatusChange?.("connected");

      // Send sync step 1 (our state vector → server responds with missing updates)
      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(syncEncoder, this.doc);
      ws.send(encoding.toUint8Array(syncEncoder));

      // Send our awareness state
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
      );
      ws.send(encoding.toUint8Array(awarenessEncoder));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const parsed = JSON.parse(event.data);
          this.onJsonMessage?.(parsed);
        } catch {
          // ignore malformed JSON
        }
        return;
      }

      const data = new Uint8Array(event.data as ArrayBuffer);
      this.handleBinaryMessage(data);
    };

    ws.onclose = () => {
      this._connected = false;
      this.ws = null;
      this.onStatusChange?.("disconnected");
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    this.ws = ws;
  }

  private handleBinaryMessage(data: Uint8Array) {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
        if (encoding.length(encoder) > 1) {
          this.ws?.send(encoding.toUint8Array(encoder));
        }
        break;
      }
      case MSG_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
        break;
      }
    }
  }

  get isConnected(): boolean {
    return this._connected;
  }

  destroy(): void {
    this.doc.off("update", this.updateHandler);
    this.awareness.off("update", this.awarenessHandler);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
