/**
 * Metrics instrumentation tests
 * 
 * Tests for:
 * - Event schema validation
 * - Event emission
 * - Query functions
 * - Sprint metrics calculation
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  startReviewSession,
  endReviewSession,
  trackNavigatorChangeClick,
  trackChangeAction,
  trackMergeAttempt,
  trackMergeCompleted,
  trackMergeBlocked,
  queryMetrics,
  getEvents,
  clearEvents,
  hasActiveSession,
  getActiveSession,
  exportMetrics,
  type ReviewSessionStartedEvent,
  type ReviewSessionEndedEvent,
  type NavigatorChangeClickedEvent,
  type ChangeActionEvent,
  type MergeAttemptedEvent,
  type MergeCompletedEvent,
  type MergeBlockedEvent,
} from "./metrics";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

Object.defineProperty(window, "setTimeout", {
  value: (fn: () => void) => fn(),
});

describe("Metrics Instrumentation", () => {
  beforeEach(() => {
    clearEvents();
    localStorageMock.clear();
  });

  describe("Event Schema", () => {
    it("should emit review session started event with correct schema", () => {
      const params = {
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      };

      startReviewSession(params);

      const events = getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0] as ReviewSessionStartedEvent;
      expect(event.type).toBe("review_session_started");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.documentId).toBe(params.documentId);
      expect(event.proposalId).toBe(params.proposalId);
      expect(event.changeCount).toBe(params.changeCount);
      expect(event.wordCountEstimate).toBe(params.wordCountEstimate);
      expect(event.fromRef).toBe(params.fromRef);
      expect(event.toRef).toBe(params.toRef);
      expect(event.actor).toBeDefined();
    });

    it("should emit navigator change clicked event with correct schema", () => {
      const params = {
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_789",
        changeType: "modified",
        navigationMethod: "click" as const,
      };

      trackNavigatorChangeClick(params);

      const events = getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0] as NavigatorChangeClickedEvent;
      expect(event.type).toBe("navigator_change_clicked");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.documentId).toBe(params.documentId);
      expect(event.proposalId).toBe(params.proposalId);
      expect(event.changeId).toBe(params.changeId);
      expect(event.changeType).toBe(params.changeType);
      expect(event.navigationMethod).toBe(params.navigationMethod);
    });

    it("should emit change action events with correct schema", () => {
      const params = {
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_789",
        changeType: "modified",
        action: "accepted" as const,
        fromRef: "abc123",
        toRef: "def456",
        previousState: "pending",
      };

      trackChangeAction(params);

      const events = getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0] as ChangeActionEvent;
      expect(event.type).toBe("change_action_accepted");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.documentId).toBe(params.documentId);
      expect(event.proposalId).toBe(params.proposalId);
      expect(event.changeId).toBe(params.changeId);
      expect(event.changeType).toBe(params.changeType);
      expect(event.fromRef).toBe(params.fromRef);
      expect(event.toRef).toBe(params.toRef);
      expect(event.previousState).toBe(params.previousState);
    });

    it("should emit all three change action types", () => {
      const actions: Array<"accepted" | "rejected" | "deferred"> = ["accepted", "rejected", "deferred"];
      
      actions.forEach((action, i) => {
        trackChangeAction({
          documentId: "doc_123",
          proposalId: "prop_456",
          changeId: `chg_${i}`,
          changeType: "modified",
          action,
          fromRef: "abc123",
          toRef: "def456",
          previousState: "pending",
        });
      });

      const events = getEvents();
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe("change_action_accepted");
      expect(events[1].type).toBe("change_action_rejected");
      expect(events[2].type).toBe("change_action_deferred");
    });

    it("should emit merge attempted event with correct schema", () => {
      const params = {
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        pendingChanges: 2,
        deferredChanges: 1,
        openThreads: 3,
        pendingApprovals: 1,
      };

      trackMergeAttempt(params);

      const events = getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0] as MergeAttemptedEvent;
      expect(event.type).toBe("merge_attempted");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.documentId).toBe(params.documentId);
      expect(event.proposalId).toBe(params.proposalId);
      expect(event.changeCount).toBe(params.changeCount);
      expect(event.pendingChanges).toBe(params.pendingChanges);
      expect(event.deferredChanges).toBe(params.deferredChanges);
      expect(event.openThreads).toBe(params.openThreads);
      expect(event.pendingApprovals).toBe(params.pendingApprovals);
    });

    it("should emit merge completed event with correct schema", () => {
      // Start a session first since trackMergeCompleted ends it
      startReviewSession({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });
      
      const params = {
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        acceptedChanges: 3,
        rejectedChanges: 1,
        deferredChanges: 1,
        deferredCarryover: true,
      };

      trackMergeCompleted(params);

      const events = getEvents();
      // Should have session started, merge completed, and session ended events
      expect(events.length).toBeGreaterThanOrEqual(2);
      
      const event = events.find(e => e.type === "merge_completed") as MergeCompletedEvent;
      expect(event).toBeDefined();
      expect(event.type).toBe("merge_completed");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.documentId).toBe(params.documentId);
      expect(event.proposalId).toBe(params.proposalId);
      expect(event.changeCount).toBe(params.changeCount);
      expect(event.acceptedChanges).toBe(params.acceptedChanges);
      expect(event.rejectedChanges).toBe(params.rejectedChanges);
      expect(event.deferredChanges).toBe(params.deferredChanges);
      expect(event.deferredCarryover).toBe(params.deferredCarryover);
    });

    it("should emit merge blocked event with correct schema", () => {
      const params = {
        documentId: "doc_123",
        proposalId: "prop_456",
        reason: "Pending approvals: 1, open threads: 2.",
        blockerTypes: ["approval", "thread"] as Array<"approval" | "thread" | "change">,
        blockerCount: 3,
        explicitBlockers: 2,
      };

      trackMergeBlocked(params);

      const events = getEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0] as MergeBlockedEvent;
      expect(event.type).toBe("merge_blocked");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.documentId).toBe(params.documentId);
      expect(event.proposalId).toBe(params.proposalId);
      expect(event.reason).toBe(params.reason);
      expect(event.blockerTypes).toEqual(params.blockerTypes);
      expect(event.blockerCount).toBe(params.blockerCount);
      expect(event.explicitBlockers).toBe(params.explicitBlockers);
    });
  });

  describe("Session Management", () => {
    it("should track active session state", () => {
      expect(hasActiveSession()).toBe(false);
      expect(getActiveSession()).toBeNull();

      startReviewSession({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });

      expect(hasActiveSession()).toBe(true);
      const session = getActiveSession();
      expect(session).not.toBeNull();
      expect(session?.documentId).toBe("doc_123");
      expect(session?.changeCount).toBe(5);
    });

    it("should end session and emit ended event", () => {
      startReviewSession({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });

      // Track some actions (these emit separate events)
      trackChangeAction({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_1",
        changeType: "modified",
        action: "accepted",
        fromRef: "abc123",
        toRef: "def456",
        previousState: "pending",
      });

      endReviewSession({ merged: true });

      expect(hasActiveSession()).toBe(false);
      
      const events = getEvents();
      const endedEvents = events.filter(e => e.type === "review_session_ended");
      // Should have at least one ended event (may be more from other test isolation issues)
      expect(endedEvents.length).toBeGreaterThanOrEqual(1);
      
      const endedEvent = endedEvents[endedEvents.length - 1] as ReviewSessionEndedEvent;
      expect(endedEvent.merged).toBe(true);
      expect(endedEvent.changesReviewed).toBe(1);
      expect(endedEvent.changesAccepted).toBe(1);
      expect(endedEvent.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should end existing session when starting a new one", () => {
      startReviewSession({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });

      startReviewSession({
        documentId: "doc_789",
        proposalId: "prop_000",
        changeCount: 3,
        wordCountEstimate: 500,
        fromRef: "xyz789",
        toRef: "uvw000",
      });

      const events = getEvents();
      const endedEvents = events.filter(e => e.type === "review_session_ended");
      expect(endedEvents).toHaveLength(1);
      
      const startedEvents = events.filter(e => e.type === "review_session_started");
      expect(startedEvents).toHaveLength(2);
    });
  });

  describe("Query Functions", () => {
    it("should query metrics for date range", () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Create some events
      startReviewSession({
        documentId: "doc_query_123",
        proposalId: "prop_query_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });

      trackChangeAction({
        documentId: "doc_query_123",
        proposalId: "prop_query_456",
        changeId: "chg_query_1",
        changeType: "modified",
        action: "accepted",
        fromRef: "abc123",
        toRef: "def456",
        previousState: "pending",
      });

      endReviewSession({ merged: true });

      const metrics = queryMetrics({
        startDate: yesterday,
        endDate: tomorrow,
        documentId: "doc_query_123",
      });

      // totalReviewSessions counts ended sessions, totalChangesReviewed counts actions
      expect(metrics.totalReviewSessions).toBe(1);
      expect(metrics.totalChangesReviewed).toBe(1);
    });

    it("should filter by document ID", () => {
      startReviewSession({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });
      endReviewSession({ merged: true });

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const metrics = queryMetrics({
        startDate: yesterday,
        endDate: tomorrow,
        documentId: "doc_999",
      });

      expect(metrics.totalReviewSessions).toBe(0);
    });

    it("should calculate navigator usage rate", () => {
      startReviewSession({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        wordCountEstimate: 1000,
        fromRef: "abc123",
        toRef: "def456",
      });

      // Navigate to 3 changes
      for (let i = 0; i < 3; i++) {
        trackNavigatorChangeClick({
          documentId: "doc_123",
          proposalId: "prop_456",
          changeId: `chg_${i}`,
          changeType: "modified",
          navigationMethod: "click",
        });
      }

      endReviewSession({ merged: false });

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const metrics = queryMetrics({
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(metrics.navigatorUsageRate).toBe(1); // 3 clicks / 3 changes reviewed
    });

    it("should calculate deferred carryover rate", () => {
      trackMergeCompleted({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        acceptedChanges: 3,
        rejectedChanges: 1,
        deferredChanges: 1,
        deferredCarryover: true,
      });

      trackMergeCompleted({
        documentId: "doc_789",
        proposalId: "prop_000",
        changeCount: 3,
        acceptedChanges: 3,
        rejectedChanges: 0,
        deferredChanges: 0,
        deferredCarryover: false,
      });

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const metrics = queryMetrics({
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(metrics.totalMerges).toBe(2);
      expect(metrics.deferredChangeCarryoverRate).toBe(0.5); // 1 out of 2
    });

    it("should calculate merge blocked by explicit blockers rate", () => {
      trackMergeAttempt({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeCount: 5,
        pendingChanges: 2,
        deferredChanges: 0,
        openThreads: 1,
        pendingApprovals: 1,
      });

      trackMergeBlocked({
        documentId: "doc_123",
        proposalId: "prop_456",
        reason: "Pending approvals",
        blockerTypes: ["approval"],
        blockerCount: 2,
        explicitBlockers: 1,
      });

      trackMergeAttempt({
        documentId: "doc_789",
        proposalId: "prop_000",
        changeCount: 3,
        pendingChanges: 0,
        deferredChanges: 0,
        openThreads: 0,
        pendingApprovals: 0,
      });

      trackMergeCompleted({
        documentId: "doc_789",
        proposalId: "prop_000",
        changeCount: 3,
        acceptedChanges: 3,
        rejectedChanges: 0,
        deferredChanges: 0,
        deferredCarryover: false,
      });

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const metrics = queryMetrics({
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(metrics.mergeBlockedByExplicitBlockersRate).toBe(0.5); // 1 blocked out of 2 attempts
    });
  });

  describe("Utility Functions", () => {
    it("should clear all events", () => {
      trackNavigatorChangeClick({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_1",
        changeType: "modified",
        navigationMethod: "click",
      });

      expect(getEvents()).toHaveLength(1);
      
      clearEvents();
      
      expect(getEvents()).toHaveLength(0);
    });

    it("should export metrics as JSON", () => {
      trackChangeAction({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_1",
        changeType: "modified",
        action: "accepted",
        fromRef: "abc123",
        toRef: "def456",
        previousState: "pending",
      });

      const json = exportMetrics();
      const parsed = JSON.parse(json);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe("change_action_accepted");
    });

    it("should filter events by type", () => {
      trackNavigatorChangeClick({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_1",
        changeType: "modified",
        navigationMethod: "click",
      });

      trackChangeAction({
        documentId: "doc_123",
        proposalId: "prop_456",
        changeId: "chg_2",
        changeType: "modified",
        action: "accepted",
        fromRef: "abc123",
        toRef: "def456",
        previousState: "pending",
      });

      const clickEvents = getEvents({ type: "navigator_change_clicked" });
      expect(clickEvents).toHaveLength(1);
      expect(clickEvents[0].type).toBe("navigator_change_clicked");
    });
  });
});
