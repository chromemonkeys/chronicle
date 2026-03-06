import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthProvider";
import {
  approveProposalGroup,
  approveProposalRole,
  connectWorkspaceRealtime,
  createDocument,
  createProposal,
  deleteDocument,
  fetchOpenProposals,
  createProposalThread,
  fetchAdminUsers,
  fetchDocuments,
  fetchSpaceDocuments,
  fetchDecisionLog,
  fetchTrash,
  fetchWorkspaces,
  purgeDocument,
  rejectProposalGroup,
  restoreDocument,
  saveApprovalRules,
  sendWorkspaceRealtimeUpdate,
  fetchDocumentCompare,
  fetchDocumentHistory,
  fetchWorkspace,
  isApiError,
  mergeProposal,
  moveDocument,
  renameDocument,
  reactProposalThread,
  reopenProposalThread,
  replyProposalThread,
  requestProposalReview,
  resolveProposalThread,
  setProposalThreadVisibility,
  saveNamedVersion,
  saveWorkspace,
  voteProposalThread,
  updateChangeReviewState
} from "../api/client";
import type {
  AdminUser,
  CompareContentSnapshot,
  OpenProposalSummary,
  DecisionLogEntry,
  DocumentComparePayload,
  DocumentHistoryPayload,
  DocumentSummary,
  MergeGateRole,
  SaveApprovalRulesRequest,
  Space,
  TrashDocument,
  TreeItemData,
  WorkspaceContent,
  WorkspacePayload
} from "../api/types";
import { ApprovalChain } from "../ui/ApprovalChain";
import { ApprovalRulesEditor } from "../ui/ApprovalRulesEditor";
import { BranchGraph } from "../ui/BranchGraph";
// DecisionLogTable no longer used — decision log rendered inline with cm-dlog-* classes
import { DocumentTree } from "../ui/DocumentTree";
import { EmptyStateError, EmptyState } from "../ui/EmptyState";
import { Dialog } from "../ui/Dialog";
import { ShareDialog } from "../ui/ShareDialog";
import { SpacePermissions } from "../ui/SpacePermissions";
import { Tabs } from "../ui/Tabs";
import { ThreadComposer } from "../ui/ThreadComposer";
import { ThreadList } from "../ui/ThreadList";
import { ExportMenu } from "../components/ExportMenu";
import { PresenceBar } from "../editor/PresenceBar";
import { WebSocketSyncProvider } from "../editor/sync/WebSocketSyncProvider";
import { ChronicleEditor } from "../editor/ChronicleEditor";
import { DiffNavigator } from "../ui/DiffNavigator";
import { SideBySideDiff } from "../editor/SideBySideDiff";
import { UnifiedDiff } from "../editor/UnifiedDiff";
import { EditorToolbar } from "../editor/EditorToolbar";
import type { DocumentContent } from "../editor/schema";
import { docToLegacyContent, legacyContentToDoc } from "../editor/schema";
import { diffDocs } from "../editor/diff";
import type { DiffManifest } from "../editor/diff";
import type { Editor } from "@tiptap/react";
import {
  startReviewSession,
  endReviewSession,
  trackNavigatorChangeClick,
  trackChangeAction,
  trackMergeAttempt,
  trackMergeCompleted,
  trackMergeBlocked,
} from "../lib/metrics";

type PanelTab = "discussions" | "approvals" | "history" | "decisions" | "changes" | "branches";
type DiffMode = "split" | "unified";
type ViewState = "success" | "loading" | "empty" | "error";
type WorkspaceMode = "proposal" | "review" | "published";
type CompareOption = {
  hash: string;
  label: string;
};
type CompareChangeType = "inserted" | "deleted" | "modified" | "moved" | "format_only";
type CompareReviewState = "pending" | "accepted" | "rejected" | "deferred";
type CompareChangeRow = {
  id: string;
  type: CompareChangeType;
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
  reviewState: CompareReviewState;
  threadIds: string[];
  blockers: string[];
};
type MergeGateBlockerType = "approval" | "thread" | "change";
type MergeGateBlockerLink = {
  tab?: PanelTab;
  role?: string;
  threadId?: string;
  changeId?: string;
  nodeId?: string;
};
type MergeGateBlockerRow = {
  id: string;
  type: MergeGateBlockerType;
  label: string;
  role?: string;
  threadId?: string;
  changeId?: string;
  state?: string;
  link?: MergeGateBlockerLink;
};
type MergeGatePolicySnapshot = {
  allowMergeWithDeferredChanges: boolean;
  ignoreFormatOnlyChangesForGate: boolean;
};

const PRESENCE_COLORS = ["#4a7c5a","#7c4a6a","#4a5c7c","#7c6a4a","#5a4a7c","#4a7c7c","#7c4a4a","#6a7c4a"];
function userColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PRESENCE_COLORS[Math.abs(h) % PRESENCE_COLORS.length];
}

const panelTabs: { id: PanelTab; label: string; ariaLabel: string; icon: JSX.Element }[] = [
  {
    id: "discussions",
    label: "Discussion",
    ariaLabel: "Discussion",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M3 4.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.7L5 15.2v-2.7H5a2 2 0 0 1-2-2v-6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    id: "approvals",
    label: "Approvals",
    ariaLabel: "Required approvals",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M10 2.8 4.8 5v4.3c0 3.3 2 6.4 5.2 7.9 3.2-1.5 5.2-4.6 5.2-7.9V5L10 2.8Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="m7.7 9.9 1.6 1.6 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    id: "history",
    label: "History",
    ariaLabel: "History",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M10 4.2a5.8 5.8 0 1 1-4.1 1.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4.7 2.8v3.3H8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 6.7v3.4l2.3 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    id: "decisions",
    label: "Log",
    ariaLabel: "Log",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M5 3.5h7.5l2.5 2.5v10.5H5V3.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12.5 3.5V6h2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M7.5 9h5M7.5 11.8h5M7.5 14.6h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    id: "changes",
    label: "Changes",
    ariaLabel: "Changes",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M4 6h12M4 10h12M4 14h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15 12l2 2-2 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    id: "branches",
    label: "Branches",
    ariaLabel: "Branch timeline",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M7 4v12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 4v4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 8c0 2.5-2 4-6 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="13" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="16" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  },
];

function extractNodeText(node: DocumentContent["content"][number]): string {
  // Direct text node
  if (node.text) return node.text;
  
  // No content array
  if (!node.content || !Array.isArray(node.content)) return "";
  
  // Recursively extract text from all children
  const texts: string[] = [];
  for (const child of node.content) {
    const childText = extractNodeText(child);
    if (childText) texts.push(childText);
  }
  
  return texts.join("").trim();
}

function buildNodeLabelMap(doc: DocumentContent | null): Map<string, string> {
  const labels = new Map<string, string>();
  if (!doc) {
    return labels;
  }
  for (const node of doc.content) {
    const nodeId = typeof node.attrs?.nodeId === "string" ? node.attrs.nodeId : "";
    if (!nodeId) {
      continue;
    }
    const text = extractNodeText(node);
    if (node.type === "heading") {
      labels.set(nodeId, `¶ ${text || "Heading"}`);
      continue;
    }
    if (node.type === "paragraph") {
      labels.set(nodeId, `¶ ${text.slice(0, 48) || "Paragraph"}`);
      continue;
    }
    labels.set(nodeId, `¶ ${node.type}`);
  }
  return labels;
}

function parseRealtimeTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function compareTypeRank(type: CompareChangeType): number {
  switch (type) {
    case "moved":
      return 0;
    case "modified":
      return 1;
    case "inserted":
      return 2;
    case "deleted":
      return 3;
    case "format_only":
      return 4;
    default:
      return 5;
  }
}

function normalizeCompareChanges(payload: DocumentComparePayload): CompareChangeRow[] {
  if (Array.isArray(payload.changes) && payload.changes.length > 0) {
    return payload.changes.map((item) => ({
      ...item,
      type: item.type as CompareChangeType,
      reviewState: item.reviewState as CompareReviewState,
      threadIds: Array.isArray(item.threadIds) ? item.threadIds : [],
      blockers: Array.isArray(item.blockers) ? item.blockers : [],
    }));
  }
  if (!Array.isArray(payload.changedFields) || payload.changedFields.length === 0) {
    return [];
  }
  const authorName = "Unknown";
  const editedAt = new Date().toISOString();
  return payload.changedFields
    .map((field, index) => ({
      id: `chg_fallback_${index}_${field.field}`,
      type: (field.field === "doc" ? "modified" : "format_only") as CompareChangeType,
      fromRef: payload.from,
      toRef: payload.to,
      anchor: {
        nodeId: field.field === "doc" ? `doc-${index}` : `field-${field.field}`,
        fromOffset: 0,
        toOffset: 0,
      },
      context: {
        before: field.before,
        after: field.after,
      },
      snippet: field.field === "doc" ? "Document body changed" : `${field.field}: ${field.after}`,
      author: { id: "usr_unknown", name: authorName },
      editedAt,
      reviewState: "pending" as CompareReviewState,
      threadIds: [],
      blockers: [],
    }))
    .sort((a, b) => {
      if (a.anchor.nodeId !== b.anchor.nodeId) {
        return a.anchor.nodeId.localeCompare(b.anchor.nodeId);
      }
      return compareTypeRank(a.type) - compareTypeRank(b.type);
    });
}

function normalizeMergeGateBlockers(value: unknown): MergeGateBlockerRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: MergeGateBlockerRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const label = typeof row.label === "string" ? row.label : "";
    const typeRaw = typeof row.type === "string" ? row.type : "";
    if (!id || !label || (typeRaw !== "approval" && typeRaw !== "thread" && typeRaw !== "change")) {
      continue;
    }
    const linkRaw = row.link && typeof row.link === "object" ? (row.link as Record<string, unknown>) : null;
    rows.push({
      id,
      type: typeRaw,
      label,
      role: typeof row.role === "string" ? row.role : undefined,
      threadId: typeof row.threadId === "string" ? row.threadId : undefined,
      changeId: typeof row.changeId === "string" ? row.changeId : undefined,
      state: typeof row.state === "string" ? row.state : undefined,
      link: linkRaw
        ? {
            tab: linkRaw.tab === "approvals" || linkRaw.tab === "discussions" || linkRaw.tab === "history" || linkRaw.tab === "decisions"
              ? linkRaw.tab
              : undefined,
            role: typeof linkRaw.role === "string" ? linkRaw.role : undefined,
            threadId: typeof linkRaw.threadId === "string" ? linkRaw.threadId : undefined,
            changeId: typeof linkRaw.changeId === "string" ? linkRaw.changeId : undefined,
            nodeId: typeof linkRaw.nodeId === "string" ? linkRaw.nodeId : undefined,
          }
        : undefined,
    });
  }
  return rows;
}

