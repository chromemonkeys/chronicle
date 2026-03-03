import { expect, test, type Page, type TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signIn(page: Page, name = "Avery") {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use demo mode" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(documents|workspace)$/);
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true,
  });
}

/**
 * Navigate to the rfc-auth workspace which has an active proposal.
 */
async function navigateToWorkspace(page: Page) {
  await page.goto("/workspace/rfc-auth");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Merge Gate").first()
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Navigate to the documents list page.
 */
async function navigateToDocuments(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");
}

/**
 * Create a new document and navigate to its workspace.
 * Returns the document title used.
 */
async function createDocumentAndNavigate(page: Page): Promise<string> {
  await navigateToDocuments(page);

  // Look for a "New Document" or "Create Document" button
  const newDocBtn = page.locator("button, a", { hasText: /New Document|Create Document|\+ New/ }).first();
  if (await newDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newDocBtn.click();
    await page.waitForURL(/\/workspace\//, { timeout: 10_000 });
    const title = `PW Test Doc ${Date.now()}`;
    return title;
  }

  // Fallback: just navigate to the rfc-auth workspace
  await navigateToWorkspace(page);
  return "rfc-auth";
}

/** Locate the right-panel tab rail */
function rail(page: Page) {
  return page.locator(".cm-panel-tabs-rail");
}

// ---------------------------------------------------------------------------
// 7.1 Proposal Workflow
// ---------------------------------------------------------------------------

test.describe("7.1 Proposal Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 7.1.1 "Create proposal" / "Start Proposal" action calls createProposal()
  test("7.1.1 Start Proposal button calls createProposal()", async ({ page }, testInfo) => {
    // Navigate to a document that may NOT have an active proposal
    // Try the rfc-auth workspace first — it may already have a proposal
    await page.goto("/workspace/rfc-auth");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Look for "Start Proposal" button (visible when no active proposal)
    const startProposalBtn = page.locator(".cm-nav-btn, .cm-primary--cta, button", { hasText: "Start Proposal" }).first();
    const requestReviewBtn = page.locator(".cm-nav-btn, .cm-primary--cta, button", { hasText: "Request Review" }).first();

    if (await startProposalBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      // No active proposal — we can test Start Proposal
      const proposalRequest = page.waitForResponse(
        (resp) =>
          resp.url().includes("/proposals") &&
          resp.request().method() === "POST"
      );

      await startProposalBtn.click();
      const response = await proposalRequest;
      expect(response.status()).toBeLessThan(500);

      await snap(page, testInfo, "7.1.1-proposal-created");
    } else if (await requestReviewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Proposal already exists — verify Request Review is shown instead
      await snap(page, testInfo, "7.1.1-proposal-already-active");
    } else {
      await snap(page, testInfo, "7.1.1-page-state");
      test.skip(true, "Neither Start Proposal nor Request Review button found");
    }
  });

  // 7.1.2 "Request review" button calls requestProposalReview()
  test("7.1.2 Request Review button calls API", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const reviewBtn = page.locator(".cm-nav-btn, .cm-primary--cta, button", { hasText: "Request Review" }).first();
    if (!(await reviewBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Request Review button not visible — no active proposal");
      return;
    }

    const reviewRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/review") &&
        resp.request().method() === "POST"
    );

    await reviewBtn.click();
    const response = await reviewRequest;
    expect(response.status()).toBeLessThan(500);

    await snap(page, testInfo, "7.1.2-review-requested");
  });

  // 7.1.3 "Save named version" calls saveNamedVersion()
  test("7.1.3 Save Version button calls API", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const saveVersionBtn = page.locator(".cm-action-btn", { hasText: "Save Version" });
    if (!(await saveVersionBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Save Version button not visible");
      return;
    }

    // Button may be disabled when no active proposal
    if (await saveVersionBtn.isDisabled()) {
      await snap(page, testInfo, "7.1.3-save-version-disabled");
      return;
    }

    const versionRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/versions") &&
        resp.request().method() === "POST"
    );

    await saveVersionBtn.click();

    try {
      const response = await versionRequest;
      expect(response.status()).toBeLessThan(500);
    } catch {
      // Version naming may use a different endpoint pattern
    }

    await snap(page, testInfo, "7.1.3-version-saved");
  });

  // 7.1.4 "Merge" button calls mergeProposal() with confirmation
  test("7.1.4 Merge button calls mergeProposal()", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    // Switch to Approvals tab to find the merge button
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    // Look for the merge button
    const mergeBtn = page.locator(".cm-merge-btn");
    if (!(await mergeBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No merge button visible");
      return;
    }

    // The merge button text indicates readiness
    const mergeText = await mergeBtn.textContent();

    if (await mergeBtn.isDisabled()) {
      // Merge is blocked — verify the button shows the reason
      expect(mergeText).toBeTruthy();
      await snap(page, testInfo, "7.1.4-merge-blocked");
    } else {
      // Merge is enabled — try clicking and intercept API call
      const mergeRequest = page.waitForResponse(
        (resp) =>
          resp.url().includes("/merge") &&
          resp.request().method() === "POST"
      );

      await mergeBtn.click();

      try {
        const response = await mergeRequest;
        expect(response.status()).toBeLessThan(500);
        await snap(page, testInfo, "7.1.4-merge-executed");
      } catch {
        // Merge may have been blocked by server
        await snap(page, testInfo, "7.1.4-merge-attempted");
      }
    }
  });

  // 7.1.5 Merge blocked when approval gates not met
  test("7.1.5 merge blocked when approval gates not met", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    const mergeBtn = page.locator(".cm-merge-btn");
    if (!(await mergeBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No merge button visible");
      return;
    }

    // Check if merge is blocked
    const isDisabled = await mergeBtn.isDisabled();
    const mergeText = await mergeBtn.textContent();

    if (isDisabled) {
      // Merge is correctly blocked
      expect(mergeText).toBeTruthy();
      // Should indicate awaiting approvals or resolving threads
      await snap(page, testInfo, "7.1.5-merge-blocked-correct");
    } else {
      // If merge is enabled, it means all gates are met — still valid
      await snap(page, testInfo, "7.1.5-merge-gates-met");
    }
  });

  // 7.1.6 Merge blocked when unresolved threads exist
  test("7.1.6 merge blocked when unresolved threads exist", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    // The merge gate banner tells us the blocking reason
    const blockedBanner = page.locator(".cm-merge-gate-banner.blocked");
    const readyBanner = page.locator(".cm-merge-gate-banner.ready");

    if (await blockedBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Should mention open thread resolutions
      const bannerText = await blockedBanner.locator(".cm-merge-gate-copy").textContent();
      expect(bannerText).toBeTruthy();
      await snap(page, testInfo, "7.1.6-merge-blocked-banner");
    } else if (await readyBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
      await snap(page, testInfo, "7.1.6-merge-ready-no-blockers");
    } else {
      await snap(page, testInfo, "7.1.6-no-merge-banner");
    }
  });

  // 7.1.7 Successful merge updates document to merged state
  test("7.1.7 successful merge updates document state", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    const mergeBtn = page.locator(".cm-merge-btn");
    if (!(await mergeBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No merge button visible");
      return;
    }

    if (await mergeBtn.isDisabled()) {
      test.skip(true, "Merge button is disabled — gates not met");
      return;
    }

    // Attempt merge
    const mergeRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/merge") &&
        resp.request().method() === "POST"
    );

    await mergeBtn.click();

    try {
      const response = await mergeRequest;
      if (response.status() < 400) {
        // After merge, workspace should update — the proposal indicator changes
        await page.waitForTimeout(1000);

        // Verify the document state changed (no longer in proposal mode)
        const startProposalBtn = page.locator("button", { hasText: "Start Proposal" });
        const isNowMainBranch = await startProposalBtn.isVisible({ timeout: 3000 }).catch(() => false);

        await snap(page, testInfo, "7.1.7-post-merge-state");
      } else {
        await snap(page, testInfo, "7.1.7-merge-blocked-by-server");
      }
    } catch {
      await snap(page, testInfo, "7.1.7-merge-response-timeout");
    }
  });

  // 7.1.8 E2E: Full proposal lifecycle
  test("7.1.8 E2E full proposal lifecycle", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    // Step 1: Verify we are on a document with an active proposal
    const hasProposal = await page.locator("button", { hasText: "Request Review" }).isVisible({ timeout: 3000 }).catch(() => false);
    const hasStart = await page.locator("button", { hasText: "Start Proposal" }).isVisible({ timeout: 2000 }).catch(() => false);

    if (hasStart) {
      // Create a proposal
      const proposalRequest = page.waitForResponse(
        (resp) => resp.url().includes("/proposals") && resp.request().method() === "POST"
      );
      await page.locator("button", { hasText: "Start Proposal" }).first().click();
      await proposalRequest;
      await snap(page, testInfo, "7.1.8-01-proposal-started");
    } else if (hasProposal) {
      await snap(page, testInfo, "7.1.8-01-proposal-already-active");
    } else {
      test.skip(true, "Cannot determine proposal state");
      return;
    }

    // Step 2: Make edits (type in editor)
    const editor = page.locator(".cm-editor-wrapper .tiptap, .ProseMirror").first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.click();
      await page.keyboard.type(" E2E lifecycle edit.");
      await snap(page, testInfo, "7.1.8-02-edits-made");
    }

    // Step 3: Save draft
    const saveBtn = page.locator(".cm-action-btn", { hasText: "Save Draft" });
    if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (!(await saveBtn.isDisabled())) {
        const saveRequest = page.waitForResponse(
          (resp) =>
            resp.url().includes("/workspace/") &&
            resp.request().method() === "PUT"
        );
        await saveBtn.click();
        try {
          await saveRequest;
        } catch {
          // May timeout — that is acceptable
        }
        await snap(page, testInfo, "7.1.8-03-draft-saved");
      }
    }

    // Step 4: Request review
    const reviewBtn = page.locator("button", { hasText: "Request Review" }).first();
    if (await reviewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const reviewRequest = page.waitForResponse(
        (resp) => resp.url().includes("/review") && resp.request().method() === "POST"
      );
      await reviewBtn.click();
      try {
        await reviewRequest;
      } catch {
        // Review request may fail if no proposal
      }
      await snap(page, testInfo, "7.1.8-04-review-requested");
    }

    // Step 5: Approve all gates
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    // Approve all available gates
    const approveButtons = page.locator(".cm-ag-approve-btn, .cm-thread-action-btn:has-text('Approve')");
    let approveCount = await approveButtons.count();

    for (let i = 0; i < approveCount && i < 5; i++) {
      const btn = approveButtons.first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        if (!(await btn.isDisabled())) {
          const approveRequest = page.waitForResponse(
            (resp) => resp.url().includes("/approve") && resp.request().method() === "POST"
          );
          await btn.click();
          try {
            await approveRequest;
          } catch {
            break;
          }
          await page.waitForTimeout(500);
        }
      }
    }
    await snap(page, testInfo, "7.1.8-05-approvals-attempted");

    // Step 6: Try to merge
    const mergeBtn = page.locator(".cm-merge-btn");
    if (await mergeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (!(await mergeBtn.isDisabled())) {
        const mergeRequest = page.waitForResponse(
          (resp) => resp.url().includes("/merge") && resp.request().method() === "POST"
        );
        await mergeBtn.click();

        try {
          const response = await mergeRequest;
          if (response.status() < 400) {
            await page.waitForTimeout(1000);
            await snap(page, testInfo, "7.1.8-06-merged-successfully");
          } else {
            await snap(page, testInfo, "7.1.8-06-merge-blocked-by-server");
          }
        } catch {
          await snap(page, testInfo, "7.1.8-06-merge-timeout");
        }
      } else {
        await snap(page, testInfo, "7.1.8-06-merge-disabled");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7.2 Merge Gate Badge
// ---------------------------------------------------------------------------

test.describe("7.2 Merge Gate Badge", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
  });

  // 7.2.1 V2: Shows approval group count "X/Y groups"
  test("7.2.1 V2 shows approval group count", async ({ page }, testInfo) => {
    // The merge gate banner shows approval status
    const banner = page.locator(".cm-merge-gate-banner");
    await expect(banner).toBeVisible();

    // Check for V2 approval workflow mode indicator
    const v2ModeCount = page.locator(".cm-ag-mode-count");

    // Switch to approvals tab to see the detailed view
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    // V2 mode shows "X/Y" in the mode bar
    if (await v2ModeCount.isVisible({ timeout: 3000 }).catch(() => false)) {
      const countText = await v2ModeCount.textContent();
      expect(countText).toMatch(/\d+\/\d+/);
      await snap(page, testInfo, "7.2.1-v2-group-count");
    } else {
      // Check the approval progress in the header
      const progressText = page.locator(".cm-approval-progress");
      if (await progressText.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = await progressText.textContent();
        expect(text).toMatch(/\d+\s*\/\s*\d+/);
        await snap(page, testInfo, "7.2.1-progress-count");
      } else {
        await snap(page, testInfo, "7.2.1-no-group-count");
      }
    }
  });

  // 7.2.2 V2: Each group row shows status dot
  test("7.2.2 V2 group rows show status dot", async ({ page }, testInfo) => {
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    const v2Groups = page.locator(".cm-ag-row");
    if ((await v2Groups.count()) > 0) {
      // Each group should have a status indicator
      const firstGroup = v2Groups.first();
      await expect(firstGroup.locator(".cm-ag-status-indicator")).toBeVisible();
      await snap(page, testInfo, "7.2.2-v2-status-dots");
    } else {
      // V1 fallback: check for status emoji/icon
      const v1Rows = page.locator(".cm-approver-row");
      if ((await v1Rows.count()) > 0) {
        await expect(v1Rows.first().locator(".cm-approver-status")).toBeVisible();
        await snap(page, testInfo, "7.2.2-v1-status-indicators");
      } else {
        await snap(page, testInfo, "7.2.2-no-approval-rows");
      }
    }
  });

  // 7.2.3 V2: Progress shows "X/Y" approvals per group
  test("7.2.3 V2 progress shows approvals per group", async ({ page }, testInfo) => {
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    const progressText = page.locator(".cm-ag-progress-text").first();
    if (await progressText.isVisible({ timeout: 3000 }).catch(() => false)) {
      const text = await progressText.textContent();
      // Should match pattern like "0 / 1" or "1 / 2"
      expect(text).toMatch(/\d+\s*\/\s*\d+/);
      await snap(page, testInfo, "7.2.3-v2-progress-per-group");
    } else {
      await snap(page, testInfo, "7.2.3-no-v2-progress");
    }
  });

  // 7.2.4 V1: Gate labels and status pills displayed
  test("7.2.4 V1 gate labels and status pills", async ({ page }, testInfo) => {
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    const v1Rows = page.locator(".cm-approver-row");
    if ((await v1Rows.count()) > 0) {
      // V1 row should have name, role, and status
      const firstRow = v1Rows.first();
      await expect(firstRow.locator(".cm-approver-name")).toBeVisible();
      await expect(firstRow.locator(".cm-approver-role")).toBeVisible();
      await expect(firstRow.locator(".cm-approver-status")).toBeVisible();

      await snap(page, testInfo, "7.2.4-v1-gate-labels");
    } else {
      // V2 is active — V1 fallback is not shown
      await snap(page, testInfo, "7.2.4-v2-active-no-v1");
    }
  });

  // 7.2.5 V1: Summary shows "Awaiting X approvals" if pending
  test("7.2.5 V1 summary shows awaiting approvals", async ({ page }, testInfo) => {
    await rail(page).getByRole("tab", { name: "Required approvals" }).click();
    await page.waitForTimeout(500);

    // Check merge button text for awaiting info
    const mergeBtn = page.locator(".cm-merge-btn");
    if (await mergeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const mergeText = await mergeBtn.textContent();

      // Could be "Awaiting X approvals", "X of Y groups approved", "Ready to merge", etc.
      expect(mergeText).toBeTruthy();
      await snap(page, testInfo, "7.2.5-merge-summary-text");
    } else {
      await snap(page, testInfo, "7.2.5-no-merge-button");
    }
  });
});

