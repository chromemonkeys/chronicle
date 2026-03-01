import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  approveProposalRole,
  connectWorkspaceRealtime,
  createDocument,
  createProposal,
  createProposalThread,
  fetchDocuments,
  fetchDecisionLog,
  fetchWorkspaces,
  sendWorkspaceRealtimeUpdate,
  fetchDocumentBlame,
  fetchDocumentCompare,
  fetchDocumentHistory,
  fetchWorkspace,
  isApiError,
  mergeProposal,
  moveDocument,
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
  BlameEntry,
  CompareContentSnapshot,
  DecisionLogEntry,
  DocumentComparePayload,
  DocumentHistoryPayload,
  DocumentSummary,
  MergeGateRole,
  Space,
  TreeItemData,
  WorkspaceContent,
  WorkspacePayload
} from "../api/types";
import { ApprovalChain } from "../ui/ApprovalChain";
import { BlameView } from "../ui/BlameView";
import { BranchGraph } from "../ui/BranchGraph";
import { DecisionLogTable } from "../ui/DecisionLogTable";
import { DocumentTree } from "../ui/DocumentTree";
import { EmptyStateError, EmptyState } from "../ui/EmptyState";
import { Tabs } from "../ui/Tabs";
import { ThreadComposer } from "../ui/ThreadComposer";
import { ThreadList } from "../ui/ThreadList";
import { ExportMenu } from "../components/ExportMenu";
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

