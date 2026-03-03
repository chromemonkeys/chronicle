import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startReviewSession,
  endReviewSession,
  hasActiveSession,
  getActiveSession,
  trackNavigatorChangeClick,
  trackChangeAction,
  trackMergeAttempt,
  trackMergeCompleted,
  trackMergeBlocked,
  queryMetrics,
  getEvents,
  clearEvents,
  exportMetrics,
} from "./metrics";

// addEvent() persists to localStorage via setTimeout — use fake timers
// so we can flush persistence before calling getEvents()/queryMetrics().
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  endReviewSession({ merged: false });
  vi.runAllTimers();
  clearEvents();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Flush the async localStorage persistence so getEvents can read them. */
function flush() {
  vi.runAllTimers();
}

// ============================================================================
// Session Management
// ============================================================================

describe("session management", () => {
  it("starts a review session", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: "prop-1",
      changeCount: 5,
      wordCountEstimate: 1000,
      fromRef: "abc",
      toRef: "def",
    });
    expect(hasActiveSession()).toBe(true);
  });

  it("has no active session initially", () => {
    expect(hasActiveSession()).toBe(false);
  });

  it("ends a review session", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 3,
      wordCountEstimate: 500,
      fromRef: "a",
      toRef: "b",
    });
    endReviewSession({ merged: false });
    expect(hasActiveSession()).toBe(false);
  });

  it("ending a session when none is active is a no-op", () => {
    endReviewSession({ merged: false });
    expect(hasActiveSession()).toBe(false);
  });

  it("double-start ends the previous session", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 3,
      wordCountEstimate: 500,
      fromRef: "a",
      toRef: "b",
    });
    startReviewSession({
      documentId: "doc-2",
      proposalId: null,
      changeCount: 2,
      wordCountEstimate: 300,
      fromRef: "c",
      toRef: "d",
    });
    expect(hasActiveSession()).toBe(true);
    const session = getActiveSession();
    expect(session?.documentId).toBe("doc-2");
  });

  it("emits review_session_started event on start", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: "prop-1",
      changeCount: 5,
      wordCountEstimate: 1000,
      fromRef: "abc",
      toRef: "def",
    });
    flush();
    const events = getEvents({ type: "review_session_started" });
    expect(events).toHaveLength(1);
    expect(events[0].documentId).toBe("doc-1");
  });

  it("emits review_session_ended event on end", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 3,
      wordCountEstimate: 500,
      fromRef: "a",
      toRef: "b",
    });
    endReviewSession({ merged: true });
    flush();
    const events = getEvents({ type: "review_session_ended" });
    expect(events).toHaveLength(1);
    expect((events[0] as any).merged).toBe(true);
  });

  it("records session duration", () => {
    // With fake timers, Date.now() is controlled by vitest
    const now = Date.now();

    // Manually set Date.now for start
    vi.setSystemTime(now);
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 1,
      wordCountEstimate: 100,
      fromRef: "a",
      toRef: "b",
    });

    // Advance time by 5 seconds
    vi.setSystemTime(now + 5000);
    endReviewSession({ merged: false });
    flush();
    const events = getEvents({ type: "review_session_ended" });
    expect((events[0] as any).durationMs).toBe(5000);
  });
});

// ============================================================================
// Navigator Events
// ============================================================================

describe("navigator events", () => {
  it("tracks navigator change click", () => {
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: "prop-1",
      changeId: "change-1",
      changeType: "paragraph",
      navigationMethod: "click",
    });
    flush();
    const events = getEvents({ type: "navigator_change_clicked" });
    expect(events).toHaveLength(1);
    expect((events[0] as any).changeId).toBe("change-1");
  });

  it("adds change to active session's reviewed set", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 3,
      wordCountEstimate: 500,
      fromRef: "a",
      toRef: "b",
    });
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "paragraph",
      navigationMethod: "keyboard",
    });
    const session = getActiveSession();
    expect(session?.changesReviewed.has("c1")).toBe(true);
  });
});

// ============================================================================
// Change Action Events
// ============================================================================