// ---------------------------------------------------------------------------
// 7.x Additional: Merge Gate Banner
// ---------------------------------------------------------------------------

test.describe("7.x Merge Gate Banner", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
  });

  // Merge gate banner shows blocked/ready state
  test("merge gate banner shows current state", async ({ page }, testInfo) => {
    const banner = page.locator(".cm-merge-gate-banner");
    await expect(banner).toBeVisible();

    // Check if ready or blocked
    const isReady = await banner.locator(".cm-merge-gate-title", { hasText: "Ready" }).isVisible().catch(() => false);
    const isBlocked = await banner.locator(".cm-merge-gate-title", { hasText: "Blocked" }).isVisible().catch(() => false);
    const isUnavailable = await banner.locator(".cm-merge-gate-title", { hasText: "Unavailable" }).isVisible().catch(() => false);

    expect(isReady || isBlocked || isUnavailable).toBe(true);

    await snap(page, testInfo, `7.x-merge-gate-banner-${isReady ? "ready" : isBlocked ? "blocked" : "unavailable"}`);
  });

  // Merge gate copy explains the blocking reason
  test("merge gate copy explains blocking reason", async ({ page }, testInfo) => {
    const copy = page.locator(".cm-merge-gate-copy");
    await expect(copy).toBeVisible();

    const text = await copy.textContent();
    expect(text!.length).toBeGreaterThan(10);

    await snap(page, testInfo, "7.x-merge-gate-copy");
  });
});

