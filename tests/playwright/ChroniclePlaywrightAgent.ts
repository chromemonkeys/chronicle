import { expect, type Page, type Request, type Route } from "@playwright/test";

type MergeGateRole = "security" | "architectureCommittee" | "legal";
type MergeGateStatus = "Approved" | "Pending";
type DocumentStatus = "Draft" | "In review" | "Ready for approval" | "Approved";

type DocumentSummary = {
  id: string;
  title: string;
  status: DocumentStatus;
  updatedBy: string;
  openThreads: number;
};

type ApprovalQueueStatus = "Blocked" | "Ready";

type ApprovalsResponse = {
  mergeGate: Record<MergeGateRole, MergeGateStatus>;
  queue: Array<{
    id: string;
    documentId: string;
    proposalId: string;
    title: string;
    requestedBy: string;
    status: ApprovalQueueStatus;
  }>;
};

type WorkspaceContent = {
  title: string;
  subtitle: string;
  purpose: string;
  tiers: string;
  enforce: string;
};

type DocumentSnapshot = {
  type: "doc";
  content: unknown[];
};

type WorkspaceThread = {
  id: string;
  initials: string;
  author: string;
  time: string;
  anchor: string;
  anchorNodeId?: string;
  text: string;
  quote?: string;
  votes: number;
  voted?: boolean;
  status?: "OPEN" | "RESOLVED" | "ORPHANED";
  type?: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
  visibility?: "INTERNAL" | "EXTERNAL";
  resolvedOutcome?: "ACCEPTED" | "REJECTED" | "DEFERRED";
  resolvedNote?: string;
  reactions?: Array<{ emoji: string; count: number }>;
  tone: "green" | "red" | "blue" | "purple" | "amber";
  replies: Array<{
    initials: string;
    author: string;
    time: string;
    text: string;
    type?: string;
    tone: "green" | "red" | "blue" | "purple" | "amber";
  }>;
};

