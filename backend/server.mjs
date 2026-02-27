import { createServer } from "node:http";
import crypto from "node:crypto";

import {
  issueAuthToken,
  verifyAuthToken,
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  cleanupExpiredRefreshTokens,
  getRefreshTokenStats
} from "./auth-token.mjs";

const PORT = Number(process.env.PORT ?? 8787);
const SYNC_INTERNAL_TOKEN = process.env.CHRONICLE_SYNC_TOKEN ?? "chronicle-sync-dev-token";

// Observability counters
const metrics = {
  "workspace.save.with_doc": 0,
  "workspace.save.legacy_only": 0,
  "sync.flush.with_doc": 0,
  "sync.flush.legacy_only": 0,
};
const threadTypeValues = new Set(["GENERAL", "LEGAL", "COMMERCIAL", "TECHNICAL", "SECURITY", "QUERY", "EDITORIAL"]);
const threadVisibilityValues = new Set(["INTERNAL", "EXTERNAL"]);
const resolutionOutcomeValues = new Set(["ACCEPTED", "REJECTED", "DEFERRED"]);

function structuredLog(event, data) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

const mergeGateRoles = ["security", "architectureCommittee", "legal"];
const approvalDependencies = {
  security: [],
  architectureCommittee: [],
  legal: ["security", "architectureCommittee"]
};
const approvalStages = [
  {
    id: "technical-review",
    mode: "parallel",
    roles: ["security", "architectureCommittee"]
  },
  {
    id: "legal-signoff",
    mode: "sequential",
    roles: ["legal"],
    dependsOn: "technical-review"
  }
];

const defaultWorkspaceContent = {
  subtitle: "Governing fair use and abuse prevention across all Acme public and internal APIs.",
  purpose: "Rate limiting protects infrastructure from abuse, preserves fairness, and maintains availability.",
  tiers: "Standard tier consumers are limited to 2,000 requests per minute.",
  enforce: "Exceeded limits return 429 with rate-limit headers and retry guidance."
};

// Stable node UUIDs for consistent thread anchoring across sessions
const stableNodeIds = {
  "adr-142": {
    "title": "n-adr142-title",
    "subtitle": "n-adr142-subtitle",
    "overview": "n-adr142-overview",
    "purpose-heading": "n-adr142-purpose-h",
    "purpose": "n-adr142-purpose",
    "tiers-heading": "n-adr142-tiers-h",
    "tiers": "n-adr142-tiers",
    "enforce-heading": "n-adr142-enforce-h",
    "enforce": "n-adr142-enforce"
  },
  "rfc-auth": {
    "title": "n-rfc-title",
    "subtitle": "n-rfc-subtitle",
    "overview": "n-rfc-overview",
    "purpose-heading": "n-rfc-purpose-h",
    "purpose": "n-rfc-purpose",
    "tiers-heading": "n-rfc-tiers-h",
    "tiers": "n-rfc-tiers",
    "enforce-heading": "n-rfc-enforce-h",
    "enforce": "n-rfc-enforce"
  },
  "policy-sec": {
    "title": "n-pol-title",
    "subtitle": "n-pol-subtitle",
    "overview": "n-pol-overview",
    "purpose-heading": "n-pol-purpose-h",
    "purpose": "n-pol-purpose",
    "tiers-heading": "n-pol-tiers-h",
    "tiers": "n-pol-tiers",
    "enforce-heading": "n-pol-enforce-h",
    "enforce": "n-pol-enforce"
  }
};

let hashCounter = 0xd0a000;
let decisionIdCounter = 1;

function nextHash() {
  hashCounter += 1;
  return hashCounter.toString(16).slice(-7);
}

function nextDecisionId() {
  const next = decisionIdCounter;
  decisionIdCounter += 1;
  return next;
}

function cloneContent(content) {
  return {
    title: content.title,
    subtitle: content.subtitle,
    purpose: content.purpose,
    tiers: content.tiers,
    enforce: content.enforce,
    ...(content.doc ? { doc: JSON.parse(JSON.stringify(content.doc)) } : {})
  };
}

function validateDocShape(doc) {
  if (!doc || typeof doc !== "object") return null;
  if (doc.type !== "doc") return "doc.type must be 'doc'";
  if (!Array.isArray(doc.content)) return "doc.content must be an array";
  for (const node of doc.content) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") {
      return "doc.content entries must be objects with a string 'type' field";
    }
  }
  return null;
}

function extractNodeIds(doc) {
  const ids = {};
  if (!doc || !doc.content) return ids;
  for (const node of doc.content) {
    if (node.attrs?.nodeId) {
      ids[node.attrs.nodeId] = node.attrs.nodeId;
    }
    if (node.content) {
      for (const child of node.content) {
        if (child.attrs?.nodeId) {
          ids[child.attrs.nodeId] = child.attrs.nodeId;
        }
      }
    }
  }
  return ids;
}

function deriveLegacyFromDoc(doc) {
  if (!doc || !doc.content) return null;
  const result = { title: "", subtitle: "", purpose: "", tiers: "", enforce: "" };
  const nodes = doc.content;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const text = extractNodeText(node);
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
        const nextText = extractNodeText(next);
        if (headingText.includes("purpose")) { result.purpose = nextText; i++; }
        else if (headingText.includes("tier")) { result.tiers = nextText; i++; }
        else if (headingText.includes("enforce")) { result.enforce = nextText; i++; }
      }
    }
  }
  return result;
}

function extractNodeText(node) {
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(extractNodeText).join("");
}