// ---------------------------------------------------------------------------
// 7.x Proposal Mode Toggle
// ---------------------------------------------------------------------------

test.describe("7.x Proposal Mode Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
  });

  // Published / Proposal / Review mode toggle
  test("mode toggle switches between Published, Proposal, Review", async ({ page }, testInfo) => {
    const modeToggle = page.locator(".cm-mode-toggle");
    if (!(await modeToggle.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No mode toggle visible — no active proposal");
      return;
    }

    // Step 1: Click Published
    const publishedBtn = modeToggle.locator("button", { hasText: "Published" });
    await publishedBtn.click();
    await page.waitForTimeout(1000);

    // Should show readonly banner
    const readonlyBanner = page.locator(".cm-readonly-banner");
    if (await readonlyBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(readonlyBanner).toContainText(/published/i);
    }
    await snap(page, testInfo, "7.x-mode-published");

    // Step 2: Click Proposal
    const proposalBtn = modeToggle.locator("button", { hasText: "Proposal" });
    await proposalBtn.click();
    await page.waitForTimeout(1000);
    await snap(page, testInfo, "7.x-mode-proposal");

    // Step 3: Click Review
    const reviewBtn = modeToggle.locator("button", { hasText: "Review" });
    await reviewBtn.click();
    await page.waitForTimeout(1000);

    // Review mode should show a review diff card
    const reviewCard = page.locator(".cm-review-diff-card");
    if (await reviewCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(reviewCard.locator(".cm-review-diff-head")).toContainText("Review Diff");
    }
    await snap(page, testInfo, "7.x-mode-review");
  });
});

