import type {
  ApprovalsResponse,
  DecisionLogResponse,
  DocumentBlamePayload,
  DocumentComparePayload,
  DocumentHistoryPayload,
  DocumentSummary,
  MergeGateRole,
  SearchResponse,
  SyncEvent,
  WorkspaceContent,
  WorkspacePayload,
  WorkspacesResponse
} from "./types";
import type { DocumentContent } from "../editor/schema";
import { legacyContentToDoc } from "../editor/schema";

const TOKEN_STORAGE_KEY = "chronicle_auth_token";
const REFRESH_TOKEN_STORAGE_KEY = "chronicle_refresh_token";
const LOCAL_USER_STORAGE_KEY = "chronicle_local_user";

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getStoredAuthToken() {
  return getToken();
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
}

function clearRefreshToken() {
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

function getLocalUser() {
  return localStorage.getItem(LOCAL_USER_STORAGE_KEY);
}

function setLocalUser(name: string) {
  localStorage.setItem(LOCAL_USER_STORAGE_KEY, name);
}

function clearLocalUser() {
  localStorage.removeItem(LOCAL_USER_STORAGE_KEY);
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "APPROVAL_ORDER_BLOCKED"
  | "MERGE_GATE_BLOCKED"
  | "INVALID_BODY"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "REQUEST_FAILED"
  | "EXPORT_ERROR";

export class ApiError extends Error {
  status: number | null;
  code: ApiErrorCode;
  details: unknown;

  constructor(message: string, code: ApiErrorCode, status: number | null = null, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 401) {
    return "AUTH_REQUIRED";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 422) {
    return "VALIDATION_ERROR";
  }
  if (status >= 500) {
    return "SERVER_ERROR";
  }
  return "REQUEST_FAILED";
}

function isInternalRouteError(message: string): boolean {
  return /Unhandled mocked API route/i.test(message) || /\/api\//i.test(message);
}

function mapErrorMessage(code: ApiErrorCode, fallback: string, path: string): string {
  if (code === "AUTH_REQUIRED") {
    return "Your session expired. Please sign in again.";
  }
  if (code === "NETWORK_ERROR") {
    return "Cannot reach Chronicle API. Check that backend is running.";
  }
  if (code === "SERVER_ERROR") {
    return "Chronicle API is unavailable right now. Please retry.";
  }
  if (code === "APPROVAL_ORDER_BLOCKED") {
    return "Approval is blocked by required prior stages.";
  }
  if (code === "MERGE_GATE_BLOCKED") {
    return "Merge is blocked until approvals and thread resolution are complete.";
  }
  if (path === "/api/spaces" && isInternalRouteError(fallback)) {
    return "Could not create space. Please retry or cancel.";
  }
  if (isInternalRouteError(fallback)) {
    return "Request failed. Please retry.";
  }
  return fallback;
}

function parseApiErrorCode(value: unknown): ApiErrorCode | null {
  if (typeof value !== "string") {
    return null;
  }
  switch (value) {
    case "AUTH_REQUIRED":
    case "FORBIDDEN":
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
    case "APPROVAL_ORDER_BLOCKED":
    case "MERGE_GATE_BLOCKED":
    case "INVALID_BODY":
    case "NETWORK_ERROR":
    case "SERVER_ERROR":
    case "REQUEST_FAILED":
      return value;
    default:
      return null;
  }
}

function clearAuthStorage() {
  clearToken();
  clearRefreshToken();
  clearLocalUser();
}

async function tryRefreshSessionToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  let response: Response;
  try {
    response = await fetch("/api/session/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refreshToken })
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    clearAuthStorage();
    return false;
  }

  const payload = await response.json().catch(() => null) as {
    token?: string;
    refreshToken?: string;
  } | null;
  if (!payload?.token || !payload?.refreshToken) {
    clearAuthStorage();
    return false;
  }
  setToken(payload.token);
  setRefreshToken(payload.refreshToken);
  return true;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new ApiError("Cannot reach Chronicle API", "NETWORK_ERROR", null);
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      allowRefresh &&
      path !== "/api/session/login" &&
      path !== "/api/session/refresh"
    ) {
      const refreshed = await tryRefreshSessionToken();
      if (refreshed) {
        return apiRequest<T>(path, options, false);
      }
      clearAuthStorage();
    }

    const errorBody = await response.json().catch(() => ({ error: "Request failed" })) as {
      error?: string;
      code?: string;
      details?: unknown;
    };
    const code = parseApiErrorCode(errorBody.code) ?? codeFromStatus(response.status);
    const rawMessage = typeof errorBody.error === "string" ? errorBody.error : "Request failed";
    const message = mapErrorMessage(code, rawMessage, path);
    if (code === "AUTH_REQUIRED") {
      clearAuthStorage();
    }
    throw new ApiError(message, code, response.status, errorBody.details ?? null);
  }

  return response.json() as Promise<T>;
}