describe("change action events", () => {
  it("tracks accepted action", () => {
    trackChangeAction({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "paragraph",
      action: "accepted",
      fromRef: "a",
      toRef: "b",
      previousState: "pending",
    });
    flush();
    const events = getEvents({ type: "change_action_accepted" });
    expect(events).toHaveLength(1);
  });

  it("tracks rejected action", () => {
    trackChangeAction({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "paragraph",
      action: "rejected",
      fromRef: "a",
      toRef: "b",
      previousState: "pending",
      rationale: "Not needed",
    });
    flush();
    const events = getEvents({ type: "change_action_rejected" });
    expect(events).toHaveLength(1);
    expect((events[0] as any).rationale).toBe("Not needed");
  });

  it("tracks deferred action", () => {
    trackChangeAction({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "paragraph",
      action: "deferred",
      fromRef: "a",
      toRef: "b",
      previousState: "pending",
    });
    flush();
    const events = getEvents({ type: "change_action_deferred" });
    expect(events).toHaveLength(1);
  });

  it("increments session counters", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 5,
      wordCountEstimate: 1000,
      fromRef: "a",
      toRef: "b",
    });
    trackChangeAction({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "p",
      action: "accepted",
      fromRef: "a",
      toRef: "b",
      previousState: "pending",
    });
    trackChangeAction({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c2",
      changeType: "p",
      action: "rejected",
      fromRef: "a",
      toRef: "b",
      previousState: "pending",
    });
    trackChangeAction({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c3",
      changeType: "p",
      action: "deferred",
      fromRef: "a",
      toRef: "b",
      previousState: "pending",
    });
    const session = getActiveSession();
    expect(session?.changesAccepted).toBe(1);
    expect(session?.changesRejected).toBe(1);
    expect(session?.changesDeferred).toBe(1);
    expect(session?.changesReviewed.size).toBe(3);
  });
});

// ============================================================================
// Merge Events
// ============================================================================

describe("merge events", () => {
  it("tracks merge attempt", () => {
    trackMergeAttempt({
      documentId: "doc-1",
      proposalId: "prop-1",
      changeCount: 10,
      pendingChanges: 2,
      deferredChanges: 1,
      openThreads: 0,
      pendingApprovals: 0,
    });
    flush();
    const events = getEvents({ type: "merge_attempted" });
    expect(events).toHaveLength(1);
    expect((events[0] as any).changeCount).toBe(10);
  });

  it("tracks merge completed", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 5,
      wordCountEstimate: 1000,
      fromRef: "a",
      toRef: "b",
    });
    trackMergeCompleted({
      documentId: "doc-1",
      proposalId: "prop-1",
      changeCount: 5,
      acceptedChanges: 4,
      rejectedChanges: 0,
      deferredChanges: 1,
      deferredCarryover: true,
    });
    flush();
    const events = getEvents({ type: "merge_completed" });
    expect(events).toHaveLength(1);
    expect((events[0] as any).deferredCarryover).toBe(true);
    expect(hasActiveSession()).toBe(false);
  });

  it("tracks merge blocked", () => {
    trackMergeBlocked({
      documentId: "doc-1",
      proposalId: "prop-1",
      reason: "Open threads",
      blockerTypes: ["thread"],
      blockerCount: 3,
      explicitBlockers: 1,
    });
    flush();
    const events = getEvents({ type: "merge_blocked" });
    expect(events).toHaveLength(1);
    expect((events[0] as any).blockerCount).toBe(3);
  });
});

// ============================================================================
// Query & KPI Computation
// ============================================================================