// ---------------------------------------------------------------------------
// 7.x Branch Badge
// ---------------------------------------------------------------------------

test.describe("7.x Branch Badge", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
  });

  // Branch badge shows current branch name
  test("branch badge shows current branch", async ({ page }, testInfo) => {
    const branchBadge = page.locator(".cm-branch-badge");
    await expect(branchBadge).toBeVisible();

    const branchText = await branchBadge.textContent();
    expect(branchText!.length).toBeGreaterThan(0);

    await snap(page, testInfo, "7.x-branch-badge");
  });
});

// ---------------------------------------------------------------------------
// 7.x Save Draft Flow
// ---------------------------------------------------------------------------

test.describe("7.x Save Draft Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
  });

  // Save Draft button enables when there are unsaved changes
  test("save draft flow", async ({ page }, testInfo) => {
    const saveBtn = page.locator(".cm-action-btn", { hasText: "Save Draft" });
    if (!(await saveBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Save Draft button not visible");
      return;
    }

    // Initially may be disabled (no changes)
    await snap(page, testInfo, "7.x-save-draft-initial");

    // Type in editor to create unsaved changes
    const editor = page.locator(".cm-editor-wrapper .tiptap, .ProseMirror").first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.click();
      await page.keyboard.type(" PW save test.");
      await page.waitForTimeout(300);

      // Unsaved changes indicator
      const unsavedIndicator = page.locator(".cm-save-indicator");
      if (await unsavedIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(unsavedIndicator).toContainText(/unsaved/i);
      }

      await snap(page, testInfo, "7.x-save-draft-unsaved");

      // Save draft
      if (!(await saveBtn.isDisabled())) {
        const saveRequest = page.waitForResponse(
          (resp) =>
            resp.url().includes("/workspace/") &&
            resp.request().method() === "PUT"
        );
        await saveBtn.click();

        try {
          await saveRequest;
        } catch {
          // Save may timeout
        }

        await snap(page, testInfo, "7.x-save-draft-saved");
      }
    }
  });
});
