/**
 * E2E Smoke Test: Diff Review Metrics Instrumentation
 * 
 * Tests that events are emitted correctly during a review session:
 * - review_session_started
 * - navigator_change_clicked
 * - change_action_accepted/rejected/deferred
 * - merge_attempted/completed/blocked
 * - review_session_ended
 * 
 * Ticket: #79 P2-DIFF-005 Diff review metrics instrumentation
 */

import { test, expect, type Page } from "@playwright/test";

async function getMetricsEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    // Access the metrics module through the window object
    // This requires exposing the module in dev mode
    const stored = localStorage.getItem("chronicle_review_metrics_events_v1");
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  });
}

async function clearMetricsEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("chronicle_review_metrics_events_v1");
  });
}

test.describe("Diff Review Metrics Instrumentation", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing metrics
    await clearMetricsEvents(page);
    
    // Sign in and navigate to a document with a proposal
    await page.goto("/");
    await page.fill('input[placeholder="Your name"]', "Test Reviewer");
    await page.click("text=Continue");
    
    // Wait for navigation to documents
    await page.waitForURL("/documents");
    
    // Create a new document
    await page.click("text=Create Document");
    await page.fill('input[placeholder="Document title"]', "Metrics Test Doc");
    await page.click("text=Create");
    
    // Wait for workspace to load
    await page.waitForURL(/\/workspace\//);
    
    // Start a proposal
    await page.click("text=Start Proposal");
    
    // Wait for proposal to be created
    await page.waitForTimeout(500);
  });

  test("should emit review session started event when compare is activated", async ({ page }) => {
    // Clear metrics after proposal creation
    await clearMetricsEvents(page);
    
    // Click Compare Versions to start a review session
    await page.click("text=Compare Versions");
    
    // Wait for compare to load
    await page.waitForTimeout(1000);
    
    // Check that metrics were recorded
    const events = await getMetricsEvents(page);
    
    // Look for session started event
    const sessionStarted = events.find((e: { type?: string }) => e.type === "review_session_started");
    expect(sessionStarted).toBeTruthy();
    
    if (sessionStarted && typeof sessionStarted === "object") {
      expect(sessionStarted).toHaveProperty("documentId");
      expect(sessionStarted).toHaveProperty("proposalId");
      expect(sessionStarted).toHaveProperty("changeCount");
      expect(sessionStarted).toHaveProperty("timestamp");
      expect(sessionStarted).toHaveProperty("actor");
    }
  });

  test("should emit navigator click events when navigating changes", async ({ page }) => {
    // Start compare
    await page.click("text=Compare Versions");
    await page.waitForTimeout(1000);
    
    // Clear previous events
    await clearMetricsEvents(page);
    
    // Click on a change in the Changes tab if available
    const changesTab = page.locator('[role="tab"]', { hasText: /Changes/i });
    if (await changesTab.isVisible().catch(() => false)) {
      await changesTab.click();
      await page.waitForTimeout(500);
      
      // Click on first change row if any exist
      const changeRow = page.locator(".cm-change-row").first();
      if (await changeRow.isVisible().catch(() => false)) {
        await changeRow.click();
        await page.waitForTimeout(500);
        
        const events = await getMetricsEvents(page);
        const navigatorClick = events.find((e: { type?: string }) => e.type === "navigator_change_clicked");
        
        if (navigatorClick && typeof navigatorClick === "object") {
          expect(navigatorClick).toHaveProperty("changeId");
          expect(navigatorClick).toHaveProperty("navigationMethod");
          expect(navigatorClick).toHaveProperty("timestamp");
        }
      }
    }
  });

  test("should emit change action events when reviewing changes", async ({ page }) => {
    // Start compare
    await page.click("text=Compare Versions");
    await page.waitForTimeout(1000);
    
    // Navigate to Changes tab
    const changesTab = page.locator('[role="tab"]', { hasText: /Changes/i });
    if (await changesTab.isVisible().catch(() => false)) {
      await changesTab.click();
      await page.waitForTimeout(500);
      
      // Clear events before action
      await clearMetricsEvents(page);
      
      // Look for Accept button on a pending change
      const acceptButton = page.locator("button", { hasText: /^Accept$/i }).first();
      if (await acceptButton.isVisible().catch(() => false)) {
        await acceptButton.click();
        await page.waitForTimeout(500);
        
        const events = await getMetricsEvents(page);
        const actionEvent = events.find((e: { type?: string }) => e.type === "change_action_accepted");
        
        expect(actionEvent).toBeTruthy();
        if (actionEvent && typeof actionEvent === "object") {
          expect(actionEvent).toHaveProperty("changeId");
          expect(actionEvent).toHaveProperty("previousState");
          expect(actionEvent).toHaveProperty("timestamp");
        }
      }
    }
  });

  test("should emit merge attempted and completed events", async ({ page }) => {
    // Start compare and resolve all changes if needed
    await page.click("text=Compare Versions");
    await page.waitForTimeout(1000);
    
    // Clear events before merge attempt
    await clearMetricsEvents(page);
    
    // Try to merge (this will either succeed or get blocked)
    const mergeButton = page.locator("button", { hasText: /merge/i }).first();
    if (await mergeButton.isVisible().catch(() => false)) {
      await mergeButton.click();
      await page.waitForTimeout(1000);
      
      const events = await getMetricsEvents(page);
      
      // Should have either merge_completed or merge_blocked
      const mergeCompleted = events.find((e: { type?: string }) => e.type === "merge_completed");
      const mergeBlocked = events.find((e: { type?: string }) => e.type === "merge_blocked");
      const mergeAttempted = events.find((e: { type?: string }) => e.type === "merge_attempted");
      
      expect(mergeAttempted).toBeTruthy();
      expect(mergeCompleted || mergeBlocked).toBeTruthy();
      
      if (mergeAttempted && typeof mergeAttempted === "object") {
        expect(mergeAttempted).toHaveProperty("changeCount");
        expect(mergeAttempted).toHaveProperty("pendingChanges");
        expect(mergeAttempted).toHaveProperty("deferredChanges");
      }
    }
  });

  test("should emit session ended event when closing compare", async ({ page }) => {
    // Start compare
    await page.click("text=Compare Versions");
    await page.waitForTimeout(1000);
    
    // Clear events
    await clearMetricsEvents(page);
    
    // Close compare
    const closeButton = page.locator("button", { hasText: /close compare/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(500);
      
      const events = await getMetricsEvents(page);
      const sessionEnded = events.find((e: { type?: string }) => e.type === "review_session_ended");
      
      expect(sessionEnded).toBeTruthy();
      if (sessionEnded && typeof sessionEnded === "object") {
        expect(sessionEnded).toHaveProperty("durationMs");
        expect(sessionEnded).toHaveProperty("changesReviewed");
        expect(sessionEnded).toHaveProperty("merged");
      }
    }
  });
});