export async function loadSession() {
  try {
    const data = await apiRequest<{ authenticated: boolean; userName: string | null }>("/api/session");
    if (!data.authenticated) {
      clearAuthStorage();
    } else {
      clearLocalUser();
    }
    return data;
  } catch (error) {
    if (isApiError(error) && error.code !== "NETWORK_ERROR") {
      clearAuthStorage();
      return { authenticated: false, userName: null };
    }
    const localUser = getLocalUser();
    return { authenticated: localUser !== null, userName: localUser };
  }
}

// Email/Password Auth APIs
export async function signUp(email: string, password: string, displayName: string) {
  const data = await apiRequest<{
    userId: string;
    message: string;
    devVerificationToken?: string;
  }>("/api/auth/signup", {
    method: "POST",
    body: { email, password, displayName }
  });
  return data;
}

export async function signIn(email: string, password: string) {
  const data = await apiRequest<{
    accessToken: string;
    refreshToken: string;
    userId: string;
    userName: string;
    role: string;
    expiresAt: number;
  }>("/api/auth/signin", {
    method: "POST",
    body: { email, password }
  });
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  clearLocalUser();
  return data;
}

export async function verifyEmail(token: string) {
  const data = await apiRequest<{ message: string }>("/api/auth/verify-email", {
    method: "POST",
    body: { token }
  });
  return data;
}

export async function requestPasswordReset(email: string) {
  const data = await apiRequest<{
    message: string;
    devResetToken?: string;
  }>("/api/auth/reset-password/request", {
    method: "POST",
    body: { email }
  });
  return data;
}

export async function resetPassword(token: string, newPassword: string) {
  const data = await apiRequest<{ message: string }>("/api/auth/reset-password", {
    method: "POST",
    body: { token, newPassword }
  });
  return data;
}

export async function login(name: string) {
  try {
    const data = await apiRequest<{ token: string; refreshToken: string; userName: string }>("/api/session/login", {
      method: "POST",
      body: { name }
    });
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    clearLocalUser();
    return data;
  } catch (error) {
    if (isApiError(error) && error.code !== "NETWORK_ERROR") {
      throw error;
    }
    const userName = name.trim() || "User";
    const token = "local-dev-token";
    const refreshToken = "local-dev-refresh-token";
    setToken(token);
    setRefreshToken(refreshToken);
    setLocalUser(userName);
    return { token, refreshToken, userName };
  }
}

export async function logout() {
  const refreshToken = getRefreshToken();
  await apiRequest<{ ok: boolean }>("/api/session/logout", {
    method: "POST",
    body: refreshToken ? { refreshToken } : undefined
  }).catch(() => undefined);
  clearAuthStorage();
}

export async function fetchDocuments() {
  const data = await apiRequest<{ documents: DocumentSummary[] }>("/api/documents");
  return data.documents;
}