export function WorkspacePage() {
  const { docId = "" } = useParams();
  const navigate = useNavigate();
  const { userId: currentUserId, userName, isAdmin } = useAuth();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaveStatus, setTitleSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [proposalPickerOpen, setProposalPickerOpen] = useState(false);
  const [existingProposals, setExistingProposals] = useState<OpenProposalSummary[]>([]);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>("discussions");
  const [activeThread, setActiveThread] = useState("");
  const [composerAnchorNodeId, setComposerAnchorNodeId] = useState<string | null>(null);
  const [diffVisible, setDiffVisible] = useState(false);
  const [diffMode, setDiffMode] = useState<DiffMode>("split");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("proposal");
  const [branchGraphExpanded, setBranchGraphExpanded] = useState(false);
  const [discussionState, setDiscussionState] = useState<ViewState>("success");
  const [approvalStateOverride, setApprovalStateOverride] = useState<ViewState | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalRefreshBusy, setApprovalRefreshBusy] = useState(false);
  const [showApprovalRules, setShowApprovalRules] = useState(false);
  const [workspaceUsers, setWorkspaceUsers] = useState<AdminUser[]>([]);
  const [approvalRulesSaving, setApprovalRulesSaving] = useState(false);
  const [approvingGroupId, setApprovingGroupId] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState<WorkspaceContent | null>(null);
  const [docDraft, setDocDraft] = useState<DocumentContent | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<DocumentHistoryPayload | null>(null);
  const [mainHistoryData, setMainHistoryData] = useState<DocumentHistoryPayload | null>(null);
  const [decisionRows, setDecisionRows] = useState<DecisionLogEntry[] | null>(null);
  const [documentIndex, setDocumentIndex] = useState<DocumentSummary[]>([]);
  const [documentIndexState, setDocumentIndexState] = useState<ViewState>("loading");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [decisionOutcomeFilter, setDecisionOutcomeFilter] = useState<"" | "ACCEPTED" | "REJECTED" | "DEFERRED">("");
  const [decisionQuery, setDecisionQuery] = useState("");
  const [decisionAuthor, setDecisionAuthor] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [compareSummary, setCompareSummary] = useState<string | null>(null);
  const [compareFromHash, setCompareFromHash] = useState("");
  const [compareToHash, setCompareToHash] = useState("");
  const [compareActive, setCompareActive] = useState(false);
  const [compareDoc, setCompareDoc] = useState<DocumentContent | null>(null);
  const [compareManifest, setCompareManifest] = useState<DiffManifest | null>(null);
  const [compareBeforeDoc, setCompareBeforeDoc] = useState<DocumentContent | null>(null);
  const [compareAfterDoc, setCompareAfterDoc] = useState<DocumentContent | null>(null);
  const [compareChanges, setCompareChanges] = useState<CompareChangeRow[]>([]);
  const [compareFilterType, setCompareFilterType] = useState<CompareChangeType | "all">("all");
  const [compareFilterAuthor, setCompareFilterAuthor] = useState("all");
  const [compareFilterState, setCompareFilterState] = useState<CompareReviewState | "all">("all");
  const [compareUnresolvedOnly, setCompareUnresolvedOnly] = useState(false);
  const [diffExpandedFullscreen, setDiffExpandedFullscreen] = useState(false);
  const [activeCompareChangeId, setActiveCompareChangeId] = useState<string>("");
  const [_mergeGateBlockers, setMergeGateBlockers] = useState<MergeGateBlockerRow[]>([]);
  const [mergeGatePolicy, setMergeGatePolicy] = useState<MergeGatePolicySnapshot | null>(null);
  const [approveBusyRole, setApproveBusyRole] = useState<MergeGateRole | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  // Trash state
  const [trashDocuments, setTrashDocuments] = useState<TrashDocument[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sidebarProposals, setSidebarProposals] = useState<OpenProposalSummary[]>([]);
  const [showTrashView, setShowTrashView] = useState(false);
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const syncProviderRef = useRef<WebSocketSyncProvider | null>(null);
  const [awarenessInstance, setAwarenessInstance] = useState<import("y-protocols/awareness").Awareness | null>(null);
  const realtimeSendTimerRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ anchor: number; head: number } | null>(null);
  const pendingRemoteCursorRef = useRef<{ actor: string; cursor: { anchor: number; head: number } } | null>(null);
  const latestRealtimeAtRef = useRef<number>(0);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [reviewDiff, setReviewDiff] = useState<DocumentComparePayload | null>(null);
  const [reviewDiffState, setReviewDiffState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => window.matchMedia("(max-width: 980px)").matches);
  const baseDocRef = useRef<DocumentContent | null>(null);
  const proposalPayloadRef = useRef<WorkspacePayload | null>(null);
  const [diffManifest, setDiffManifest] = useState<DiffManifest | null>(null);
  const proposalMode = workspaceMode === "proposal";
  // Derive current space from the loaded workspace
  const currentSpaceId = workspace?.space?.id ?? null;
  const currentSpaceName = workspace?.space?.name ?? null;
  const showDebugStateToggles = import.meta.env.DEV;
  const handleDiffModeChange = useCallback((mode: DiffMode) => {
    setDiffMode(mode);
    setDiffVisible(true);
    // Persist user preference
    try {
      localStorage.setItem("chronicle-diff-mode", mode);
    } catch {
      // Ignore storage errors
    }
  }, []);
  const applyWorkspacePayload = useCallback((payload: WorkspacePayload) => {
    setWorkspace(payload);
    setContentDraft(payload.content);
    setDocDraft(payload.doc ?? legacyContentToDoc(payload.content, payload.nodeIds));
    setMergeGateBlockers([]);
    setMergeGatePolicy(null);
    latestRealtimeAtRef.current = Date.now();
  }, []);

  // Lock body scroll when fullscreen diff is open
  useEffect(() => {
    if (diffExpandedFullscreen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [diffExpandedFullscreen]);

  useEffect(() => {
    let active = true;
    latestRealtimeAtRef.current = 0;
    setViewState("loading");
    setSaveState("idle");
    setSaveError(null);
    setActionError(null);
    setHistoryData(null);
    setMainHistoryData(null);
    setDecisionRows(null);
    setHistoryError(null);
    setCompareSummary(null);
    setCompareFromHash("");
    setCompareToHash("");
    setCompareActive(false);
    setCompareDoc(null);
    setCompareManifest(null);
    setCompareChanges([]);
    setCompareFilterType("all");
    setCompareFilterAuthor("all");
    setCompareFilterState("all");
    setCompareUnresolvedOnly(false);
    setActiveCompareChangeId("");
    setMergeGateBlockers([]);
    setMergeGatePolicy(null);
    setReviewDiff(null);
    setReviewDiffState("idle");
    setApproveBusyRole(null);
    setMergeBusy(false);
    setApprovalStateOverride(null);
    setApprovalError(null);
    setApprovalRefreshBusy(false);
    setRealtimeStatus("connecting");
    setOnlineUsers([]);
    setWorkspaceMode("proposal");
    fetchWorkspace(docId)
      .then((response) => {
        if (!active) {
          return;
        }
        applyWorkspacePayload(response);
        const initialDoc = response.doc ?? legacyContentToDoc(response.content, response.nodeIds);
        baseDocRef.current = initialDoc;
        if (response.threads.length > 0) {
          setActiveThread(response.threads[0].id);
          setComposerAnchorNodeId(response.threads[0].anchorNodeId ?? null);
        }
        setViewState("success");
      })
      .catch(() => {
        if (active) {
          setContentDraft(null);
          setViewState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [applyWorkspacePayload, docId]);

  const refreshDocumentIndex = useCallback(async (mode: "foreground" | "background" = "foreground", spaceId?: string) => {
    if (mode === "foreground") {
      setDocumentIndexState("loading");
    }
    try {
      const documents = spaceId ? await fetchSpaceDocuments(spaceId) : await fetchDocuments();
      setDocumentIndex(documents);
      setDocumentIndexState(documents.length === 0 ? "empty" : "success");
    } catch {
      if (mode === "foreground") {
        setDocumentIndex([]);
      }
      setDocumentIndexState("error");
    }
  }, []);

  useEffect(() => {
    if (viewState !== "success") return;
    void refreshDocumentIndex("foreground", currentSpaceId ?? undefined);
  }, [refreshDocumentIndex, currentSpaceId, viewState]);

  useEffect(() => {
    return () => {
      if (realtimeSendTimerRef.current) {
        window.clearTimeout(realtimeSendTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 980px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrowLayout(event.matches);
    };
    setIsNarrowLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  // Load persisted diff mode preference
  useEffect(() => {
    try {
      const persisted = localStorage.getItem("chronicle-diff-mode");
      if (persisted === "unified" || persisted === "split") {
        setDiffMode(persisted);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Ctrl+S / Cmd+S keyboard shortcut to save
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveDraftRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load workspace users when approval rules editor opens
  useEffect(() => {
    if (!showApprovalRules) return;
    let cancelled = false;
    fetchAdminUsers({ limit: 200 }).then((res) => {
      if (!cancelled) {
        setWorkspaceUsers(res.users);
      }
    }).catch(() => {
      // Silently fail — editor will show empty user list
    });
    return () => { cancelled = true; };
  }, [showApprovalRules]);

  const nodeLabelMap = useMemo(() => buildNodeLabelMap(docDraft), [docDraft]);
  const compareAuthorOptions = useMemo(() => {
    const options = new Set<string>();
    for (const change of compareChanges) {
      if (change.author.name) {
        options.add(change.author.name);
      }
    }
    return ["all", ...Array.from(options).sort((a, b) => a.localeCompare(b))];
  }, [compareChanges]);
  const filteredCompareChanges = useMemo(() => {
    return compareChanges.filter((change) => {
      if (compareFilterType !== "all" && change.type !== compareFilterType) {
        return false;
      }
      if (compareFilterAuthor !== "all" && change.author.name !== compareFilterAuthor) {
        return false;
      }
      if (compareFilterState !== "all" && change.reviewState !== compareFilterState) {
        return false;
      }
      if (!compareUnresolvedOnly) {
        return true;
      }
      return (
        change.reviewState === "pending" ||
        change.reviewState === "deferred" ||
        change.threadIds.length > 0 ||
        change.blockers.length > 0
      );
    });
  }, [compareChanges, compareFilterAuthor, compareFilterState, compareFilterType, compareUnresolvedOnly]);
  const activeCompareNodeId = useMemo(
    () => compareChanges.find((item) => item.id === activeCompareChangeId)?.anchor.nodeId ?? null,
    [activeCompareChangeId, compareChanges]
  );
  useEffect(() => {
    if (!compareActive || filteredCompareChanges.length === 0) {
      setActiveCompareChangeId("");
      return;
    }
    if (filteredCompareChanges.some((item) => item.id === activeCompareChangeId)) {
      return;
    }
    setActiveCompareChangeId(filteredCompareChanges[0].id);
  }, [activeCompareChangeId, compareActive, filteredCompareChanges]);

  const currentAnchor = useMemo(() => {
    const nodeId = composerAnchorNodeId ?? activeNodeId;
    if (!nodeId) {
      return "¶ Unanchored";
    }
    return nodeLabelMap.get(nodeId) ?? `¶ ${nodeId.slice(0, 12)}`;
  }, [composerAnchorNodeId, activeNodeId, nodeLabelMap]);

  const threadAnchors = useMemo(() => {
    if (!workspace) return [];
    const countMap = new Map<string, number>();
    for (const thread of workspace.threads) {
      if (thread.anchorNodeId) {
        countMap.set(thread.anchorNodeId, (countMap.get(thread.anchorNodeId) ?? 0) + 1);
      }
    }
    return [...countMap.entries()].map(([nodeId, count]) => ({
      nodeId,
      threadCount: count,
      selected: workspace.threads.some(
        (t) => t.anchorNodeId === nodeId && t.id === activeThread
      ),
    }));
  }, [workspace, activeThread]);

  const discussionTabsWithCount = useMemo(() => {
    if (!workspace) return panelTabs;
    const openThreadCount = workspace.threads.filter((thread) => thread.status !== "RESOLVED").length;
    const pendingApprovals = workspace.document.proposalId
      ? Object.values(workspace.approvals).filter((value) => value === "Pending").length
      : 0;
    const tabs = compareActive
      ? panelTabs
      : panelTabs.filter((tab) => tab.id !== "changes");
    return tabs.map((tab) =>
      tab.id === "discussions"
        ? { ...tab, count: openThreadCount }
        : tab.id === "approvals"
          ? { ...tab, count: pendingApprovals > 0 ? pendingApprovals : undefined }
          : tab.id === "changes"
            ? { ...tab, count: compareChanges.length > 0 ? compareChanges.length : undefined }
            : { ...tab, count: undefined }
    );
  }, [workspace, compareActive, compareChanges.length]);

  const sidebarDocuments = useMemo(() => documentIndex, [documentIndex]);

  // Fetch spaces for folder hierarchy
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceForPermissions, setActiveSpaceForPermissions] = useState<Space | null>(null);
  useEffect(() => {
    fetchWorkspaces()
      .then((response) => setSpaces(response.spaces))
      .catch(() => setSpaces([]));
  }, []);

  // Transform documents to tree items — flat when space-scoped, grouped by space otherwise
  const treeItems: TreeItemData[] = useMemo(() => {
    // When scoped to a space, return a flat list (no folder wrappers)
    if (currentSpaceId) {
      return sidebarDocuments.map((doc) => ({
        id: doc.id,
        label: doc.title,
        icon: "📄",
        badge: doc.openThreads > 0 ? "pending" : doc.status === "Approved" ? "approved" : undefined,
        status: doc.status,
        openThreads: doc.openThreads,
      }));
    }

    // Unscoped: group documents by space
    const docsBySpace = new Map<string, DocumentSummary[]>();
    for (const doc of sidebarDocuments) {
      const spaceDocs = docsBySpace.get(doc.spaceId) ?? [];
      spaceDocs.push(doc);
      docsBySpace.set(doc.spaceId, spaceDocs);
    }

    const items: TreeItemData[] = [];

    for (const space of spaces) {
      const spaceDocs = docsBySpace.get(space.id) ?? [];
      const children: TreeItemData[] = spaceDocs.map((doc) => ({
        id: doc.id,
        label: doc.title,
        icon: "📄",
        badge: doc.openThreads > 0 ? "pending" : doc.status === "Approved" ? "approved" : undefined,
        status: doc.status,
        openThreads: doc.openThreads,
      }));

      items.push({
        id: `space-${space.id}`,
        label: space.name,
        icon: "📂",
        isFolder: true,
        children,
      });
    }

    // Documents with unknown space at root level
    const unknownSpaceDocs = sidebarDocuments.filter((d) => !spaces.some((s) => s.id === d.spaceId));
    for (const doc of unknownSpaceDocs) {
      items.push({
        id: doc.id,
        label: doc.title,
        icon: "📄",
        badge: doc.openThreads > 0 ? "pending" : doc.status === "Approved" ? "approved" : undefined,
        status: doc.status,
        openThreads: doc.openThreads,
      });
    }

    return items;
  }, [sidebarDocuments, spaces, currentSpaceId]);

  // Handle creating a new document
  const handleCreateDocument = useCallback(async (spaceId?: string) => {
    try {
      const targetSpaceId = spaceId ?? currentSpaceId ?? undefined;
      const result = await createDocument("Untitled Document", "", targetSpaceId);
      navigate(`/workspace/${result.document.id}`);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to create document";
      setActionError(message);
    }
  }, [navigate, currentSpaceId]);

  // Handle moving a document
  const handleMoveDocument = useCallback(async (documentId: string, targetSpaceId: string) => {
    try {
      await moveDocument(documentId, targetSpaceId);
      // Refresh the document index to reflect the move
      const docs = currentSpaceId ? await fetchSpaceDocuments(currentSpaceId) : await fetchDocuments();
      setDocumentIndex(docs);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to move document";
      setActionError(message);
    }
  }, [currentSpaceId]);

  // Handle renaming a document
  const handleRenameDocument = useCallback(async (documentId: string, newTitle: string) => {
    try {
      await renameDocument(documentId, newTitle);
      const docs = currentSpaceId ? await fetchSpaceDocuments(currentSpaceId) : await fetchDocuments();
      setDocumentIndex(docs);
      // If renaming the active document, refresh workspace to update breadcrumb/title
      if (documentId === workspace?.document.id) {
        const updated = await fetchWorkspace(docId);
        applyWorkspacePayload(updated);
      }
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to rename document";
      setActionError(message);
    }
  }, [workspace?.document.id, docId, currentSpaceId]);

  // Trash handlers
  const handleDeleteDocument = useCallback((documentId: string) => {
    setDeleteError(null);
    setDeleteConfirmId(documentId);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDocument(deleteConfirmId);
      // Refresh document index
      const docs = currentSpaceId ? await fetchSpaceDocuments(currentSpaceId) : await fetchDocuments();
      setDocumentIndex(docs);
      // Navigate away if deleting the active document
      if (deleteConfirmId === workspace?.document.id) {
        if (docs.length > 0) {
          navigate(`/workspace/${docs[0].id}`);
        } else {
          navigate("/documents");
        }
      }
      setDeleteConfirmId(null);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to delete document";
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirmId, currentSpaceId, workspace?.document.id, navigate]);

  const handleRestoreDocument = useCallback(async (documentId: string) => {
    try {
      await restoreDocument(documentId);
      setTrashDocuments(prev => prev.filter(d => d.id !== documentId));
      // Refresh document index
      const docs = currentSpaceId ? await fetchSpaceDocuments(currentSpaceId) : await fetchDocuments();
      setDocumentIndex(docs);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to restore document";
      setActionError(message);
    }
  }, [currentSpaceId]);

  const handlePurgeDocument = useCallback(async (documentId: string) => {
    try {
      await purgeDocument(documentId);
      setTrashDocuments(prev => prev.filter(d => d.id !== documentId));
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to permanently delete document";
      setActionError(message);
    }
  }, []);

  async function handleTitleSave() {
    const trimmed = titleDraft.trim();
    if (!trimmed || !workspace || trimmed === content.title) {
      setEditingTitle(false);
      return;
    }
    setTitleSaveStatus("saving");
    try {
      await renameDocument(workspace.document.id, trimmed);
      const updated = await fetchWorkspace(docId);
      applyWorkspacePayload(updated);
      const docs = currentSpaceId ? await fetchSpaceDocuments(currentSpaceId) : await fetchDocuments();
      setDocumentIndex(docs);
      setTitleSaveStatus("saved");
      setTimeout(() => setTitleSaveStatus("idle"), 2000);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Failed to rename document");
      setTitleSaveStatus("idle");
    } finally {
      setEditingTitle(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "discussions") {
      return;
    }
    const thread = threadRefs.current[activeThread];
    if (thread) {
      thread.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeThread, activeTab]);

  // When switching to decisions tab, close trash view
  useEffect(() => {
    if (activeTab === "decisions") {
      setShowTrashView(false);
    }
  }, [activeTab]);

  // Fetch open proposals for sidebar when document changes
  useEffect(() => {
    if (!workspace?.document.id) return;
    let active = true;
    fetchOpenProposals(workspace.document.id)
      .then((proposals) => {
        if (active) setSidebarProposals(proposals);
      })
      .catch(() => {
        if (active) setSidebarProposals([]);
      });
    return () => { active = false; };
  }, [workspace?.document.id]);

  // Fetch trash documents when viewing trash
  useEffect(() => {
    if (!showTrashView) return;
    let active = true;
    setTrashLoading(true);
    fetchTrash()
      .then((docs) => {
        if (active) setTrashDocuments(docs);
      })
      .catch(() => {
        if (active) setTrashDocuments([]);
      })
      .finally(() => {
        if (active) setTrashLoading(false);
      });
    return () => { active = false; };
  }, [showTrashView]);

  useEffect(() => {
    if ((activeTab !== "history" && activeTab !== "branches") || !workspace) {
      return;
    }

    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    const load = async () => {
      try {
        const primaryPromise = fetchDocumentHistory(workspace.document.id, workspace.document.proposalId);
        if (workspace.document.proposalId) {
          const [proposalHistory, mainHistory] = await Promise.all([
            primaryPromise,
            fetchDocumentHistory(workspace.document.id, "main")
          ]);
          if (!active) {
            return;
          }
          setHistoryData(proposalHistory);
          setMainHistoryData(mainHistory);
        } else {
          const mainHistory = await primaryPromise;
          if (!active) {
            return;
          }
          setHistoryData(mainHistory);
          setMainHistoryData(null);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("History tab load failed", error);
        }
        if (active) {
          setHistoryData(null);
          setMainHistoryData(null);
          setHistoryError(
            isApiError(error) ? error.message : "History service request failed."
          );
        }
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };
    void load();

    return () => {
      active = false;
    };
  }, [activeTab, workspace?.document.id, workspace?.document.proposalId]);

  useEffect(() => {
    if (activeTab !== "decisions" || !workspace) {
      return;
    }
    let active = true;
    fetchDecisionLog(workspace.document.id, {
      proposalId: workspace.document.proposalId,
      outcome: decisionOutcomeFilter,
      q: decisionQuery.trim(),
      author: decisionAuthor.trim(),
      limit: 100,
    })
      .then((response) => {
        if (!active) return;
        setDecisionRows(response.items);
      })
      .catch(() => {
        if (!active) return;
        setDecisionRows(null);
      });
    return () => {
      active = false;
    };
  }, [activeTab, workspace?.document.id, workspace?.document.proposalId, decisionOutcomeFilter, decisionQuery, decisionAuthor]);

  useEffect(() => {
    if (!workspace?.document.proposalId) {
      if (realtimeSocketRef.current) {
        realtimeSocketRef.current.close();
      }
      syncProviderRef.current?.destroy();
      syncProviderRef.current = null;
      setAwarenessInstance(null);
      setRealtimeStatus("offline");
      setOnlineUsers([]);
      realtimeSocketRef.current = null;
      return;
    }

    // Create awareness provider for collaborative cursors
    const provider = new WebSocketSyncProvider(userName ?? "Anonymous", userColor(userName ?? "Anonymous"));
    syncProviderRef.current = provider;
    setAwarenessInstance(provider.getAwareness());

    setRealtimeStatus("connecting");
    const socket = connectWorkspaceRealtime(
      workspace.document.id,
      workspace.document.proposalId,
      (event) => {
        if (event.type === "connected") {
          setRealtimeStatus("connected");
          setOnlineUsers(event.users ?? []);
          return;
        }
        if (event.type === "presence") {
          setRealtimeStatus("connected");
          setOnlineUsers(event.users ?? []);
          return;
        }
        if (event.type === "snapshot" && event.snapshot?.content) {
          const eventAt = parseRealtimeTimestamp(event.snapshot.updatedAt);
          if (eventAt === null || eventAt < latestRealtimeAtRef.current) {
            return;
          }
          latestRealtimeAtRef.current = eventAt;
          setContentDraft(event.snapshot.content);
          setDocDraft(event.snapshot.doc ?? legacyContentToDoc(event.snapshot.content, workspace.nodeIds));
          return;
        }
        if (event.type === "document_update") {
          const eventAt = parseRealtimeTimestamp(event.at);
          if (eventAt !== null && eventAt < latestRealtimeAtRef.current) {
            return;
          }
          if (eventAt !== null) {
            latestRealtimeAtRef.current = eventAt;
          }
          // Stash the bundled cursor so it can be applied after the editor
          // renders the new content (see pendingRemoteCursorRef usage).
          if (event.cursor && event.actor) {
            pendingRemoteCursorRef.current = { actor: event.actor, cursor: event.cursor };
          }
          setContentDraft(event.content);
          setDocDraft(event.doc ?? legacyContentToDoc(event.content, workspace.nodeIds));
          setSaveState("idle");
        }
      },
      () => {
        setRealtimeStatus("offline");
      }
    );

    if (!socket) {
      setRealtimeStatus("offline");
      realtimeSocketRef.current = null;
      provider.destroy();
      syncProviderRef.current = null;
      setAwarenessInstance(null);
      return;
    }
    realtimeSocketRef.current = socket;

    // Attach awareness provider to the socket once it opens
    if (socket.readyState === WebSocket.OPEN) {
      provider.attachSocket(socket);
    } else {
      const origOnOpen = socket.onopen;
      socket.onopen = (ev) => {
        provider.attachSocket(socket);
        if (typeof origOnOpen === "function") origOnOpen.call(socket, ev);
      };
    }

    return () => {
      realtimeSocketRef.current = null;
      provider.destroy();
      syncProviderRef.current = null;
      setAwarenessInstance(null);
      socket.close();
    };
  }, [workspace?.document.id, workspace?.document.proposalId, workspace?.nodeIds, userName]);

  // Apply pending remote cursor after the editor has rendered the updated
  // document content. This ensures cursor decorations are placed against
  // the matching document state, preventing flicker.
  useEffect(() => {
    const pending = pendingRemoteCursorRef.current;
    if (!pending || !syncProviderRef.current) return;
    pendingRemoteCursorRef.current = null;
    const awareness = syncProviderRef.current.getAwareness();
    awareness.getStates().forEach((state, clientId) => {
      if (clientId !== awareness.doc.clientID && state.user?.name === pending.actor) {
        const current = awareness.getStates().get(clientId);
        if (current) {
          awareness.getStates().set(clientId, { ...current, cursor: pending.cursor });
          awareness.emit("change", [{ added: [], updated: [clientId], removed: [] }, "remote"]);
        }
      }
    });
  }, [docDraft]);

  useEffect(() => {
    if (!workspace?.document.proposalId || workspaceMode !== "review") {
      setReviewDiffState("idle");
      return;
    }

    let active = true;
    setReviewDiffState("loading");
    Promise.all([
      fetchDocumentHistory(workspace.document.id, workspace.document.proposalId),
      fetchDocumentHistory(workspace.document.id, "main")
    ])
      .then(async ([proposalHistory, mainHistory]) => {
        if (!active) {
          return;
        }
        const proposalHead = proposalHistory.commits[0];
        const mainHead = mainHistory.commits[0];
        if (!proposalHead || !mainHead) {
          setReviewDiff(null);
          setReviewDiffState("ready");
          return;
        }
        const diff = await fetchDocumentCompare(
          workspace.document.id,
          mainHead.hash,
          proposalHead.hash,
          workspace.document.proposalId
        );
        if (!active) {
          return;
        }
        setReviewDiff(diff);
        setReviewDiffState("ready");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setReviewDiff(null);
        setReviewDiffState("error");
      });

    return () => {
      active = false;
    };
  }, [workspace?.document.id, workspace?.document.proposalId, workspaceMode, workspace?.history.length]);

  const compareOptions = useMemo<CompareOption[]>(() => {
    if (!workspace) {
      return [];
    }
    const seen = new Set<string>();
    const options: CompareOption[] = [];
    const primaryCommits = historyData?.commits ?? workspace.history;
    const pushCommits = (branchLabel: string, commits: { hash: string; message: string }[]) => {
      for (const item of commits) {
        if (seen.has(item.hash)) {
          continue;
        }
        seen.add(item.hash);
        options.push({
          hash: item.hash,
          label: `${branchLabel} · ${item.hash} · ${item.message}`
        });
      }
    };
    if (workspace.document.proposalId) {
      pushCommits("main", mainHistoryData?.commits ?? []);
      pushCommits("proposal", primaryCommits);
      return options;
    }
    pushCommits("main", primaryCommits);
    return options;
  }, [workspace, historyData?.commits, mainHistoryData?.commits]);

  useEffect(() => {
    if (compareOptions.length === 0) {
      setCompareFromHash("");
      setCompareToHash("");
      return;
    }
    const hasOption = (value: string) => compareOptions.some((item) => item.hash === value);
    if (workspace?.document.proposalId) {
      const mainHead = mainHistoryData?.commits[0]?.hash ?? compareOptions[0].hash;
      const proposalHead = historyData?.commits[0]?.hash ?? compareOptions.find((item) => item.hash !== mainHead)?.hash ?? compareOptions[0].hash;
      setCompareFromHash((current) => (hasOption(current) ? current : mainHead));
      setCompareToHash((current) => {
        if (hasOption(current) && current !== mainHead) {
          return current;
        }
        return proposalHead;
      });
      return;
    }
    const newest = compareOptions[0].hash;
    const previous = compareOptions.find((item) => item.hash !== newest)?.hash ?? compareOptions[0].hash;
    setCompareFromHash((current) => (hasOption(current) ? current : previous));
    setCompareToHash((current) => (hasOption(current) ? current : newest));
  }, [compareOptions, workspace?.document.proposalId, historyData?.commits, mainHistoryData?.commits]);

  // Recompute diff manifest when diff is visible and doc changes
  useEffect(() => {
    if (compareActive) {
      return;
    }
    if (!diffVisible || !baseDocRef.current || !docDraft) {
      setDiffManifest(null);
      return;
    }
    setDiffManifest(diffDocs(baseDocRef.current, docDraft));
  }, [compareActive, diffVisible, docDraft]);

  function snapshotToDoc(snapshot: CompareContentSnapshot | undefined, fallbackNodeIds?: Record<string, string>) {
    if (!snapshot) {
      return null;
    }
    if (snapshot.doc) {
      return snapshot.doc;
    }
    return legacyContentToDoc(snapshot, fallbackNodeIds);
  }



  function formatChangedField(item: { field: string; before: string; after: string }) {
    if (item.field === "doc") {
      return "Document body updated.";
    }
    return `${item.field}: "${item.before}" -> "${item.after}"`;
  }

  function selectThread(id: string) {
    setActiveThread(id);
    const thread = workspace?.threads.find((item) => item.id === id);
    setComposerAnchorNodeId(thread?.anchorNodeId ?? null);
    setActiveTab("discussions");
  }

  const focusCompareChange = useCallback((change: CompareChangeRow, navigationMethod: "click" | "keyboard" | "step" = "click") => {
    setActiveCompareChangeId(change.id);
    setActiveNodeId(change.anchor.nodeId);
    setComposerAnchorNodeId(change.anchor.nodeId);
    
    // Track navigator usage
    if (workspace) {
      trackNavigatorChangeClick({
        documentId: workspace.document.id,
        proposalId: workspace.document.proposalId,
        changeId: change.id,
        changeType: change.type,
        navigationMethod,
      });
    }
    
    const nodeSelector = `[data-node-id="${change.anchor.nodeId}"]`;
    const target =
      document.querySelector<HTMLElement>(`.cm-doc-body ${nodeSelector}`) ??
      document.querySelector<HTMLElement>(`.cm-editor-wrapper ${nodeSelector}`) ??
      document.querySelector<HTMLElement>(nodeSelector);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    target.classList.add("cm-compare-anchor-focus");
    window.setTimeout(() => {
      target.classList.remove("cm-compare-anchor-focus");
    }, 900);
  }, [workspace]);

  const stepCompareChange = useCallback((direction: 1 | -1) => {
    if (!compareActive || filteredCompareChanges.length === 0) {
      return;
    }
    const currentIndex = filteredCompareChanges.findIndex((item) => item.id === activeCompareChangeId);
    const startIndex = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
    const nextIndex = (startIndex + direction + filteredCompareChanges.length) % filteredCompareChanges.length;
    focusCompareChange(filteredCompareChanges[nextIndex], "step");
  }, [activeCompareChangeId, compareActive, filteredCompareChanges, focusCompareChange]);

  useEffect(() => {
    if (!compareActive) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "n" || (event.altKey && event.key === "]")) {
        event.preventDefault();
        // Track keyboard navigation
        const currentChange = filteredCompareChanges.find(c => c.id === activeCompareChangeId);
        if (currentChange && workspace) {
          trackNavigatorChangeClick({
            documentId: workspace.document.id,
            proposalId: workspace.document.proposalId,
            changeId: currentChange.id,
            changeType: currentChange.type,
            navigationMethod: "keyboard",
          });
        }
        stepCompareChange(1);
      } else if (event.key === "ArrowUp" || event.key.toLowerCase() === "p" || (event.altKey && event.key === "[")) {
        event.preventDefault();
        // Track keyboard navigation
        const currentChange = filteredCompareChanges.find(c => c.id === activeCompareChangeId);
        if (currentChange && workspace) {
          trackNavigatorChangeClick({
            documentId: workspace.document.id,
            proposalId: workspace.document.proposalId,
            changeId: currentChange.id,
            changeType: currentChange.type,
            navigationMethod: "keyboard",
          });
        }
        stepCompareChange(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compareActive, stepCompareChange, filteredCompareChanges, activeCompareChangeId, workspace]);

  const handleEditorUpdate = useCallback((doc: DocumentContent) => {
    const nextContent = docToLegacyContent(doc);
    setDocDraft(doc);
    setContentDraft(nextContent);
    if (realtimeSendTimerRef.current) {
      window.clearTimeout(realtimeSendTimerRef.current);
    }
    realtimeSendTimerRef.current = window.setTimeout(() => {
      sendWorkspaceRealtimeUpdate(realtimeSocketRef.current, nextContent, doc, pendingCursorRef.current);
    }, 250);
    setSaveState("idle");
    setSaveError(null);
  }, []);

  const handleSelectionChange = useCallback((nodeId: string | null) => {
    setActiveNodeId(nodeId);
    setComposerAnchorNodeId(nodeId);
    if (nodeId) {
      // Find thread anchored to this node
      const thread = workspace?.threads.find((t) => t.anchorNodeId === nodeId);
      if (thread) {
        setActiveThread(thread.id);
      }
    }
  }, [workspace?.threads]);

  const handleLocalSelectionChange = useCallback((anchor: number, head: number) => {
    pendingCursorRef.current = { anchor, head };
    // If there is a pending document update, the cursor will be sent
    // atomically with it so the receiver applies both at once.
    // Only send a standalone awareness update when the user moves the
    // cursor without editing (no pending doc update).
    if (!realtimeSendTimerRef.current) {
      syncProviderRef.current?.updateCursor(anchor, head);
    }
  }, []);


  function getCurrentAnchorOffsets() {
    if (!editorInstance) {
      return undefined;
    }
    const { from, to } = editorInstance.state.selection;
    if (from === to) {
      return undefined;
    }
    const quote = editorInstance.state.doc.textBetween(from, to, " ").trim();
    return {
      start: from,
      end: to,
      quote: quote || undefined,
    };
  }

  async function saveDraft() {
    if (!contentDraft || !workspace || !proposalMode) {
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      const updated = await saveWorkspace(workspace.document.id, contentDraft, docDraft ?? undefined);
      applyWorkspacePayload(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (error) {
      setSaveState("error");
      if (isApiError(error)) {
        setSaveError(error.message);
      } else {
        setSaveError("Could not save your document changes. Please retry.");
      }
    }
  }

  async function requestReview() {
    if (!workspace?.document.proposalId) {
      return;
    }
    setActionError(null);
    try {
      const updated = await requestProposalReview(workspace.document.id, workspace.document.proposalId);
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not submit proposal for review.");
    }
  }

  async function startProposal() {
    if (!workspace) {
      return;
    }
    setActionError(null);
    setApprovalError(null);
    setApprovalStateOverride(null);
    try {
      const openProposals = await fetchOpenProposals(workspace.document.id);
      if (openProposals.length > 0) {
        setExistingProposals(openProposals);
        setProposalPickerOpen(true);
        return;
      }
      const updated = await createProposal(workspace.document.id, userName ? `${userName}'s edits` : undefined);
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not start proposal.");
    }
  }

  async function handlePickExistingProposal() {
    if (!workspace) return;
    setProposalPickerOpen(false);
    try {
      const updated = await fetchWorkspace(workspace.document.id);
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not load proposal.");
    }
  }

  async function handleCreateNewProposal() {
    if (!workspace) return;
    setProposalPickerOpen(false);
    try {
      const updated = await createProposal(workspace.document.id, userName ? `${userName}'s edits` : undefined);
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not create proposal.");
    }
  }

  async function handleViewPublished() {
    if (!workspace) return;
    // Stash current proposal workspace so we can restore without refetching
    proposalPayloadRef.current = workspace;
    try {
      const published = await fetchWorkspace(workspace.document.id, "published");
      applyWorkspacePayload(published);
      setWorkspaceMode("published");
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not load published version.");
    }
  }

  async function handleReturnToProposal() {
    if (!workspace) return;
    if (proposalPayloadRef.current) {
      applyWorkspacePayload(proposalPayloadRef.current);
      proposalPayloadRef.current = null;
      setWorkspaceMode("proposal");
    } else {
      // Fallback: refetch workspace (will get proposal if one exists)
      try {
        const updated = await fetchWorkspace(workspace.document.id);
        applyWorkspacePayload(updated);
        setWorkspaceMode("proposal");
      } catch (error) {
        setActionError(isApiError(error) ? error.message : "Could not load proposal.");
      }
    }
  }

  async function approveRole(role: MergeGateRole) {
    if (!workspace?.document.proposalId) {
      return;
    }
    setApproveBusyRole(role);
    setActionError(null);
    setApprovalError(null);
    setApprovalStateOverride(null);
    try {
      const updated = await approveProposalRole(workspace.document.id, workspace.document.proposalId, role);
      applyWorkspacePayload(updated);
      setActionError(null);
    } catch (error) {
      if (isApiError(error) && error.code === "APPROVAL_ORDER_BLOCKED") {
        const blockers = Array.isArray((error.details as { blockers?: unknown[] } | null)?.blockers)
          ? (error.details as { blockers: string[] }).blockers.join(", ")
          : "required prior roles";
        const message = `Approval update failed. Blocked by: ${blockers}`;
        setActionError(message);
        setApprovalError(message);
      } else {
        const message = isApiError(error) ? error.message : "Approval update failed.";
        setActionError(message);
        setApprovalError(message);
      }
    } finally {
      setApproveBusyRole(null);
    }
  }

  async function handleApproveGroup(groupId: string) {
    if (!workspace?.document.proposalId) return;
    setApprovingGroupId(groupId);
    setActionError(null);
    setApprovalError(null);
    setApprovalStateOverride(null);
    try {
      const updated = await approveProposalGroup(
        workspace.document.id,
        workspace.document.proposalId,
        groupId
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Group approval failed.";
      setActionError(message);
      setApprovalError(message);
    } finally {
      setApprovingGroupId(null);
    }
  }

  async function handleRejectGroup(groupId: string) {
    if (!workspace?.document.proposalId) return;
    setApprovingGroupId(groupId);
    setActionError(null);
    setApprovalError(null);
    setApprovalStateOverride(null);
    try {
      const updated = await rejectProposalGroup(
        workspace.document.id,
        workspace.document.proposalId,
        groupId
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Group rejection failed.";
      setActionError(message);
      setApprovalError(message);
    } finally {
      setApprovingGroupId(null);
    }
  }

  async function handleSaveApprovalRules(payload: SaveApprovalRulesRequest) {
    if (!workspace) return;
    setApprovalRulesSaving(true);
    setActionError(null);
    try {
      await saveApprovalRules(workspace.document.id, payload);
      setShowApprovalRules(false);
      // Refresh workspace to get updated approval workflow
      const updated = await fetchWorkspace(workspace.document.id);
      applyWorkspacePayload(updated);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to save approval rules.";
      setActionError(message);
    } finally {
      setApprovalRulesSaving(false);
    }
  }

  async function resolveActiveThread(
    threadIdOverride?: string,
    resolution?: {
      outcome: "ACCEPTED" | "REJECTED" | "DEFERRED";
      rationale?: string;
    }
  ) {
    if (!workspace?.document.proposalId) {
      return;
    }
    const targetThreadId = threadIdOverride ?? activeThread;
    const thread = workspace.threads.find((item) => item.id === targetThreadId);
    if (!thread || thread.resolvedNote) {
      return;
    }
    const outcome = resolution?.outcome ?? "ACCEPTED";
    const rationale = resolution?.rationale?.trim();
    if (outcome === "REJECTED" && !rationale) return;
    setActionError(null);
    try {
      const updated = await resolveProposalThread(
        workspace.document.id,
        workspace.document.proposalId,
        targetThreadId,
        {
          outcome,
          rationale
        }
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Thread resolution failed.");
    }
  }

  async function submitComment(
    text: string,
    anchorNodeId?: string,
    options?: {
      visibility: "INTERNAL" | "EXTERNAL";
      type: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
    }
  ) {
    if (!workspace?.document.proposalId || !text.trim()) {
      return;
    }
    setActionError(null);
    try {
      const updated = await createProposalThread(
        workspace.document.id,
        workspace.document.proposalId,
        {
          text,
          anchorLabel: currentAnchor,
          anchorNodeId: anchorNodeId ?? composerAnchorNodeId ?? activeNodeId ?? undefined,
          anchorOffsets: getCurrentAnchorOffsets(),
          visibility: options?.visibility ?? "INTERNAL",
          type: options?.type ?? "GENERAL",
        }
      );
      applyWorkspacePayload(updated);
      // Select the newly created thread
      const newThread = updated.threads[updated.threads.length - 1];
      if (newThread) {
        setActiveThread(newThread.id);
        setComposerAnchorNodeId(newThread.anchorNodeId ?? null);
        setActiveTab("discussions");
      }
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not create comment. Please retry.");
    }
  }

  async function replyToThread(threadIdOverride: string | undefined, body: string) {
    if (!workspace?.document.proposalId) {
      return;
    }
    const targetThreadId = threadIdOverride ?? activeThread;
    const thread = workspace.threads.find((item) => item.id === targetThreadId);
    if (!thread) {
      return;
    }
    if (!body || !body.trim()) {
      return;
    }
    setActionError(null);
    try {
      const updated = await replyProposalThread(
        workspace.document.id,
        workspace.document.proposalId,
        targetThreadId,
        { body: body.trim() }
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not post reply. Please retry.");
    }
  }

  async function voteThread(threadId: string, direction: "up" | "down") {
    if (!workspace?.document.proposalId) {
      return;
    }
    setActionError(null);
    try {
      const updated = await voteProposalThread(
        workspace.document.id,
        workspace.document.proposalId,
        threadId,
        direction
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not update vote.");
    }
  }

  async function reactThread(threadId: string, emoji: string) {
    if (!workspace?.document.proposalId) {
      return;
    }
    setActionError(null);
    try {
      const updated = await reactProposalThread(
        workspace.document.id,
        workspace.document.proposalId,
        threadId,
        emoji
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not apply reaction.");
    }
  }

  async function reopenThread(threadId: string) {
    if (!workspace?.document.proposalId) {
      return;
    }
    setActionError(null);
    try {
      const updated = await reopenProposalThread(
        workspace.document.id,
        workspace.document.proposalId,
        threadId
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not reopen thread.");
    }
  }

  async function toggleThreadVisibility(threadId: string) {
    if (!workspace?.document.proposalId) {
      return;
    }
    const thread = workspace.threads.find((item) => item.id === threadId);
    if (!thread) {
      return;
    }
    const nextVisibility = thread.visibility === "EXTERNAL" ? "INTERNAL" : "EXTERNAL";
    setActionError(null);
    try {
      const updated = await setProposalThreadVisibility(
        workspace.document.id,
        workspace.document.proposalId,
        threadId,
        nextVisibility
      );
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not change visibility.");
    }
  }

  async function mergeCurrentProposal() {
    if (!workspace?.document.proposalId) {
      return;
    }
    setMergeBusy(true);
    setActionError(null);
    setApprovalError(null);
    setApprovalStateOverride(null);
    
    // Calculate metrics for tracking
    const pendingChanges = compareChanges.filter(c => c.reviewState === "pending").length;
    const deferredChanges = compareChanges.filter(c => c.reviewState === "deferred").length;
    
    // Track merge attempt
    trackMergeAttempt({
      documentId: workspace.document.id,
      proposalId: workspace.document.proposalId,
      changeCount: compareChanges.length,
      pendingChanges,
      deferredChanges,
      openThreads: openThreads,
      pendingApprovals: pendingApprovals,
    });
    
    try {
      const updated = await mergeProposal(workspace.document.id, workspace.document.proposalId, {
        policy: mergeGatePolicy ?? {
          allowMergeWithDeferredChanges: false,
          ignoreFormatOnlyChangesForGate: false,
        },
        changeStates: compareChanges,
      });
      applyWorkspacePayload(updated);
      setActionError(null);
      setDocumentIndex((current) =>
        current.map((doc) =>
          doc.id === updated.document.id
            ? {
                ...doc,
                title: updated.document.title,
                status: updated.document.status,
                updatedBy: updated.document.editedBy,
                openThreads: updated.threads.filter((thread) => thread.status !== "RESOLVED").length
              }
            : doc
        )
      );
      void refreshDocumentIndex("background");
      
      // Track successful merge
      const acceptedChanges = compareChanges.filter(c => c.reviewState === "accepted").length;
      const rejectedChanges = compareChanges.filter(c => c.reviewState === "rejected").length;
      trackMergeCompleted({
        documentId: workspace.document.id,
        proposalId: workspace.document.proposalId,
        changeCount: compareChanges.length,
        acceptedChanges,
        rejectedChanges,
        deferredChanges,
        deferredCarryover: deferredChanges > 0,
      });
    } catch (error) {
      if (isApiError(error) && error.code === "MERGE_GATE_BLOCKED") {
        const details = error.details as {
          pendingApprovals?: number;
          openThreads?: number;
          blockers?: unknown;
          policy?: {
            allowMergeWithDeferredChanges?: boolean;
            ignoreFormatOnlyChangesForGate?: boolean;
          };
        } | null;
        const pending = details?.pendingApprovals ?? pendingApprovals;
        const open = details?.openThreads ?? openThreads;
        setMergeGateBlockers(normalizeMergeGateBlockers(details?.blockers));
        if (details?.policy) {
          setMergeGatePolicy({
            allowMergeWithDeferredChanges: Boolean(details.policy.allowMergeWithDeferredChanges),
            ignoreFormatOnlyChangesForGate: Boolean(details.policy.ignoreFormatOnlyChangesForGate),
          });
        } else {
          setMergeGatePolicy(null);
        }
        const message = `Merge gate is blocked. Pending approvals: ${pending}, open threads: ${open}.`;
        setActionError(message);
        
        // Track blocked merge
        const blockerRows = normalizeMergeGateBlockers(details?.blockers);
        const blockerTypes = Array.from(new Set(blockerRows.map(b => b.type)));
        trackMergeBlocked({
          documentId: workspace.document.id,
          proposalId: workspace.document.proposalId,
          reason: message,
          blockerTypes: blockerTypes as Array<"approval" | "thread" | "change">,
          blockerCount: blockerRows.length,
          explicitBlockers: blockerRows.filter(b => b.type === "change" || b.type === "thread").length,
        });
      } else {
        setMergeGateBlockers([]);
        setMergeGatePolicy(null);
        const message = isApiError(error) ? error.message : "Merge gate is still blocked.";
        setActionError(message);
      }
    } finally {
      setMergeBusy(false);
    }
  }

  async function handleChangeReviewAction(changeId: string, action: "accepted" | "rejected" | "deferred") {
    if (!workspace?.document.proposalId || !compareActive) {
      return;
    }
    const change = compareChanges.find((c) => c.id === changeId);
    if (!change) {
      return;
    }

    // Optimistic update
    const previousState = change.reviewState;
    setCompareChanges((prev) =>
      prev.map((c) =>
        c.id === changeId ? { ...c, reviewState: action } : c
      )
    );

    try {
      await updateChangeReviewState(
        workspace.document.id,
        workspace.document.proposalId,
        changeId,
        {
          reviewState: action,
          fromRef: change.fromRef,
          toRef: change.toRef,
          ...(action === "rejected" ? { rejectedRationale: "" } : {})
        }
      );
      // Success - keep the optimistic update and track the action
      trackChangeAction({
        documentId: workspace.document.id,
        proposalId: workspace.document.proposalId,
        changeId,
        changeType: change.type,
        action,
        fromRef: change.fromRef,
        toRef: change.toRef,
        previousState,
      });
    } catch (error) {
      // Revert optimistic update on error
      setCompareChanges((prev) =>
        prev.map((c) =>
          c.id === changeId ? { ...c, reviewState: previousState } : c
        )
      );
      const message = isApiError(error) ? error.message : "Failed to update review state";
      setActionError(message);
    }
  }

  async function retryApprovalsPanel() {
    if (!workspace) {
      return;
    }
    setApprovalRefreshBusy(true);
    setApprovalStateOverride(null);
    setApprovalError(null);
    try {
      const refreshed = await fetchWorkspace(workspace.document.id);
      applyWorkspacePayload(refreshed);
      setActionError(null);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Approval service request failed.";
      setApprovalError(message);
      setActionError(message);
    } finally {
      setApprovalRefreshBusy(false);
    }
  }

  // @ts-expect-error Reserved for history panel / keyboard shortcut use
  async function createNamedVersion() { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!workspace?.document.proposalId) {
      return;
    }
    const label = window.prompt("Named version label", "Partner Review Draft");
    if (!label) {
      return;
    }
    setActionError(null);
    try {
      const updated = await saveNamedVersion(workspace.document.id, workspace.document.proposalId, label);
      applyWorkspacePayload(updated);
      if (activeTab === "history") {
        const refreshed = await fetchDocumentHistory(updated.document.id, updated.document.proposalId);
        setHistoryData(refreshed);
      }
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not save named version.");
    }
  }

  function clearCompare() {
    // End review session metrics if active
    endReviewSession({ merged: false });

    setCompareActive(false);
    setCompareDoc(null);
    setCompareManifest(null);
    setCompareBeforeDoc(null);
    setCompareAfterDoc(null);
    setCompareChanges([]);
    setActiveCompareChangeId("");
    setCompareSummary(null);
    setDiffVisible(false);
    setDiffExpandedFullscreen(false);
  }

  async function compareCommits(fromHash: string, toHash: string, statusLabel = "Comparing selected commits..."): Promise<CompareChangeRow[] | null> {
    if (!workspace) {
      return null;
    }
    if (!fromHash || !toHash) {
      setCompareSummary("Select two commits to compare.");
      return null;
    }
    if (fromHash === toHash && !statusLabel.startsWith("Viewing ")) {
      setCompareSummary("Select two different commits.");
      return null;
    }
    setCompareFromHash(fromHash);
    setCompareToHash(toHash);
    setWorkspaceMode("review");
    setDiffVisible(true);
    setDiffMode("split");
    setActiveTab("history");
    setCompareSummary(statusLabel);
    try {
      const comparison = await fetchDocumentCompare(
        workspace.document.id,
        fromHash,
        toHash,
        workspace.document.proposalId
      );
      const beforeDoc = snapshotToDoc(comparison.fromContent, workspace.nodeIds);
      const afterDoc = snapshotToDoc(comparison.toContent, workspace.nodeIds);
      if (beforeDoc && afterDoc) {
        setCompareDoc(afterDoc);
        setCompareBeforeDoc(beforeDoc);
        setCompareAfterDoc(afterDoc);
        setCompareManifest(diffDocs(beforeDoc, afterDoc));
        setCompareActive(true);
      } else {
        setCompareActive(false);
        setCompareDoc(null);
        setCompareBeforeDoc(null);
        setCompareAfterDoc(null);
        setCompareManifest(null);
        setCompareChanges([]);
        setActiveCompareChangeId("");
        setCompareSummary("Compare loaded, but snapshot content is unavailable from the API response.");
        return null;
      }
      const normalizedChanges = normalizeCompareChanges(comparison);
      setCompareChanges(normalizedChanges);
      setActiveCompareChangeId(normalizedChanges[0]?.id ?? "");
      
      // Start review session metrics
      if (normalizedChanges.length > 0) {
        // Estimate word count from context snippets
        const wordCountEstimate = normalizedChanges.reduce((sum, change) => {
          const beforeWords = change.context?.before?.split(/\s+/).length ?? 0;
          const afterWords = change.context?.after?.split(/\s+/).length ?? 0;
          return sum + Math.max(beforeWords, afterWords);
        }, 0) || 1000;
        
        startReviewSession({
          documentId: workspace.document.id,
          proposalId: workspace.document.proposalId,
          changeCount: normalizedChanges.length,
          wordCountEstimate,
          fromRef: fromHash,
          toRef: toHash,
        });
      }
      
      if (comparison.changedFields.length === 0) {
        setCompareSummary("No field-level differences between selected commits.");
        return normalizedChanges;
      }
      setCompareSummary(
        comparison.changedFields
          .map((item) => formatChangedField(item))
          .join("\n")
      );
      return normalizedChanges;
    } catch {
      setCompareActive(false);
      setCompareDoc(null);
      setCompareManifest(null);
      setCompareChanges([]);
      setActiveCompareChangeId("");
      setCompareSummary("Compare request failed.");
      return null;
    }
  }

  async function compareSelectedCommits() {
    await compareCommits(compareFromHash, compareToHash);
  }

  function currentCommitHash() {
    if (!workspace) {
      return "";
    }
    const currentBranchCommits = historyData?.commits ?? workspace.history;
    return currentBranchCommits[0]?.hash ?? "";
  }

  async function compareVersionAgainstCurrent(hash: string, label: string) {
    const currentHash = currentCommitHash();
    if (!currentHash) {
      setCompareSummary("Current version is unavailable. Refresh history and try again.");
      return;
    }
    if (hash === currentHash) {
      await compareCommits(hash, currentHash, `Viewing ${label}`);
      return;
    }
    await compareCommits(hash, currentHash, `Comparing ${label} against current version...`);
  }

  async function compareLatestCommits(): Promise<CompareChangeRow[] | null> {
    if (!workspace) {
      return null;
    }
    if (compareActive) {
      clearCompare();
      return null;
    }
    if (compareFromHash && compareToHash && compareFromHash !== compareToHash) {
      return compareCommits(compareFromHash, compareToHash);
    }
    setCompareSummary("Comparing latest main and proposal commits...");
    try {
      let fromHash = "";
      let toHash = "";
      if (workspace.document.proposalId) {
        const [proposalHistory, mainHistory] = await Promise.all([
          fetchDocumentHistory(workspace.document.id, workspace.document.proposalId),
          fetchDocumentHistory(workspace.document.id, "main")
        ]);
        const proposalHead = proposalHistory.commits[0];
        const mainHead = mainHistory.commits[0];
        if (!proposalHead || !mainHead) {
          setCompareSummary("Need both proposal and main commits to compare.");
          return null;
        }
        fromHash = mainHead.hash;
        toHash = proposalHead.hash;
      } else {
        const commits = historyData?.commits ?? workspace.history;
        if (commits.length < 2) {
          setCompareSummary("Need at least two commits to compare.");
          return null;
        }
        const [head, base] = commits;
        fromHash = base.hash;
        toHash = head.hash;
      }
      return compareCommits(fromHash, toHash, "Comparing latest main and proposal commits...");
    } catch {
      setCompareActive(false);
      setCompareDoc(null);
      setCompareManifest(null);
      setCompareChanges([]);
      setActiveCompareChangeId("");
      setCompareSummary("Compare request failed.");
      return null;
    }
  }

  if (viewState === "loading") {
    return (
      <div className="cm-workspace-fallback">
        <EmptyState variant="loading" title="Loading workspace..." />
      </div>
    );
  }

  if (viewState === "error" || !workspace) {
    return (
      <div className="cm-workspace-fallback">
        <EmptyStateError
          title="Workspace failed to load"
          description="Could not load workspace data for this document. You can try again or return to your documents."
          onRetry={() => {
            setViewState("loading");
            fetchWorkspace(docId)
              .then((response) => {
                applyWorkspacePayload(response);
                const initialDoc = response.doc ?? legacyContentToDoc(response.content, response.nodeIds);
                baseDocRef.current = initialDoc;
                if (response.threads.length > 0) {
                  setActiveThread(response.threads[0].id);
                  setComposerAnchorNodeId(response.threads[0].anchorNodeId ?? null);
                }
                setViewState("success");
              })
              .catch(() => {
                setContentDraft(null);
                setViewState("error");
              });
          }}
          showHomeFallback={true}
        />
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div className="cm-workspace-fallback">
        <EmptyState
          variant="empty"
          title="No workspace data"
          description="This document exists but has no active content. Start a proposal to begin collaborating."
          primaryAction={{
            label: "Start Proposal",
            onClick: () => {
              setViewState("loading");
              fetchWorkspace(docId)
                .then((response) => {
                  applyWorkspacePayload(response);
                  const initialDoc = response.doc ?? legacyContentToDoc(response.content, response.nodeIds);
                  baseDocRef.current = initialDoc;
                  setViewState("success");
                })
                .catch(() => {
                  setViewState("error");
                });
            }
          }}
          secondaryAction={{
            label: "← Back to Documents",
            to: "/documents"
          }}
        />
      </div>
    );
  }

  const pendingApprovals = Object.values(workspace.approvals).filter((value) => value === "Pending").length;
  const openThreads = workspace.threads.filter((thread) => thread.status !== "RESOLVED").length;
  const resolvedThreads = workspace.threads.length - openThreads;
  const hasActiveProposal = Boolean(workspace.document.proposalId);
  const apiUnavailable = Boolean(approvalError && /chronicle api is unavailable/i.test(approvalError));
  const runtimeApprovalState: ViewState = !hasActiveProposal
    ? "empty"
    : approvalRefreshBusy || approveBusyRole !== null || mergeBusy
      ? "loading"
      : approvalError
        ? "error"
        : "success";
  const effectiveApprovalState: ViewState = approvalStateOverride ?? runtimeApprovalState;
  const approvalsOk = workspace.approvalWorkflow
    ? workspace.approvalWorkflow.allApproved
    : true;
  const mergeReady = hasActiveProposal && approvalsOk && openThreads === 0;
  const content = contentDraft ?? workspace.content;
  const workspaceDoc = workspace.doc ?? legacyContentToDoc(workspace.content, workspace.nodeIds);
  const activeDoc = docDraft ?? workspaceDoc;
  const hasUnsavedLegacyChanges =
    content.title !== workspace.content.title ||
    content.subtitle !== workspace.content.subtitle ||
    content.purpose !== workspace.content.purpose ||
    content.tiers !== workspace.content.tiers ||
    content.enforce !== workspace.content.enforce;
  const hasUnsavedDocChanges = JSON.stringify(activeDoc) !== JSON.stringify(workspaceDoc);
  const hasUnsavedChanges = hasUnsavedLegacyChanges || hasUnsavedDocChanges;

  return (
    <div className={`cm-app ${diffVisible ? "" : "cm-diff-off"}`.trim()}>
      <div className="cm-topnav">
        <button className="cm-topnav-logo" type="button" onClick={() => navigate("/documents")}>
          Chronicle<span>.</span>
        </button>
        <div className="cm-topnav-divider" />
        <div className="cm-breadcrumb">
          <button className="cm-breadcrumb-link" type="button" onClick={() => navigate("/documents")}>
            {workspace?.workspaceName ?? "Chronicle"}
          </button>
          <span className="cm-breadcrumb-sep">/</span>
          {workspace?.space ? (
            <>
              <button className="cm-breadcrumb-link" type="button" onClick={() => navigate(`/spaces/${workspace.space!.id}`)}>
                {workspace.space.name}
              </button>
              <span className="cm-breadcrumb-sep">/</span>
            </>
          ) : null}
          {editingTitle ? (
            <input
              className="cm-breadcrumb-edit"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleTitleSave();
                } else if (e.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
              onBlur={() => void handleTitleSave()}
              autoFocus
            />
          ) : (
            <span
              className="cm-breadcrumb-current cm-breadcrumb-editable"
              title="Click to rename"
              onClick={() => { setTitleDraft(content.title); setEditingTitle(true); }}
            >
              {content.title}
            </span>
          )}
          {titleSaveStatus !== "idle" && (
            <span className={`cm-breadcrumb-save-status ${titleSaveStatus === "saved" ? "cm-breadcrumb-save-status--done" : ""}`}>
              {titleSaveStatus === "saving" ? "Saving..." : "Saved"}
            </span>
          )}
        </div>
        <div className="cm-topnav-spacer" />
        <div className="cm-topnav-context">
          {(hasActiveProposal || (workspaceMode === "published" && proposalPayloadRef.current !== null)) && (
            <div className="cm-mode-toggle" aria-label="Workspace mode">
              <button
                className={workspaceMode === "published" ? "active" : ""}
                onClick={() => void handleViewPublished()}
                type="button"
              >
                Published
              </button>
              <button
                className={workspaceMode === "proposal" ? "active" : ""}
                onClick={() => void handleReturnToProposal()}
                type="button"
              >
                Proposal
              </button>
              <button
                className={workspaceMode === "review" ? "active" : ""}
                onClick={() => setWorkspaceMode("review")}
                type="button"
              >
                Review
              </button>
            </div>
          )}
          <div className="cm-branch-badge" aria-label="Current branch">
            <div className="cm-branch-dot" />
            {(() => {
              const raw = workspace.document.branch.split(" -> ")[0];
              if (!workspace.document.proposalId) return raw;
              const match = sidebarProposals.find((p) => p.branchName === raw)
                ?? existingProposals.find((p) => p.branchName === raw);
              return match?.title ?? raw;
            })()}
          </div>
        </div>

        <div className="cm-topnav-actions">
          <PresenceBar users={onlineUsers.map(name => ({ name, color: userColor(name) }))} />
          <div className="cm-action-group cm-action-group--secondary">
            <button
              className="cm-action-btn"
              type="button"
              onClick={() => void compareLatestCommits()}
              title={compareActive ? "Close comparison" : "Compare versions"}
            >
              <span>{compareActive ? "Close Compare" : "Compare Versions"}</span>
            </button>
            <button
              className="cm-action-btn cm-action-btn--primary"
              type="button"
              onClick={() => setShareDialogOpen(true)}
              title="Share document"
            >
              <span>Share</span>
            </button>
          </div>

	          <div className="cm-action-group cm-action-group--document">
	            <ExportMenu documentId={workspace.document.id} documentTitle={content.title} />
            <button
              className="cm-action-btn"
              type="button"
              disabled={!proposalMode || !hasActiveProposal || !hasUnsavedChanges || saveState === "saving"}
              onClick={() => void saveDraft()}
              title="Save changes"
            >
              <span>{saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save"}</span>
            </button>
          </div>

          <button
            className="cm-nav-btn cm-primary cm-primary--cta"
            type="button"
            onClick={() => {
              if (workspace.document.proposalId) {
                void requestReview();
                return;
              }
              void startProposal();
            }}
          >
            {workspace.document.proposalId ? "Request Review" : "Start Proposal"}
          </button>
        </div>
      </div>

      <div className="cm-app-body">
        <aside className={`cm-sidebar ${leftSidebarCollapsed ? "collapsed" : ""}`.trim()}>
          <button
            className="cm-pane-toggle cm-pane-toggle-left"
            type="button"
            onClick={() => setLeftSidebarCollapsed((current) => !current)}
            aria-label={leftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
            title={leftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d={leftSidebarCollapsed ? "M6 3l5 5-5 5" : "M10 3L5 8l5 5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* ── Space Header ── */}
          <div className="cm-sb-header">
            {currentSpaceId ? (
              <>
                <button className="cm-sb-back" type="button" onClick={() => navigate("/documents")}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  All Spaces
                </button>
                <div className="cm-sb-space-name">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3.38a1.5 1.5 0 0 1 1.22.63L10 6h5.5A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
                  {currentSpaceName ?? "Space"}
                </div>
              </>
            ) : (
              <div className="cm-sb-space-name">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="11" y="3" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="3" y="11" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/><rect x="11" y="11" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4"/></svg>
                Workspace
              </div>
            )}
          </div>

          {!showTrashView && (
            <div className="cm-sb-content">
              {/* ── Active Proposals ── */}
              {sidebarProposals.length > 0 && (
                <div className="cm-sb-section">
                  <div className="cm-sb-section-head">
                    <span>Proposals</span>
                    <span className="cm-sb-badge">{sidebarProposals.length}</span>
                  </div>
                  <div className="cm-sb-proposal-list">
                    {sidebarProposals.map((proposal) => {
                      const statusLabel = proposal.status.replace(/_/g, " ").toLowerCase();
                      const isReview = /review|pending/i.test(proposal.status);
                      const isDraft = /draft|open/i.test(proposal.status);
                      return (
                        <button
                          key={proposal.id}
                          className="cm-sb-proposal"
                          type="button"
                          onClick={() => navigate(`/workspace/${proposal.documentId}`)}
                        >
                          <div className="cm-sb-proposal-top">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7 4v12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M13 4v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M13 8c0 2.2-1.8 3.5-6 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="7" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="13" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                            <span className="cm-sb-proposal-name">{proposal.title}</span>
                          </div>
                          <span className={`cm-sb-proposal-badge ${isReview ? "review" : isDraft ? "draft" : ""}`}>
                            {statusLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Documents ── */}
              <div className="cm-sb-section cm-sb-section--grow">
                <div className="cm-sb-section-head">
                  <span>Documents</span>
                  <button
                    className="cm-sb-new-btn"
                    type="button"
                    onClick={() => handleCreateDocument()}
                    title="New document"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                {documentIndexState === "loading" && <div className="cm-sidebar-hint">Loading...</div>}
                {documentIndexState === "error" && <div className="cm-sidebar-hint">Could not load documents.</div>}
                {documentIndexState !== "loading" && documentIndexState !== "error" && (
                  <DocumentTree
                    items={treeItems}
                    activeId={workspace?.document.id ?? ""}
                    onSelect={(id) => {
                      if (id !== workspace?.document.id) {
                        navigate(`/workspace/${id}`);
                      }
                    }}
                    onCreateDocument={handleCreateDocument}
                    onMoveDocument={handleMoveDocument}
                    onRenameDocument={handleRenameDocument}
                    onDeleteDocument={isAdmin ? handleDeleteDocument : undefined}
                    onManageSpacePermissions={(spaceId) => {
                      const space = spaces.find(s => s.id === spaceId);
                      if (space) {
                        setActiveSpaceForPermissions(space);
                      }
                    }}
                    emptyMessage="No documents yet."
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Trash View ── */}
          {showTrashView && (
            <div className="cm-sb-content">
              <div className="cm-sb-section cm-sb-section--grow">
                <div className="cm-sb-section-head">
                  <button className="cm-sb-back" type="button" onClick={() => setShowTrashView(false)} style={{ margin: 0, padding: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Back
                  </button>
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--ink-4)" }}>Trash</span>
                </div>
                {trashLoading && <div className="cm-sidebar-hint">Loading...</div>}
                {!trashLoading && trashDocuments.length === 0 && (
                  <div className="cm-sidebar-hint">Trash is empty.</div>
                )}
                {!trashLoading && trashDocuments.map((doc) => (
                  <div key={doc.id} className="cm-trash-item">
                    <div className="cm-trash-title">{doc.title}</div>
                    <div className="cm-trash-date">
                      Deleted {new Date(doc.deletedAt).toLocaleDateString()}
                    </div>
                    <div className="cm-trash-actions">
                      <button className="cm-trash-restore" type="button" onClick={() => handleRestoreDocument(doc.id)}>Restore</button>
                      <button className="cm-trash-purge" type="button" onClick={() => handlePurgeDocument(doc.id)}>Delete forever</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Sidebar Footer ── */}
          {isAdmin && !showTrashView && (
            <div className="cm-sb-footer">
              <button className="cm-sb-footer-btn" type="button" onClick={() => setShowTrashView(true)} title="View trash">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                  <path d="M4 5h8l-.6 7a1.2 1.2 0 0 1-1.2 1H5.8a1.2 1.2 0 0 1-1.2-1L4 5ZM6.5 7.5v3M9.5 7.5v3M3 5h10M6 5V3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Trash
              </button>
            </div>
          )}
        </aside>

        <main className="cm-doc-area">
          {hasActiveProposal && proposalMode && (
            <EditorToolbar
              editor={editorInstance}
              diffVisible={diffVisible}
              onToggleDiff={() => setDiffVisible((value) => !value)}
              diffMode={diffMode}
              onSetDiffMode={handleDiffModeChange}
            />
          )}
          {hasActiveProposal && (
            <div className={`cm-merge-gate-banner ${mergeReady ? "ready" : "blocked"}`}>
              <div className="cm-merge-gate-title">
                {apiUnavailable ? "Merge Gate Unavailable" : (mergeReady ? "Merge Gate Ready" : "Merge Gate Blocked")}
              </div>
              <div className="cm-merge-gate-copy">
                {apiUnavailable
                  ? "Approval state is temporarily unavailable. Retry once the API recovers."
                  : mergeReady
                  ? "All required approvals are complete and all threads are resolved."
                  : `Awaiting ${pendingApprovals} approvals and ${openThreads} open thread resolutions.`}
              </div>
            </div>
          )}
          {compareSummary ? (
            <div className="cm-compare-banner" role="status">
              <strong>Latest Compare:</strong> {compareSummary}
            </div>
          ) : null}
          {!hasActiveProposal && workspaceMode !== "published" && proposalPayloadRef.current === null && (
            <div className="cm-readonly-banner" role="status">
              <span>You are viewing the published document.</span>
              <button type="button" onClick={() => void startProposal()}>Start Proposal</button>
            </div>
          )}
          {(hasActiveProposal || proposalPayloadRef.current !== null) && workspaceMode === "published" && (
            <div className="cm-readonly-banner" role="status">
              <span>You are viewing the published snapshot.</span>
              <button type="button" onClick={() => void handleReturnToProposal()}>Switch to Proposal</button>
            </div>
          )}
          {workspaceMode === "review" && (
            <div className="cm-review-diff-card">
              <div className="cm-review-diff-head">Review Diff vs Main</div>
              {reviewDiffState === "loading" && <div className="cm-review-diff-meta">Loading compare…</div>}
              {reviewDiffState === "error" && <div className="cm-review-diff-meta">Compare request failed.</div>}
              {reviewDiffState === "ready" && reviewDiff && reviewDiff.changedFields.length === 0 && (
                <div className="cm-review-diff-meta">No differences from main.</div>
              )}
              {reviewDiffState === "ready" && reviewDiff && reviewDiff.changedFields.length > 0 && (
                <div className="cm-review-diff-list">
                  {reviewDiff.changedFields.map((field) => (
                    <div className="cm-review-diff-row" key={field.field}>
                      <strong>{field.field === "doc" ? "Document body" : field.field}</strong>
                      {field.field === "doc" ? (
                        <div className="cm-review-diff-meta">Rich text blocks changed between proposal and main.</div>
                      ) : (
                        <>
                          <div className="cm-review-diff-before">- {field.before}</div>
                          <div className="cm-review-diff-after">+ {field.after}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(saveError || ((saveState === "saved" || hasUnsavedChanges) && hasActiveProposal && proposalMode)) && (
            <div className="cm-save-indicator" role="status">
              {saveError && <span>{saveError}</span>}
              {!saveError && saveState === "saved" && <span>Saved.</span>}
              {!saveError && saveState !== "saved" && hasUnsavedChanges && <span>Unsaved changes.</span>}
            </div>
          )}

          <div className="cm-doc-scroll">
            <div className="cm-doc-content">
              <div className="cm-doc-meta">
                <div className="cm-doc-status cm-status-review">
                  <div className="cm-status-dot" />
                  {workspace.document.status}
                </div>
                <div className="cm-doc-version">{workspace.document.version}</div>
                <div className="cm-doc-author">
                  Edited by <strong>{workspace.document.editedBy}</strong> · {workspace.document.editedAt}
                </div>
                <div className="cm-doc-author">{workspaceMode === "published" ? "Published — read-only" : hasActiveProposal ? (proposalMode ? "Editing proposal" : "Reviewing proposal") : "Published — read-only"}</div>
                <div className="cm-doc-branch">{workspace.document.branch}</div>
              </div>

              <div className="cm-doc-body">
                {compareActive && compareBeforeDoc && compareAfterDoc ? (
                  diffMode === "split" ? (
                    <SideBySideDiff
                      beforeDoc={compareBeforeDoc}
                      afterDoc={compareAfterDoc}
                      beforeLabel={compareFromHash ? `From ${compareFromHash.slice(0, 7)}` : "Before"}
                      afterLabel={compareToHash ? `To ${compareToHash.slice(0, 7)}` : "After"}
                      beforeHash={compareFromHash}
                      afterHash={compareToHash}
                      scrollToNodeId={activeCompareNodeId}
                      activeChangeNodeId={activeCompareNodeId}
                      isExpanded={diffExpandedFullscreen}
                      onExpand={() => setDiffExpandedFullscreen(true)}
                      onClose={() => setDiffExpandedFullscreen(false)}
                    />
                  ) : (
                    <UnifiedDiff
                      beforeDoc={compareBeforeDoc}
                      afterDoc={compareAfterDoc}
                      fromLabel={compareFromHash ? `From ${compareFromHash.slice(0, 7)}` : "Before"}
                      toLabel={compareToHash ? `To ${compareToHash.slice(0, 7)}` : "After"}
                      fromHash={compareFromHash}
                      toHash={compareToHash}
                      scrollToNodeId={activeCompareNodeId}
                      activeChangeNodeId={activeCompareNodeId}
                    />
                  )
                ) : (compareDoc ?? docDraft) ? (
                  <ChronicleEditor
                    content={compareDoc ?? docDraft!}
                    editable={proposalMode && hasActiveProposal && !compareActive}
                    onUpdate={handleEditorUpdate}
                    onSelectionChange={handleSelectionChange}
                    onEditorReady={setEditorInstance}
                    diffManifest={compareActive ? compareManifest : diffManifest}
                    diffVisible={diffVisible}
                    diffMode={diffMode}
                    activeChangeNodeId={compareActive ? activeCompareNodeId : null}
                    threadAnchors={threadAnchors}
                    awareness={awarenessInstance}
                    onLocalSelectionChange={handleLocalSelectionChange}
                    className="cm-editor-wrapper"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </main>

        <aside className={`cm-discussion-panel ${rightPanelCollapsed ? "collapsed" : ""}`.trim()}>
          <button
            className="cm-pane-toggle cm-pane-toggle-right"
            type="button"
            onClick={() => setRightPanelCollapsed((current) => !current)}
            aria-label={rightPanelCollapsed ? "Expand right panel" : "Collapse right panel"}
            title={rightPanelCollapsed ? "Expand right panel" : "Collapse right panel"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d={rightPanelCollapsed ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Tabs
            tabs={discussionTabsWithCount}
            active={activeTab}
            onTabChange={setActiveTab}
            className="cm-panel-tabs-rail"
            orientation={isNarrowLayout ? "horizontal" : "vertical"}
          />
          {!rightPanelCollapsed && <div className="cm-panel-main">
          {actionError ? (
            <div className="cm-inline-action-error" role="alert">
              <span>{actionError}</span>
              <button
                className="cm-thread-action-btn"
                type="button"
                onClick={() => setActionError(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {activeTab === "discussions" && (
            <div className="cm-panel-content active">
              {showDebugStateToggles && (
                <div className="cm-panel-state" aria-label="Discussion panel state">
                  <button
                    className={discussionState === "success" ? "active" : ""}
                    onClick={() => setDiscussionState("success")}
                    type="button"
                  >
                    Success
                  </button>
                  <button
                    className={discussionState === "loading" ? "active" : ""}
                    onClick={() => setDiscussionState("loading")}
                    type="button"
                  >
                    Loading
                  </button>
                  <button
                    className={discussionState === "empty" ? "active" : ""}
                    onClick={() => setDiscussionState("empty")}
                    type="button"
                  >
                    Empty
                  </button>
                  <button
                    className={discussionState === "error" ? "active" : ""}
                    onClick={() => setDiscussionState("error")}
                    type="button"
                  >
                    Error
                  </button>
                </div>
              )}

              {discussionState === "loading" && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line short" />
                  </div>
                </div>
              )}

              {discussionState === "empty" && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card">
                    <h3>No open threads</h3>
                    <p>All discussion threads are currently resolved.</p>
                  </div>
                </div>
              )}

              {discussionState === "error" && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card">
                    <h3>Thread feed unavailable</h3>
                    <p>Discussion service request failed.</p>
                    <button className="cm-compose-send" onClick={() => setDiscussionState("success")} type="button">
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {discussionState === "success" && workspace.threads.length > 0 && (
                <div className="cm-panel-scroll-threadlist">
                  <ThreadList
                    threads={workspace.threads}
                    activeThreadId={activeThread}
                    onSelectThread={selectThread}
                    onReplyThread={(threadId, body) => { void replyToThread(threadId, body); }}
                    onResolveThread={(threadId, resolution) => { void resolveActiveThread(threadId, resolution); }}
                    onReopenThread={(threadId) => { void reopenThread(threadId); }}
                    onVoteThread={(threadId, direction) => { void voteThread(threadId, direction); }}
                    onReactThread={(threadId, emoji) => { void reactThread(threadId, emoji); }}
                    onToggleThreadVisibility={(threadId) => { void toggleThreadVisibility(threadId); }}
                    threadRefs={threadRefs}
                  />
                </div>
              )}

              {discussionState === "success" && workspace.threads.length === 0 && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card cm-panel-fallback-card--compact">
                    <span className="cm-panel-fallback-text">
                      {hasActiveProposal ? "No threads yet." : "No active proposal."}
                    </span>
                    {!hasActiveProposal && (
                      <button className="cm-compose-send" type="button" onClick={() => { void startProposal(); }}>
                        Start Proposal
                      </button>
                    )}
                  </div>
                </div>
              )}

              {discussionState === "success" && hasActiveProposal && (
                <ThreadComposer
                  anchorLabel={currentAnchor}
                  anchorNodeId={composerAnchorNodeId ?? activeNodeId ?? undefined}
                  onSubmit={(text, nodeId, options) => { void submitComment(text, nodeId, options); }}
                />
              )}
            </div>
          )}

          {activeTab === "approvals" && (
            <div className="cm-panel-content active">
              {!hasActiveProposal && !showApprovalRules && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card cm-panel-fallback-card--compact">
                    <span className="cm-panel-fallback-text">Start a proposal to begin the approval process.</span>
                    <button className="cm-compose-send" type="button" onClick={() => { void startProposal(); }}>
                      Start Proposal
                    </button>
                  </div>
                </div>
              )}

              {showApprovalRules && (
                <div className="cm-panel-scroll cm-panel-scroll-approval">
                  <ApprovalRulesEditor
                    documentId={workspace?.document.id ?? ""}
                    mode={workspace?.approvalWorkflow?.mode ?? "sequential"}
                    groups={workspace?.approvalWorkflow?.groups.map((g) => ({
                      id: g.groupId,
                      documentId: workspace?.document.id ?? "",
                      name: g.groupName,
                      minApprovals: g.minApprovals,
                      sortOrder: g.sortOrder,
                      members: g.members,
                      createdAt: "",
                      updatedAt: "",
                    })) ?? []}
                    workspaceUsers={workspaceUsers.map((u) => ({
                      id: u.id,
                      displayName: u.displayName,
                      email: u.email,
                    }))}
                    saving={approvalRulesSaving}
                    onSave={(payload) => {
                      void handleSaveApprovalRules(payload);
                    }}
                    onCancel={() => setShowApprovalRules(false)}
                  />
                </div>
              )}

              {hasActiveProposal && !showApprovalRules && (
                <div className="cm-panel-scroll cm-panel-scroll-approval">
                  <div className="cm-approval-panel cm-approval-panel-tab">
                    <div className="cm-approval-header">
                      Required Approvals
                      <span className="cm-approval-header-actions">
                        <button
                          className="cm-rules-configure-btn"
                          type="button"
                          onClick={() => setShowApprovalRules(true)}
                          title="Configure approval workflow"
                          aria-label="Configure approval workflow"
                        >
                          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                            <path d="M6.5 1.2l-.5 1.5-.8.3-1.3-.8L2.2 3.9l.8 1.3-.3.8-1.5.5v2.1l1.5.5.3.8-.8 1.3 1.5 1.5 1.3-.8.8.3.5 1.5h2.1l.5-1.5.8-.3 1.3.8 1.5-1.5-.8-1.3.3-.8 1.5-.5V6.5l-1.5-.5-.3-.8.8-1.3-1.5-1.5-1.3.8-.8-.3L8.6 1.2H6.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                            <circle cx="7.5" cy="7.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                          </svg>
                        </button>
                        <span className="cm-approval-progress">
                          {workspace.approvalWorkflow
                            ? `${workspace.approvalWorkflow.groups.filter((g) => g.status === "approved").length} / ${workspace.approvalWorkflow.groups.length}`
                            : `${3 - pendingApprovals} / 3`}
                        </span>
                      </span>
                    </div>
                    {showDebugStateToggles && (
                      <div className="cm-panel-state cm-panel-state-subtle" aria-label="Approvals panel state">
                        <button
                          className={effectiveApprovalState === "success" ? "active" : ""}
                          onClick={() => setApprovalStateOverride("success")}
                          type="button"
                        >
                          Success
                        </button>
                        <button
                          className={effectiveApprovalState === "loading" ? "active" : ""}
                          onClick={() => setApprovalStateOverride("loading")}
                          type="button"
                        >
                          Loading
                        </button>
                        <button
                          className={effectiveApprovalState === "empty" ? "active" : ""}
                          onClick={() => setApprovalStateOverride("empty")}
                          type="button"
                        >
                          Empty
                        </button>
                        <button
                          className={effectiveApprovalState === "error" ? "active" : ""}
                          onClick={() => setApprovalStateOverride("error")}
                          type="button"
                        >
                          Error
                        </button>
                      </div>
                    )}
                    {effectiveApprovalState === "loading" && (
                      <div className="cm-approval-fallback">
                        <p>
                          {approvalRefreshBusy
                            ? "Refreshing approval chain..."
                            : mergeBusy
                              ? "Submitting merge..."
                              : approveBusyRole || approvingGroupId
                                ? "Recording approval..."
                                : "Loading approval state..."}
                        </p>
                        <div className="skeleton skeleton-line" />
                        <div className="skeleton skeleton-line short" />
                      </div>
                    )}
                    {effectiveApprovalState === "empty" && (
                      <div className="cm-approval-fallback">
                        <p>No pending approvers remain. Merge gate is clear.</p>
                      </div>
                    )}
                    {effectiveApprovalState === "error" && (
                      <div className="cm-approval-fallback">
                        <p>{approvalError ?? "Approval service request failed."}</p>
                        <button
                          className="cm-compose-send"
                          onClick={() => {
                            void retryApprovalsPanel();
                          }}
                          type="button"
                        >
                          {apiUnavailable ? "Retry API" : "Retry"}
                        </button>
                      </div>
                    )}
                    {effectiveApprovalState === "success" && (
                      !workspace.approvalWorkflow || workspace.approvalWorkflow.groups.length === 0 ? (
                        <div className="cm-approval-fallback">
                          <p>Document owner approval required by default. Customize the approval workflow to add reviewers.</p>
                          <button
                            className="cm-compose-send"
                            type="button"
                            onClick={() => setShowApprovalRules(true)}
                          >
                            Set up approval rules
                          </button>
                          <button
                            className={`cm-merge-btn ${mergeReady ? "" : "disabled"}`}
                            type="button"
                            disabled={!mergeReady || mergeBusy}
                            onClick={mergeReady ? () => void mergeCurrentProposal() : undefined}
                          >
                            {mergeBusy ? "Merging..." : mergeReady ? "Ready to merge" : openThreads > 0 ? `Resolve ${openThreads} open thread${openThreads > 1 ? "s" : ""}` : pendingApprovals > 0 ? `Awaiting ${pendingApprovals} approval${pendingApprovals > 1 ? "s" : ""}` : "Ready to merge"}
                          </button>
                        </div>
                      ) : (
                        <ApprovalChain
                          gate={workspace.approvals}
                          details={workspace.approvalDetails}
                          stages={workspace.approvalStages}
                          approvingRole={approveBusyRole}
                          onApprove={(role) => {
                            void approveRole(role);
                          }}
                          workflow={workspace.approvalWorkflow}
                          approvingGroupId={approvingGroupId}
                          onApproveGroup={handleApproveGroup}
                          onRejectGroup={handleRejectGroup}
                          currentUserId={currentUserId}
                          onMerge={() => {
                            void mergeCurrentProposal();
                          }}
                          canMerge={hasActiveProposal && mergeReady && !mergeBusy}
                          mergeLabel={
                            mergeBusy
                              ? "Merging..."
                              : !hasActiveProposal
                                ? "⊘ Start proposal"
                                : undefined
                          }
                        />
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="cm-panel-content active">
              <div className="cm-panel-scroll cm-hist">
                {/* ── Branch header ── */}
                <div className="cm-hist-branch-bar">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 3v6.5a3.5 3.5 0 003.5 3.5h0A3.5 3.5 0 0012 9.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="5" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                  <span className="cm-hist-branch-name">{historyData?.branch ?? workspace.document.branch.split(" -> ")[0]}</span>
                  {mainHistoryData && <span className="cm-hist-branch-sep">/</span>}
                  {mainHistoryData && <span className="cm-hist-branch-name cm-hist-branch-name--secondary">{mainHistoryData.branch}</span>}
                </div>

                {/* ── Compare bar ── */}
                {compareOptions.length > 1 ? (
                  <div className="cm-hist-compare-bar">
                    <div className="cm-hist-compare-selects">
                      <select
                        className="cm-hist-select"
                        aria-label="Compare from commit"
                        value={compareFromHash}
                        onChange={(event) => setCompareFromHash(event.target.value)}
                      >
                        <option value="">From…</option>
                        {compareOptions.map((option) => (
                          <option key={`from-${option.hash}`} value={option.hash}>{option.label}</option>
                        ))}
                      </select>
                      <svg className="cm-hist-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <select
                        className="cm-hist-select"
                        aria-label="Compare to commit"
                        value={compareToHash}
                        onChange={(event) => setCompareToHash(event.target.value)}
                      >
                        <option value="">To…</option>
                        {compareOptions.map((option) => (
                          <option key={`to-${option.hash}`} value={option.hash}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="cm-hist-compare-btn"
                      type="button"
                      disabled={!compareFromHash || !compareToHash || compareFromHash === compareToHash}
                      onClick={() => { void compareSelectedCommits(); }}
                    >
                      Compare
                    </button>
                  </div>
                ) : null}

                {/* ── Change navigator (when comparing) ── */}
                {compareActive ? (
                  <div className="cm-hist-changes">
                    <div className="cm-hist-changes-head">
                      <span className="cm-hist-changes-count">{filteredCompareChanges.length}<span className="cm-hist-changes-of"> / {compareChanges.length}</span></span>
                      <span className="cm-hist-changes-label">changes</span>
                      <div className="cm-hist-changes-nav">
                        <button className="cm-hist-nav-btn" type="button" onClick={() => stepCompareChange(-1)} aria-label="Previous change">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button className="cm-hist-nav-btn" type="button" onClick={() => stepCompareChange(1)} aria-label="Next change">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                    {/* Compact inline filters */}
                    <div className="cm-hist-filters">
                      <select className="cm-hist-filter" aria-label="Filter change type" value={compareFilterType} onChange={(event) => setCompareFilterType(event.target.value as CompareChangeType | "all")}>
                        <option value="all">All types</option>
                        <option value="modified">Modified</option>
                        <option value="inserted">Inserted</option>
                        <option value="deleted">Deleted</option>
                        <option value="moved">Moved</option>
                        <option value="format_only">Format only</option>
                      </select>
                      <select className="cm-hist-filter" aria-label="Filter change author" value={compareFilterAuthor} onChange={(event) => setCompareFilterAuthor(event.target.value)}>
                        {compareAuthorOptions.map((author) => (
                          <option key={author} value={author}>{author === "all" ? "All authors" : author}</option>
                        ))}
                      </select>
                      <select className="cm-hist-filter" aria-label="Filter review state" value={compareFilterState} onChange={(event) => setCompareFilterState(event.target.value as CompareReviewState | "all")}>
                        <option value="all">All states</option>
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                        <option value="deferred">Deferred</option>
                      </select>
                      <label className="cm-hist-filter-check">
                        <input type="checkbox" checked={compareUnresolvedOnly} onChange={(event) => setCompareUnresolvedOnly(event.target.checked)} />
                        Unresolved
                      </label>
                    </div>
                    {/* Change list */}
                    {filteredCompareChanges.length === 0 ? (
                      <p className="cm-hist-empty">No changes match filters.</p>
                    ) : (
                      <div className="cm-hist-change-list">
                        {filteredCompareChanges.map((change) => (
                          <button
                            key={change.id}
                            className={`cm-hist-change ${activeCompareChangeId === change.id ? "cm-hist-change--active" : ""}`}
                            type="button"
                            onClick={() => focusCompareChange(change)}
                          >
                            <div className="cm-hist-change-header">
                              <span className={`cm-hist-change-type cm-hist-ct--${change.type}`}>{change.type}</span>
                              <span className={`cm-hist-change-state cm-hist-cs--${change.reviewState}`}>{change.reviewState}</span>
                            </div>
                            <div className="cm-hist-change-body">{change.snippet || "Change"}</div>
                            <div className="cm-hist-change-footer">
                              <span>{change.author.name}</span>
                              {change.threadIds.length > 0 && <span className="cm-hist-change-threads">{change.threadIds.length} thread{change.threadIds.length > 1 ? "s" : ""}</span>}
                            </div>
                            {change.reviewState === "pending" && workspace?.document.proposalId && (
                              <div className="cm-hist-change-actions">
                                <button className="cm-hist-action cm-hist-action--accept" type="button" onClick={(e) => { e.stopPropagation(); void handleChangeReviewAction(change.id, "accepted"); }}>Accept</button>
                                <button className="cm-hist-action cm-hist-action--reject" type="button" onClick={(e) => { e.stopPropagation(); void handleChangeReviewAction(change.id, "rejected"); }}>Reject</button>
                                <button className="cm-hist-action" type="button" onClick={(e) => { e.stopPropagation(); void handleChangeReviewAction(change.id, "deferred"); }}>Defer</button>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* ── Commit timeline ── */}
                {(() => {
                  const branchCommits = historyData?.commits ?? workspace.history;
                  const branchLabel = historyData?.branch ?? "active";
                  return (
                    <div className="cm-hist-timeline">
                      <div className="cm-hist-section-head">
                        <span>{branchLabel}</span>
                        <span className="cm-hist-section-count">{branchCommits.length}</span>
                      </div>
                      <div className="cm-hist-commit-list">
                        {branchCommits.map((item, idx) => {
                          const parts = item.meta.split(" · ");
                          const author = parts[0]?.trim() ?? "";
                          const time = parts[1]?.trim() ?? "";
                          const isSelected = compareFromHash === item.hash || compareToHash === item.hash;
                          return (
                            <button
                              className={`cm-hist-commit ${isSelected ? "cm-hist-commit--selected" : ""}`}
                              key={`${branchLabel}-${item.hash}`}
                              type="button"
                              onClick={() => { void compareVersionAgainstCurrent(item.hash, `${branchLabel} · ${item.hash.slice(0, 7)}`); }}
                              title="Compare with current"
                            >
                              <div className="cm-hist-commit-dot">{idx === 0 && <div className="cm-hist-commit-dot-inner" />}</div>
                              <div className="cm-hist-commit-body">
                                <div className="cm-hist-commit-msg">{item.message}</div>
                                <div className="cm-hist-commit-info">
                                  <span className="cm-hist-commit-author">{author}</span>
                                  {time && <span className="cm-hist-commit-time">{time}</span>}
                                  <code className="cm-hist-commit-hash">{item.hash.slice(0, 7)}</code>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Main branch commits (when on proposal) ── */}
                {mainHistoryData ? (
                  <div className="cm-hist-timeline">
                    <div className="cm-hist-section-head">
                      <span>{mainHistoryData.branch}</span>
                      <span className="cm-hist-section-count">{mainHistoryData.commits.length}</span>
                    </div>
                    <div className="cm-hist-commit-list">
                      {mainHistoryData.commits.map((item, idx) => {
                        const parts = item.meta.split(" · ");
                        const author = parts[0]?.trim() ?? "";
                        const time = parts[1]?.trim() ?? "";
                        const isSelected = compareFromHash === item.hash || compareToHash === item.hash;
                        return (
                          <button
                            className={`cm-hist-commit ${isSelected ? "cm-hist-commit--selected" : ""}`}
                            key={`${mainHistoryData.branch}-${item.hash}`}
                            type="button"
                            onClick={() => { void compareVersionAgainstCurrent(item.hash, `main · ${item.hash.slice(0, 7)}`); }}
                            title="Compare with current"
                          >
                            <div className="cm-hist-commit-dot">{idx === 0 && <div className="cm-hist-commit-dot-inner" />}</div>
                            <div className="cm-hist-commit-body">
                              <div className="cm-hist-commit-msg">{item.message}</div>
                              <div className="cm-hist-commit-info">
                                <span className="cm-hist-commit-author">{author}</span>
                                {time && <span className="cm-hist-commit-time">{time}</span>}
                                <code className="cm-hist-commit-hash">{item.hash.slice(0, 7)}</code>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* ── Named Versions ── */}
                {historyData?.namedVersions.length ? (
                  <div className="cm-hist-timeline cm-hist-timeline--named">
                    <div className="cm-hist-section-head">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1.5 2.5h5l1.5 2H14.5v9h-13z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                      <span>Named Versions</span>
                      <span className="cm-hist-section-count">{historyData.namedVersions.length}</span>
                    </div>
                    <div className="cm-hist-commit-list">
                      {historyData.namedVersions.map((version) => {
                        const isSelected = compareFromHash === version.hash || compareToHash === version.hash;
                        return (
                          <button
                            className={`cm-hist-commit cm-hist-commit--named ${isSelected ? "cm-hist-commit--selected" : ""}`}
                            key={`${version.hash}-${version.name}`}
                            type="button"
                            onClick={() => { void compareVersionAgainstCurrent(version.hash, `named version: ${version.name}`); }}
                            title="Compare with current"
                          >
                            <div className="cm-hist-commit-dot"><div className="cm-hist-commit-dot-tag" /></div>
                            <div className="cm-hist-commit-body">
                              <div className="cm-hist-commit-msg">{version.name}</div>
                              <div className="cm-hist-commit-info">
                                <span className="cm-hist-commit-author">{version.createdBy}</span>
                                <code className="cm-hist-commit-hash">{version.hash.slice(0, 7)}</code>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* ── Status ── */}
                {historyLoading && <div className="cm-hist-status">Loading history…</div>}
                {historyError && <div className="cm-hist-status cm-hist-status--error">{historyError}</div>}
                {compareSummary && (
                  <div className="cm-hist-summary">
                    <pre>{compareSummary}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "decisions" && (
            <div className="cm-panel-content active">
              <div className="cm-panel-scroll cm-dlog">
                {/* ── Compact filter bar ── */}
                <div className="cm-dlog-toolbar">
                  <select className="cm-dlog-filter" value={decisionOutcomeFilter} onChange={(event) => setDecisionOutcomeFilter(event.target.value as typeof decisionOutcomeFilter)} aria-label="Filter by outcome">
                    <option value="">All outcomes</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="DEFERRED">Deferred</option>
                  </select>
                  <input className="cm-dlog-search" value={decisionQuery} onChange={(event) => setDecisionQuery(event.target.value)} placeholder="Search decisions…" aria-label="Search decisions" />
                  <input className="cm-dlog-search cm-dlog-search--sm" value={decisionAuthor} onChange={(event) => setDecisionAuthor(event.target.value)} placeholder="Author" aria-label="Filter by author" />
                </div>
                {/* ── Decision entries ── */}
                {decisionRows && decisionRows.length === 0 ? (
                  <div className="cm-dlog-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinejoin="round"/><path d="M2 17l10 5 10-5" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12l10 5 10-5" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <p>No decisions yet</p>
                    <span>Resolve a thread or merge a proposal to create the first entry.</span>
                  </div>
                ) : (
                  <div className="cm-dlog-list">
                    {(decisionRows
                      ? decisionRows.map((row) => ({
                          date: new Date(row.decidedAt).toISOString().slice(0, 10),
                          hash: row.commitHash,
                          tags: [{ label: row.outcome, tone: (row.outcome === "REJECTED" ? "rejected" : row.outcome === "DEFERRED" ? "deferred" : "approved") as "approved" | "rejected" | "deferred" }],
                          text: row.rationale,
                          by: row.decidedBy,
                        }))
                      : workspace.decisions.map((d) => ({
                          date: d.date.split(" · ")[0] ?? d.date,
                          hash: d.date.split(" · ")[1] ?? "",
                          tags: d.tags,
                          text: d.text,
                          by: d.by,
                        }))
                    ).map((entry, idx) => (
                      <div className="cm-dlog-entry" key={`${entry.date}-${idx}`}>
                        <div className="cm-dlog-entry-left">
                          <div className={`cm-dlog-indicator cm-dlog-indicator--${entry.tags[0]?.tone ?? "approved"}`} />
                        </div>
                        <div className="cm-dlog-entry-body">
                          <div className="cm-dlog-entry-head">
                            {entry.tags.map((tag) => (
                              <span key={tag.label} className={`cm-dlog-tag cm-dlog-tag--${tag.tone}`}>{tag.label}</span>
                            ))}
                            <span className="cm-dlog-entry-date">{entry.date}</span>
                          </div>
                          <div className="cm-dlog-entry-text">{entry.text}</div>
                          <div className="cm-dlog-entry-meta">
                            <span className="cm-dlog-entry-author">{entry.by}</span>
                            {entry.hash && <code className="cm-dlog-entry-hash">{entry.hash.slice(0, 7)}</code>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "changes" && (
            <div className="cm-panel-content active">
              <DiffNavigator
                changes={compareChanges}
                activeChangeId={activeCompareChangeId}
                diffMode={diffMode}
                onChangeClick={focusCompareChange}
                onStepChange={stepCompareChange}
                onReviewAction={(changeId, action) => void handleChangeReviewAction(changeId, action)}
              />
            </div>
          )}

          {activeTab === "branches" && (
            <div className="cm-panel-content active">
              <BranchGraph
                historyData={historyData}
                mainHistoryData={mainHistoryData}
                proposalId={workspace?.document.proposalId}
                branchName={workspace?.document.branch || "main"}
                onSelectCommit={(commitHash) => {
                  setActiveTab("history");
                  const commitElement = document.querySelector(`[data-commit-hash="${commitHash}"]`);
                  if (commitElement) {
                    commitElement.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                onExpand={() => setBranchGraphExpanded(true)}
                onClose={() => setBranchGraphExpanded(false)}
                isExpanded={branchGraphExpanded}
                loading={historyLoading}
                error={historyError}
              />
            </div>
          )}

          </div>}
        </aside>
      </div>

      <div className="cm-statusbar">
        <div className="cm-statusbar-item" title={onlineUsers.length > 0 ? onlineUsers.join(", ") : undefined}>
          <div className="cm-statusbar-dot" />
          {realtimeStatus === "connected" ? "Connected" : realtimeStatus === "connecting" ? "Connecting" : "Offline"} · {onlineUsers.length} online
        </div>
        <div className="cm-statusbar-item cm-status-branch">{workspace.document.branch.split(" -> ")[0]}</div>
        <div className="cm-statusbar-item">{workspace.threads.length} threads · {resolvedThreads} resolved · {openThreads} open</div>
        <div className="cm-statusbar-spacer" />
        <div className="cm-statusbar-item">Autosaved · now</div>
      </div>

      {/* Share Dialog */}
      <ShareDialog
        documentId={workspace.document.id}
        documentTitle={content.title}
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
      />

      {/* Proposal Picker Dialog */}
      <Dialog isOpen={proposalPickerOpen} onClose={() => setProposalPickerOpen(false)} title="Open Proposals" size="medium">
        <div className="cm-proposal-picker">
          <p className="cm-proposal-picker-intro">
            This document has existing open proposals. You can continue working on one, or start a new proposal.
          </p>
          <div className="cm-proposal-picker-list">
            {existingProposals.map((p) => (
              <button
                key={p.id}
                className="cm-proposal-picker-item"
                type="button"
                onClick={() => void handlePickExistingProposal()}
              >
                <span className="cm-proposal-picker-title">{p.title}</span>
                <span className="cm-proposal-picker-meta">
                  by {p.createdBy} · {p.status.toLowerCase()} · {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
          <button
            className="cm-compose-send"
            type="button"
            onClick={() => void handleCreateNewProposal()}
          >
            Create New Proposal
          </button>
        </div>
      </Dialog>

      {/* Space Permissions Dialog */}
      {activeSpaceForPermissions && (
        <SpacePermissions
          space={activeSpaceForPermissions}
          isOpen={!!activeSpaceForPermissions}
          onClose={() => setActiveSpaceForPermissions(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={deleteConfirmId !== null}
        onClose={() => { setDeleteConfirmId(null); setDeleteError(null); }}
        title="Delete document"
        size="small"
      >
        <p style={{ margin: "0 0 16px", color: "var(--ink-2)" }}>
          This document will be moved to Trash. You can restore it later or delete it permanently.
        </p>
        {deleteError && (
          <p style={{ margin: "0 0 12px", color: "var(--red)", fontSize: "13px" }}>{deleteError}</p>
        )}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            className="cm-btn"
            type="button"
            onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="cm-btn cm-btn-danger"
            type="button"
            onClick={handleConfirmDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
