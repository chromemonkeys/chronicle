/**
 * Local-only Yjs provider stub (no network).
 * Creates a Y.Doc and initializes from ProseMirror JSON content.
 * Lane E integration = replace this with a WebSocket provider.
 */
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { SyncProvider } from "./SyncProvider";

export class LocalSyncProvider implements SyncProvider {
  private doc: Y.Doc;
  private awareness: Awareness;
  private connected = false;

  constructor(userName = "Local User") {
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalStateField("user", {
      name: userName,
      color: "#c4622d",
    });
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
    this.disconnect();
    this.awareness.destroy();
    this.doc.destroy();
  }
}