export async function searchGlobal(
  query: string,
  filters: {
    type?: "document" | "thread" | "decision";
    spaceId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (filters.type) params.set("type", filters.type);
  if (filters.spaceId) params.set("spaceId", filters.spaceId);
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  return apiRequest<SearchResponse>(`/api/search?${params.toString()}`);
}

export async function createDocument(title: string, subtitle = "", spaceId?: string) {
  return apiRequest<WorkspacePayload>("/api/documents", {
    method: "POST",
    body: { title, subtitle, ...(spaceId ? { spaceId } : {}) }
  });
}

export async function fetchApprovals() {
  return apiRequest<ApprovalsResponse>("/api/approvals");
}

export async function fetchWorkspaces() {
  return apiRequest<WorkspacesResponse>("/api/workspaces");
}

export async function fetchSpaceDocuments(spaceId: string) {
  const data = await apiRequest<{ documents: DocumentSummary[] }>(`/api/spaces/${spaceId}/documents`);
  return data.documents;
}

export async function createSpace(name: string, description = "") {
  return apiRequest<WorkspacesResponse>("/api/spaces", {
    method: "POST",
    body: { name, description }
  });
}

export async function moveDocument(documentId: string, spaceId: string) {
  return apiRequest<{ ok: boolean; documentId: string; spaceId: string }>(
    `/api/documents/${documentId}/move`,
    { method: "POST", body: { spaceId } }
  );
}

export async function fetchWorkspace(documentId: string) {
  const payload = await apiRequest<WorkspacePayload>(`/api/workspace/${documentId}`);
  // Ensure ProseMirror JSON doc is always present (convert from legacy if needed)
  if (!payload.doc) {
    payload.doc = legacyContentToDoc(payload.content, payload.nodeIds);
  }
  return payload;
}

export async function saveWorkspace(
  documentId: string,
  content: WorkspaceContent,
  doc?: DocumentContent
) {
  const payload = await apiRequest<WorkspacePayload>(`/api/workspace/${documentId}`, {
    method: "POST",
    body: { ...content, doc }
  });
  if (!payload.doc) {
    payload.doc = legacyContentToDoc(payload.content, payload.nodeIds);
  }
  return payload;
}

export async function fetchDocumentHistory(documentId: string, proposalId: string | null) {
  const suffix = proposalId ? `?proposalId=${encodeURIComponent(proposalId)}` : "";
  return apiRequest<DocumentHistoryPayload>(`/api/documents/${documentId}/history${suffix}`);
}

export async function fetchDocumentCompare(
  documentId: string,
  from: string,
  to: string,
  proposalId: string | null
) {
  const params = new URLSearchParams({
    from,
    to
  });
  if (proposalId) {
    params.set("proposalId", proposalId);
  }
  return apiRequest<DocumentComparePayload>(`/api/documents/${documentId}/compare?${params.toString()}`);
}

export async function fetchDecisionLog(
  documentId: string,
  filters: {
    proposalId?: string | null;
    outcome?: "ACCEPTED" | "REJECTED" | "DEFERRED" | "";
    q?: string;
    author?: string;
    limit?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (filters.proposalId) params.set("proposalId", filters.proposalId);
  if (filters.outcome) params.set("outcome", filters.outcome);
  if (filters.q) params.set("q", filters.q);
  if (filters.author) params.set("author", filters.author);
  if (filters.limit) params.set("limit", String(filters.limit));
  const suffix = params.toString();
  const path = suffix
    ? `/api/documents/${documentId}/decision-log?${suffix}`
    : `/api/documents/${documentId}/decision-log`;
  return apiRequest<DecisionLogResponse>(path);
}

export async function requestProposalReview(documentId: string, proposalId: string) {
  return apiRequest<WorkspacePayload>(`/api/documents/${documentId}/proposals/${proposalId}/submit`, {
    method: "POST"
  });
}

export async function createProposal(documentId: string, title?: string) {
  const body = title ? { title } : undefined;
  return apiRequest<WorkspacePayload>(`/api/documents/${documentId}/proposals`, {
    method: "POST",
    body
  });
}

export async function approveProposalRole(documentId: string, proposalId: string, role: MergeGateRole) {
  return apiRequest<WorkspacePayload>(`/api/documents/${documentId}/proposals/${proposalId}/approvals`, {
    method: "POST",
    body: { role }
  });
}

export async function createProposalThread(
  documentId: string,
  proposalId: string,
  data: {
    text: string;
    anchorLabel?: string;
    anchorNodeId?: string;
    anchorOffsets?: {
      start?: number;
      end?: number;
      quote?: string;
    };
    visibility?: "INTERNAL" | "EXTERNAL";
    type?: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
  }
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads`,
    {
      method: "POST",
      body: data
    }
  );
}

export async function replyProposalThread(
  documentId: string,
  proposalId: string,
  threadId: string,
  data: {
    body: string;
    type?: "GENERAL" | "LEGAL" | "COMMERCIAL" | "TECHNICAL" | "SECURITY" | "QUERY" | "EDITORIAL";
  }
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads/${threadId}/replies`,
    {
      method: "POST",
      body: data
    }
  );
}

export async function voteProposalThread(
  documentId: string,
  proposalId: string,
  threadId: string,
  direction: "up" | "down"
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads/${threadId}/vote`,
    {
      method: "POST",
      body: { direction }
    }
  );
}

export async function reactProposalThread(
  documentId: string,
  proposalId: string,
  threadId: string,
  emoji: string
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads/${threadId}/reactions`,
    {
      method: "POST",
      body: { emoji }
    }
  );
}

export async function reopenProposalThread(
  documentId: string,
  proposalId: string,
  threadId: string
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads/${threadId}/reopen`,
    {
      method: "POST"
    }
  );
}

export async function setProposalThreadVisibility(
  documentId: string,
  proposalId: string,
  threadId: string,
  visibility: "INTERNAL" | "EXTERNAL"
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads/${threadId}/visibility`,
    {
      method: "POST",
      body: { visibility }
    }
  );
}