function asOptionalString(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function initialsFromName(name) {
  return name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function normalizeThreadType(raw) {
  const normalized = asOptionalString(raw)?.toUpperCase();
  return threadTypeValues.has(normalized) ? normalized : "GENERAL";
}

function normalizeThreadVisibility(raw) {
  const normalized = asOptionalString(raw)?.toUpperCase();
  return threadVisibilityValues.has(normalized) ? normalized : "INTERNAL";
}

function formatRelative(isoDate) {
  const then = new Date(isoDate).getTime();
  const diffMinutes = Math.max(1, Math.round((Date.now() - then) / 60_000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function toneFromName(name) {
  if (name.includes("Sarah")) return "green";
  if (name.includes("Marcus")) return "red";
  if (name.includes("Jamie")) return "blue";
  if (name.includes("Priya")) return "purple";
  return "amber";
}

function createCommit({ message, author, content, added = 0, removed = 0, hash, createdAt }) {
  return {
    hash: hash ?? nextHash(),
    message,
    author,
    content: cloneContent(content),
    added,
    removed,
    createdAt: createdAt ?? new Date().toISOString()
  };
}

function threadTemplates(documentId) {
  if (documentId === "adr-142") {
    return [
      {
        id: "purpose",
        initials: "MK",
        author: "Marcus K.",
        time: "3h ago",
        anchor: "Overview > Purpose",
        anchorNodeId: "n-adr142-purpose",
        text: "Should we explicitly call out DDoS mitigation as a goal here? Incident findings cited rate limiting as first-line defense.",
        votes: 3,
        voted: true,
        tone: toneFromName("Marcus K."),
        status: "OPEN",
        type: "TECHNICAL",
        visibility: "INTERNAL",
        resolvedNote: null,
        reactions: [{ emoji: "👍", count: 1 }],
        replies: [
          {
            initials: "SR",
            author: "Sarah R.",
            time: "1h ago",
            text: "Added abuse-prevention scope language in overview. Keeping final wording concise.",
            type: "GENERAL",
            tone: toneFromName("Sarah R.")
          }
        ]
      },
      {
        id: "tiers",
        initials: "JL",
        author: "Jamie L.",
        time: "5h ago",
        anchor: "Tier Definitions > Standard Limit",
        anchorNodeId: "n-adr142-tiers",
        quote: "\"Standard tier consumers are limited to 2,000 requests per minute\"",
        text: "The 2x increase needs load-testing evidence before policy merge.",
        votes: 5,
        voted: false,
        tone: toneFromName("Jamie L."),
        status: "OPEN",
        type: "SECURITY",
        visibility: "INTERNAL",
        resolvedNote: null,
        reactions: [{ emoji: "🎯", count: 2 }],
        replies: [
          {
            initials: "MK",
            author: "Marcus K.",
            time: "4h ago",
            text: "Benchmarks show P99 at 180ms at 3k req/min. Report link queued for this thread.",
            type: "TECHNICAL",
            tone: toneFromName("Marcus K.")
          },
          {
            initials: "PR",
            author: "Priya R.",
            time: "2h ago",
            text: "Contract language still references 1,000 req/min minimum; amendment notice may be required.",
            type: "LEGAL",
            tone: toneFromName("Priya R.")
          }
        ]
      },
      {
        id: "enforce",
        initials: "SR",
        author: "Sarah R.",
        time: "1d ago",
        anchor: "Enforcement > Response Codes",
        anchorNodeId: "n-adr142-enforce",
        text: "Should jitter algorithm specifics remain in policy or move to SDK docs?",
        votes: 2,
        voted: true,
        tone: toneFromName("Sarah R."),
        status: "RESOLVED",
        type: "EDITORIAL",
        visibility: "INTERNAL",
        resolvedOutcome: "ACCEPTED",
        resolvedNote: "Resolved by Marcus K. · 1h ago — moved to SDK docs.",
        reactions: [],
        replies: []
      }
    ];
  }

  return [
    {
      id: "purpose",
      initials: "AV",
      author: "Avery",
      time: "2h ago",
      anchor: "Overview > Purpose",
      anchorNodeId: stableNodeIds[documentId]?.purpose ?? null,
      text: "Can we tighten wording before we request review?",
      votes: 1,
      voted: false,
      tone: toneFromName("Avery"),
      status: "OPEN",
      type: "GENERAL",
      visibility: "INTERNAL",
      resolvedNote: null,
      reactions: [],
      replies: []
    }
  ];
}

function buildDecision(date, tags, text, by) {
  return { date, tags, text, by };
}

function createApprovalState(initialStatus = "Pending", approvedBy = null, approvedAt = null) {
  return {
    status: initialStatus,
    approvedBy,
    approvedAt
  };
}

function toApprovalStatusMap(approvals) {
  return mergeGateRoles.reduce((acc, role) => {
    acc[role] = approvals[role]?.status === "Approved" ? "Approved" : "Pending";
    return acc;
  }, {});
}

function blockedApprovalRoles(proposal, role) {
  const blockers = approvalDependencies[role] ?? [];
  return blockers.filter((blockerRole) => proposal.approvals[blockerRole]?.status !== "Approved");
}

function recordDecision(proposal, decision) {
  proposal.decisions.unshift(decision);
}

function trackAuditEvent(proposal, actor, action, details = {}) {
  proposal.auditTrail.unshift({
    actor,
    action,
    details,
    at: new Date().toISOString()
  });
}

function createProposalFromContent(document, content, createdBy, title = "Proposal") {
  const now = new Date().toISOString();
  const proposalId = `prop-${document.id}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: proposalId,
    title,
    status: "DRAFT",
    createdBy,
    createdAt: now,
    targetBranch: "main",
    approvalStages,
    approvals: {
      security: createApprovalState(),
      architectureCommittee: createApprovalState(),
      legal: createApprovalState()
    },
    commits: [
      createCommit({
        message: `Create proposal from main`,
        author: createdBy,
        content,
        added: 6,
        removed: 0,
        createdAt: now
      })
    ],
    namedVersions: [],
    threads: threadTemplates(document.id).map(prepareThreadForStorage),
    decisions: [],
    decisionLog: [],
    auditTrail: []
  };
}

function createDocumentState(seed) {
  const baseContent = {
    title: seed.title,
    subtitle: defaultWorkspaceContent.subtitle,
    purpose: defaultWorkspaceContent.purpose,
    tiers: defaultWorkspaceContent.tiers,
    enforce: defaultWorkspaceContent.enforce
  };

  const mainCommit = createCommit({
    hash: seed.initialHash,
    message: "Import document baseline",
    author: seed.updatedBy,
    content: baseContent,
    added: 24,
    removed: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
  });

  const document = {
    id: seed.id,
    title: seed.title,
    status: seed.status,
    updatedBy: seed.updatedBy,
    main: {
      commits: [mainCommit],
      namedVersions: []
    },
    proposals: new Map(),
    activeProposalId: null,
    counts: {
      allDocuments: 42,
      openReviews: 3,
      merged: 28
    }
  };

  const proposal = createProposalFromContent(document, baseContent, seed.updatedBy, `${seed.title} review`);
  proposal.status = "UNDER_REVIEW";

  if (seed.id === "adr-142") {
    const v1 = {
      ...baseContent,
      tiers: "Standard tier consumers are limited to 1,000 requests per minute."
    };
    const v2 = {
      ...v1,
      purpose: "Rate limiting protects infrastructure from abuse and maintains fairness for all tenants."
    };
    const v3 = {
      ...v2,
      tiers: "Standard tier consumers are limited to 2,000 requests per minute.",
      enforce: "Exceeded limits return 429 with retry guidance and per-key concurrent WebSocket caps."
    };

    proposal.commits = [
      createCommit({
        hash: "cc9821a",
        message: "Increase standard tier limit to 2,000 req/min",
        author: "Sarah R.",
        content: v1,
        added: 3,
        removed: 3,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()
      }),
      createCommit({
        hash: "b71e440",
        message: "Revise internal service exemption (security review)",
        author: "Sarah R.",
        content: v2,
        added: 12,
        removed: 8,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
      }),
      createCommit({
        hash: "a3f9c21",
        message: "Add WebSocket concurrent connection limit",
        author: "Sarah R.",
        content: v3,
        added: 28,
        removed: 0,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
      })
    ];

    proposal.approvals = {
      security: createApprovalState("Approved", "Sarah R.", new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()),
      architectureCommittee: createApprovalState(),
      legal: createApprovalState()
    };
    proposal.namedVersions = [
      {
        name: "Partner Review Draft",
        hash: "b71e440",
        createdBy: "Sarah R.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()
      }
    ];
    proposal.decisions = [
      buildDecision(
        "2025-04-15 · a3f9c21",
        [
          { label: "Accepted", tone: "approved" },
          { label: "Security", tone: "blue" }
        ],
        "WebSocket concurrent connection cap (50/key) added after resource exhaustion incident review.",
        "Approved: Sarah R., David W. · 2 participants"
      ),
      buildDecision(
        "2025-04-14 · resolved thread",
        [{ label: "Accepted", tone: "approved" }],
        "Jitter algorithm specification moved from policy text into SDK docs.",
        "Sarah R. -> Marcus K. agreed"
      )
    ];
    proposal.decisionLog = [
      {
        id: nextDecisionId(),
        threadId: "enforce",
        proposalId: proposal.id,
        outcome: "ACCEPTED",
        rationale: "Jitter algorithm specification moved from policy text into SDK docs.",
        decidedBy: "Marcus K.",
        decidedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        commitHash: "a3f9c21",
        participants: ["Sarah R.", "Marcus K."]
      }
    ];
  }

  document.proposals.set(proposal.id, proposal);
  document.activeProposalId = proposal.id;
  document.updatedBy = proposal.commits[proposal.commits.length - 1].author;
  document.title = proposal.commits[proposal.commits.length - 1].content.title;

  return document;
}

function createBlankDocumentState({ id, title, subtitle, updatedBy }) {
  const baseContent = {
    title,
    subtitle,
    purpose: "Describe the purpose and decision context for this document.",
    tiers: "Document relevant tiers, scope boundaries, or audience segments.",
    enforce: "Describe how this policy or decision is enforced and reviewed."
  };

  const mainCommit = createCommit({
    message: "Create document baseline",
    author: updatedBy,
    content: baseContent,
    added: 12,
    removed: 0,
    createdAt: new Date().toISOString()
  });

  return {
    id,
    title,
    status: "Draft",
    updatedBy,
    main: {
      commits: [mainCommit],
      namedVersions: []
    },
    proposals: new Map(),
    activeProposalId: null,
    counts: {
      allDocuments: 42,
      openReviews: 3,
      merged: 28
    }
  };
}

const documentSeeds = [
  {
    id: "adr-142",
    title: "ADR-142: Event Retention Model",
    status: "In review",
    updatedBy: "Avery",
    initialHash: "91aa112"
  },
  {
    id: "rfc-auth",
    title: "RFC: OAuth and Magic Link Session Flow",
    status: "Draft",
    updatedBy: "Sam",
    initialHash: "91aa113"
  },
  {
    id: "policy-sec",
    title: "Security Policy Update",
    status: "Ready for approval",
    updatedBy: "Jordan",
    initialHash: "91aa114"
  }
];

const documents = new Map(documentSeeds.map((seed) => [seed.id, createDocumentState(seed)]));
const revokedTokens = new Set();
const processedSyncSessions = new Set();

// Workspace & Spaces state
const defaultWorkspace = { id: "ws_default", name: "Acme Corp", slug: "acme-corp" };
const spaces = new Map([
  ["sp_default", { id: "sp_default", workspaceId: "ws_default", name: "General", slug: "general", description: "Default space for all documents", sortOrder: 0 }],
  ["sp_engineering", { id: "sp_engineering", workspaceId: "ws_default", name: "Engineering", slug: "engineering", description: "Engineering documents and ADRs", sortOrder: 1 }],
]);

// Assign spaceIds to existing documents
for (const [docId, doc] of documents) {
  if (docId === "adr-142" || docId === "rfc-auth") {
    doc.spaceId = "sp_engineering";
  } else {
    doc.spaceId = "sp_default";
  }
}

function parseAuthToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice("Bearer ".length).trim();
}

function getSessionFromRequest(req) {
  const token = parseAuthToken(req);
  if (!token || revokedTokens.has(token)) {
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    return null;
  }
  return {
    token,
    userName: payload.userName
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(body);
}

function sendError(res, statusCode, code, error, details) {
  sendJson(res, statusCode, {
    code,
    error,
    ...(details ? { details } : {})
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function requireSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    sendError(res, 401, "UNAUTHORIZED", "Unauthorized");
    return null;
  }
  return session;
}

function getOpenThreadCount(proposal) {
  return proposal.threads.filter((thread) => thread.status !== "RESOLVED").length;
}

function getPendingApprovalCount(proposal) {
  return mergeGateRoles.filter((role) => proposal.approvals[role]?.status !== "Approved").length;
}

function computeMergeGate(proposal) {
  const pendingApprovals = getPendingApprovalCount(proposal);
  const openThreads = getOpenThreadCount(proposal);
  return {
    pendingApprovals,
    openThreads,
    mergeReady: pendingApprovals === 0 && openThreads === 0
  };
}

function approvalBlockedDetails(proposal, role) {
  const blockers = blockedApprovalRoles(proposal, role);
  if (blockers.length === 0) {
    return null;
  }
  return {
    role,
    blockers
  };
}

function parseResolutionOutcome(rawOutcome) {
  const normalized = asOptionalString(rawOutcome)?.toUpperCase();
  if (normalized === "REJECTED") {
    return { code: "REJECTED", label: "Rejected", tone: "rejected" };
  }
  if (normalized === "DEFERRED") {
    return { code: "DEFERRED", label: "Deferred", tone: "deferred" };
  }
  return { code: "ACCEPTED", label: "Accepted", tone: "approved" };
}

function normalizeReplies(replies) {
  if (!Array.isArray(replies)) {
    return [];
  }
  return replies.map((reply) => ({
    initials: asOptionalString(reply.initials) ?? initialsFromName(asOptionalString(reply.author) ?? "User"),
    author: asOptionalString(reply.author) ?? "User",
    time: asOptionalString(reply.time) ?? formatRelative(new Date().toISOString()),
    text: asOptionalString(reply.text) ?? "",
    type: normalizeThreadType(reply.type),
    tone: reply.tone ?? "amber"
  })).filter((reply) => reply.text.length > 0);
}

function normalizeReactions(reactions) {
  if (!Array.isArray(reactions)) {
    return [];
  }
  return reactions
    .map((reaction) => ({
      emoji: asOptionalString(reaction.emoji),
      count: Number.isFinite(reaction.count) ? Math.max(0, Number(reaction.count)) : 0
    }))
    .filter((reaction) => reaction.emoji && reaction.count > 0);
}

function prepareThreadForStorage(thread) {
  const status = thread.status === "RESOLVED" || thread.status === "ORPHANED" ? thread.status : "OPEN";
  return {
    ...thread,
    status,
    type: normalizeThreadType(thread.type),
    visibility: normalizeThreadVisibility(thread.visibility),
    resolvedOutcome: status === "RESOLVED" ? parseResolutionOutcome(thread.resolvedOutcome).code : undefined,
    reactions: normalizeReactions(thread.reactions),
    replies: normalizeReplies(thread.replies),
    __userVotes: typeof thread.__userVotes === "object" && thread.__userVotes !== null ? thread.__userVotes : {},
    __reactionUsers: typeof thread.__reactionUsers === "object" && thread.__reactionUsers !== null ? thread.__reactionUsers : {}
  };
}

function collectThreadParticipants(thread) {
  const participants = new Set();
  if (thread.author) {
    participants.add(thread.author);
  }
  for (const reply of thread.replies ?? []) {
    if (reply.author) {
      participants.add(reply.author);
    }
  }
  return [...participants];
}

function appendDecisionLogEntry(proposal, entry) {
  if (!Array.isArray(proposal.decisionLog)) {
    proposal.decisionLog = [];
  }
  proposal.decisionLog.unshift({
    id: nextDecisionId(),
    ...entry
  });
}

function workflowProposal(document) {
  if (!document.activeProposalId) {
    return null;
  }
  const proposal = document.proposals.get(document.activeProposalId);
  if (!proposal) {
    return null;
  }
  if (proposal.status === "MERGED" || proposal.status === "REJECTED") {
    return null;
  }
  return proposal;
}

function ensureWorkflowProposal(document, userName) {
  const existing = workflowProposal(document);
  if (existing) {
    return existing;
  }

  const mainHead = document.main.commits[document.main.commits.length - 1];
  const proposal = createProposalFromContent(document, mainHead.content, userName, "New proposal");
  document.proposals.set(proposal.id, proposal);
  document.activeProposalId = proposal.id;
  document.status = "Draft";
  return proposal;
}

function serializeThread(thread, viewerName = null) {
  const viewerVote = viewerName ? thread.__userVotes?.[viewerName] : null;
  const reactions = normalizeReactions(thread.reactions);
  return {
    id: thread.id,
    initials: thread.initials,
    author: thread.author,
    time: thread.time,
    anchor: thread.anchor,
    anchorNodeId: thread.anchorNodeId ?? undefined,
    text: thread.text,
    quote: thread.quote,
    votes: Number.isFinite(thread.votes) ? Number(thread.votes) : 0,
    voted: viewerVote ? viewerVote === "up" : Boolean(thread.voted),
    status: thread.status ?? "OPEN",
    type: normalizeThreadType(thread.type),
    visibility: normalizeThreadVisibility(thread.visibility),
    resolvedOutcome: thread.status === "RESOLVED" ? parseResolutionOutcome(thread.resolvedOutcome).code : undefined,
    resolvedNote: thread.status === "RESOLVED" ? thread.resolvedNote : undefined,
    reactions,
    tone: thread.tone ?? "amber",
    replies: normalizeReplies(thread.replies)
  };
}

function serializeHistoryItem(commit) {
  return {
    hash: commit.hash,
    message: commit.message,
    meta: `${commit.author} · ${formatRelative(commit.createdAt)} · +${commit.added} -${commit.removed} lines`
  };
}

function buildWorkspace(document, viewerName = null) {
  const proposal = workflowProposal(document);
  const activeBranch = proposal ? `proposals/${proposal.id}` : "main";
  const commits = proposal ? proposal.commits : document.main.commits;
  const headCommit = commits[commits.length - 1];
  const mergeGate = proposal
    ? computeMergeGate(proposal)
    : {
        pendingApprovals: 0,
        openThreads: 0,
        mergeReady: true
      };

  return {
    document: {
      id: document.id,
      title: headCommit.content.title,
      subtitle: headCommit.content.subtitle,
      status: document.status,
      version: `v${commits.length}.0.${Math.max(0, commits.length - 1)}-${proposal ? "draft" : "main"}`,
      editedBy: headCommit.author,
      editedAt: formatRelative(headCommit.createdAt),
      branch: proposal ? `${activeBranch} -> main` : "main",
      proposalId: proposal ? proposal.id : null
    },
    content: cloneContent(headCommit.content),
    doc: headCommit.content.doc ?? undefined,
    nodeIds: headCommit.content.doc
      ? extractNodeIds(headCommit.content.doc)
      : (stableNodeIds[document.id] ?? {}),
    counts: document.counts,
    approvals: proposal
      ? toApprovalStatusMap(proposal.approvals)
      : {
          security: "Approved",
          architectureCommittee: "Approved",
          legal: "Approved"
        },
    approvalDetails: proposal
      ? proposal.approvals
      : {
          security: createApprovalState("Approved"),
          architectureCommittee: createApprovalState("Approved"),
          legal: createApprovalState("Approved")
        },
    approvalStages,
    threads: proposal ? proposal.threads.map((thread) => serializeThread(thread, viewerName)) : [],
    history: commits.slice().reverse().map(serializeHistoryItem),
    decisions: proposal ? proposal.decisions : [],
    mergeGate,
    workspaceName: defaultWorkspace.name,
    ...(document.spaceId && spaces.has(document.spaceId) ? {
      space: { id: document.spaceId, name: spaces.get(document.spaceId).name }
    } : {})
  };
}

function buildDocumentsList() {
  return [...documents.values()].map((document) => {
    const proposal = workflowProposal(document);
    const openThreads = proposal ? getOpenThreadCount(proposal) : 0;
    const latestCommit = (proposal ? proposal.commits : document.main.commits).at(-1);

    return {
      id: document.id,
      title: latestCommit ? latestCommit.content.title : document.title,
      status: document.status,
      updatedBy: latestCommit ? latestCommit.author : document.updatedBy,
      openThreads,
      spaceId: document.spaceId ?? "sp_default"
    };
  });
}

function findCommitInDocument(document, proposalId, hash) {
  const normalizedHash = hash.trim();
  if (proposalId) {
    const proposal = document.proposals.get(proposalId);
    if (proposal) {
      const proposalCommit = proposal.commits.find((commit) => commit.hash === normalizedHash);
      if (proposalCommit) {
        return proposalCommit;
      }
    }
  }

  const active = workflowProposal(document);
  if (active) {
    const fromActive = active.commits.find((commit) => commit.hash === normalizedHash);
    if (fromActive) {
      return fromActive;
    }
  }

  return document.main.commits.find((commit) => commit.hash === normalizedHash) ?? null;
}

function diffContent(fromContent, toContent) {
  const fields = ["title", "subtitle", "purpose", "tiers", "enforce"];
  const changed = fields
    .filter((field) => fromContent[field] !== toContent[field])
    .map((field) => ({
      field,
      before: fromContent[field],
      after: toContent[field]
    }));
  // Also detect doc JSON changes even when legacy fields haven't changed
  if (toContent.doc && JSON.stringify(toContent.doc) !== JSON.stringify(fromContent.doc)) {
    if (changed.length === 0) {
      changed.push({ field: "doc", before: "[rich content]", after: "[rich content]" });
    }
  }
  return changed;
}

function parseSnapshotContent(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const content = {
    title: asOptionalString(value.title),
    subtitle: asOptionalString(value.subtitle),
    purpose: asOptionalString(value.purpose),
    tiers: asOptionalString(value.tiers),
    enforce: asOptionalString(value.enforce),
    ...(value.doc && typeof value.doc === "object" ? { doc: value.doc } : {})
  };
  if (!content.title || !content.subtitle || !content.purpose || !content.tiers || !content.enforce) {
    return null;
  }
  return content;
}

function proposalQueueItems() {
  return [...documents.values()]
    .map((document) => {
      const proposal = workflowProposal(document);
      if (!proposal || proposal.status === "DRAFT") {
        return null;
      }
      const pendingApprovals = getPendingApprovalCount(proposal);
      const openThreads = getOpenThreadCount(proposal);
      const blocked = pendingApprovals > 0 || openThreads > 0;
      return {
        id: `${document.id}:${proposal.id}`,
        documentId: document.id,
        proposalId: proposal.id,
        title: document.title,
        requestedBy: proposal.createdBy,
        status: blocked ? "Blocked" : "Ready"
      };
    })
    .filter(Boolean);
}

function slugFromTitle(title) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return normalized || "document";
}

function nextDocumentID(title) {
  const base = slugFromTitle(title);
  let candidate = base;
  while (documents.has(candidate)) {
    candidate = `${base}-${Math.floor(100 + Math.random() * 900)}`;
  }
  return candidate;
}

function getDocumentOr404(res, id) {
  const document = documents.get(id);
  if (!document) {
    sendError(res, 404, "DOCUMENT_NOT_FOUND", "Document not found");
    return null;
  }
  return document;
}

function getProposalOr404(res, document, proposalId) {
  const proposal = document.proposals.get(proposalId);
  if (!proposal) {
    sendError(res, 404, "PROPOSAL_NOT_FOUND", "Proposal not found");
    return null;
  }
  return proposal;
}

function getThreadOr404(res, proposal, threadId) {
  const thread = proposal.threads.find((item) => item.id === threadId);
  if (!thread) {
    sendError(res, 404, "THREAD_NOT_FOUND", "Thread not found");
    return null;
  }
  return thread;
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (method === "GET" && path === "/api/health") {
    sendJson(res, 200, { ok: true, metrics });
    return;
  }

  if (method === "GET" && path === "/api/internal/token-stats") {
    const internalToken = req.headers["x-chronicle-sync-token"];
    if (internalToken !== SYNC_INTERNAL_TOKEN) {
      sendError(res, 401, "AUTH_REQUIRED", "Invalid token");
      return;
    }
    
    const stats = getRefreshTokenStats();
    sendJson(res, 200, { 
      ok: true, 
      refreshTokens: stats,
      accessTokens: { revoked: revokedTokens.size }
    });
    return;
  }

  if (method === "POST" && path === "/api/internal/token-cleanup") {
    const internalToken = req.headers["x-chronicle-sync-token"];
    if (internalToken !== SYNC_INTERNAL_TOKEN) {
      sendError(res, 401, "AUTH_REQUIRED", "Invalid token");
      return;
    }
    
    const result = cleanupExpiredRefreshTokens();
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && path === "/api/internal/sync/session-ended") {
    const internalToken = req.headers["x-chronicle-sync-token"];
    if (internalToken !== SYNC_INTERNAL_TOKEN) {
      sendError(res, 401, "SYNC_TOKEN_INVALID", "Sync token invalid");
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const sessionId = asOptionalString(body.sessionId);
    const documentId = asOptionalString(body.documentId);
    const proposalId = asOptionalString(body.proposalId);
    const actor = asOptionalString(body.actor) ?? "Sync Gateway";
    const updateCount = Number.isFinite(body.updateCount) ? Math.max(0, Number(body.updateCount)) : 0;
    const snapshot = parseSnapshotContent(body.snapshot);

    // Validate doc shape if present in snapshot
    if (snapshot?.doc) {
      const docError = validateDocShape(snapshot.doc);
      if (docError) {
        sendError(res, 422, "VALIDATION_ERROR", `Invalid snapshot doc: ${docError}`);
        return;
      }
    }

    if (!sessionId || !documentId || !proposalId) {
      sendError(res, 422, "VALIDATION_ERROR", "sessionId, documentId, and proposalId are required");
      return;
    }
    if (processedSyncSessions.has(sessionId)) {
      sendJson(res, 200, { ok: true, ignored: true, reason: "duplicate-session" });
      return;
    }

    const document = documents.get(documentId);
    if (!document) {
      sendError(res, 404, "DOCUMENT_NOT_FOUND", "Document not found");
      return;
    }
    const proposal = document.proposals.get(proposalId);
    if (!proposal) {
      sendError(res, 404, "PROPOSAL_NOT_FOUND", "Proposal not found");
      return;
    }
    if (!snapshot) {
      processedSyncSessions.add(sessionId);
      sendJson(res, 200, { ok: true, ignored: true, reason: "empty-snapshot" });
      return;
    }

    const headCommit = proposal.commits[proposal.commits.length - 1];
    const changed = diffContent(headCommit.content, snapshot);
    if (changed.length === 0) {
      processedSyncSessions.add(sessionId);
      sendJson(res, 200, { ok: true, ignored: true, reason: "no-changes" });
      return;
    }

    const commit = createCommit({
      message: `Sync session flush (${Math.max(updateCount, changed.length)} updates)`,
      author: actor,
      content: snapshot,
      added: Math.max(2, changed.length * 3),
      removed: Math.max(0, changed.length - 1)
    });
    proposal.commits.push(commit);
    document.updatedBy = actor;
    document.status = proposal.status === "DRAFT" ? "Draft" : "In review";
    document.title = snapshot.title;

    const flushHasDoc = !!snapshot.doc;
    metrics[flushHasDoc ? "sync.flush.with_doc" : "sync.flush.legacy_only"] += 1;

    trackAuditEvent(proposal, actor, "SYNC_SESSION_FLUSHED", {
      sessionId,
      updateCount,
      changedFields: changed.map((entry) => entry.field),
      commit: commit.hash
    });
    structuredLog("SYNC_SESSION_FLUSHED", {
      sessionId,
      documentId,
      proposalId,
      commit: commit.hash,
      updateCount,
      changedFields: changed.map((entry) => entry.field),
      hasDoc: flushHasDoc
    });
    recordDecision(
      proposal,
      buildDecision(
        `${new Date().toISOString().slice(0, 10)} · ${commit.hash}`,
        [{ label: "Session Flush", tone: "blue" }],
        `Recovered ${changed.length} field changes from a collaborative session flush.`,
        `${actor} persisted ${Math.max(updateCount, changed.length)} updates`
      )
    );

    processedSyncSessions.add(sessionId);
    sendJson(res, 200, { ok: true, commit: commit.hash, changedFields: changed.map((entry) => entry.field) });
    return;
  }

  if (method === "GET" && path === "/api/session") {
    const session = getSessionFromRequest(req);
    if (!session) {
      sendJson(res, 200, { authenticated: false, userName: null });
      return;
    }
    sendJson(res, 200, { authenticated: true, userName: session.userName });
    return;
  }

  if (method === "POST" && path === "/api/session/login") {
    try {
      const body = await parseBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const userName = name || "User";
      const token = issueAuthToken(userName);
      const refreshToken = issueRefreshToken(userName);
      sendJson(res, 200, { token, refreshToken, userName });
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }
  }

  if (method === "POST" && path === "/api/session/refresh") {
    try {
      const body = await parseBody(req);
      const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
      
      if (!refreshToken) {
        sendError(res, 401, "AUTH_REQUIRED", "Refresh token required");
        return;
      }
      
      const tokenData = verifyRefreshToken(refreshToken);
      if (!tokenData) {
        sendError(res, 401, "AUTH_REQUIRED", "Invalid or expired refresh token");
        return;
      }
      
      // Issue new tokens
      const newToken = issueAuthToken(tokenData.userName);
      const newRefreshToken = issueRefreshToken(tokenData.userName);
      
      // Revoke the old refresh token (rotation)
      revokeRefreshToken(refreshToken);
      
      sendJson(res, 200, { token: newToken, refreshToken: newRefreshToken, userName: tokenData.userName });
      return;
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }
  }

  if (method === "POST" && path === "/api/session/logout") {
    // Revoke access token
    const token = parseAuthToken(req);
    if (token) {
      revokedTokens.add(token);
    }
    
    // Revoke refresh token if provided
    try {
      const body = await parseBody(req);
      if (body.refreshToken) {
        revokeRefreshToken(body.refreshToken);
      }
    } catch {
      // Ignore body parsing errors - refresh token revocation is best-effort
    }
    
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && path === "/api/documents") {
    if (!requireSession(req, res)) {
      return;
    }
    sendJson(res, 200, { documents: buildDocumentsList() });
    return;
  }

  if (method === "POST" && path === "/api/documents") {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const title = asOptionalString(body.title) ?? "Untitled Document";
    const subtitle = asOptionalString(body.subtitle) ?? "";
    const spaceId = asOptionalString(body.spaceId) ?? "sp_default";
    const documentID = nextDocumentID(title);
    const document = createBlankDocumentState({
      id: documentID,
      title,
      subtitle,
      updatedBy: session.userName
    });
    document.spaceId = spaceId;
    documents.set(documentID, document);
    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  // === Workspaces & Spaces routes ===

  if (method === "GET" && path === "/api/workspaces") {
    if (!requireSession(req, res)) return;
    const spaceList = [...spaces.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((sp) => {
      let documentCount = 0;
      for (const doc of documents.values()) {
        if (doc.spaceId === sp.id) documentCount++;
      }
      return { ...sp, documentCount };
    });
    sendJson(res, 200, { workspace: defaultWorkspace, spaces: spaceList });
    return;
  }

  if (method === "POST" && path === "/api/spaces") {
    const session = requireSession(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { sendError(res, 400, "INVALID_BODY", error.message); return; }
    const name = asOptionalString(body.name);
    if (!name) { sendError(res, 422, "VALIDATION_ERROR", "name is required"); return; }
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const id = `sp_${crypto.randomUUID().slice(0, 8)}`;
    const space = { id, workspaceId: "ws_default", name, slug, description: asOptionalString(body.description) ?? "", sortOrder: spaces.size };
    spaces.set(id, space);
    // Return full workspaces response
    const spaceList = [...spaces.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((sp) => {
      let documentCount = 0;
      for (const doc of documents.values()) { if (doc.spaceId === sp.id) documentCount++; }
      return { ...sp, documentCount };
    });
    sendJson(res, 200, { workspace: defaultWorkspace, spaces: spaceList });
    return;
  }

  const spaceIdMatch = path.match(/^\/api\/spaces\/([^/]+)$/);
  if (spaceIdMatch) {
    const spaceId = decodeURIComponent(spaceIdMatch[1]);
    const space = spaces.get(spaceId);
    if (!space) { sendError(res, 404, "NOT_FOUND", "Space not found"); return; }

    if (method === "GET") {
      if (!requireSession(req, res)) return;
      let documentCount = 0;
      for (const doc of documents.values()) { if (doc.spaceId === spaceId) documentCount++; }
      sendJson(res, 200, { ...space, documentCount });
      return;
    }

    if (method === "PUT") {
      const session = requireSession(req, res);
      if (!session) return;
      let body;
      try { body = await parseBody(req); } catch (error) { sendError(res, 400, "INVALID_BODY", error.message); return; }
      const name = asOptionalString(body.name);
      if (!name) { sendError(res, 422, "VALIDATION_ERROR", "name is required"); return; }
      space.name = name;
      space.description = asOptionalString(body.description) ?? space.description;
      let documentCount = 0;
      for (const doc of documents.values()) { if (doc.spaceId === spaceId) documentCount++; }
      sendJson(res, 200, { ...space, documentCount });
      return;
    }

    if (method === "DELETE") {
      if (!requireSession(req, res)) return;
      let documentCount = 0;
      for (const doc of documents.values()) { if (doc.spaceId === spaceId) documentCount++; }
      if (documentCount > 0) { sendError(res, 409, "SPACE_NOT_EMPTY", `Space contains ${documentCount} documents`); return; }
      spaces.delete(spaceId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  const spaceDocsMatch = path.match(/^\/api\/spaces\/([^/]+)\/documents$/);
  if (method === "GET" && spaceDocsMatch) {
    if (!requireSession(req, res)) return;
    const spaceId = decodeURIComponent(spaceDocsMatch[1]);
    const filtered = buildDocumentsList().filter((doc) => doc.spaceId === spaceId);
    sendJson(res, 200, { documents: filtered });
    return;
  }

  const moveDocMatch = path.match(/^\/api\/documents\/([^/]+)\/move$/);
  if (method === "POST" && moveDocMatch) {
    const session = requireSession(req, res);
    if (!session) return;
    const documentId = decodeURIComponent(moveDocMatch[1]);
    const document = documents.get(documentId);
    if (!document) { sendError(res, 404, "NOT_FOUND", "Document not found"); return; }
    let body;
    try { body = await parseBody(req); } catch (error) { sendError(res, 400, "INVALID_BODY", error.message); return; }
    const newSpaceId = asOptionalString(body.spaceId);
    if (!newSpaceId) { sendError(res, 422, "VALIDATION_ERROR", "spaceId is required"); return; }
    if (!spaces.has(newSpaceId)) { sendError(res, 404, "NOT_FOUND", "Space not found"); return; }
    document.spaceId = newSpaceId;
    sendJson(res, 200, { ok: true, documentId, spaceId: newSpaceId });
    return;
  }

  // === End Workspaces & Spaces routes ===

  const historyMatch = path.match(/^\/api\/documents\/([^/]+)\/history$/);
  if (method === "GET" && historyMatch) {
    if (!requireSession(req, res)) {
      return;
    }

    const documentId = decodeURIComponent(historyMatch[1]);
    const proposalId = asOptionalString(url.searchParams.get("proposalId"));
    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }

    const useMain = proposalId === "main";
    const proposal = useMain
      ? null
      : proposalId
        ? getProposalOr404(res, document, proposalId)
        : workflowProposal(document);
    if (proposalId && proposalId !== "main" && !proposal) {
      return;
    }

    const commits = proposal ? proposal.commits : document.main.commits;
    sendJson(res, 200, {
      documentId,
      proposalId: proposal ? proposal.id : null,
      branch: proposal ? `proposals/${proposal.id}` : "main",
      commits: commits.slice().reverse().map(serializeHistoryItem),
      namedVersions: proposal ? proposal.namedVersions : document.main.namedVersions
    });
    return;
  }

  const compareMatch = path.match(/^\/api\/documents\/([^/]+)\/compare$/);
  if (method === "GET" && compareMatch) {
    if (!requireSession(req, res)) {
      return;
    }

    const documentId = decodeURIComponent(compareMatch[1]);
    const from = asOptionalString(url.searchParams.get("from"));
    const to = asOptionalString(url.searchParams.get("to"));
    const proposalId = asOptionalString(url.searchParams.get("proposalId"));

    if (!from || !to) {
      sendError(res, 422, "VALIDATION_ERROR", "from and to commit hashes are required");
      return;
    }

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }

    const fromCommit = findCommitInDocument(document, proposalId, from);
    const toCommit = findCommitInDocument(document, proposalId, to);
    if (!fromCommit || !toCommit) {
      sendError(res, 404, "COMMIT_NOT_FOUND", "One or more commits were not found");
      return;
    }

    sendJson(res, 200, {
      from: fromCommit.hash,
      to: toCommit.hash,
      changedFields: diffContent(fromCommit.content, toCommit.content),
      fromContent: cloneContent(fromCommit.content),
      toContent: cloneContent(toCommit.content)
    });
    return;
  }

  const decisionLogMatch = path.match(/^\/api\/documents\/([^/]+)\/decision-log$/);
  if (method === "GET" && decisionLogMatch) {
    if (!requireSession(req, res)) {
      return;
    }
    const documentId = decodeURIComponent(decisionLogMatch[1]);
    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }

    const proposalId = asOptionalString(url.searchParams.get("proposalId"));
    let proposal = null;
    if (proposalId) {
      proposal = getProposalOr404(res, document, proposalId);
      if (!proposal) {
        return;
      }
    } else {
      proposal = workflowProposal(document);
    }

    const normalizedOutcome = asOptionalString(url.searchParams.get("outcome"))?.toUpperCase();
    if (normalizedOutcome && !resolutionOutcomeValues.has(normalizedOutcome)) {
      sendError(res, 422, "VALIDATION_ERROR", "outcome must be ACCEPTED, REJECTED, or DEFERRED");
      return;
    }

    const query = asOptionalString(url.searchParams.get("q"))?.toLowerCase();
    const authorFilter = asOptionalString(url.searchParams.get("author"))?.toLowerCase();
    const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));
    const items = (proposal?.decisionLog ?? [])
      .filter((entry) => !normalizedOutcome || entry.outcome === normalizedOutcome)
      .filter((entry) => !authorFilter || entry.decidedBy.toLowerCase().includes(authorFilter))
      .filter((entry) => {
        if (!query) {
          return true;
        }
        const haystack = [
          entry.threadId,
          entry.rationale,
          entry.decidedBy,
          entry.commitHash,
          ...(entry.participants ?? [])
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, limit);

    sendJson(res, 200, {
      documentId,
      items
    });
    return;
  }

  const proposalRootMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals$/);
  if (method === "POST" && proposalRootMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(proposalRootMatch[1]);
    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }

    const body = await parseBody(req).catch(() => ({}));
    const title = asOptionalString(body.title) ?? "New proposal";
    const mainHead = document.main.commits[document.main.commits.length - 1];
    const proposal = createProposalFromContent(document, mainHead.content, session.userName, title);
    document.proposals.set(proposal.id, proposal);
    document.activeProposalId = proposal.id;
    document.status = "Draft";

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  // Create new thread
  const threadCreateMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads$/);
  if (method === "POST" && threadCreateMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadCreateMatch[1]);
    const proposalId = decodeURIComponent(threadCreateMatch[2]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const text = asOptionalString(body.text);
    if (!text) {
      sendError(res, 422, "VALIDATION_ERROR", "Thread text is required");
      return;
    }

    const anchor = asOptionalString(body.anchorLabel) ?? asOptionalString(body.anchor) ?? "General";
    const anchorNodeId = asOptionalString(body.anchorNodeId);
    const initials = initialsFromName(session.userName);

    const thread = {
      id: `thread-${crypto.randomUUID().slice(0, 8)}`,
      initials,
      author: session.userName,
      time: formatRelative(new Date().toISOString()),
      anchor,
      anchorNodeId: anchorNodeId ?? undefined,
      text,
      status: "OPEN",
      votes: 0,
      voted: false,
      type: normalizeThreadType(body.type),
      visibility: normalizeThreadVisibility(body.visibility),
      tone: toneFromName(session.userName),
      reactions: [],
      __userVotes: {},
      __reactionUsers: {},
      replies: []
    };

    proposal.threads.push(prepareThreadForStorage(thread));
    trackAuditEvent(proposal, session.userName, "THREAD_CREATED", {
      threadId: thread.id,
      anchor
    });

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const threadReplyMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/replies$/);
  if (method === "POST" && threadReplyMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadReplyMatch[1]);
    const proposalId = decodeURIComponent(threadReplyMatch[2]);
    const threadId = decodeURIComponent(threadReplyMatch[3]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }
    const thread = getThreadOr404(res, proposal, threadId);
    if (!thread) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const replyText = asOptionalString(body.body) ?? asOptionalString(body.text);
    if (!replyText) {
      sendError(res, 422, "VALIDATION_ERROR", "Reply body is required");
      return;
    }

    thread.replies.push({
      initials: initialsFromName(session.userName),
      author: session.userName,
      time: formatRelative(new Date().toISOString()),
      text: replyText,
      type: normalizeThreadType(body.type),
      tone: toneFromName(session.userName)
    });
    trackAuditEvent(proposal, session.userName, "THREAD_REPLIED", {
      threadId
    });

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const threadVoteMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/vote$/);
  if (method === "POST" && threadVoteMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadVoteMatch[1]);
    const proposalId = decodeURIComponent(threadVoteMatch[2]);
    const threadId = decodeURIComponent(threadVoteMatch[3]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }
    const thread = getThreadOr404(res, proposal, threadId);
    if (!thread) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const direction = asOptionalString(body.direction)?.toLowerCase();
    if (direction !== "up" && direction !== "down") {
      sendError(res, 422, "VALIDATION_ERROR", "direction must be up or down");
      return;
    }

    thread.__userVotes = thread.__userVotes ?? {};
    const previous = thread.__userVotes[session.userName];
    if (previous === direction) {
      if (direction === "up") {
        thread.votes -= 1;
      } else {
        thread.votes += 1;
      }
      delete thread.__userVotes[session.userName];
      thread.voted = false;
    } else if (previous) {
      if (direction === "up") {
        thread.votes += 2;
        thread.voted = true;
      } else {
        thread.votes -= 2;
        thread.voted = false;
      }
      thread.__userVotes[session.userName] = direction;
    } else {
      if (direction === "up") {
        thread.votes += 1;
        thread.voted = true;
      } else {
        thread.votes -= 1;
        thread.voted = false;
      }
      thread.__userVotes[session.userName] = direction;
    }

    trackAuditEvent(proposal, session.userName, "THREAD_VOTED", {
      threadId,
      direction
    });

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const threadReactionMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/reactions$/);
  if (method === "POST" && threadReactionMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadReactionMatch[1]);
    const proposalId = decodeURIComponent(threadReactionMatch[2]);
    const threadId = decodeURIComponent(threadReactionMatch[3]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }
    const thread = getThreadOr404(res, proposal, threadId);
    if (!thread) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const emoji = asOptionalString(body.emoji);
    if (!emoji) {
      sendError(res, 422, "VALIDATION_ERROR", "emoji is required");
      return;
    }

    thread.__reactionUsers = thread.__reactionUsers ?? {};
    const users = Array.isArray(thread.__reactionUsers[emoji]) ? thread.__reactionUsers[emoji] : [];
    const existingIndex = users.findIndex((name) => name === session.userName);
    if (existingIndex >= 0) {
      users.splice(existingIndex, 1);
    } else {
      users.push(session.userName);
    }
    thread.__reactionUsers[emoji] = users;

    const reaction = (thread.reactions ?? []).find((item) => item.emoji === emoji);
    if (reaction) {
      reaction.count = Math.max(0, reaction.count + (existingIndex >= 0 ? -1 : 1));
    } else if (existingIndex < 0) {
      (thread.reactions ??= []).push({ emoji, count: 1 });
    }
    thread.reactions = normalizeReactions(thread.reactions);

    trackAuditEvent(proposal, session.userName, "THREAD_REACTION_TOGGLED", {
      threadId,
      emoji
    });

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const threadReopenMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/reopen$/);
  if (method === "POST" && threadReopenMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadReopenMatch[1]);
    const proposalId = decodeURIComponent(threadReopenMatch[2]);
    const threadId = decodeURIComponent(threadReopenMatch[3]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }
    const thread = getThreadOr404(res, proposal, threadId);
    if (!thread) {
      return;
    }

    if (thread.status === "RESOLVED") {
      thread.status = "OPEN";
      thread.resolvedOutcome = undefined;
      thread.resolvedNote = null;
      trackAuditEvent(proposal, session.userName, "THREAD_REOPENED", {
        threadId
      });
    }

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const threadVisibilityMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/visibility$/);
  if (method === "POST" && threadVisibilityMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadVisibilityMatch[1]);
    const proposalId = decodeURIComponent(threadVisibilityMatch[2]);
    const threadId = decodeURIComponent(threadVisibilityMatch[3]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }
    const thread = getThreadOr404(res, proposal, threadId);
    if (!thread) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const visibility = asOptionalString(body.visibility)?.toUpperCase();
    if (!visibility || !threadVisibilityValues.has(visibility)) {
      sendError(res, 422, "VALIDATION_ERROR", "visibility must be INTERNAL or EXTERNAL");
      return;
    }
    thread.visibility = visibility;
    trackAuditEvent(proposal, session.userName, "THREAD_VISIBILITY_UPDATED", {
      threadId,
      visibility: thread.visibility
    });

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const threadResolveMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/resolve$/);
  if (method === "POST" && threadResolveMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(threadResolveMatch[1]);
    const proposalId = decodeURIComponent(threadResolveMatch[2]);
    const threadId = decodeURIComponent(threadResolveMatch[3]);

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }

    const thread = getThreadOr404(res, proposal, threadId);
    if (!thread) {
      return;
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (error) {
      sendError(res, 400, "INVALID_BODY", error.message);
      return;
    }

    const outcome = parseResolutionOutcome(asOptionalString(body.outcome) ?? "ACCEPTED");
    const rationale = asOptionalString(body.rationale) ?? asOptionalString(body.note);
    if (outcome.code === "REJECTED" && !rationale) {
      sendError(res, 422, "VALIDATION_ERROR", "rationale is required for REJECTED outcomes");
      return;
    }

    if (thread.status !== "RESOLVED") {
      const decidedAt = new Date().toISOString();
      const decisionRationale = rationale ?? `Resolved thread "${thread.anchor}" with outcome ${outcome.code.toLowerCase()}.`;
      thread.status = "RESOLVED";
      thread.resolvedOutcome = outcome.code;
      thread.resolvedNote = `Resolved by ${session.userName} · ${formatRelative(decidedAt)}${decisionRationale ? ` — ${decisionRationale}` : ""}`;
      const latestCommit = proposal.commits[proposal.commits.length - 1];
      recordDecision(
        proposal,
        buildDecision(
          `${new Date().toISOString().slice(0, 10)} · ${latestCommit.hash}`,
          [{ label: outcome.label, tone: outcome.tone }],
          decisionRationale,
          `${session.userName} finalized the decision record`
        )
      );
      appendDecisionLogEntry(proposal, {
        threadId,
        proposalId: proposal.id,
        outcome: outcome.code,
        rationale: decisionRationale,
        decidedBy: session.userName,
        decidedAt,
        commitHash: latestCommit.hash,
        participants: collectThreadParticipants(thread)
      });
      trackAuditEvent(proposal, session.userName, "THREAD_RESOLVED", {
        threadId,
        outcome: outcome.code
      });
    }

    sendJson(res, 200, buildWorkspace(document, session.userName));
    return;
  }

  const proposalActionMatch = path.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/(submit|approvals|versions|merge)$/);
  if (method === "POST" && proposalActionMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(proposalActionMatch[1]);
    const proposalId = decodeURIComponent(proposalActionMatch[2]);
    const action = proposalActionMatch[3];

    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }
    const proposal = getProposalOr404(res, document, proposalId);
    if (!proposal) {
      return;
    }

    if (action === "submit") {
      proposal.status = "UNDER_REVIEW";
      document.status = "In review";
      const headCommit = proposal.commits[proposal.commits.length - 1];
      recordDecision(
        proposal,
        buildDecision(
          `${new Date().toISOString().slice(0, 10)} · ${headCommit.hash}`,
          [{ label: "Submitted", tone: "blue" }],
          "Proposal submitted for review. Approval chain is now enforced.",
          `${session.userName} started formal review`
        )
      );
      trackAuditEvent(proposal, session.userName, "PROPOSAL_SUBMITTED", {
        proposalId: proposal.id
      });
      sendJson(res, 200, buildWorkspace(document, session.userName));
      return;
    }

    if (action === "approvals") {
      let body;
      try {
        body = await parseBody(req);
      } catch (error) {
        sendError(res, 400, "INVALID_BODY", error.message);
        return;
      }
      const role = asOptionalString(body.role);
      if (!role || !mergeGateRoles.includes(role)) {
        sendError(res, 422, "VALIDATION_ERROR", "role must be one of security, architectureCommittee, legal");
        return;
      }

      if (proposal.status !== "UNDER_REVIEW") {
        sendError(res, 409, "PROPOSAL_NOT_UNDER_REVIEW", "Proposal must be submitted for review before approvals");
        return;
      }

      const blocked = approvalBlockedDetails(proposal, role);
      if (blocked) {
        sendError(res, 409, "APPROVAL_ORDER_BLOCKED", "Approval order is blocked by unmet prerequisites", blocked);
        return;
      }

      if (proposal.approvals[role]?.status !== "Approved") {
        proposal.approvals[role] = createApprovalState("Approved", session.userName, new Date().toISOString());
        const headCommit = proposal.commits[proposal.commits.length - 1];
        recordDecision(
          proposal,
          buildDecision(
            `${new Date().toISOString().slice(0, 10)} · ${headCommit.hash}`,
            [
              { label: "Approved", tone: "approved" },
              { label: role, tone: "blue" }
            ],
            `${role} approval recorded for proposal ${proposal.id}.`,
            `${session.userName} approved ${role}`
          )
        );
        trackAuditEvent(proposal, session.userName, "APPROVAL_GRANTED", {
          role
        });
      }
      proposal.status = "UNDER_REVIEW";
      sendJson(res, 200, buildWorkspace(document, session.userName));
      return;
    }

    if (action === "versions") {
      let body;
      try {
        body = await parseBody(req);
      } catch (error) {
        sendError(res, 400, "INVALID_BODY", error.message);
        return;
      }
      const name = asOptionalString(body.name);
      if (!name) {
        sendError(res, 422, "VALIDATION_ERROR", "name is required");
        return;
      }

      const headCommit = proposal.commits[proposal.commits.length - 1];
      proposal.namedVersions.unshift({
        name,
        hash: headCommit.hash,
        createdBy: session.userName,
        createdAt: new Date().toISOString()
      });
      trackAuditEvent(proposal, session.userName, "NAMED_VERSION_CREATED", {
        name,
        hash: headCommit.hash
      });

      sendJson(res, 200, buildWorkspace(document, session.userName));
      return;
    }

    if (action === "merge") {
      if (proposal.status !== "UNDER_REVIEW") {
        sendError(res, 409, "PROPOSAL_NOT_UNDER_REVIEW", "Proposal must be under review to merge");
        return;
      }

      const gate = computeMergeGate(proposal);
      if (!gate.mergeReady) {
        sendError(res, 409, "MERGE_GATE_BLOCKED", "Merge gate blocked", {
          pendingApprovals: gate.pendingApprovals,
          openThreads: gate.openThreads
        });
        return;
      }

      const headCommit = proposal.commits[proposal.commits.length - 1];
      const mergeCommit = createCommit({
        message: `Merge proposal ${proposal.id}`,
        author: session.userName,
        content: headCommit.content,
        added: 8,
        removed: 2
      });

      document.main.commits.push(mergeCommit);
      document.main.namedVersions.unshift(
        ...proposal.namedVersions.map((version) => ({
          ...version
        }))
      );
      proposal.status = "MERGED";
      document.title = mergeCommit.content.title;
      document.updatedBy = session.userName;
      document.status = "Approved";
      recordDecision(
        proposal,
        buildDecision(
          `${new Date().toISOString().slice(0, 10)} · ${mergeCommit.hash}`,
          [{ label: "Merged", tone: "approved" }],
          `Proposal ${proposal.id} merged into main after approvals and thread resolution.`,
          `${session.userName} completed merge`
        )
      );
      appendDecisionLogEntry(proposal, {
        threadId: `proposal:${proposal.id}`,
        proposalId: proposal.id,
        outcome: "ACCEPTED",
        rationale: `Proposal ${proposal.id} merged into main after approvals and thread resolution.`,
        decidedBy: session.userName,
        decidedAt: new Date().toISOString(),
        commitHash: mergeCommit.hash,
        participants: [session.userName]
      });
      trackAuditEvent(proposal, session.userName, "PROPOSAL_MERGED", {
        mergeCommit: mergeCommit.hash
      });

      sendJson(res, 200, buildWorkspace(document, session.userName));
      return;
    }
  }

  const documentMatch = path.match(/^\/api\/documents\/([^/]+)$/);
  if (method === "GET" && documentMatch) {
    if (!requireSession(req, res)) {
      return;
    }

    const documentId = decodeURIComponent(documentMatch[1]);
    const summary = buildDocumentsList().find((item) => item.id === documentId);
    if (!summary) {
      sendError(res, 404, "DOCUMENT_NOT_FOUND", "Document not found");
      return;
    }
    sendJson(res, 200, { document: summary });
    return;
  }

  const workspaceMatch = path.match(/^\/api\/workspace\/([^/]+)$/);
  if (workspaceMatch) {
    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    const documentId = decodeURIComponent(workspaceMatch[1]);
    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }

    if (method === "GET") {
      sendJson(res, 200, buildWorkspace(document, session.userName));
      return;
    }

    if (method === "POST") {
      let body;
      try {
        body = await parseBody(req);
      } catch (error) {
        sendError(res, 400, "INVALID_BODY", error.message);
        return;
      }

      const proposal = ensureWorkflowProposal(document, session.userName);
      const headCommit = proposal.commits[proposal.commits.length - 1];
      const current = headCommit.content;

      // If a full ProseMirror doc is provided, validate and use it as source of truth
      if (body.doc && typeof body.doc === "object") {
        const docError = validateDocShape(body.doc);
        if (docError) {
          sendError(res, 422, "VALIDATION_ERROR", `Invalid doc: ${docError}`);
          return;
        }
      }
      const nextDoc = body.doc && typeof body.doc === "object" ? body.doc : current.doc;
      const derived = nextDoc ? deriveLegacyFromDoc(nextDoc) : null;
      const next = {
        title: asOptionalString(body.title) ?? derived?.title ?? current.title,
        subtitle: asOptionalString(body.subtitle) ?? derived?.subtitle ?? current.subtitle,
        purpose: asOptionalString(body.purpose) ?? derived?.purpose ?? current.purpose,
        tiers: asOptionalString(body.tiers) ?? derived?.tiers ?? current.tiers,
        enforce: asOptionalString(body.enforce) ?? derived?.enforce ?? current.enforce,
        ...(nextDoc ? { doc: nextDoc } : {})
      };

      const changed = diffContent(current, next);
      const hasDoc = !!next.doc;
      metrics[hasDoc ? "workspace.save.with_doc" : "workspace.save.legacy_only"] += 1;

      if (changed.length > 0) {
        const message = `Update ${changed.map((item) => item.field).join(", ")}`;
        const commit = createCommit({
          message,
          author: session.userName,
          content: next,
          added: Math.max(2, changed.length * 3),
          removed: Math.max(0, changed.length - 1)
        });

        proposal.commits.push(commit);
        proposal.status = proposal.status === "DRAFT" ? "DRAFT" : "UNDER_REVIEW";
        document.status = proposal.status === "DRAFT" ? "Draft" : "In review";
        document.updatedBy = session.userName;
        document.title = next.title;
        trackAuditEvent(proposal, session.userName, "CONTENT_UPDATED", {
          commit: commit.hash,
          changedFields: changed.map((item) => item.field)
        });
        structuredLog("CONTENT_UPDATED", {
          documentId: document.id,
          commit: commit.hash,
          changedFields: changed.map((item) => item.field),
          hasDoc
        });
      }

      sendJson(res, 200, buildWorkspace(document, session.userName));
      return;
    }

    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return;
  }

  if (method === "GET" && path === "/api/approvals") {
    if (!requireSession(req, res)) {
      return;
    }

    const primaryProposal = workflowProposal(documents.get("adr-142"));
    sendJson(res, 200, {
      mergeGate: primaryProposal
        ? toApprovalStatusMap(primaryProposal.approvals)
        : {
            security: "Approved",
            architectureCommittee: "Approved",
            legal: "Approved"
          },
      queue: proposalQueueItems()
    });
    return;
  }

  // Blame endpoint - paragraph-level attribution
  const blameMatch = path.match(/^\/api\/documents\/([^/]+)\/blame$/);
  if (method === "GET" && blameMatch) {
    if (!requireSession(req, res)) {
      return;
    }

    const documentId = decodeURIComponent(blameMatch[1]);
    const proposalId = asOptionalString(url.searchParams.get("proposalId"));
    const document = getDocumentOr404(res, documentId);
    if (!document) {
      return;
    }

    const useMain = proposalId === "main";
    const proposal = useMain
      ? null
      : proposalId
        ? getProposalOr404(res, document, proposalId)
        : workflowProposal(document);
    if (proposalId && proposalId !== "main" && !proposal) {
      return;
    }

    const commits = proposal ? proposal.commits : document.main.commits;
    const headCommit = commits[commits.length - 1];
    
    // Get threads for this proposal/document
    const allThreads = proposal ? proposal.threads : [];
    
    // Build blame entries from commit history
    // For each node in the head commit, find the most recent commit that modified it
    const entries = [];
    const doc = headCommit?.content?.doc;
    
    if (doc && Array.isArray(doc.content)) {
      // Track which nodes we've found blame for
      const nodeBlameMap = new Map();
      
      // Walk through commits from newest to oldest
      for (let i = commits.length - 1; i >= 0; i--) {
        const commit = commits[i];
        const commitDoc = commit.content?.doc;
        
        if (!commitDoc || !Array.isArray(commitDoc.content)) {
          continue;
        }
        
        // For each node in this commit
        for (const node of commitDoc.content) {
          const nodeId = node.attrs?.nodeId;
          if (!nodeId || nodeBlameMap.has(nodeId)) {
            continue;
          }
          
          // Record blame for this node
          nodeBlameMap.set(nodeId, {
            nodeId,
            author: commit.author,
            editedAt: commit.createdAt,
            commitHash: commit.hash,
            commitMessage: commit.message
          });
        }
      }
      
      // Add entries for nodes in head commit, including thread info
      for (const node of doc.content) {
        const nodeId = node.attrs?.nodeId;
        if (!nodeId) continue;
        
        const blame = nodeBlameMap.get(nodeId);
        if (blame) {
          // Find threads anchored to this node
          const nodeThreads = allThreads
            .filter(t => t.anchorNodeId === nodeId)
            .map(t => ({
              id: t.id,
              author: t.author,
              status: t.status,
              replyCount: t.replies?.length || 0
            }));
          
          entries.push({
            ...blame,
            threads: nodeThreads.length > 0 ? nodeThreads : undefined
          });
        }
      }
    }

    sendJson(res, 200, {
      documentId,
      branch: proposal ? `proposals/${proposal.id}` : "main",
      entries
    });
    return;
  }

  sendError(res, 404, "NOT_FOUND", "Not found");
});

// Periodic cleanup of expired refresh tokens (every hour)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const result = cleanupExpiredRefreshTokens();
  structuredLog("TOKEN_CLEANUP", {
    active: result.active,
    revoked: result.revoked,
    cleaned: result.cleaned
  });
}, CLEANUP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Chronicle API listening on http://localhost:${PORT}`);
  console.log(`Token cleanup running every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);
});
