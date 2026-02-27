import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  approveProposalRole,
  connectWorkspaceRealtime,
  createProposal,
  createProposalThread,
  fetchDocuments,
  fetchDecisionLog,
  sendWorkspaceRealtimeUpdate,
  fetchDocumentCompare,
  fetchDocumentHistory,
  fetchWorkspace,
  isApiError,
  mergeProposal,
  reactProposalThread,
  reopenProposalThread,
  replyProposalThread,
  requestProposalReview,
  resolveProposalThread,
  setProposalThreadVisibility,
  saveNamedVersion,
  saveWorkspace,
  voteProposalThread
} from "../api/client";
import type {
  CompareContentSnapshot,
  DecisionLogEntry,
  DocumentComparePayload,
  DocumentHistoryPayload,
  DocumentSummary,
  MergeGateRole,
  WorkspaceContent,
  WorkspacePayload
} from "../api/types";
import { ApprovalChain } from "../ui/ApprovalChain";
import { DecisionLogTable } from "../ui/DecisionLogTable";
import { EmptyStateError, EmptyState } from "../ui/EmptyState";
import { Tabs } from "../ui/Tabs";
import { ThreadComposer } from "../ui/ThreadComposer";
import { ThreadList } from "../ui/ThreadList";
import { ChronicleEditor } from "../editor/ChronicleEditor";
import { EditorToolbar } from "../editor/EditorToolbar";
import type { DocumentContent } from "../editor/schema";
import { docToLegacyContent, legacyContentToDoc } from "../editor/schema";
import { diffDocs } from "../editor/diff";
import type { DiffManifest } from "../editor/diff";
import type { Editor } from "@tiptap/react";

type PanelTab = "discussions" | "history" | "decisions";
type DiffMode = "split" | "unified";
type ViewState = "success" | "loading" | "empty" | "error";
type WorkspaceMode = "proposal" | "review";
type SidebarSection = "all" | "open" | "merged" | "decisions";
type CompareOption = {
  hash: string;
  label: string;
};

