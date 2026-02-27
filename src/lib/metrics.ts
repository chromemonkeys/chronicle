/**
 * Diff Review Metrics Instrumentation
 * 
 * Implements SPEC-004 §9 Metrics:
 * - Navigator usage rate (changes opened from rail)
 * - Per-change action completion rate (accept/reject/defer)
 * - Deferred-change carryover rate at merge
 * - Median time to complete review per 1,000 changed words
 * - Re-open rate after merge (proxy for review misses)
 * - Percent merges blocked by unresolved explicit blockers
 * 
 * Design principles:
 * - Non-blocking: All event emissions are fire-and-forget
 * - Lightweight: Minimal overhead on review actions
 * - Queryable: Events stored locally for dashboard/recipes
 */

// ============================================================================
// Event Types
// ============================================================================

export type ReviewEventType =
  | "review_session_started"
  | "review_session_ended"
  | "navigator_change_clicked"
  | "change_action_accepted"
  | "change_action_rejected"
  | "change_action_deferred"
  | "merge_attempted"
  | "merge_completed"
  | "merge_blocked";

export interface BaseReviewEvent {
  id: string;
  type: ReviewEventType;
  timestamp: number;
  documentId: string;
  proposalId: string | null;
  actor: string;
}

export interface ReviewSessionStartedEvent extends BaseReviewEvent {
  type: "review_session_started";
  changeCount: number;
  wordCountEstimate: number;
  fromRef: string;
  toRef: string;
}

export interface ReviewSessionEndedEvent extends BaseReviewEvent {
  type: "review_session_ended";
  durationMs: number;
  changesReviewed: number;
  changesAccepted: number;
  changesRejected: number;
  changesDeferred: number;
  merged: boolean;
}

export interface NavigatorChangeClickedEvent extends BaseReviewEvent {
  type: "navigator_change_clicked";
  changeId: string;
  changeType: string;
  navigationMethod: "click" | "keyboard" | "step";
}

export interface ChangeActionEvent extends BaseReviewEvent {
  type: "change_action_accepted" | "change_action_rejected" | "change_action_deferred";
  changeId: string;
  changeType: string;
  fromRef: string;
  toRef: string;
  previousState: string;
  rationale?: string;
}

export interface MergeAttemptedEvent extends BaseReviewEvent {
  type: "merge_attempted";
  changeCount: number;
  pendingChanges: number;
  deferredChanges: number;
  openThreads: number;
  pendingApprovals: number;
}

export interface MergeCompletedEvent extends BaseReviewEvent {
  type: "merge_completed";
  changeCount: number;
  acceptedChanges: number;
  rejectedChanges: number;
  deferredChanges: number;
  deferredCarryover: boolean;
}

export interface MergeBlockedEvent extends BaseReviewEvent {
  type: "merge_blocked";
  reason: string;
  blockerTypes: Array<"approval" | "thread" | "change">;
  blockerCount: number;
  explicitBlockers: number;
}

export type ReviewEvent =
  | ReviewSessionStartedEvent
  | ReviewSessionEndedEvent
  | NavigatorChangeClickedEvent
  | ChangeActionEvent
  | MergeAttemptedEvent
  | MergeCompletedEvent
  | MergeBlockedEvent;

// ============================================================================
// Event Storage
// ============================================================================

const MAX_EVENTS = 10000;
const EVENT_STORAGE_KEY = "chronicle_review_metrics_events_v1";

let eventBuffer: ReviewEvent[] = [];
let activeSession: {
  id: string;
  documentId: string;
  proposalId: string | null;
  actor: string;
  startedAt: number;
  changeCount: number;
  wordCountEstimate: number;
  fromRef: string;
  toRef: string;
  changesReviewed: Set<string>;
  changesAccepted: number;
  changesRejected: number;
  changesDeferred: number;
} | null = null;

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get current actor from auth storage
 */
function getCurrentActor(): string {
  if (typeof localStorage === "undefined") return "unknown";
  
  // Try to get from auth token or local user
  const localUser = localStorage.getItem("chronicle_local_user");
  if (localUser) return localUser;
  
  return "unknown";
}

/**
 * Load events from persistent storage
 */
function loadEvents(): ReviewEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const stored = localStorage.getItem(EVENT_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as ReviewEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist events to storage
 */
function persistEvents(): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Keep only last MAX_EVENTS
    const toStore = eventBuffer.slice(-MAX_EVENTS);
    localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Storage might be full or unavailable - silently fail
  }
}

