/**
 * Awareness-over-WebSocket provider.
 * Layers Yjs awareness (binary frames) on top of the existing
 * JSON-based document sync WebSocket connection.
 */
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import type { SyncProvider } from "./SyncProvider";

export class WebSocketSyncProvider implements SyncProvider {
  private doc: Y.Doc;
  private awareness: Awareness;
  private socket: WebSocket | null = null;
  private originalOnMessage: ((ev: MessageEvent) => void) | null = null;
  private connected = false;

  constructor(userName: string, color: string) {
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField("user", { name: userName, color });

    // Only broadcast LOCAL awareness changes to peers.
    // Remote changes must NOT be re-broadcast (echo), otherwise
    // stale clientIDs leak back to the original sender.
    this.awareness.on("update", (
      { added, updated, removed }: {
        added: number[];
        updated: number[];
        removed: number[];
      },
      origin: string,
    ) => {
      if (origin !== "local") return;
      const changedClients = added.concat(updated, removed);
      if (changedClients.length === 0) return;
      const encoded = encodeAwarenessUpdate(this.awareness, changedClients);
      this.sendBinary(encoded);
    });
  }

  /**
   * Attach to an already-open (or opening) WebSocket.
   * Intercepts binary frames for awareness while forwarding text frames
   * to the original handler.
   */
  attachSocket(socket: WebSocket): void {
    this.socket = socket;
    socket.binaryType = "arraybuffer";

    // Preserve the existing onmessage handler (JSON doc sync)
    this.originalOnMessage = socket.onmessage as ((ev: MessageEvent) => void) | null;

    socket.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) {
        // Binary frame → awareness update from a remote peer
        const update = new Uint8Array(ev.data);
        applyAwarenessUpdate(this.awareness, update, "remote");
        return;
      }
      // Text frame → forward to original JSON handler
      this.originalOnMessage?.(ev);
    };

    this.connected = true;

    // Broadcast our initial awareness state so peers see us immediately
    const encoded = encodeAwarenessUpdate(this.awareness, [
      this.doc.clientID,
    ]);
    this.sendBinary(encoded);
  }

  /** Send binary data over the WebSocket. */
  private sendBinary(data: Uint8Array): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    }
  }

  /** Update local cursor position in awareness. */
  updateCursor(anchor: number, head: number): void {
    this.awareness.setLocalStateField("cursor", { anchor, head });
  }

  /** Clear the local cursor from awareness. */
  clearCursor(): void {
    this.awareness.setLocalStateField("cursor", null);
  }

  connect(_docId: string): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  getDoc(): Y.Doc {
    return this.doc;
  }

  getAwareness(): Awareness {
    return this.awareness;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  destroy(): void {
    this.clearCursor();
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    this.connected = false;
    this.socket = null;
    this.awareness.destroy();
    this.doc.destroy();
  }
}