type DecisionLogEntry = {
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

type WorkspacePayload = {
  document: {
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
  content: WorkspaceContent;
  doc: DocumentSnapshot;
  nodeIds: Record<string, string>;
  counts: {
    allDocuments: number;
    openReviews: number;
    merged: number;
  };
  approvals: Record<MergeGateRole, MergeGateStatus>;
  approvalDetails: Record<
    MergeGateRole,
    {
      status: MergeGateStatus;
      approvedBy: string | null;
      approvedAt: string | null;
    }
  >;
  approvalStages: Array<{
    id: string;
    mode: "parallel" | "sequential";
    roles: MergeGateRole[];
    dependsOn?: string;
  }>;
  threads: WorkspaceThread[];
  history: Array<{ hash: string; message: string; meta: string }>;
  decisions: Array<{
    date: string;
    tags: Array<{ label: string; tone: "approved" | "rejected" | "deferred" | "blue" }>;
    text: string;
    by: string;
  }>;
};

type NamedVersion = {
  name: string;
  hash: string;
  createdBy: string;
  createdAt: string;
};

type ChronicleAgentOptions = {
  userName?: string | null;
  documents?: DocumentSummary[];
  approvals?: ApprovalsResponse;
  workspaces?: Record<string, WorkspacePayload>;
  failFirst?: Partial<Record<"documents" | "approvals" | "workspace" | "history" | "decisionLog" | "compare", number>>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function initialsFromName(name: string | null): string {
  const raw = (name ?? "Playwright").trim();
  if (!raw) {
    return "PW";
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function buildDefaultWorkspace(): WorkspacePayload {
  return {
    document: {
      id: "rfc-auth",
      title: "RFC: OAuth and Magic Link Session Flow",
      subtitle: "Auth strategy for Chronicle API",
      status: "In review",
      version: "v0.9-draft",
      editedBy: "Avery",
      editedAt: "just now",
      branch: "proposal/rfc-auth-legal-copy -> main",
      proposalId: "proposal-rfc-auth"
    },
    content: {
      title: "RFC: OAuth and Magic Link Session Flow",
      subtitle: "Auth strategy for Chronicle API",
      purpose: "Define secure sign-in and session refresh behavior for Chronicle.",
      tiers: "Standard tier allows up to 2,500 requests per minute.",
      enforce: "Violations trigger warning, then temporary request throttling."
    },
    doc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, nodeId: "node-title" },
          content: [{ type: "text", text: "RFC: OAuth and Magic Link Session Flow" }]
        },
        {
          type: "paragraph",
          attrs: { nodeId: "node-subtitle" },
          content: [{ type: "text", text: "Auth strategy for Chronicle API" }]
        },
        {
          type: "heading",
          attrs: { level: 2, nodeId: "node-purpose-h" },
          content: [{ type: "text", text: "Purpose" }]
        },
        {
          type: "paragraph",
          attrs: { nodeId: "node-purpose" },
          content: [{ type: "text", text: "Define secure sign-in and session refresh behavior for Chronicle." }]
        },
        {
          type: "heading",
          attrs: { level: 2, nodeId: "node-tiers-h" },
          content: [{ type: "text", text: "Tier Definitions" }]
        },
        {
          type: "paragraph",
          attrs: { nodeId: "node-tiers" },
          content: [{ type: "text", text: "Standard tier allows up to 2,500 requests per minute." }]
        }
      ]
    },
    nodeIds: {
      title: "node-title",
      subtitle: "node-subtitle",
      purpose: "node-purpose",
      tiers: "node-tiers",
      enforce: "node-enforce"
    },
    counts: {
      allDocuments: 5,
      openReviews: 2,
      merged: 18
    },
    approvals: {
      security: "Pending",
      architectureCommittee: "Pending",
      legal: "Pending"
    },
    approvalDetails: {
      security: { status: "Pending", approvedBy: null, approvedAt: null },
      architectureCommittee: { status: "Pending", approvedBy: null, approvedAt: null },
      legal: { status: "Pending", approvedBy: null, approvedAt: null }
    },
    approvalStages: [
      { id: "technical", mode: "parallel", roles: ["security", "architectureCommittee"] },
      { id: "legal", mode: "sequential", roles: ["legal"], dependsOn: "technical" }
    ],
    threads: [
      {
        id: "purpose",
        initials: "AV",
        author: "Avery",
        time: "5m",
        anchor: "Purpose",
        anchorNodeId: "node-purpose",
        text: "Add explicit language for legal fallback before merge.",
        quote: "Define secure sign-in and session refresh behavior for Chronicle.",
        votes: 2,
        status: "OPEN",
        type: "LEGAL",
        visibility: "INTERNAL",
        reactions: [],
        tone: "amber",
        replies: []
      }
    ],
    history: [
      {
        hash: "pw-0002",
        message: "Proposal refresh: adjust auth fallback language",
        meta: "Avery · today"
      },
      {
        hash: "pw-0001",
        message: "Initial proposal branch commit",
        meta: "Avery · yesterday"
      }
    ],
    decisions: [
      {
        date: "Today",
        tags: [{ label: "Deferred", tone: "deferred" }],
        text: "Legal sign-off deferred until technical approvers complete review.",
        by: "Avery"
      }
    ]
  };
}

export function createDefaultWorkspacePayload(): WorkspacePayload {
  return buildDefaultWorkspace();
}

function buildDefaultDocuments(): DocumentSummary[] {
  return [
    {
      id: "rfc-auth",
      title: "RFC: OAuth and Magic Link Session Flow",
      status: "In review",
      updatedBy: "Avery",
      openThreads: 1
    },
    {
      id: "policy-sec",
      title: "Security Policy Update",
      status: "Draft",
      updatedBy: "Jordan",
      openThreads: 3
    }
  ];
}

function buildDefaultApprovals(workspace: WorkspacePayload): ApprovalsResponse {
  return {
    mergeGate: clone(workspace.approvals),
    queue: [
      {
        id: workspace.document.id,
        documentId: workspace.document.id,
        proposalId: workspace.document.proposalId ?? "",
        title: workspace.document.title,
        requestedBy: workspace.document.editedBy,
        status: "Blocked"
      }
    ]
  };
}

export class ChroniclePlaywrightAgent {
  private readonly page: Page;
  private userName: string | null;
  private authToken: string;
  private readonly documents: DocumentSummary[];
  private readonly workspaces: Record<string, WorkspacePayload>;
  private approvals: ApprovalsResponse;
  private readonly baselineByDocumentId: Record<string, WorkspaceContent>;
  private readonly baselineDocByDocumentId: Record<string, DocumentSnapshot>;
  private readonly namedVersionsByDocumentId: Record<string, NamedVersion[]>;
  private readonly decisionLogByDocumentId: Record<string, DecisionLogEntry[]>;
  private readonly failRemaining: Record<"documents" | "approvals" | "workspace" | "history" | "decisionLog" | "compare", number>;
  private readonly autoSyncApprovalsFromWorkspace: boolean;
  private commitCounter = 2;
  private decisionCounter = 1;

  constructor(page: Page, options: ChronicleAgentOptions = {}) {
    this.page = page;
    this.userName = options.userName ?? null;
    this.authToken = "chronicle-playwright-token";
    const defaultWorkspace = buildDefaultWorkspace();
    this.workspaces = clone(options.workspaces ?? { [defaultWorkspace.document.id]: defaultWorkspace });
    this.documents = clone(options.documents ?? buildDefaultDocuments());
    this.approvals = clone(options.approvals ?? buildDefaultApprovals(defaultWorkspace));
    this.autoSyncApprovalsFromWorkspace = options.approvals == null;
    this.baselineByDocumentId = Object.fromEntries(
      Object.entries(this.workspaces).map(([docId, workspace]) => [docId, clone(workspace.content)])
    );
    this.baselineDocByDocumentId = Object.fromEntries(
      Object.entries(this.workspaces).map(([docId, workspace]) => [docId, clone(workspace.doc)])
    );
    this.namedVersionsByDocumentId = {};
    this.decisionLogByDocumentId = {};
    for (const [docId, workspace] of Object.entries(this.workspaces)) {
      this.decisionLogByDocumentId[docId] = [
        {
          id: this.nextDecisionId(),
          threadId: workspace.threads[0]?.id ?? "thread-1",
          proposalId: workspace.document.proposalId,
          outcome: "DEFERRED",
          rationale: "Legal sign-off deferred until technical approvers complete review.",
          decidedBy: workspace.document.editedBy,
          decidedAt: nowIso(),
          commitHash: workspace.history[0]?.hash ?? this.nextHash(),
          participants: [workspace.document.editedBy]
        }
      ];
    }
    const failFirst = options.failFirst ?? {};
    this.failRemaining = {
      documents: failFirst.documents ?? 0,
      approvals: failFirst.approvals ?? 0,
      workspace: failFirst.workspace ?? 0,
      history: failFirst.history ?? 0,
      decisionLog: failFirst.decisionLog ?? 0,
      compare: failFirst.compare ?? 0
    };
    this.refreshWorkspaceCounts();
  }

  async install(): Promise<void> {
    await this.page.route(/https?:\/\/[^/]+\/api\/.*/, async (route) => {
      await this.handleRoute(route);
    });
  }

  async signIn(name = "Avery"): Promise<void> {
    await this.page.goto("/sign-in");
    const displayNameInput = this.page.getByLabel("Display name");
    try {
      await expect(displayNameInput).toBeVisible({ timeout: 10_000 });
    } catch {
      // Vite can occasionally drop module requests in parallel runs; a reload restores the route.
      await this.page.reload({ waitUntil: "domcontentloaded" });
      await expect(displayNameInput).toBeVisible({ timeout: 10_000 });
    }
    await displayNameInput.fill(name);
    await this.page.getByRole("button", { name: "Sign in" }).click();
    await expect(this.page).toHaveURL(/\/documents$/);
  }

  private async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();

    if (pathname === "/api/session" && method === "GET") {
      await this.ok(route, {
        authenticated: this.userName !== null,
        userName: this.userName
      });
      return;
    }

    if (pathname === "/api/session/login" && method === "POST") {
      const body = this.readBody<{ name?: string }>(request);
      const name = (body?.name ?? "User").trim() || "User";
      this.userName = name;
      this.authToken = `chronicle-playwright-token-${Date.now()}`;
      await this.ok(route, {
        token: this.authToken,
        userName: name
      });
      return;
    }

    if (pathname === "/api/session/logout" && method === "POST") {
      this.userName = null;
      await this.ok(route, { ok: true });
      return;
    }

    if (!this.isAuthorized(request)) {
      await this.fail(route, 401, "Authentication required", "AUTH_REQUIRED");
      return;
    }

    if (pathname === "/api/documents" && method === "GET") {
      if (await this.maybeFail(route, "documents")) {
        return;
      }
      await this.ok(route, {
        documents: this.documents
      });
      return;
    }

    if (pathname === "/api/documents" && method === "POST") {
      const body = this.readBody<{ title?: string; subtitle?: string }>(request);
      const title = (body?.title ?? "").trim() || "Untitled Document";
      const subtitle = (body?.subtitle ?? "").trim();
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24) || "document";
      let documentId = baseSlug;
      while (this.workspaces[documentId]) {
        documentId = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
      }

      const actor = this.userName ?? "Playwright";
      const workspace = createDefaultWorkspacePayload();
      workspace.document.id = documentId;
      workspace.document.title = title;
      workspace.document.subtitle = subtitle;
      workspace.document.status = "Draft";
      workspace.document.version = "v1.0.0-main";
      workspace.document.editedBy = actor;
      workspace.document.editedAt = "just now";
      workspace.document.branch = "main";
      workspace.document.proposalId = null;
      workspace.content = {
        title,
        subtitle,
        purpose: "Describe the purpose and decision context for this document.",
        tiers: "Document relevant tiers, scope boundaries, or audience segments.",
        enforce: "Describe how this policy or decision is enforced and reviewed."
      };
      workspace.doc = {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1, nodeId: `${documentId}-title` },
            content: [{ type: "text", text: title }]
          },
          {
            type: "paragraph",
            attrs: { nodeId: `${documentId}-subtitle` },
            content: [{ type: "text", text: subtitle }]
          },
          {
            type: "heading",
            attrs: { level: 2, nodeId: `${documentId}-purpose-h` },
            content: [{ type: "text", text: "Purpose" }]
          },
          {
            type: "paragraph",
            attrs: { nodeId: `${documentId}-purpose` },
            content: [{ type: "text", text: workspace.content.purpose }]
          },
          {
            type: "heading",
            attrs: { level: 2, nodeId: `${documentId}-tiers-h` },
            content: [{ type: "text", text: "Tier Definitions" }]
          },
          {
            type: "paragraph",
            attrs: { nodeId: `${documentId}-tiers` },
            content: [{ type: "text", text: workspace.content.tiers }]
          },
          {
            type: "heading",
            attrs: { level: 2, nodeId: `${documentId}-enforce-h` },
            content: [{ type: "text", text: "Enforcement" }]
          },
          {
            type: "paragraph",
            attrs: { nodeId: `${documentId}-enforce` },
            content: [{ type: "text", text: workspace.content.enforce }]
          }
        ]
      };
      workspace.nodeIds = {
        title: `${documentId}-title`,
        subtitle: `${documentId}-subtitle`,
        purpose: `${documentId}-purpose`,
        tiers: `${documentId}-tiers`,
        enforce: `${documentId}-enforce`
      };
      workspace.approvals = {
        security: "Approved",
        architectureCommittee: "Approved",
        legal: "Approved"
      };
      workspace.approvalDetails = {
        security: { status: "Approved", approvedBy: actor, approvedAt: nowIso() },
        architectureCommittee: { status: "Approved", approvedBy: actor, approvedAt: nowIso() },
        legal: { status: "Approved", approvedBy: actor, approvedAt: nowIso() }
      };
      workspace.threads = [];
      workspace.history = [
        {
          hash: this.nextHash(),
          message: "Create document baseline",
          meta: `${actor} · just now`
        }
      ];
      workspace.decisions = [];

      this.workspaces[documentId] = workspace;
      this.baselineByDocumentId[documentId] = clone(workspace.content);
      this.baselineDocByDocumentId[documentId] = clone(workspace.doc);
      this.namedVersionsByDocumentId[documentId] = [];
      this.decisionLogByDocumentId[documentId] = [];
      this.documents.unshift({
        id: documentId,
        title,
        status: "Draft",
        updatedBy: actor,
        openThreads: 0
      });
      this.refreshWorkspaceCounts();
      if (this.autoSyncApprovalsFromWorkspace) {
        this.syncApprovalsFromWorkspace();
      }
      await this.ok(route, workspace);
      return;
    }

    if (pathname === "/api/approvals" && method === "GET") {
      if (await this.maybeFail(route, "approvals")) {
        return;
      }
      if (this.autoSyncApprovalsFromWorkspace) {
        this.syncApprovalsFromWorkspace();
      }
      await this.ok(route, this.approvals);
      return;
    }

    const workspaceMatch = pathname.match(/^\/api\/workspace\/([^/]+)$/);
    if (workspaceMatch) {
      if (method === "GET" && await this.maybeFail(route, "workspace")) {
        return;
      }
      const documentId = workspaceMatch[1];
      const workspace = this.workspaces[documentId];
      if (!workspace) {
        await this.fail(route, 404, "Workspace not found", "NOT_FOUND");
        return;
      }

      if (method === "GET") {
        await this.ok(route, workspace);
        return;
      }

      if (method === "POST") {
        const body = this.readBody<Partial<WorkspaceContent> & { doc?: WorkspacePayload["doc"] }>(request);
        workspace.content = {
          ...workspace.content,
          title: typeof body?.title === "string" ? body.title : workspace.content.title,
          subtitle: typeof body?.subtitle === "string" ? body.subtitle : workspace.content.subtitle,
          purpose: typeof body?.purpose === "string" ? body.purpose : workspace.content.purpose,
          tiers: typeof body?.tiers === "string" ? body.tiers : workspace.content.tiers,
          enforce: typeof body?.enforce === "string" ? body.enforce : workspace.content.enforce
        };
        if (body?.doc && typeof body.doc === "object") {
          workspace.doc = clone(body.doc);
        }
        this.touchWorkspace(documentId, "Save draft via Playwright agent");
        await this.ok(route, workspace);
        return;
      }
    }

    const historyMatch = pathname.match(/^\/api\/documents\/([^/]+)\/history$/);
    if (historyMatch && method === "GET") {
      if (await this.maybeFail(route, "history")) {
        return;
      }
      const documentId = historyMatch[1];
      const workspace = this.workspaces[documentId];
      if (!workspace) {
        await this.fail(route, 404, "Document history not found", "NOT_FOUND");
        return;
      }
      const proposalIdParam = url.searchParams.get("proposalId");
      const isMain = proposalIdParam === "main";
      await this.ok(route, {
        documentId,
        proposalId: isMain ? null : proposalIdParam,
        branch: isMain ? "main" : workspace.document.branch.split(" -> ")[0],
        commits: workspace.history,
        namedVersions: this.namedVersionsByDocumentId[documentId] ?? []
      });
      return;
    }

    const compareMatch = pathname.match(/^\/api\/documents\/([^/]+)\/compare$/);
    if (compareMatch && method === "GET") {
      if (await this.maybeFail(route, "compare")) {
        return;
      }
      const documentId = compareMatch[1];
      const workspace = this.workspaces[documentId];
      if (!workspace) {
        await this.fail(route, 404, "Document compare not found", "NOT_FOUND");
        return;
      }
      const from = url.searchParams.get("from") ?? "unknown";
      const to = url.searchParams.get("to") ?? "unknown";
      const baseline = this.baselineByDocumentId[documentId] ?? workspace.content;
      const baselineDoc = this.baselineDocByDocumentId[documentId] ?? workspace.doc;
      const keys: Array<keyof WorkspaceContent> = ["title", "subtitle", "purpose", "tiers", "enforce"];
      const changedFields = keys
        .filter((field) => baseline[field] !== workspace.content[field])
        .map((field) => ({
          field,
          before: baseline[field],
          after: workspace.content[field]
        }));
      const baselineNodes = Array.isArray((baselineDoc as { content?: unknown[] }).content)
        ? ((baselineDoc as { content: Array<{ attrs?: { nodeId?: string }; content?: Array<{ text?: string }> }> }).content)
        : [];
      const currentNodes = Array.isArray((workspace.doc as { content?: unknown[] }).content)
        ? ((workspace.doc as { content: Array<{ attrs?: { nodeId?: string }; content?: Array<{ text?: string }> }> }).content)
        : [];
      const baselineByNodeId = new Map<string, { index: number; text: string }>();
      for (let i = 0; i < baselineNodes.length; i += 1) {
        const node = baselineNodes[i];
        const nodeId = node?.attrs?.nodeId;
        if (!nodeId) continue;
        const text = Array.isArray(node.content) ? node.content.map((item) => item?.text ?? "").join("").trim() : "";
        baselineByNodeId.set(nodeId, { index: i, text });
      }
      const currentByNodeId = new Map<string, { index: number; text: string }>();
      for (let i = 0; i < currentNodes.length; i += 1) {
        const node = currentNodes[i];
        const nodeId = node?.attrs?.nodeId;
        if (!nodeId) continue;
        const text = Array.isArray(node.content) ? node.content.map((item) => item?.text ?? "").join("").trim() : "";
        currentByNodeId.set(nodeId, { index: i, text });
      }
      const changes: Array<{
        id: string;
        type: "inserted" | "deleted" | "modified" | "moved" | "format_only";
        fromRef: string;
        toRef: string;
        anchor: { nodeId: string; fromOffset: number; toOffset: number };
        context: { before: string; after: string };
        snippet: string;
        author: { id: string; name: string };
        editedAt: string;
        reviewState: "pending";
        threadIds: string[];
        blockers: string[];
      }> = [];
      for (const [nodeId, baseNode] of baselineByNodeId.entries()) {
        const nextNode = currentByNodeId.get(nodeId);
        if (!nextNode) {
          changes.push({
            id: `chg-${nodeId}-deleted`,
            type: "deleted",
            fromRef: from,
            toRef: to,
            anchor: { nodeId, fromOffset: 0, toOffset: baseNode.text.length },
            context: { before: "", after: "" },
            snippet: baseNode.text || "Deleted content",
            author: { id: "usr_avery", name: "Avery" },
            editedAt: new Date().toISOString(),
            reviewState: "pending",
            threadIds: [],
            blockers: []
          });
          continue;
        }
        if (baseNode.index !== nextNode.index && baseNode.text === nextNode.text) {
          changes.push({
            id: `chg-${nodeId}-moved`,
            type: "moved",
            fromRef: from,
            toRef: to,
            anchor: { nodeId, fromOffset: 0, toOffset: nextNode.text.length },
            context: { before: "", after: "" },
            snippet: nextNode.text || "Moved content",
            author: { id: "usr_avery", name: "Avery" },
            editedAt: new Date().toISOString(),
            reviewState: "pending",
            threadIds: [],
            blockers: []
          });
        } else if (baseNode.text !== nextNode.text) {
          changes.push({
            id: `chg-${nodeId}-modified`,
            type: "modified",
            fromRef: from,
            toRef: to,
            anchor: { nodeId, fromOffset: 0, toOffset: nextNode.text.length },
            context: { before: baseNode.text, after: nextNode.text },
            snippet: nextNode.text || "Modified content",
            author: { id: "usr_avery", name: "Avery" },
            editedAt: new Date().toISOString(),
            reviewState: "pending",
            threadIds: [],
            blockers: []
          });
        }
      }
      for (const [nodeId, currentNode] of currentByNodeId.entries()) {
        if (baselineByNodeId.has(nodeId)) {
          continue;
        }
        changes.push({
          id: `chg-${nodeId}-inserted`,
          type: "inserted",
          fromRef: from,
          toRef: to,
          anchor: { nodeId, fromOffset: 0, toOffset: currentNode.text.length },
          context: { before: "", after: currentNode.text },
          snippet: currentNode.text || "Inserted content",
          author: { id: "usr_avery", name: "Avery" },
          editedAt: new Date().toISOString(),
          reviewState: "pending",
          threadIds: [],
          blockers: []
        });
      }
      changes.sort((a, b) => a.id.localeCompare(b.id));
      await this.ok(route, {
        from,
        to,
        changedFields,
        changes,
        fromContent: {
          ...baseline,
          doc: clone(baselineDoc)
        },
        toContent: {
          ...workspace.content,
          doc: clone(workspace.doc)
        }
      });
      return;
    }

    const proposalCreateMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals$/);
    if (proposalCreateMatch && method === "POST") {
      const documentId = proposalCreateMatch[1];
      const workspace = this.workspaces[documentId];
      if (!workspace) {
        await this.fail(route, 404, "Workspace not found", "NOT_FOUND");
        return;
      }
      if (!workspace.document.proposalId) {
        workspace.document.proposalId = `proposal-${documentId}`;
        workspace.document.status = "In review";
        workspace.document.branch = `proposal/${documentId}-playwright -> main`;
        workspace.approvals = {
          security: "Pending",
          architectureCommittee: "Pending",
          legal: "Pending"
        };
        workspace.approvalDetails = {
          security: { status: "Pending", approvedBy: null, approvedAt: null },
          architectureCommittee: { status: "Pending", approvedBy: null, approvedAt: null },
          legal: { status: "Pending", approvedBy: null, approvedAt: null }
        };
      }
      this.touchWorkspace(documentId, "Start proposal");
      await this.ok(route, workspace);
      return;
    }

    const decisionLogMatch = pathname.match(/^\/api\/documents\/([^/]+)\/decision-log$/);
    if (decisionLogMatch && method === "GET") {
      if (await this.maybeFail(route, "decisionLog")) {
        return;
      }
      const documentId = decisionLogMatch[1];
      const entries = [...(this.decisionLogByDocumentId[documentId] ?? [])];
      const outcome = (url.searchParams.get("outcome") ?? "").toUpperCase();
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const author = (url.searchParams.get("author") ?? "").trim().toLowerCase();
      const limitRaw = Number(url.searchParams.get("limit") ?? "100");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;
      const filtered = entries
        .filter((item) => !outcome || item.outcome === outcome)
        .filter((item) => !q || item.rationale.toLowerCase().includes(q) || item.threadId.toLowerCase().includes(q))
        .filter((item) => !author || item.decidedBy.toLowerCase().includes(author))
        .slice(0, limit);

      await this.ok(route, {
        documentId,
        items: filtered
      });
      return;
    }

    const submitMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/submit$/);
    if (submitMatch && method === "POST") {
      const [_, documentId, proposalId] = submitMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      workspace.document.status = "Ready for approval";
      this.touchWorkspace(documentId, "Submit proposal for review");
      await this.ok(route, workspace);
      return;
    }

    const approvalsMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/approvals$/);
    if (approvalsMatch && method === "POST") {
      const [_, documentId, proposalId] = approvalsMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const body = this.readBody<{ role?: MergeGateRole }>(request);
      const role = body?.role;
      if (!role || !(role in workspace.approvals)) {
        await this.fail(route, 422, "role is required", "VALIDATION_ERROR");
        return;
      }
      if (
        role === "legal" &&
        (workspace.approvals.security !== "Approved" || workspace.approvals.architectureCommittee !== "Approved")
      ) {
        await this.fail(route, 409, "Legal approval depends on technical stage", "APPROVAL_ORDER_BLOCKED", {
          blockers: ["security", "architectureCommittee"].filter(
            (candidate) => workspace.approvals[candidate as MergeGateRole] !== "Approved"
          )
        });
        return;
      }

      workspace.approvals[role] = "Approved";
      workspace.approvalDetails[role] = {
        status: "Approved",
        approvedBy: this.userName ?? "Reviewer",
        approvedAt: nowIso()
      };
      this.touchWorkspace(documentId, `Approve ${role}`);
      await this.ok(route, workspace);
      return;
    }

    const threadCreateMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads$/);
    if (threadCreateMatch && method === "POST") {
      const [_, documentId, proposalId] = threadCreateMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const body = this.readBody<{
        text?: string;
        anchor?: string;
        anchorLabel?: string;
        anchorNodeId?: string;
        visibility?: "INTERNAL" | "EXTERNAL";
        type?: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
      }>(request);
      const text = body?.text?.trim();
      if (!text) {
        await this.fail(route, 422, "text is required", "VALIDATION_ERROR");
        return;
      }
      const nextId = `thread-${workspace.threads.length + 1}`;
      workspace.threads.push({
        id: nextId,
        initials: initialsFromName(this.userName),
        author: this.userName ?? "Playwright",
        time: "now",
        anchor: body?.anchorLabel ?? body?.anchor ?? "General",
        anchorNodeId: body?.anchorNodeId,
        text,
        votes: 0,
        status: "OPEN",
        type: body?.type ?? "GENERAL",
        visibility: body?.visibility ?? "INTERNAL",
        reactions: [],
        tone: "blue",
        replies: []
      });
      this.touchWorkspace(documentId, "Create thread");
      await this.ok(route, workspace);
      return;
    }

    const threadRepliesMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/replies$/);
    if (threadRepliesMatch && method === "POST") {
      const [_, documentId, proposalId, threadId] = threadRepliesMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const thread = workspace.threads.find((item) => item.id === threadId);
      if (!thread) {
        await this.fail(route, 404, "Thread not found", "NOT_FOUND");
        return;
      }
      const body = this.readBody<{ body?: string; type?: string }>(request);
      const replyText = body?.body?.trim();
      if (!replyText) {
        await this.fail(route, 422, "body is required", "VALIDATION_ERROR");
        return;
      }
      thread.replies.push({
        initials: initialsFromName(this.userName),
        author: this.userName ?? "Playwright",
        time: "now",
        text: replyText,
        type: body?.type ?? "GENERAL",
        tone: "blue"
      });
      this.touchWorkspace(documentId, `Reply to thread ${threadId}`);
      await this.ok(route, workspace);
      return;
    }

    const threadVoteMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/vote$/);
    if (threadVoteMatch && method === "POST") {
      const [_, documentId, proposalId, threadId] = threadVoteMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const thread = workspace.threads.find((item) => item.id === threadId);
      if (!thread) {
        await this.fail(route, 404, "Thread not found", "NOT_FOUND");
        return;
      }
      const body = this.readBody<{ direction?: "up" | "down" }>(request);
      if (body?.direction !== "up" && body?.direction !== "down") {
        await this.fail(route, 422, "direction is required", "VALIDATION_ERROR");
        return;
      }
      if (body.direction === "up") {
        thread.votes += 1;
        thread.voted = true;
      } else {
        thread.votes = Math.max(0, thread.votes - 1);
        thread.voted = false;
      }
      this.touchWorkspace(documentId, `Vote ${body.direction} on thread ${threadId}`);
      await this.ok(route, workspace);
      return;
    }

    const threadReactionsMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/reactions$/);
    if (threadReactionsMatch && method === "POST") {
      const [_, documentId, proposalId, threadId] = threadReactionsMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const thread = workspace.threads.find((item) => item.id === threadId);
      if (!thread) {
        await this.fail(route, 404, "Thread not found", "NOT_FOUND");
        return;
      }
      const body = this.readBody<{ emoji?: string }>(request);
      const emoji = body?.emoji?.trim();
      if (!emoji) {
        await this.fail(route, 422, "emoji is required", "VALIDATION_ERROR");
        return;
      }
      if (!thread.reactions) {
        thread.reactions = [];
      }
      const existing = thread.reactions.find((item) => item.emoji === emoji);
      if (existing) {
        existing.count += 1;
      } else {
        thread.reactions.push({ emoji, count: 1 });
      }
      this.touchWorkspace(documentId, `React ${emoji} on thread ${threadId}`);
      await this.ok(route, workspace);
      return;
    }

    const threadReopenMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/reopen$/);
    if (threadReopenMatch && method === "POST") {
      const [_, documentId, proposalId, threadId] = threadReopenMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const thread = workspace.threads.find((item) => item.id === threadId);
      if (!thread) {
        await this.fail(route, 404, "Thread not found", "NOT_FOUND");
        return;
      }
      thread.status = "OPEN";
      thread.resolvedOutcome = undefined;
      thread.resolvedNote = undefined;
      this.touchWorkspace(documentId, `Reopen thread ${threadId}`);
      await this.ok(route, workspace);
      return;
    }

    const threadVisibilityMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/visibility$/);
    if (threadVisibilityMatch && method === "POST") {
      const [_, documentId, proposalId, threadId] = threadVisibilityMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const thread = workspace.threads.find((item) => item.id === threadId);
      if (!thread) {
        await this.fail(route, 404, "Thread not found", "NOT_FOUND");
        return;
      }
      const body = this.readBody<{ visibility?: "INTERNAL" | "EXTERNAL" }>(request);
      if (body?.visibility !== "INTERNAL" && body?.visibility !== "EXTERNAL") {
        await this.fail(route, 422, "visibility is required", "VALIDATION_ERROR");
        return;
      }
      thread.visibility = body.visibility;
      this.touchWorkspace(documentId, `Set thread ${threadId} visibility to ${body.visibility}`);
      await this.ok(route, workspace);
      return;
    }

    const threadResolveMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/threads\/([^/]+)\/resolve$/);
    if (threadResolveMatch && method === "POST") {
      const [_, documentId, proposalId, threadId] = threadResolveMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const thread = workspace.threads.find((item) => item.id === threadId);
      if (!thread) {
        await this.fail(route, 404, "Thread not found", "NOT_FOUND");
        return;
      }
      const body = this.readBody<{ outcome?: "ACCEPTED" | "REJECTED" | "DEFERRED"; rationale?: string }>(request);
      const outcome = body?.outcome ?? "ACCEPTED";
      thread.status = "RESOLVED";
      thread.resolvedOutcome = outcome;
      thread.resolvedNote = `Resolved by ${this.userName ?? "Reviewer"}`;
      this.decisionLogByDocumentId[documentId] = [
        {
          id: this.nextDecisionId(),
          threadId,
          proposalId: workspace.document.proposalId,
          outcome,
          rationale: body?.rationale?.trim() || `Thread ${threadId} resolved for merge readiness.`,
          decidedBy: this.userName ?? "Reviewer",
          decidedAt: nowIso(),
          commitHash: workspace.history[0]?.hash ?? this.nextHash(),
          participants: [thread.author, this.userName ?? "Reviewer"].filter(Boolean)
        },
        ...(this.decisionLogByDocumentId[documentId] ?? [])
      ];
      workspace.decisions.unshift({
        date: "Today",
        tags: [
          {
            label: outcome,
            tone: outcome === "REJECTED" ? "rejected" : outcome === "DEFERRED" ? "deferred" : "approved"
          }
        ],
        text: `Thread ${threadId} resolved for merge readiness.`,
        by: this.userName ?? "Reviewer"
      });
      this.touchWorkspace(documentId, `Resolve thread ${threadId}`);
      await this.ok(route, workspace);
      return;
    }

    const mergeMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/merge$/);
    if (mergeMatch && method === "POST") {
      const [_, documentId, proposalId] = mergeMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const pendingApprovals = Object.values(workspace.approvals).filter((status) => status === "Pending").length;
      const openThreads = workspace.threads.filter((thread) => thread.status !== "RESOLVED").length;
      if (pendingApprovals > 0 || openThreads > 0) {
        await this.fail(route, 409, "Merge gate blocked", "MERGE_GATE_BLOCKED", {
          pendingApprovals,
          openThreads
        });
        return;
      }

      workspace.document.status = "Approved";
      workspace.document.proposalId = null;
      workspace.document.branch = "main";
      workspace.document.version = "v1.0";
      this.baselineByDocumentId[documentId] = clone(workspace.content);
      this.baselineDocByDocumentId[documentId] = clone(workspace.doc);
      this.touchWorkspace(documentId, "Merge proposal branch into main");
      await this.ok(route, workspace);
      return;
    }

    const versionsMatch = pathname.match(/^\/api\/documents\/([^/]+)\/proposals\/([^/]+)\/versions$/);
    if (versionsMatch && method === "POST") {
      const [_, documentId, proposalId] = versionsMatch;
      const workspace = this.validateProposalWorkspace(route, documentId, proposalId);
      if (!workspace) {
        return;
      }
      const body = this.readBody<{ name?: string }>(request);
      const name = body?.name?.trim();
      if (!name) {
        await this.fail(route, 422, "name is required", "VALIDATION_ERROR");
        return;
      }
      this.touchWorkspace(documentId, `Save named version: ${name}`);
      const namedVersion: NamedVersion = {
        name,
        hash: workspace.history[0]?.hash ?? this.nextHash(),
        createdBy: this.userName ?? "Reviewer",
        createdAt: nowIso()
      };
      this.namedVersionsByDocumentId[documentId] = [
        namedVersion,
        ...(this.namedVersionsByDocumentId[documentId] ?? [])
      ];
      await this.ok(route, workspace);
      return;
    }

    await this.fail(route, 404, `Unhandled mocked API route: ${method} ${pathname}`, "NOT_FOUND");
  }

  private validateProposalWorkspace(route: Route, documentId: string, proposalId: string): WorkspacePayload | null {
    const workspace = this.workspaces[documentId];
    if (!workspace) {
      void this.fail(route, 404, "Workspace not found", "NOT_FOUND");
      return null;
    }
    if (!workspace.document.proposalId || workspace.document.proposalId !== proposalId) {
      void this.fail(route, 404, "Proposal not found", "NOT_FOUND");
      return null;
    }
    return workspace;
  }

  private isAuthorized(request: Request): boolean {
    const authHeader = request.headers()["authorization"];
    return authHeader === `Bearer ${this.authToken}`;
  }

  private syncApprovalsFromWorkspace(): void {
    const primary = this.workspaces["rfc-auth"];
    if (!primary) {
      return;
    }
    this.approvals.mergeGate = clone(primary.approvals);
    const pendingApprovals = Object.values(primary.approvals).filter((status) => status === "Pending").length;
    this.approvals.queue = pendingApprovals
      ? [
          {
            id: primary.document.id,
            documentId: primary.document.id,
            proposalId: primary.document.proposalId ?? "",
            title: primary.document.title,
            requestedBy: primary.document.editedBy,
            status: pendingApprovals === 3 ? "Blocked" : "Ready"
          }
        ]
      : [];
  }

  private touchWorkspace(documentId: string, message: string): void {
    const workspace = this.workspaces[documentId];
    if (!workspace) {
      return;
    }
    const actor = this.userName ?? "Playwright";
    workspace.document.editedBy = actor;
    workspace.document.editedAt = "just now";
    workspace.history.unshift({
      hash: this.nextHash(),
      message,
      meta: `${actor} · just now`
    });
    this.syncDocumentSummary(documentId);
  }

  private syncDocumentSummary(documentId: string): void {
    const workspace = this.workspaces[documentId];
    const summary = this.documents.find((item) => item.id === documentId);
    if (!workspace || !summary) {
      return;
    }
    summary.status = workspace.document.status;
    summary.updatedBy = workspace.document.editedBy;
    summary.openThreads = workspace.threads.filter((thread) => thread.status !== "RESOLVED").length;
    this.refreshWorkspaceCounts();
  }

  private refreshWorkspaceCounts(): void {
    const allDocuments = this.documents.length;
    const openReviews = this.documents.filter((item) => item.status === "In review").length;
    const merged = this.documents.filter((item) => item.status === "Approved").length;
    for (const workspace of Object.values(this.workspaces)) {
      workspace.counts = {
        allDocuments,
        openReviews,
        merged
      };
    }
  }

  private nextHash(): string {
    this.commitCounter += 1;
    return `pw-${this.commitCounter.toString().padStart(4, "0")}`;
  }

  private nextDecisionId(): number {
    this.decisionCounter += 1;
    return this.decisionCounter;
  }

  private readBody<T>(request: Request): T | undefined {
    const body = request.postData();
    if (!body) {
      return undefined;
    }
    return JSON.parse(body) as T;
  }

  private async ok(route: Route, payload: unknown): Promise<void> {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(clone(payload))
    });
  }

  private async fail(
    route: Route,
    status: number,
    error: string,
    code: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error, code, ...(details ? { details } : {}) })
    });
  }

  private async maybeFail(
    route: Route,
    target: "documents" | "approvals" | "workspace" | "history" | "decisionLog" | "compare"
  ): Promise<boolean> {
    if (this.failRemaining[target] <= 0) {
      return false;
    }
    this.failRemaining[target] -= 1;
    await this.fail(route, 500, `Mock ${target} failure`, "SERVER_ERROR");
    return true;
  }
}
