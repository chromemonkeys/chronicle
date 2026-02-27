export type DocumentStatus = "Draft" | "In review" | "Ready for approval" | "Approved";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
};

export type Space = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  documentCount: number;
};

export type WorkspacesResponse = {
  workspace: Workspace;
  spaces: Space[];
};

export type DocumentSummary = {
  id: string;
  title: string;
  status: DocumentStatus;
  updatedBy: string;
  openThreads: number;
  spaceId: string;
};

export type MergeGateStatus = "Approved" | "Pending";
export type MergeGateRole = "security" | "architectureCommittee" | "legal";

export type ApprovalQueueStatus = "Blocked" | "Ready";

export type MergeGate = {
  security: MergeGateStatus;
  architectureCommittee: MergeGateStatus;
  legal: MergeGateStatus;
};

export type ApprovalDetail = {
  status: MergeGateStatus;
  approvedBy: string | null;
  approvedAt: string | null;
};

export type ApprovalStage = {
  id: string;
  mode: "parallel" | "sequential";
  roles: MergeGateRole[];
  dependsOn?: string;
};

export type ApprovalQueueItem = {
  id: string;
  documentId: string;
  proposalId: string;
  title: string;
  requestedBy: string;
  status: ApprovalQueueStatus;
};

export type ApprovalsResponse = {
  mergeGate: MergeGate;
  queue: ApprovalQueueItem[];
};

export type WorkspaceDocument = {
  id: string;
  title: string;
  subtitle: string;
  status: DocumentStatus;
  version: string;
  editedBy: string;
  editedAt: string;
  branch: string;
  proposalId: string | null;
};

export type WorkspaceContent = {
  title: string;
  subtitle: string;
  purpose: string;
  tiers: string;
  enforce: string;
};

export type { DocumentContent } from "../editor/schema";

export type WorkspaceThreadReply = {
  initials: string;
  author: string;
  time: string;
  text: string;
  type?: string;
  tone: "green" | "red" | "blue" | "purple" | "amber";
};

export type WorkspaceThreadReaction = {
  emoji: string;
  count: number;
};

export type ThreadAnchorOffsets = {
  start?: number;
  end?: number;
  quote?: string;
};

export type WorkspaceThread = {
  id: string;
  initials: string;
  author: string;
  time: string;
  anchor: string;
  anchorNodeId?: string;
  anchorOffsets?: ThreadAnchorOffsets;
  text: string;
  quote?: string;
  votes: number;
  voted?: boolean;
  status?: "OPEN" | "RESOLVED" | "ORPHANED";
  type?: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
  visibility?: "INTERNAL" | "EXTERNAL";
  resolvedOutcome?: "ACCEPTED" | "REJECTED" | "DEFERRED";
  resolvedNote?: string;
  reactions?: WorkspaceThreadReaction[];
  tone: "green" | "red" | "blue" | "purple" | "amber";
  replies: WorkspaceThreadReply[];
};

export type WorkspaceHistoryItem = {
  hash: string;
  message: string;
  meta: string;
  branch?: string;
};

export type WorkspaceDecisionItem = {
  date: string;
  tags: Array<{
    label: string;
    tone: "approved" | "rejected" | "deferred" | "blue";
  }>;
  text: string;
  by: string;
};

export type WorkspacePayload = {
  document: WorkspaceDocument;
  content: WorkspaceContent;
  doc?: import("../editor/schema").DocumentContent;
  nodeIds?: Record<string, string>;
  counts: {
    allDocuments: number;
    openReviews: number;
    merged: number;
  };
  approvals: MergeGate;
  approvalDetails?: Record<MergeGateRole, ApprovalDetail>;
  approvalStages?: ApprovalStage[];
  threads: WorkspaceThread[];
  history: WorkspaceHistoryItem[];
  decisions: WorkspaceDecisionItem[];
  workspaceName?: string;
  space?: { id: string; name: string };
};

export type NamedVersion = {
  name: string;
  hash: string;
  createdBy: string;
  createdAt: string;
};

export type DocumentHistoryPayload = {
  documentId: string;
  proposalId: string | null;
  branch: string;
  commits: WorkspaceHistoryItem[];
  namedVersions: NamedVersion[];
};

export type CompareField = {
  field: keyof WorkspaceContent | "doc";
  before: string;
  after: string;
};

export type CompareContentSnapshot = WorkspaceContent & {
  doc?: import("../editor/schema").DocumentContent;
};

export type DocumentComparePayload = {
  from: string;
  to: string;
  changedFields: CompareField[];
  changes?: Array<{
    id: string;
    type: "inserted" | "deleted" | "modified" | "moved" | "format_only";
    fromRef: string;
    toRef: string;
    anchor: {
      nodeId: string;
      fromOffset: number;
      toOffset: number;
    };
    context: {
      before: string;
      after: string;
    };
    snippet: string;
    author: {
      id: string;
      name: string;
    };
    editedAt: string;
    reviewState: "pending" | "accepted" | "rejected" | "deferred";
    threadIds: string[];
    blockers: string[];
  }>;
  fromContent?: CompareContentSnapshot;
  toContent?: CompareContentSnapshot;
};

export type DecisionLogEntry = {
  id: number;
  threadId: string;
  proposalId: string | null;
  outcome: "ACCEPTED" | "REJECTED" | "DEFERRED";
  rationale: string;
  decidedBy: string;
  decidedAt: string;
  commitHash: string;
  participants: string[];
};

export type DecisionLogResponse = {
  documentId: string;
  items: DecisionLogEntry[];
};

export type SyncEvent =
  | {
      type: "connected";
      room: string;
      participants: number;
      userName: string;
      persistedUpdates?: number;
    }
  | {
      type: "presence";
      action: "joined" | "left";
      participants: number;
      userName: string;
    }
  | {
      type: "snapshot";
      snapshot: {
        content: WorkspaceContent;
        doc?: import("../editor/schema").DocumentContent;
        actor?: string;
        updatedAt?: string;
      };
    }
  | {
      type: "document_update";
      actor: string;
      at: string;
      content: WorkspaceContent;
      doc?: import("../editor/schema").DocumentContent;
    }
  | {
      type: "message";
      from: string;
      payload: unknown;
      receivedAt: string;
    };