describe("queryMetrics", () => {
  it("returns zero counts when no events exist", () => {
    const metrics = queryMetrics({
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-31"),
    });
    expect(metrics.totalReviewSessions).toBe(0);
    expect(metrics.totalMerges).toBe(0);
    expect(metrics.totalBlockedMerges).toBe(0);
    expect(metrics.totalChangesReviewed).toBe(0);
  });

  it("returns null rates when no data for computation", () => {
    const metrics = queryMetrics({
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-31"),
    });
    expect(metrics.medianReviewTimePer1000Words).toBeNull();
    expect(metrics.navigatorUsageRate).toBeNull();
    expect(metrics.perChangeActionCompletionRate).toBeNull();
    expect(metrics.deferredChangeCarryoverRate).toBeNull();
    expect(metrics.mergeBlockedByExplicitBlockersRate).toBeNull();
  });

  it("filters events by date range", () => {
    const now = Date.now();

    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 5,
      wordCountEstimate: 1000,
      fromRef: "a",
      toRef: "b",
    });
    endReviewSession({ merged: false });
    flush();

    const metrics = queryMetrics({
      startDate: new Date(now - 1000),
      endDate: new Date(now + 10000),
    });
    expect(metrics.totalReviewSessions).toBe(1);

    const metricsOutside = queryMetrics({
      startDate: new Date(now + 100000),
      endDate: new Date(now + 200000),
    });
    expect(metricsOutside.totalReviewSessions).toBe(0);
  });

  it("filters events by documentId", () => {
    startReviewSession({
      documentId: "doc-1",
      proposalId: null,
      changeCount: 3,
      wordCountEstimate: 500,
      fromRef: "a",
      toRef: "b",
    });
    endReviewSession({ merged: false });

    startReviewSession({
      documentId: "doc-2",
      proposalId: null,
      changeCount: 2,
      wordCountEstimate: 300,
      fromRef: "c",
      toRef: "d",
    });
    endReviewSession({ merged: false });
    flush();

    const now = Date.now();
    const metrics = queryMetrics({
      startDate: new Date(now - 10000),
      endDate: new Date(now + 10000),
      documentId: "doc-1",
    });
    expect(metrics.totalReviewSessions).toBe(1);
  });

  it("computes deferred carryover rate", () => {
    trackMergeCompleted({
      documentId: "d1",
      proposalId: null,
      changeCount: 5,
      acceptedChanges: 4,
      rejectedChanges: 0,
      deferredChanges: 1,
      deferredCarryover: true,
    });
    trackMergeCompleted({
      documentId: "d1",
      proposalId: null,
      changeCount: 5,
      acceptedChanges: 5,
      rejectedChanges: 0,
      deferredChanges: 0,
      deferredCarryover: false,
    });
    flush();

    const now = Date.now();
    const metrics = queryMetrics({
      startDate: new Date(now - 10000),
      endDate: new Date(now + 10000),
    });
    expect(metrics.deferredChangeCarryoverRate).toBe(0.5);
  });
});

// ============================================================================
// getEvents filtering
// ============================================================================

describe("getEvents", () => {
  it("returns all events without filter", () => {
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "p",
      navigationMethod: "click",
    });
    flush();
    const events = getEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by event type", () => {
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "p",
      navigationMethod: "click",
    });
    trackMergeBlocked({
      documentId: "doc-1",
      proposalId: null,
      reason: "blocked",
      blockerTypes: ["thread"],
      blockerCount: 1,
      explicitBlockers: 0,
    });
    flush();
    const navEvents = getEvents({ type: "navigator_change_clicked" });
    expect(navEvents).toHaveLength(1);
  });
});

// ============================================================================
// Persistence
// ============================================================================

describe("persistence", () => {
  it("clearEvents removes all events from buffer and localStorage", () => {
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "p",
      navigationMethod: "click",
    });
    clearEvents();
    const events = getEvents();
    expect(events).toHaveLength(0);
    expect(localStorage.getItem("chronicle_review_metrics_events_v1")).toBeNull();
  });

  it("exportMetrics returns valid JSON", () => {
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "p",
      navigationMethod: "click",
    });
    flush();
    const json = exportMetrics();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("exportMetrics with query returns filtered events", () => {
    trackNavigatorChangeClick({
      documentId: "doc-1",
      proposalId: null,
      changeId: "c1",
      changeType: "p",
      navigationMethod: "click",
    });
    flush();
    const now = Date.now();
    const json = exportMetrics({
      startDate: new Date(now - 10000),
      endDate: new Date(now + 10000),
    });
    const parsed = JSON.parse(json);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
  });
});