/**
 * Add event to buffer and persist
 */
function addEvent(event: ReviewEvent): void {
  eventBuffer.push(event);
  
  // Trim buffer if it gets too large
  if (eventBuffer.length > MAX_EVENTS) {
    eventBuffer = eventBuffer.slice(-MAX_EVENTS);
  }
  
  // Persist asynchronously to avoid blocking
  if (typeof window !== "undefined") {
    window.setTimeout(persistEvents, 0);
  }
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Start a review session when user begins reviewing changes
 */
export function startReviewSession(params: {
  documentId: string;
  proposalId: string | null;
  changeCount: number;
  wordCountEstimate: number;
  fromRef: string;
  toRef: string;
}): void {
  // End any existing session first
  if (activeSession) {
    endReviewSession({ merged: false });
  }

  const sessionId = generateEventId();
  const actor = getCurrentActor();
  
  activeSession = {
    id: sessionId,
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor,
    startedAt: Date.now(),
    changeCount: params.changeCount,
    wordCountEstimate: params.wordCountEstimate,
    fromRef: params.fromRef,
    toRef: params.toRef,
    changesReviewed: new Set(),
    changesAccepted: 0,
    changesRejected: 0,
    changesDeferred: 0,
  };

  const event: ReviewSessionStartedEvent = {
    id: sessionId,
    type: "review_session_started",
    timestamp: activeSession.startedAt,
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor,
    changeCount: params.changeCount,
    wordCountEstimate: params.wordCountEstimate,
    fromRef: params.fromRef,
    toRef: params.toRef,
  };

  addEvent(event);
}

/**
 * End the current review session
 */
export function endReviewSession(params: { merged: boolean }): void {
  if (!activeSession) return;

  const endedAt = Date.now();
  const durationMs = endedAt - activeSession.startedAt;

  const event: ReviewSessionEndedEvent = {
    id: generateEventId(),
    type: "review_session_ended",
    timestamp: endedAt,
    documentId: activeSession.documentId,
    proposalId: activeSession.proposalId,
    actor: activeSession.actor,
    durationMs,
    changesReviewed: activeSession.changesReviewed.size,
    changesAccepted: activeSession.changesAccepted,
    changesRejected: activeSession.changesRejected,
    changesDeferred: activeSession.changesDeferred,
    merged: params.merged,
  };

  addEvent(event);
  activeSession = null;
}

// ============================================================================
// Navigation Events
// ============================================================================

/**
 * Track when user navigates to a change via the navigator
 */
export function trackNavigatorChangeClick(params: {
  documentId: string;
  proposalId: string | null;
  changeId: string;
  changeType: string;
  navigationMethod: "click" | "keyboard" | "step";
}): void {
  const event: NavigatorChangeClickedEvent = {
    id: generateEventId(),
    type: "navigator_change_clicked",
    timestamp: Date.now(),
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor: getCurrentActor(),
    changeId: params.changeId,
    changeType: params.changeType,
    navigationMethod: params.navigationMethod,
  };

  addEvent(event);

  // Track in active session
  if (activeSession) {
    activeSession.changesReviewed.add(params.changeId);
  }
}

// ============================================================================
// Action Events
// ============================================================================

/**
 * Track per-change review actions (accept/reject/defer)
 */
export function trackChangeAction(params: {
  documentId: string;
  proposalId: string | null;
  changeId: string;
  changeType: string;
  action: "accepted" | "rejected" | "deferred";
  fromRef: string;
  toRef: string;
  previousState: string;
  rationale?: string;
}): void {
  const eventType: ReviewEventType = `change_action_${params.action}` as const;
  
  const event: ChangeActionEvent = {
    id: generateEventId(),
    type: eventType,
    timestamp: Date.now(),
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor: getCurrentActor(),
    changeId: params.changeId,
    changeType: params.changeType,
    fromRef: params.fromRef,
    toRef: params.toRef,
    previousState: params.previousState,
    rationale: params.rationale,
  };

  addEvent(event);

  // Track in active session
  if (activeSession) {
    activeSession.changesReviewed.add(params.changeId);
    switch (params.action) {
      case "accepted":
        activeSession.changesAccepted++;
        break;
      case "rejected":
        activeSession.changesRejected++;
        break;
      case "deferred":
        activeSession.changesDeferred++;
        break;
    }
  }
}

// ============================================================================
// Merge Events
// ============================================================================

/**
 * Track merge attempt
 */
export function trackMergeAttempt(params: {
  documentId: string;
  proposalId: string | null;
  changeCount: number;
  pendingChanges: number;
  deferredChanges: number;
  openThreads: number;
  pendingApprovals: number;
}): void {
  const event: MergeAttemptedEvent = {
    id: generateEventId(),
    type: "merge_attempted",
    timestamp: Date.now(),
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor: getCurrentActor(),
    changeCount: params.changeCount,
    pendingChanges: params.pendingChanges,
    deferredChanges: params.deferredChanges,
    openThreads: params.openThreads,
    pendingApprovals: params.pendingApprovals,
  };

  addEvent(event);
}

/**
 * Track successful merge
 */
export function trackMergeCompleted(params: {
  documentId: string;
  proposalId: string | null;
  changeCount: number;
  acceptedChanges: number;
  rejectedChanges: number;
  deferredChanges: number;
  deferredCarryover: boolean;
}): void {
  const event: MergeCompletedEvent = {
    id: generateEventId(),
    type: "merge_completed",
    timestamp: Date.now(),
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor: getCurrentActor(),
    changeCount: params.changeCount,
    acceptedChanges: params.acceptedChanges,
    rejectedChanges: params.rejectedChanges,
    deferredChanges: params.deferredChanges,
    deferredCarryover: params.deferredCarryover,
  };

  addEvent(event);

  // End the review session as merged
  endReviewSession({ merged: true });
}

/**
 * Track blocked merge
 */
export function trackMergeBlocked(params: {
  documentId: string;
  proposalId: string | null;
  reason: string;
  blockerTypes: Array<"approval" | "thread" | "change">;
  blockerCount: number;
  explicitBlockers: number;
}): void {
  const event: MergeBlockedEvent = {
    id: generateEventId(),
    type: "merge_blocked",
    timestamp: Date.now(),
    documentId: params.documentId,
    proposalId: params.proposalId,
    actor: getCurrentActor(),
    reason: params.reason,
    blockerTypes: params.blockerTypes,
    blockerCount: params.blockerCount,
    explicitBlockers: params.explicitBlockers,
  };

  addEvent(event);
}

// ============================================================================
// Query Functions (KPI Recipes)
// ============================================================================

export interface ReviewMetrics {
  // Primary KPIs (SPEC-004 §9)
  medianReviewTimePer1000Words: number | null;
  reopenRateAfterMerge: number | null;
  mergeBlockedByExplicitBlockersRate: number | null;
  
  // Secondary KPIs
  navigatorUsageRate: number | null;
  perChangeActionCompletionRate: number | null;
  deferredChangeCarryoverRate: number | null;
  
  // Raw counts
  totalReviewSessions: number;
  totalChangesReviewed: number;
  totalMerges: number;
  totalBlockedMerges: number;
}

export interface SprintMetricsQuery {
  startDate: Date;
  endDate: Date;
  documentId?: string;
  proposalId?: string;
}

/**
 * Query metrics for a date range (sprint tracking)
 */
export function queryMetrics(query: SprintMetricsQuery): ReviewMetrics {
  const events = loadEvents();
  
  const startTime = query.startDate.getTime();
  const endTime = query.endDate.getTime();
  
  const filtered = events.filter(e => {
    if (e.timestamp < startTime || e.timestamp > endTime) return false;
    if (query.documentId && e.documentId !== query.documentId) return false;
    if (query.proposalId && e.proposalId !== query.proposalId) return false;
    return true;
  });

  // Calculate metrics
  const sessions = filtered.filter(e => e.type === "review_session_ended") as ReviewSessionEndedEvent[];
  const navigatorClicks = filtered.filter(e => e.type === "navigator_change_clicked") as NavigatorChangeClickedEvent[];
  const changeActions = filtered.filter(e => 
    e.type === "change_action_accepted" || 
    e.type === "change_action_rejected" || 
    e.type === "change_action_deferred"
  ) as ChangeActionEvent[];
  const merges = filtered.filter(e => e.type === "merge_completed") as MergeCompletedEvent[];
  const blockedMerges = filtered.filter(e => e.type === "merge_blocked") as MergeBlockedEvent[];

  // Median review time per 1000 words
  let medianReviewTimePer1000Words: number | null = null;
  if (sessions.length > 0) {
    const timesPer1000 = sessions
      .filter(s => s.changesReviewed > 0)
      .map(s => {
        // Approximate word count from session start event
        const startEvent = filtered.find(e => 
          e.type === "review_session_started" && 
          e.timestamp < s.timestamp &&
          e.documentId === s.documentId
        ) as ReviewSessionStartedEvent | undefined;
        
        const wordCount = startEvent?.wordCountEstimate ?? 1000;
        return (s.durationMs / wordCount) * 1000;
      })
      .sort((a, b) => a - b);
    
    if (timesPer1000.length > 0) {
      const mid = Math.floor(timesPer1000.length / 2);
      medianReviewTimePer1000Words = timesPer1000.length % 2 === 0
        ? (timesPer1000[mid - 1] + timesPer1000[mid]) / 2
        : timesPer1000[mid];
    }
  }

  // Navigator usage rate: % of changes viewed via navigator
  let navigatorUsageRate: number | null = null;
  if (sessions.length > 0) {
    const totalChanges = sessions.reduce((sum, s) => sum + s.changesReviewed, 0);
    if (totalChanges > 0) {
      navigatorUsageRate = navigatorClicks.length / totalChanges;
    }
  }

  // Per-change action completion rate
  let perChangeActionCompletionRate: number | null = null;
  const startedSessions = filtered.filter(e => e.type === "review_session_started") as ReviewSessionStartedEvent[];
  if (startedSessions.length > 0) {
    const totalChanges = startedSessions.reduce((sum, s) => sum + s.changeCount, 0);
    if (totalChanges > 0) {
      const uniqueChangesWithActions = new Set(changeActions.map(a => a.changeId)).size;
      perChangeActionCompletionRate = uniqueChangesWithActions / totalChanges;
    }
  }

  // Deferred change carryover rate
  let deferredChangeCarryoverRate: number | null = null;
  if (merges.length > 0) {
    const withDeferred = merges.filter(m => m.deferredCarryover).length;
    deferredChangeCarryoverRate = withDeferred / merges.length;
  }

  // Merge blocked by explicit blockers rate
  let mergeBlockedByExplicitBlockersRate: number | null = null;
  const totalMergeAttempts = merges.length + blockedMerges.length;
  if (totalMergeAttempts > 0) {
    const blockedByExplicit = blockedMerges.filter(b => b.explicitBlockers > 0).length;
    mergeBlockedByExplicitBlockersRate = blockedByExplicit / totalMergeAttempts;
  }

  // Re-open rate after merge (proxy)
  // Note: This requires tracking post-merge reopen events which may not be in this sprint
  const reopenRateAfterMerge: number | null = null;

  return {
    medianReviewTimePer1000Words,
    reopenRateAfterMerge,
    mergeBlockedByExplicitBlockersRate,
    navigatorUsageRate,
    perChangeActionCompletionRate,
    deferredChangeCarryoverRate,
    totalReviewSessions: sessions.length,
    totalChangesReviewed: changeActions.length,
    totalMerges: merges.length,
    totalBlockedMerges: blockedMerges.length,
  };
}

/**
 * Get raw events for custom analysis
 */
export function getEvents(query?: {
  startDate?: Date;
  endDate?: Date;
  documentId?: string;
  proposalId?: string;
  type?: ReviewEventType;
}): ReviewEvent[] {
  let events = loadEvents();
  
  if (query) {
    events = events.filter(e => {
      if (query.startDate && e.timestamp < query.startDate.getTime()) return false;
      if (query.endDate && e.timestamp > query.endDate.getTime()) return false;
      if (query.documentId && e.documentId !== query.documentId) return false;
      if (query.proposalId && e.proposalId !== query.proposalId) return false;
      if (query.type && e.type !== query.type) return false;
      return true;
    });
  }
  
  return events;
}

/**
 * Clear all stored events (use with caution)
 */
export function clearEvents(): void {
  eventBuffer = [];
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(EVENT_STORAGE_KEY);
  }
}

/**
 * Export metrics as JSON for dashboard/reporting
 */
export function exportMetrics(query?: SprintMetricsQuery): string {
  const events = query ? getEvents(query) : getEvents();
  return JSON.stringify(events, null, 2);
}

// ============================================================================
// Debug/Dev Helpers
// ============================================================================

/**
 * Get current active session (for debugging)
 */
export function getActiveSession(): typeof activeSession {
  return activeSession;
}

/**
 * Check if there's an active review session
 */
export function hasActiveSession(): boolean {
  return activeSession !== null;
}

// Initialize event buffer from storage on module load
if (typeof window !== "undefined") {
  eventBuffer = loadEvents();
}
