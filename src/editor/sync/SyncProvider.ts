/**
 * Interface for Yjs provider abstraction.
 * Lane E integration = swap LocalSyncProvider for a WebSocket/WebRTC provider.
 */
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";

export interface SyncProvider {
  /** Connect to a document room */
  connect(docId: string): void;

  /** Disconnect from current room */
  disconnect(): void;

  /** Get the Y.Doc instance */
  getDoc(): Y.Doc;

  /** Get the awareness protocol instance */
  getAwareness(): Awareness;

  /** Whether the provider is currently connected */
  readonly isConnected: boolean;

  /** Clean up resources */
  destroy(): void;
}