const panelTabs: { id: PanelTab; label: string; ariaLabel: string }[] = [
  { id: "discussions", label: "Discussion", ariaLabel: "Discussion" },
  { id: "history", label: "History", ariaLabel: "History" },
  { id: "decisions", label: "Log", ariaLabel: "Log" },
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
  const [discussionState, setDiscussionState] = useState<ViewState>("success");
  const [approvalState, setApprovalState] = useState<ViewState>("success");
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
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("open");
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [decisionOutcomeFilter, setDecisionOutcomeFilter] = useState<"" | "ACCEPTED" | "REJECTED" | "DEFERRED">("");
  const [decisionQuery, setDecisionQuery] = useState("");
  const [decisionAuthor, setDecisionAuthor] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [compareSummary, setCompareSummary] = useState<string | null>(null);
  const [compareFromHash, setCompareFromHash] = useState("");
  const [compareToHash, setCompareToHash] = useState("");
  const [compareActive, setCompareActive] = useState(false);
  const [compareDoc, setCompareDoc] = useState<DocumentContent | null>(null);
  const [compareManifest, setCompareManifest] = useState<DiffManifest | null>(null);
  const [approveBusyRole, setApproveBusyRole] = useState<MergeGateRole | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "offline">("connecting");
  const [onlineCount, setOnlineCount] = useState(1);
  const threadRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeSendTimerRef = useRef<number | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [reviewDiff, setReviewDiff] = useState<DocumentComparePayload | null>(null);
  const [reviewDiffState, setReviewDiffState] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const baseDocRef = useRef<DocumentContent | null>(null);
  const [diffManifest, setDiffManifest] = useState<DiffManifest | null>(null);
  const proposalMode = workspaceMode === "proposal";
  const showDebugStateToggles = import.meta.env.DEV;

  useEffect(() => {
    let active = true;
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
    setReviewDiff(null);
    setReviewDiffState("idle");
    setApproveBusyRole(null);
    setMergeBusy(false);
    setRealtimeStatus("connecting");
    setOnlineCount(1);
    fetchWorkspace(docId)
      .then((response) => {
        if (!active) {
          return;
        }
        setWorkspace(response);
        setContentDraft(response.content);
        const initialDoc = response.doc ?? legacyContentToDoc(response.content, response.nodeIds);
        setDocDraft(initialDoc);
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
  }, [docId]);

  useEffect(() => {
    let active = true;
    setDocumentIndexState("loading");
    fetchDocuments()
      .then((documents) => {
        if (!active) {
          return;
        }
        setDocumentIndex(documents);
        setDocumentIndexState(documents.length === 0 ? "empty" : "success");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setDocumentIndex([]);
        setDocumentIndexState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (realtimeSendTimerRef.current) {
        window.clearTimeout(realtimeSendTimerRef.current);
      }
    };
  }, []);

  const nodeLabelMap = useMemo(() => buildNodeLabelMap(docDraft), [docDraft]);

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
    return panelTabs.map((tab) =>
      tab.id === "discussions" ? { ...tab, count: workspace.threads.length } : { ...tab }
    );
  }, [workspace]);

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

  useEffect(() => {
    if (activeTab !== "discussions") {
      return;
    }
    const thread = threadRefs.current[activeThread];
    if (thread) {
      thread.scrollIntoView({ behavior: "smooth", block: "nearest" });
      thread.focus({ preventScroll: true });
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
    if (activeTab !== "history" || !workspace) {
      return;
    }

    let active = true;
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
      } catch {
        if (active) {
          setHistoryData(null);
          setMainHistoryData(null);
          setHistoryError("History service request failed.");
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
          setContentDraft(event.snapshot.content);
          setDocDraft(event.snapshot.doc ?? legacyContentToDoc(event.snapshot.content, workspace.nodeIds));
          return;
        }
        if (event.type === "document_update") {
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
        setActiveTab("discussions");
      }
    }
  }, [workspace?.threads]);

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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not submit proposal for review.");
    }
  }

  async function startProposal() {
    if (!workspace) {
      return;
    }
    setActionError(null);
    try {
      const updated = await createProposal(workspace.document.id);
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
    try {
      const updated = await approveProposalRole(workspace.document.id, workspace.document.proposalId, role);
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
    } catch (error) {
      if (isApiError(error) && error.code === "APPROVAL_ORDER_BLOCKED") {
        const blockers = Array.isArray((error.details as { blockers?: unknown[] } | null)?.blockers)
          ? (error.details as { blockers: string[] }).blockers.join(", ")
          : "required prior roles";
        setActionError(`Approval update failed. Blocked by: ${blockers}`);
      } else {
        setActionError(isApiError(error) ? error.message : "Approval update failed.");
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
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
    try {
      const updated = await mergeProposal(workspace.document.id, workspace.document.proposalId);
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
    } catch (error) {
      if (isApiError(error) && error.code === "MERGE_GATE_BLOCKED") {
        const details = error.details as { pendingApprovals?: number; openThreads?: number } | null;
        const pending = details?.pendingApprovals ?? pendingApprovals;
        const open = details?.openThreads ?? openThreads;
        setActionError(`Merge gate is blocked. Pending approvals: ${pending}, open threads: ${open}.`);
      } else {
        setActionError(isApiError(error) ? error.message : "Merge gate is still blocked.");
      }
    } finally {
      setMergeBusy(false);
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
      setWorkspace(updated);
      setContentDraft(updated.content);
      setDocDraft(updated.doc ?? legacyContentToDoc(updated.content, updated.nodeIds));
      if (activeTab === "history") {
        const refreshed = await fetchDocumentHistory(updated.document.id, updated.document.proposalId);
        setHistoryData(refreshed);
      }
    } catch (error) {
      setActionError(isApiError(error) ? error.message : "Could not save named version.");
    }
  }

  function clearCompare() {
    setCompareActive(false);
    setCompareDoc(null);
    setCompareManifest(null);
    setCompareSummary(null);
    setDiffVisible(false);
  }

  async function compareCommits(fromHash: string, toHash: string, statusLabel = "Comparing selected commits...") {
    if (!workspace) {
      return;
    }
    if (!fromHash || !toHash) {
      setCompareSummary("Select two commits to compare.");
      return;
    }
    if (fromHash === toHash) {
      setCompareSummary("Select two different commits.");
      return;
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
        setCompareManifest(diffDocs(beforeDoc, afterDoc));
        setCompareActive(true);
      } else {
        setCompareActive(false);
        setCompareDoc(null);
        setCompareManifest(null);
        setCompareSummary("Compare loaded, but snapshot content is unavailable from the API response.");
        return;
      }
      if (comparison.changedFields.length === 0) {
        setCompareSummary("No field-level differences between selected commits.");
        return;
      }
      setCompareSummary(
        comparison.changedFields
          .map((item) => formatChangedField(item))
          .join("\n")
      );
    } catch {
      setCompareActive(false);
      setCompareDoc(null);
      setCompareManifest(null);
      setCompareSummary("Compare request failed.");
    }
  }

  async function compareSelectedCommits() {
    await compareCommits(compareFromHash, compareToHash);
  }

  async function compareLatestCommits() {
    if (!workspace) {
      return;
    }
    if (compareActive) {
      clearCompare();
      return;
    }
    if (compareFromHash && compareToHash && compareFromHash !== compareToHash) {
      await compareCommits(compareFromHash, compareToHash);
      return;
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
          return;
        }
        fromHash = mainHead.hash;
        toHash = proposalHead.hash;
      } else {
        const commits = historyData?.commits ?? workspace.history;
        if (commits.length < 2) {
          setCompareSummary("Need at least two commits to compare.");
          return;
        }
        const [head, base] = commits;
        fromHash = base.hash;
        toHash = head.hash;
      }
      await compareCommits(fromHash, toHash, "Comparing latest main and proposal commits...");
    } catch {
      setCompareActive(false);
      setCompareDoc(null);
      setCompareManifest(null);
      setCompareSummary("Compare request failed.");
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
                setWorkspace(response);
                setContentDraft(response.content);
                const initialDoc = response.doc ?? legacyContentToDoc(response.content, response.nodeIds);
                setDocDraft(initialDoc);
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
                  setWorkspace(response);
                  setContentDraft(response.content);
                  const initialDoc = response.doc ?? legacyContentToDoc(response.content, response.nodeIds);
                  setDocDraft(initialDoc);
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
  const mergeReady = hasActiveProposal && pendingApprovals === 0 && openThreads === 0;
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
          <div className="cm-shell-toggle-group" role="group" aria-label="Workspace panels">
            <button
              className="cm-shell-toggle-btn"
              type="button"
              onClick={() => setLeftSidebarCollapsed((current) => !current)}
              aria-label={leftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
              title={leftSidebarCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
            >
              {leftSidebarCollapsed ? "⟫" : "⟪"}
            </button>
            <button
              className="cm-shell-toggle-btn"
              type="button"
              onClick={() => setRightPanelCollapsed((current) => !current)}
              aria-label={rightPanelCollapsed ? "Expand right panel" : "Collapse right panel"}
              title={rightPanelCollapsed ? "Expand right panel" : "Collapse right panel"}
            >
              {rightPanelCollapsed ? "⟪" : "⟫"}
            </button>
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
          <div className="cm-sidebar-section">
            <div className="cm-sidebar-label">Workspace</div>
            <button
              className={`cm-sidebar-item ${sidebarSection === "all" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => navigate("/documents")}
            >
              All Documents
              <span className="cm-sidebar-count">{documentIndex.length || workspace.counts.allDocuments}</span>
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
              <span className="cm-sidebar-count">{openReviewDocuments.length || workspace.counts.openReviews}</span>
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
              <span className="cm-sidebar-count">{mergedDocuments.length || workspace.counts.merged}</span>
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
            <div className="cm-doc-tree">
              <div className="cm-sidebar-label">
                {sidebarSection === "all" ? "All Documents" : sidebarSection === "open" ? "Open Reviews" : "Merged"}
              </div>
              {documentIndexState === "loading" && <div className="cm-sidebar-hint">Loading documents...</div>}
              {documentIndexState === "error" && <div className="cm-sidebar-hint">Could not load document list.</div>}
              {documentIndexState !== "loading" && documentIndexState !== "error" && sidebarDocuments.length === 0 && (
                <div className="cm-sidebar-hint">No documents in this section.</div>
              )}
              {sidebarDocuments.map((doc) => (
                <button
                  key={doc.id}
                  className={`cm-tree-item ${doc.id === workspace.document.id ? "active" : ""}`.trim()}
                  type="button"
                  onClick={() => {
                    if (doc.id !== workspace.document.id) {
                      navigate(`/workspace/${doc.id}`);
                    }
                  }}
                >
                  <span className="cm-tree-icon">•</span>
                  <span>{doc.title}</span>
                  {doc.openThreads > 0 ? <span className="cm-tree-badge pending" /> : null}
                </button>
              ))}
            </div>
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
            onSetDiffMode={setDiffMode}
          />
          <div className={`cm-merge-gate-banner ${mergeReady ? "ready" : "blocked"}`}>
            <div className="cm-merge-gate-title">
              {hasActiveProposal ? (mergeReady ? "Merge Gate Ready" : "Merge Gate Blocked") : "No Active Proposal"}
            </div>
            <div className="cm-merge-gate-copy">
              {hasActiveProposal
                ? (
                  mergeReady
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
                {(compareDoc ?? docDraft) && (
                  <ChronicleEditor
                    content={compareDoc ?? docDraft!}
                    editable={proposalMode && !compareActive}
                    onUpdate={handleEditorUpdate}
                    onSelectionChange={handleSelectionChange}
                    onEditorReady={setEditorInstance}
                    diffManifest={compareActive ? compareManifest : diffManifest}
                    diffVisible={diffVisible}
                    diffMode={diffMode}
                    threadAnchors={threadAnchors}
                    className="cm-editor-wrapper"
                  />
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className={`cm-discussion-panel ${rightPanelCollapsed ? "collapsed" : ""}`.trim()}>
          <Tabs
            tabs={discussionTabsWithCount}
            active={activeTab}
            onTabChange={setActiveTab}
            className="cm-panel-tabs-rail"
            orientation="vertical"
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
                <>
                  <ThreadComposer
                    anchorLabel={currentAnchor}
                    anchorNodeId={composerAnchorNodeId ?? activeNodeId ?? undefined}
                    onSubmit={(text, nodeId, options) => { void submitComment(text, nodeId, options); }}
                  />

                  <div className="cm-approval-panel">
                    <div className="cm-approval-header">
                      Required Approvals
                      <span className="cm-approval-progress">{3 - pendingApprovals} / 3</span>
                    </div>
                    {showDebugStateToggles && (
                      <div className="cm-panel-state cm-panel-state-subtle" aria-label="Approvals panel state">
                        <button
                          className={approvalState === "success" ? "active" : ""}
                          onClick={() => setApprovalState("success")}
                          type="button"
                        >
                          Success
                        </button>
                        <button
                          className={approvalState === "loading" ? "active" : ""}
                          onClick={() => setApprovalState("loading")}
                          type="button"
                        >
                          Loading
                        </button>
                        <button
                          className={approvalState === "empty" ? "active" : ""}
                          onClick={() => setApprovalState("empty")}
                          type="button"
                        >
                          Empty
                        </button>
                        <button
                          className={approvalState === "error" ? "active" : ""}
                          onClick={() => setApprovalState("error")}
                          type="button"
                        >
                          Error
                        </button>
                      </div>
                    )}
                    {approvalState === "loading" && (
                      <div className="cm-approval-fallback">
                        <div className="skeleton skeleton-line" />
                        <div className="skeleton skeleton-line short" />
                      </div>
                    )}
                    {approvalState === "empty" && (
                      <div className="cm-approval-fallback">
                        <p>No pending approvers remain. Merge gate is clear.</p>
                      </div>
                    )}
                    {approvalState === "error" && (
                      <div className="cm-approval-fallback">
                        <p>Approval service request failed.</p>
                        <button className="cm-compose-send" onClick={() => setApprovalState("success")} type="button">
                          Retry
                        </button>
                      </div>
                    )}
                    {approvalState === "success" && (
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
                    )}
                  </div>
                </>
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
                ) : null}
                <div className="cm-approval-fallback">
                  <strong>{historyData?.branch ?? "active"} commits</strong>
                  {(historyData?.commits ?? workspace.history).map((item) => (
                    <div className="cm-commit-row" key={`${historyData?.branch ?? "active"}-${item.hash}`}>
                      <div className="cm-commit-hash">{item.hash}</div>
                      <div>
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
                      <div className="cm-commit-row" key={`${mainHistoryData.branch}-${item.hash}`}>
                        <div className="cm-commit-hash">{item.hash}</div>
                        <div>
                          <div className="cm-commit-msg">{item.message}</div>
                          <div className="cm-commit-meta">{item.meta}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {historyError ? <div className="cm-commit-meta">{historyError}</div> : null}
                {historyData?.namedVersions.length ? (
                  <div className="cm-approval-fallback">
                    <strong>Named Versions</strong>
                    {historyData.namedVersions.map((version) => (
                      <p key={`${version.hash}-${version.name}`} className="cm-commit-meta">
                        {version.name} · {version.hash} · {version.createdBy}
                      </p>
                    ))}
                  </div>
                ) : null}
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