type PanelTab = "discussions" | "approvals" | "history" | "decisions" | "changes" | "blame" | "branches";
type DiffMode = "split" | "unified";
type ViewState = "success" | "loading" | "empty" | "error";
type WorkspaceMode = "proposal" | "review";
type SidebarSection = "all" | "open" | "merged" | "decisions";
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
    id: "blame",
    label: "Blame",
    ariaLabel: "Blame attribution",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <circle cx="10" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 17c0-3 2.7-5 6-5s6 2 6 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    id: "branches",
    label: "Branches",
    ariaLabel: "Branch timeline",
    icon: (
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false" aria-hidden="true">
        <path d="M4 4v12M4 6c2 0 4-1.5 4-4M4 14c2 0 4 1.5 4 4M4 10c3 0 6-2 6-5h4a2 2 0 0 1 2 2v6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="4" cy="6" r="1.5" fill="currentColor" />
        <circle cx="4" cy="14" r="1.5" fill="currentColor" />
        <circle cx="4" cy="10" r="1.5" fill="currentColor" />
        <circle cx="16" cy="10" r="1.5" fill="currentColor" />
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

function pluralize(value: number, singular: string, plural: string) {
  return value === 1 ? singular : plural;
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

function roleLabel(role: string): string {
  switch (role) {
    case "security":
      return "Security";
    case "architectureCommittee":
      return "Architecture Committee";
    case "legal":
      return "Legal";
    default:
      return role;
  }
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
  const [viewState, setViewState] = useState<ViewState>("loading");
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
  const [contentDraft, setContentDraft] = useState<WorkspaceContent | null>(null);
  const [docDraft, setDocDraft] = useState<DocumentContent | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<DocumentHistoryPayload | null>(null);
  const [mainHistoryData, setMainHistoryData] = useState<DocumentHistoryPayload | null>(null);
  const [decisionRows, setDecisionRows] = useState<DecisionLogEntry[] | null>(null);
  const [documentIndex, setDocumentIndex] = useState<DocumentSummary[]>([]);
  const [documentIndexState, setDocumentIndexState] = useState<ViewState>("loading");
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("open");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [decisionOutcomeFilter, setDecisionOutcomeFilter] = useState<"" | "ACCEPTED" | "REJECTED" | "DEFERRED">("");
  const [decisionQuery, setDecisionQuery] = useState("");
  const [decisionAuthor, setDecisionAuthor] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Blame view state
  const [blameEntries, setBlameEntries] = useState<BlameEntry[]>([]);
  const [blameLoading, setBlameLoading] = useState(false);
  const [blameError, setBlameError] = useState<string | null>(null);
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
  const [activeCompareChangeId, setActiveCompareChangeId] = useState<string>("");
  const [mergeGateBlockers, setMergeGateBlockers] = useState<MergeGateBlockerRow[]>([]);
  const [mergeGatePolicy, setMergeGatePolicy] = useState<MergeGatePolicySnapshot | null>(null);
  const [approveBusyRole, setApproveBusyRole] = useState<MergeGateRole | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [onlineCount, setOnlineCount] = useState(1);
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeSendTimerRef = useRef<number | null>(null);
  const latestRealtimeAtRef = useRef<number>(0);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [reviewDiff, setReviewDiff] = useState<DocumentComparePayload | null>(null);
  const [reviewDiffState, setReviewDiffState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [isNarrowLayout, setIsNarrowLayout] = useState(() => window.matchMedia("(max-width: 980px)").matches);
  const baseDocRef = useRef<DocumentContent | null>(null);
  const [diffManifest, setDiffManifest] = useState<DiffManifest | null>(null);
  const proposalMode = workspaceMode === "proposal";
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
    setOnlineCount(1);
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

  const refreshDocumentIndex = useCallback(async (mode: "foreground" | "background" = "foreground") => {
    if (mode === "foreground") {
      setDocumentIndexState("loading");
    }
    try {
      const documents = await fetchDocuments();
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
    void refreshDocumentIndex("foreground");
  }, [refreshDocumentIndex]);

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

  const openReviewDocuments = useMemo(
    () => documentIndex.filter((doc) => doc.status === "In review" || doc.status === "Ready for approval"),
    [documentIndex]
  );
  const mergedDocuments = useMemo(
    () => documentIndex.filter((doc) => doc.status === "Approved"),
    [documentIndex]
  );
  const sidebarDocuments = useMemo(() => {
    if (sidebarSection === "all") {
      return documentIndex;
    }
    if (sidebarSection === "open") {
      return openReviewDocuments;
    }
    if (sidebarSection === "merged") {
      return mergedDocuments;
    }
    return [];
  }, [documentIndex, openReviewDocuments, mergedDocuments, sidebarSection]);

  // Fetch spaces for folder hierarchy
  const [spaces, setSpaces] = useState<Space[]>([]);
  useEffect(() => {
    fetchWorkspaces()
      .then((response) => setSpaces(response.spaces))
      .catch(() => setSpaces([]));
  }, []);

  // Transform documents to hierarchical tree items (spaces as folders with nested children)
  const treeItems: TreeItemData[] = useMemo(() => {
    // Group documents by space
    const docsBySpace = new Map<string, DocumentSummary[]>();
    for (const doc of sidebarDocuments) {
      const spaceDocs = docsBySpace.get(doc.spaceId) ?? [];
      spaceDocs.push(doc);
      docsBySpace.set(doc.spaceId, spaceDocs);
    }
    
    // Create space folders with nested documents as children
    const items: TreeItemData[] = [];
    
    for (const space of spaces) {
      const spaceDocs = docsBySpace.get(space.id) ?? [];
      
      // Create children array (nested documents)
      const children: TreeItemData[] = spaceDocs.map((doc) => ({
        id: doc.id,
        label: doc.title,
        icon: "📄",
        badge: doc.openThreads > 0 ? "pending" : doc.status === "Approved" ? "approved" : undefined,
        status: doc.status,
        openThreads: doc.openThreads,
      }));
      
      // Add space as folder with children
      items.push({
        id: `space-${space.id}`,
        label: space.name,
        icon: "📂",
        isFolder: true,
        children,
      });
    }
    
    // Add documents with unknown space (at root level, not in folder)
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
  }, [sidebarDocuments, spaces]);

  // Handle creating a new document
  const handleCreateDocument = useCallback(async (spaceId?: string) => {
    try {
      const result = await createDocument("Untitled Document", "", spaceId);
      navigate(`/workspace/${result.document.id}`);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to create document";
      setActionError(message);
    }
  }, [navigate]);

  // Handle moving a document
  const handleMoveDocument = useCallback(async (documentId: string, targetSpaceId: string) => {
    try {
      await moveDocument(documentId, targetSpaceId);
      // Refresh the document index to reflect the move
      const docs = await fetchDocuments();
      setDocumentIndex(docs);
    } catch (error) {
      const message = isApiError(error) ? error.message : "Failed to move document";
      setActionError(message);
    }
  }, []);

  const sidebarAllCount = documentIndexState === "loading" ? (workspace?.counts.allDocuments ?? 0) : documentIndex.length;
  const sidebarOpenReviewCount =
    documentIndexState === "loading" ? (workspace?.counts.openReviews ?? 0) : openReviewDocuments.length;
  const sidebarMergedCount = documentIndexState === "loading" ? (workspace?.counts.merged ?? 0) : mergedDocuments.length;

  useEffect(() => {
    if (activeTab !== "discussions") {
      return;
    }
    const thread = threadRefs.current[activeThread];
    if (thread) {
      thread.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeThread, activeTab]);

  useEffect(() => {
    if (activeTab === "decisions") {
      setSidebarSection("decisions");
      return;
    }
    if (sidebarSection === "decisions") {
      setSidebarSection("open");
    }
  }, [activeTab, sidebarSection]);

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

  // Blame view data fetching
  useEffect(() => {
    if (activeTab !== "blame" || !workspace) {
      return;
    }
    let active = true;
    setBlameLoading(true);
    setBlameError(null);
    fetchDocumentBlame(workspace.document.id, workspace.document.proposalId)
      .then((response) => {
        if (!active) return;
        setBlameEntries(response.entries);
        setBlameLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        setBlameEntries([]);
        setBlameError(isApiError(error) ? error.message : "Failed to load blame data.");
        setBlameLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, workspace?.document.id, workspace?.document.proposalId]);

  useEffect(() => {
    if (!workspace?.document.proposalId) {
      if (realtimeSocketRef.current) {
        realtimeSocketRef.current.close();
      }
      setRealtimeStatus("offline");
      setOnlineCount(1);
      realtimeSocketRef.current = null;
      return;
    }

    setRealtimeStatus("connecting");
    const socket = connectWorkspaceRealtime(
      workspace.document.id,
      workspace.document.proposalId,
      (event) => {
        if (event.type === "connected") {
          setRealtimeStatus("connected");
          setOnlineCount(event.participants);
          return;
        }
        if (event.type === "presence") {
          setRealtimeStatus("connected");
          setOnlineCount(event.participants);
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
      return;
    }
    realtimeSocketRef.current = socket;

    return () => {
      realtimeSocketRef.current = null;
      socket.close();
    };
  }, [workspace?.document.id, workspace?.document.proposalId, workspace?.nodeIds]);

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

  async function openMergeBlocker(row: MergeGateBlockerRow) {
    const targetTab = row.link?.tab;
    if (targetTab) {
      setActiveTab(targetTab);
    }
    if (row.type === "thread") {
      const threadID = row.threadId ?? row.link?.threadId;
      if (threadID) {
        selectThread(threadID);
      }
      return;
    }
    if (row.type === "change") {
      const changeID = row.changeId ?? row.link?.changeId;
      let availableChanges = compareChanges;
      if (!compareActive) {
        const loadedChanges = await compareLatestCommits();
        if (loadedChanges) {
          availableChanges = loadedChanges;
        }
      }
      const fallbackNodeId = row.link?.nodeId;
      if (!changeID) {
        if (fallbackNodeId) {
          setActiveNodeId(fallbackNodeId);
          setComposerAnchorNodeId(fallbackNodeId);
        }
        return;
      }
      const match = availableChanges.find((item) => item.id === changeID);
      if (match) {
        focusCompareChange(match);
      } else if (fallbackNodeId) {
        setActiveNodeId(fallbackNodeId);
        setComposerAnchorNodeId(fallbackNodeId);
      }
      return;
    }
    setActiveTab("approvals");
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
      sendWorkspaceRealtimeUpdate(realtimeSocketRef.current, nextContent, doc);
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

  const handleHoverBlockChange = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
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
      const updated = await createProposal(workspace.document.id);
      applyWorkspacePayload(updated);
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not start proposal.");
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
        setApprovalError(message);
        
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
        setApprovalError(message);
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

  async function createNamedVersion() {
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
  const mergeReady = hasActiveProposal && pendingApprovals === 0 && openThreads === 0 && runtimeApprovalState === "success";
  const showMergeBlockers = hasActiveProposal && !mergeReady && effectiveApprovalState === "success";
  const mergeBlockerSummary = `Merge blockers: ${pendingApprovals} pending ${pluralize(pendingApprovals, "approval", "approvals")}, ${openThreads} open ${pluralize(openThreads, "thread", "threads")}.`;
  const fallbackMergeBlockers: MergeGateBlockerRow[] = workspace
    ? (() => {
        const approvalRows: MergeGateBlockerRow[] = (Object.entries(workspace.approvals) as Array<[MergeGateRole, string]>)
      .filter(([, status]) => status !== "Approved")
      .map(([role]) => ({
        id: `approval:${role}`,
        type: "approval" as const,
        label: `${roleLabel(role)} approval is pending`,
        role,
        link: { tab: "approvals" as PanelTab, role }
      }));
        const threadRows: MergeGateBlockerRow[] = workspace.threads
      .filter((thread) => thread.status !== "RESOLVED")
      .map((thread) => ({
        id: `thread:${thread.id}`,
        type: "thread" as const,
        label: `Thread ${thread.id} is still open`,
        threadId: thread.id,
        link: { tab: "discussions" as PanelTab, threadId: thread.id, nodeId: thread.anchorNodeId }
      }));
        return [...approvalRows, ...threadRows];
      })()
    : [];
  const activeMergeBlockers = mergeGateBlockers.length > 0 ? mergeGateBlockers : fallbackMergeBlockers;
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
          <span className="cm-breadcrumb-current">{content.title}</span>
        </div>
        <div className="cm-topnav-spacer" />
        <div className="cm-topnav-context">
          <div className="cm-mode-toggle" aria-label="Workspace mode">
            <button
              className={workspaceMode === "proposal" ? "active" : ""}
              onClick={() => setWorkspaceMode("proposal")}
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
          <div className="cm-branch-badge" aria-label="Current branch">
            <div className="cm-branch-dot" />
            {workspace.document.branch.split(" -> ")[0]}
          </div>
        </div>

        <div className="cm-topnav-actions">
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
              className="cm-action-btn" 
              type="button" 
              onClick={() => setActiveTab("history")}
              title="View history"
            >
              <span>View History</span>
            </button>
          </div>

	          <div className="cm-action-group cm-action-group--document">
	            <ExportMenu documentId={workspace.document.id} documentTitle={content.title} />
	            <button
	              className="cm-action-btn"
	              type="button"
	              disabled={!workspace.document.proposalId}
              onClick={() => void createNamedVersion()}
              title="Save named version"
            >
              <span>Save Version</span>
            </button>
            <button
              className="cm-action-btn"
              type="button"
              disabled={!proposalMode || !hasUnsavedChanges || saveState === "saving"}
              onClick={() => void saveDraft()}
              title="Save draft"
            >
              <span>{saveState === "saving" ? "Saving..." : "Save Draft"}</span>
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
          <div className="cm-sidebar-section">
            <div className="cm-sidebar-label">Workspace</div>
            <button
              className={`cm-sidebar-item ${sidebarSection === "all" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => navigate("/documents")}
            >
              All Documents
              <span className="cm-sidebar-count">{sidebarAllCount}</span>
            </button>
            <button
              className={`cm-sidebar-item ${sidebarSection === "open" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => {
                setSidebarSection("open");
                if (activeTab === "decisions") {
                  setActiveTab("discussions");
                }
              }}
            >
              Open Reviews
              <span className="cm-sidebar-count">{sidebarOpenReviewCount}</span>
            </button>
            <button
              className={`cm-sidebar-item ${sidebarSection === "merged" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => {
                setSidebarSection("merged");
                if (activeTab === "decisions") {
                  setActiveTab("discussions");
                }
              }}
            >
              Merged
              <span className="cm-sidebar-count">{sidebarMergedCount}</span>
            </button>
            <button
              className={`cm-sidebar-item ${sidebarSection === "decisions" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => {
                setSidebarSection("decisions");
                setActiveTab("decisions");
              }}
            >
              Decision Log
            </button>
          </div>
          {sidebarSection !== "decisions" && (
            <>
              <div className="cm-sidebar-label">
                {sidebarSection === "all" ? "All Documents" : sidebarSection === "open" ? "Open Reviews" : "Merged"}
              </div>
              {documentIndexState === "loading" && <div className="cm-sidebar-hint">Loading documents...</div>}
              {documentIndexState === "error" && <div className="cm-sidebar-hint">Could not load document list.</div>}
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
                  emptyMessage={
                    sidebarSection === "all"
                      ? "No documents yet. Create your first document to get started."
                      : sidebarSection === "open"
                      ? "No open reviews. Start a proposal to begin a review."
                      : "No merged documents yet."
                  }
                />
              )}
            </>
          )}
          {sidebarSection === "decisions" && (
            <div className="cm-doc-tree">
              <div className="cm-sidebar-label">Decision Log</div>
              <div className="cm-sidebar-hint">Filter outcomes and rationale from the panel on the right.</div>
            </div>
          )}
        </aside>

        <main className="cm-doc-area">
          <EditorToolbar
            editor={editorInstance}
            diffVisible={diffVisible}
            onToggleDiff={() => setDiffVisible((value) => !value)}
            diffMode={diffMode}
            onSetDiffMode={handleDiffModeChange}
          />
          <div className={`cm-merge-gate-banner ${mergeReady ? "ready" : "blocked"}`}>
            <div className="cm-merge-gate-title">
              {hasActiveProposal
                ? (apiUnavailable ? "Merge Gate Unavailable" : (mergeReady ? "Merge Gate Ready" : "Merge Gate Blocked"))
                : "No Active Proposal"}
            </div>
            <div className="cm-merge-gate-copy">
              {hasActiveProposal
                ? (
                  apiUnavailable
                    ? "Approval state is temporarily unavailable. Retry once the API recovers."
                    : mergeReady
                    ? "All required approvals are complete and all threads are resolved."
                    : `Awaiting ${pendingApprovals} approvals and ${openThreads} open thread resolutions.`
                )
                : "Start a proposal to open discussions, collect approvals, and merge changes."}
            </div>
          </div>
          {compareSummary ? (
            <div className="cm-compare-banner" role="status">
              <strong>Latest Compare:</strong> {compareSummary}
            </div>
          ) : null}
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
          {(saveError || saveState === "saved" || hasUnsavedChanges) && (
            <div className="cm-save-indicator" role="status">
              {saveError && <span>{saveError}</span>}
              {!saveError && saveState === "saved" && <span>Saved.</span>}
              {!saveError && saveState !== "saved" && hasUnsavedChanges && <span>Unsaved changes.</span>}
            </div>
          )}
          <div className="cm-save-indicator">
            Add blocks: press <strong>Enter</strong> for a new paragraph, or type <strong>/</strong> at line start for block types.
          </div>

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
                <div className="cm-doc-author">{proposalMode ? "Proposal mode enabled" : "Direct edit mode"}</div>
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
                    editable={proposalMode && !compareActive}
                    onUpdate={handleEditorUpdate}
                    onSelectionChange={handleSelectionChange}
                    onHoverBlockChange={handleHoverBlockChange}
                    onEditorReady={setEditorInstance}
                    diffManifest={compareActive ? compareManifest : diffManifest}
                    diffVisible={diffVisible}
                    diffMode={diffMode}
                    activeChangeNodeId={compareActive ? activeCompareNodeId : null}
                    threadAnchors={threadAnchors}
                    className="cm-editor-wrapper"
                    enableHoverAttribution={activeTab === "blame"}
                    blameEntries={blameEntries}
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
              )}

              {discussionState === "success" && workspace.threads.length === 0 && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card">
                    <h3>{hasActiveProposal ? "No discussion threads yet" : "No active proposal discussion"}</h3>
                    <p>
                      {hasActiveProposal
                        ? "Create the first thread to collect review feedback."
                        : "Start a proposal to enable comment threads and merge-gate discussion."}
                    </p>
                    {!hasActiveProposal ? (
                      <button
                        className="cm-compose-send"
                        type="button"
                        onClick={() => {
                          void startProposal();
                        }}
                      >
                        Start Proposal
                      </button>
                    ) : null}
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
              {!hasActiveProposal && (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card">
                    <h3>No active proposal approvals</h3>
                    <p>Start a proposal to open the required approval chain and merge gate.</p>
                    <button
                      className="cm-compose-send"
                      type="button"
                      onClick={() => {
                        void startProposal();
                      }}
                    >
                      Start Proposal
                    </button>
                  </div>
                </div>
              )}

              {hasActiveProposal && (
                <div className="cm-panel-scroll cm-panel-scroll-approval">
                  <div className="cm-approval-panel cm-approval-panel-tab">
                    <div className="cm-approval-header">
                      Required Approvals
                      <span className="cm-approval-progress">{3 - pendingApprovals} / 3</span>
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
                              : approveBusyRole
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
                      <>
                        {showMergeBlockers ? (
                          <div className="cm-merge-blockers" role="status">
                            <p>{mergeBlockerSummary}</p>
                            {activeMergeBlockers.length > 0 ? (
                              <ul className="cm-merge-blockers-list">
                                {activeMergeBlockers.map((row) => (
                                  <li key={row.id}>
                                    <button
                                      className="cm-thread-action-btn"
                                      type="button"
                                      onClick={() => {
                                        void openMergeBlocker(row);
                                      }}
                                    >
                                      {row.label}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {mergeGatePolicy ? (
                              <p className="cm-merge-blockers-policy">
                                Policy: deferred changes {mergeGatePolicy.allowMergeWithDeferredChanges ? "allowed" : "block merge"}, format-only changes {mergeGatePolicy.ignoreFormatOnlyChangesForGate ? "ignored" : "block merge"}.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <ApprovalChain
                          gate={workspace.approvals}
                          details={workspace.approvalDetails}
                          stages={workspace.approvalStages}
                          approvingRole={approveBusyRole}
                          onApprove={(role) => {
                            void approveRole(role);
                          }}
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
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="cm-panel-content active">
              <div className="cm-panel-scroll">
                <div className="cm-approval-fallback">
                  <strong>Current Branch</strong>
                  <p className="cm-commit-meta">{historyData?.branch ?? workspace.document.branch.split(" -> ")[0]}</p>
                </div>
                {compareActive ? (
                  <div className="cm-approval-fallback cm-compare-rail" aria-label="Change navigator">
                    <strong>Change Navigator</strong>
                    <p className="cm-change-summary">
                      {filteredCompareChanges.length} of {compareChanges.length} changes · {diffMode} mode
                    </p>
                    <div className="cm-change-filters">
                      <label className="cm-compose-select-wrap">
                        <span>Type</span>
                        <select
                          className="cm-compose-select"
                          aria-label="Filter change type"
                          value={compareFilterType}
                          onChange={(event) => setCompareFilterType(event.target.value as CompareChangeType | "all")}
                        >
                          <option value="all">All types</option>
                          <option value="modified">Modified</option>
                          <option value="inserted">Inserted</option>
                          <option value="deleted">Deleted</option>
                          <option value="moved">Moved</option>
                          <option value="format_only">Format only</option>
                        </select>
                      </label>
                      <label className="cm-compose-select-wrap">
                        <span>Author</span>
                        <select
                          className="cm-compose-select"
                          aria-label="Filter change author"
                          value={compareFilterAuthor}
                          onChange={(event) => setCompareFilterAuthor(event.target.value)}
                        >
                          {compareAuthorOptions.map((author) => (
                            <option key={author} value={author}>
                              {author === "all" ? "All authors" : author}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="cm-compose-select-wrap">
                        <span>State</span>
                        <select
                          className="cm-compose-select"
                          aria-label="Filter review state"
                          value={compareFilterState}
                          onChange={(event) => setCompareFilterState(event.target.value as CompareReviewState | "all")}
                        >
                          <option value="all">All states</option>
                          <option value="pending">Pending</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="deferred">Deferred</option>
                        </select>
                      </label>
                      <label className="cm-compare-toggle">
                        <input
                          type="checkbox"
                          checked={compareUnresolvedOnly}
                          onChange={(event) => setCompareUnresolvedOnly(event.target.checked)}
                        />
                        <span>Unresolved only</span>
                      </label>
                    </div>
                    <div className="cm-compare-nav-actions">
                      <button className="cm-thread-action-btn" type="button" onClick={() => stepCompareChange(-1)}>
                        Previous
                      </button>
                      <button className="cm-thread-action-btn" type="button" onClick={() => stepCompareChange(1)}>
                        Next
                      </button>
                    </div>
                    {filteredCompareChanges.length === 0 ? (
                      <p className="cm-commit-meta">No changes match current filters.</p>
                    ) : (
                      <div className="cm-compare-change-list">
                        {filteredCompareChanges.map((change) => (
                          <button
                            key={change.id}
                            className={`cm-change-row ${activeCompareChangeId === change.id ? "cm-change-row--active" : ""}`.trim()}
                            type="button"
                            onClick={() => focusCompareChange(change)}
                          >
                            <div className="cm-change-row-top">
                              <span className={`cm-change-type cm-badge-change cm-badge-${change.type}`}>{change.type}</span>
                              <span className="cm-compare-change-id">{change.id}</span>
                            </div>
                            <div className="cm-change-snippet">{change.snippet || "Change"}</div>
                            <div className="cm-change-meta">
                              <span>{change.author.name}</span>
                              <span>{change.editedAt ? new Date(change.editedAt).toLocaleString() : "Unknown time"}</span>
                              <span className={`cm-change-state cm-change-state--${change.reviewState}`}>{change.reviewState}</span>
                            </div>
                            {(change.threadIds.length > 0 || change.blockers.length > 0) ? (
                              <div className="cm-change-threads">
                                {change.threadIds.length > 0 ? <span>Threads {change.threadIds.length}</span> : null}
                                {change.blockers.length > 0 ? <span>Blockers {change.blockers.length}</span> : null}
                              </div>
                            ) : null}
                            {change.reviewState === "pending" && workspace?.document.proposalId && (
                              <div className="cm-change-actions">
                                <button
                                  className="cm-thread-action-btn"
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void handleChangeReviewAction(change.id, "accepted"); }}
                                  title="Accept this change"
                                >
                                  Accept
                                </button>
                                <button
                                  className="cm-thread-action-btn"
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void handleChangeReviewAction(change.id, "rejected"); }}
                                  title="Reject this change"
                                >
                                  Reject
                                </button>
                                <button
                                  className="cm-thread-action-btn"
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); void handleChangeReviewAction(change.id, "deferred"); }}
                                  title="Defer this change"
                                >
                                  Defer
                                </button>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                {compareOptions.length > 1 ? (
                  <div className="cm-history-compare-controls">
                    <label className="cm-compose-select-wrap">
                      <span>From</span>
                      <select
                        className="cm-compose-select"
                        aria-label="Compare from commit"
                        value={compareFromHash}
                        onChange={(event) => setCompareFromHash(event.target.value)}
                      >
                        <option value="">Select commit</option>
                        {compareOptions.map((option) => (
                          <option key={`from-${option.hash}`} value={option.hash}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cm-compose-select-wrap">
                      <span>To</span>
                      <select
                        className="cm-compose-select"
                        aria-label="Compare to commit"
                        value={compareToHash}
                        onChange={(event) => setCompareToHash(event.target.value)}
                      >
                        <option value="">Select commit</option>
                        {compareOptions.map((option) => (
                          <option key={`to-${option.hash}`} value={option.hash}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="cm-compose-send"
                      type="button"
                      disabled={!compareFromHash || !compareToHash || compareFromHash === compareToHash}
                      onClick={() => {
                        void compareSelectedCommits();
                      }}
                    >
                      Compare Selected
                    </button>
                  </div>
                ) : (
                  <div className="cm-approval-fallback">
                    <strong>Compare</strong>
                    <p className="cm-commit-meta">Need at least two commits to compare versions.</p>
                  </div>
                )}
                <div className="cm-approval-fallback">
                  <strong>{historyData?.branch ?? "active"} commits</strong>
                  {(historyData?.commits ?? workspace.history).map((item) => (
                    <div
                      className={`cm-commit-row ${compareFromHash === item.hash || compareToHash === item.hash ? "active" : ""}`}
                      key={`${historyData?.branch ?? "active"}-${item.hash}`}
                      onClick={() => {
                        void compareVersionAgainstCurrent(item.hash, `${historyData?.branch ?? "active"} · ${item.hash.slice(0, 7)}`);
                      }}
                      title="Open this version and compare with current"
                    >
                      <div className="cm-commit-hash">{item.hash}</div>
                      <div className="cm-commit-main">
                        <div className="cm-commit-msg">{item.message}</div>
                        <div className="cm-commit-meta">{item.meta}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {mainHistoryData ? (
                  <div className="cm-approval-fallback">
                    <strong>{mainHistoryData.branch} commits</strong>
                    {mainHistoryData.commits.map((item) => (
                      <div
                        className={`cm-commit-row ${compareFromHash === item.hash || compareToHash === item.hash ? "active" : ""}`}
                        key={`${mainHistoryData.branch}-${item.hash}`}
                        onClick={() => {
                          void compareVersionAgainstCurrent(item.hash, `main · ${item.hash.slice(0, 7)}`);
                        }}
                        title="Open this version and compare with current"
                      >
                        <div className="cm-commit-hash">{item.hash}</div>
                        <div className="cm-commit-main">
                          <div className="cm-commit-msg">{item.message}</div>
                          <div className="cm-commit-meta">{item.meta}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {historyData?.namedVersions.length ? (
                  <div className="cm-approval-fallback">
                    <strong>Named Versions</strong>
                    {historyData.namedVersions.map((version) => (
                      <div
                        className={`cm-commit-row ${compareFromHash === version.hash || compareToHash === version.hash ? "active" : ""}`}
                        key={`${version.hash}-${version.name}`}
                        onClick={() => {
                          void compareVersionAgainstCurrent(version.hash, `named version: ${version.name}`);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void compareVersionAgainstCurrent(version.hash, `named version: ${version.name}`);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title="Open this named version and compare with current"
                      >
                        <div className="cm-commit-hash">{version.hash}</div>
                        <div className="cm-commit-main">
                          <div className="cm-commit-msg">{version.name}</div>
                          <div className="cm-commit-meta">{version.createdBy}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {historyLoading ? <div className="cm-commit-meta">Loading history…</div> : null}
                {historyError ? <div className="cm-commit-meta">{historyError}</div> : null}
                {compareSummary ? (
                  <div className="cm-approval-fallback">
                    <strong>Latest Compare</strong>
                    <pre className="cm-commit-meta" style={{ whiteSpace: "pre-wrap" }}>{compareSummary}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === "decisions" && (
            <div className="cm-panel-content active">
              <div className="cm-panel-scroll cm-decision-controls">
                <div className="cm-approval-fallback">
                  <strong>Decision Log</strong>
                  <p className="cm-commit-meta">
                    Resolved thread outcomes and merge decisions appear here once discussions are closed.
                  </p>
                </div>
                <label className="cm-compose-select-wrap">
                  <span>Outcome</span>
                  <select
                    className="cm-compose-select"
                    value={decisionOutcomeFilter}
                    onChange={(event) => setDecisionOutcomeFilter(event.target.value as typeof decisionOutcomeFilter)}
                  >
                    <option value="">All</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="DEFERRED">Deferred</option>
                  </select>
                </label>
                <label className="cm-compose-select-wrap">
                  <span>Author</span>
                  <input
                    className="cm-compose-select"
                    value={decisionAuthor}
                    onChange={(event) => setDecisionAuthor(event.target.value)}
                    placeholder="Filter by author"
                  />
                </label>
                <label className="cm-compose-select-wrap">
                  <span>Search</span>
                  <input
                    className="cm-compose-select"
                    value={decisionQuery}
                    onChange={(event) => setDecisionQuery(event.target.value)}
                    placeholder="Thread, rationale..."
                  />
                </label>
              </div>
              {decisionRows && decisionRows.length === 0 ? (
                <div className="cm-panel-scroll">
                  <div className="cm-panel-fallback-card">
                    <h3>No decisions yet</h3>
                    <p>Resolve a thread or merge a proposal to create the first decision log entry.</p>
                  </div>
                </div>
              ) : (
                <DecisionLogTable
                  items={
                    decisionRows
                      ? decisionRows.map((row) => ({
                          date: `${new Date(row.decidedAt).toISOString().slice(0, 10)} · ${row.commitHash}`,
                          tags: [{ label: row.outcome, tone: row.outcome === "REJECTED" ? "rejected" : row.outcome === "DEFERRED" ? "deferred" : "approved" }],
                          text: row.rationale,
                          by: row.decidedBy,
                        }))
                      : workspace.decisions
                  }
                  note="Auto-generated from resolved threads and merges. Filters query the decision log API."
                  className="cm-panel-scroll"
                />
              )}
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

          {activeTab === "blame" && (
            <div className="cm-panel-content active">
              <BlameView
                entries={blameEntries}
                nodeId={hoveredNodeId}
                onSelectCommit={(commitHash) => {
                  setActiveTab("history");
                  const commitElement = document.querySelector(`[data-commit-hash="${commitHash}"]`);
                  if (commitElement) {
                    commitElement.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }}
                onSelectThread={(threadId) => {
                  setActiveTab("discussions");
                  setActiveThread(threadId);
                  // Scroll to thread
                  setTimeout(() => {
                    const threadElement = document.querySelector(`[data-thread-id="${threadId}"]`);
                    if (threadElement) {
                      threadElement.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }, 100);
                }}
                loading={blameLoading}
                error={blameError}
              />
            </div>
          )}

          {activeTab === "branches" && (
            <div className="cm-panel-content active">
              <BranchGraph
                historyData={historyData}
                mainHistoryData={mainHistoryData}
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
        <div className="cm-statusbar-item">
          <div className="cm-statusbar-dot" />
          {realtimeStatus === "connected" ? "Connected" : realtimeStatus === "connecting" ? "Connecting" : "Offline"} · {onlineCount} online
        </div>
        <div className="cm-statusbar-item cm-status-branch">{workspace.document.branch.split(" -> ")[0]}</div>
        <div className="cm-statusbar-item">{workspace.threads.length} threads · {resolvedThreads} resolved · {openThreads} open</div>
        <div className="cm-statusbar-spacer" />
        <div className="cm-statusbar-item">Autosaved · now</div>
      </div>
    </div>
  );
}