export async function resolveProposalThread(
  documentId: string,
  proposalId: string,
  threadId: string,
  data: {
    outcome: "ACCEPTED" | "REJECTED" | "DEFERRED";
    rationale?: string;
  }
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/threads/${threadId}/resolve`,
    {
      method: "POST",
      body: data
    }
  );
}

type MergeProposalPayload = {
  policy?: {
    allowMergeWithDeferredChanges: boolean;
    ignoreFormatOnlyChangesForGate: boolean;
  };
  changeStates?: DocumentComparePayload["changes"];
};

export async function mergeProposal(documentId: string, proposalId: string, payload?: MergeProposalPayload) {
  return apiRequest<WorkspacePayload>(`/api/documents/${documentId}/proposals/${proposalId}/merge`, {
    method: "POST",
    body: payload
  });
}

export async function saveNamedVersion(
  documentId: string,
  proposalId: string,
  name: string
) {
  return apiRequest<WorkspacePayload>(`/api/documents/${documentId}/proposals/${proposalId}/versions`, {
    method: "POST",
    body: { name }
  });
}

export function connectWorkspaceRealtime(
  documentId: string,
  proposalId: string,
  onEvent: (event: SyncEvent) => void,
  onClose: () => void
) {
  const token = getToken();
  if (!token) {
    return null;
  }
  const baseUrl = import.meta.env.VITE_SYNC_URL ?? "ws://localhost:8788/ws";
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("documentId", documentId);
  url.searchParams.set("branchId", proposalId);

  const socket = new WebSocket(url.toString());
  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data as string) as SyncEvent;
      onEvent(payload);
    } catch {
      // no-op: malformed frame from dev sync gateway
    }
  };
  socket.onclose = onClose;
  socket.onerror = onClose;
  return socket;
}

export function sendWorkspaceRealtimeUpdate(socket: WebSocket | null, content: WorkspaceContent, doc?: DocumentContent) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(
    JSON.stringify({
      type: "doc_update",
      content,
      ...(doc ? { doc } : {})
    })
  );
}

export async function updateChangeReviewState(
  documentId: string,
  proposalId: string,
  changeId: string,
  data: {
    reviewState: "accepted" | "rejected" | "deferred";
    rejectedRationale?: string;
    fromRef: string;
    toRef: string;
  }
) {
  return apiRequest<WorkspacePayload>(
    `/api/documents/${documentId}/proposals/${proposalId}/changes/${changeId}/review`,
    {
      method: "POST",
      body: data
    }
  );
}

export async function fetchChangeReviewStates(
  documentId: string,
  proposalId: string,
  fromRef: string,
  toRef: string
) {
  const params = new URLSearchParams({ fromRef, toRef });
  return apiRequest<{ states: Array<{
    changeId: string;
    reviewState: "pending" | "accepted" | "rejected" | "deferred";
    reviewedBy?: string;
    reviewedAt?: string;
    rejectedRationale?: string;
    fromRef: string;
    toRef: string;
  }> }>(`/api/documents/${documentId}/proposals/${proposalId}/changes/review-states?${params.toString()}`);
}

export async function fetchAuditEvents(
  documentId: string,
  proposalId?: string | null,
  limit = 100
) {
  const params = new URLSearchParams();
  if (proposalId) params.set("proposalId", proposalId);
  params.set("limit", String(limit));
  return apiRequest<{ events: Array<{
    id: number;
    eventType: string;
    actorName: string;
    documentId: string;
    proposalId: string;
    changeId?: string;
    threadId?: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }> }>(`/api/documents/${documentId}/audit-events?${params.toString()}`);
}

export async function fetchDocumentBlame(documentId: string, proposalId: string | null) {
  const suffix = proposalId ? `?proposalId=${encodeURIComponent(proposalId)}` : "";
  return apiRequest<DocumentBlamePayload>(`/api/documents/${documentId}/blame${suffix}`);
}


export async function exportDocument(
  documentId: string,
  format: "pdf" | "docx",
  options: {
    version?: string;
    includeThreads?: boolean;
  } = {}
): Promise<Blob> {
  const token = getToken();
  const response = await fetch(`/api/documents/${documentId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      format,
      version: options.version ?? "latest",
      includeThreads: options.includeThreads ?? true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Export failed" }));
    throw new ApiError(
      typeof errorBody.error === "string" ? errorBody.error : "Export failed",
      parseApiErrorCode(errorBody.code) ?? "EXPORT_ERROR",
      response.status
    );
  }

  return response.blob();
}
