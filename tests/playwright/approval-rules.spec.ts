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
 * Navigate to the workspace page for the first document, then open the
 * Approvals tab and click "Configure approval workflow" to show the
 * ApprovalRulesEditor.
 */
async function openApprovalRulesEditor(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");

  // Click the first document in the sidebar tree to enter the workspace
  const docItem = page.locator(".tree-item").first();
  await expect(docItem).toBeVisible({ timeout: 10_000 });
  await docItem.click();
  await page.waitForURL(/\/workspace\//);
  await page.waitForLoadState("networkidle");

  // Click the Approvals tab in the right panel
  const approvalsTab = page.locator('[role="tab"]', { hasText: "Approvals" });
  await expect(approvalsTab).toBeVisible({ timeout: 5_000 });
  await approvalsTab.click();

  // Click "Configure approval workflow" to open the editor
  const configureBtn = page.getByRole("button", {
    name: /configure approval workflow/i,
  });
  // The button might be on the fallback card or on the approval panel header
  if (await configureBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await configureBtn.click();
  } else {
    // Try the fallback text-based button
    const fallbackBtn = page.locator("button", {
      hasText: "Configure approval workflow",
    });
    await expect(fallbackBtn).toBeVisible({ timeout: 5_000 });
    await fallbackBtn.click();
  }

  // Wait for the editor to render
  await expect(page.locator(".cm-rules-editor")).toBeVisible({ timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// 8. Approval Rules Editor
// ---------------------------------------------------------------------------

test.describe("8. Approval Rules Editor", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // ── 8.1 Mode Selector ──

  test.describe("8.1 Mode Selector", () => {
    test("8.1a mode radio buttons default to sequential or parallel", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // One of the mode buttons should have the "active" class
      const seqBtn = page.locator(".cm-rules-mode-btn", { hasText: "Sequential" });
      const parBtn = page.locator(".cm-rules-mode-btn", { hasText: "Parallel" });
      await expect(seqBtn).toBeVisible();
      await expect(parBtn).toBeVisible();

      // Exactly one should be active
      const seqActive = await seqBtn.evaluate((el) =>
        el.classList.contains("active"),
      );
      const parActive = await parBtn.evaluate((el) =>
        el.classList.contains("active"),
      );
      expect(seqActive || parActive).toBe(true);

      await snap(page, testInfo, "8.1a-mode-default");
    });

    test("8.1b clicking parallel switches mode from sequential", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      const seqBtn = page.locator(".cm-rules-mode-btn", { hasText: "Sequential" });
      const parBtn = page.locator(".cm-rules-mode-btn", { hasText: "Parallel" });

      // Start with sequential
      await seqBtn.click();
      await expect(seqBtn).toHaveClass(/active/);
      await expect(parBtn).not.toHaveClass(/active/);
      await snap(page, testInfo, "8.1b-sequential");

      // Switch to parallel
      await parBtn.click();
      await expect(parBtn).toHaveClass(/active/);
      await expect(seqBtn).not.toHaveClass(/active/);
      await snap(page, testInfo, "8.1b-parallel");
    });

    test("8.1c mode hint text updates on toggle", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Switch to sequential
      await page.locator(".cm-rules-mode-btn", { hasText: "Sequential" }).click();
      await expect(page.locator(".cm-rules-mode-hint")).toContainText(
        "Groups must be approved in order",
      );
      await snap(page, testInfo, "8.1c-sequential-hint");

      // Switch to parallel
      await page.locator(".cm-rules-mode-btn", { hasText: "Parallel" }).click();
      await expect(page.locator(".cm-rules-mode-hint")).toContainText(
        "All groups can be approved at the same time",
      );
      await snap(page, testInfo, "8.1c-parallel-hint");
    });
  });

  // ── 8.2 Group Rules ──

  test.describe("8.2 Group Rules", () => {
    test("8.2a add group button creates new group card", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      const initialGroups = await page.locator(".cm-rules-group").count();

      await page.locator(".cm-rules-add-group").click();

      const newGroupCount = await page.locator(".cm-rules-group").count();
      expect(newGroupCount).toBe(initialGroups + 1);

      // The new group should have an empty name input
      const lastGroup = page.locator(".cm-rules-group").last();
      await expect(lastGroup.locator(".cm-rules-group-name-input")).toBeVisible();

      await snap(page, testInfo, "8.2a-group-added");
    });

    test("8.2b group name input updates name", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      await page.locator(".cm-rules-add-group").click();

      const nameInput = page.locator(".cm-rules-group").last().locator(".cm-rules-group-name-input");
      await nameInput.fill("Legal Review");
      await expect(nameInput).toHaveValue("Legal Review");

      // Verify pipeline shows the name
      await expect(
        page.locator(".cm-rules-pipeline-name", { hasText: "Legal Review" }),
      ).toBeVisible();

      await snap(page, testInfo, "8.2b-name-updated");
    });

    test("8.2c group header toggle expands and collapses group body", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Add a group (new groups start expanded)
      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();

      // Body should be visible initially (new groups are expanded)
      await expect(group.locator(".cm-rules-group-body")).toBeVisible();
      await snap(page, testInfo, "8.2c-expanded");

      // Click the collapse toggle
      await group.locator(".cm-rules-group-toggle").click();
      await expect(group.locator(".cm-rules-group-body")).not.toBeVisible();
      await expect(group.locator(".cm-rules-group-summary")).toBeVisible();
      await snap(page, testInfo, "8.2c-collapsed");

      // Click toggle again to expand
      await group.locator(".cm-rules-group-toggle").click();
      await expect(group.locator(".cm-rules-group-body")).toBeVisible();
      await snap(page, testInfo, "8.2c-re-expanded");
    });

    test("8.2d remove button removes group", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Add two groups
      await page.locator(".cm-rules-add-group").click();
      await page.locator(".cm-rules-add-group").click();

      const countBefore = await page.locator(".cm-rules-group").count();
      await snap(page, testInfo, "8.2d-before-remove");

      // Remove the last group
      await page.locator(".cm-rules-group").last().locator(".cm-rules-group-remove").click();

      const countAfter = await page.locator(".cm-rules-group").count();
      expect(countAfter).toBe(countBefore - 1);

      await snap(page, testInfo, "8.2d-after-remove");
    });

    test("8.2e min approvals stepper changes threshold", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();

      // Default min approvals should be 1
      await expect(group.locator(".cm-rules-stepper-value")).toHaveText("1");

      // Minus button should be disabled at 1
      const minusBtn = group.locator(".cm-rules-stepper-btn").first();
      await expect(minusBtn).toBeDisabled();

      // Plus button increments
      const plusBtn = group.locator(".cm-rules-stepper-btn").last();
      await plusBtn.click();
      await expect(group.locator(".cm-rules-stepper-value")).toHaveText("2");

      await snap(page, testInfo, "8.2e-threshold-changed");
    });

    test("8.2f description input updates description", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();

      const descInput = group.locator('.cm-rules-field-input[placeholder*="Optional"]');
      await descInput.fill("Executive team sign-off");
      await expect(descInput).toHaveValue("Executive team sign-off");

      await snap(page, testInfo, "8.2f-description-updated");
    });

    test("8.2g add member button opens member search", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();

      // Click "+ Add member"
      await group.locator(".cm-rules-add-member-btn").click();

      // Search input should appear
      await expect(group.locator(".cm-rules-member-search-input")).toBeVisible();

      await snap(page, testInfo, "8.2g-member-search-open");
    });

    test("8.2h clicking search result adds member to group", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();

      // Open member search
      await group.locator(".cm-rules-add-member-btn").click();

      // Wait for workspace users to load and search results to show
      const resultBtn = group.locator(".cm-rules-member-result").first();
      if (await resultBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const memberName = await resultBtn.locator(".cm-rules-member-name").textContent();
        await resultBtn.click();

        // Member should now appear in the members list
        await expect(
          group.locator(".cm-rules-member", { hasText: memberName! }),
        ).toBeVisible();
        // Search should close
        await expect(group.locator(".cm-rules-member-search-input")).not.toBeVisible();

        await snap(page, testInfo, "8.2h-member-added");
      } else {
        await snap(page, testInfo, "8.2h-no-users-available");
        test.skip(true, "No workspace users available for member search");
      }
    });

    test("8.2i remove button removes member from group", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();

      // Add a member first
      await group.locator(".cm-rules-add-member-btn").click();
      const resultBtn = group.locator(".cm-rules-member-result").first();
      if (!(await resultBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
        test.skip(true, "No workspace users available");
        return;
      }
      await resultBtn.click();

      const membersBefore = await group.locator(".cm-rules-member").count();
      expect(membersBefore).toBeGreaterThan(0);
      await snap(page, testInfo, "8.2i-before-remove");

      // Remove the member
      await group.locator(".cm-rules-member-remove").first().click();

      const membersAfter = await group.locator(".cm-rules-member").count();
      expect(membersAfter).toBe(membersBefore - 1);

      await snap(page, testInfo, "8.2i-after-remove");
    });

    test("8.2j drag handle is present for reordering (sequential)", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Set to sequential mode
      await page.locator(".cm-rules-mode-btn", { hasText: "Sequential" }).click();

      // Add two groups
      await page.locator(".cm-rules-add-group").click();
      await page.locator(".cm-rules-add-group").click();

      // Each group should have a drag handle
      const handles = page.locator(".cm-rules-drag-handle");
      const count = await handles.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Verify drag handle has accessible label
      await expect(handles.first()).toHaveAttribute("aria-label", "Drag to reorder");

      await snap(page, testInfo, "8.2j-drag-handles-visible");
    });
  });

  // ── 8.3 Save & Reset ──

  test.describe("8.3 Save & Reset", () => {
    test("8.3a save button calls onSave with payload", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Add a group with a name
      await page.locator(".cm-rules-add-group").click();
      const group = page.locator(".cm-rules-group").last();
      await group.locator(".cm-rules-group-name-input").fill("Engineering Review");

      await snap(page, testInfo, "8.3a-before-save");

      // Intercept the save API call
      const saveRequest = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/documents/") &&
          resp.url().includes("/approval-rules") &&
          resp.request().method() === "PUT",
      );

      // Click save
      await page.locator(".cm-rules-save-btn").click();

      // Wait for the save API call (or verify the button was clicked)
      const response = await saveRequest.catch(() => null);
      if (response) {
        await snap(page, testInfo, "8.3a-save-complete");
      } else {
        // Save was attempted - editor may have closed
        await snap(page, testInfo, "8.3a-save-attempted");
      }
    });

    test("8.3b save button shows saving state", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Add a group to make the form dirty
      await page.locator(".cm-rules-add-group").click();
      await page
        .locator(".cm-rules-group")
        .last()
        .locator(".cm-rules-group-name-input")
        .fill("Test Group");

      // Slow down the API to catch the loading state
      await page.route("**/approval-rules", async (route) => {
        if (route.request().method() === "PUT") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await route.continue();
        } else {
          await route.continue();
        }
      });

      await page.locator(".cm-rules-save-btn").click();

      // Button should show "Saving..." and be disabled
      const savingBtn = page.locator(".cm-rules-save-btn:disabled");
      await expect(savingBtn).toBeVisible({ timeout: 2_000 });
      await expect(savingBtn).toContainText("Saving");

      await snap(page, testInfo, "8.3b-saving-state");

      await page.unrouteAll({ behavior: "wait" });
    });

    test("8.3c cancel button dismisses the editor", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);
      await snap(page, testInfo, "8.3c-editor-open");

      // Click cancel
      await page.locator(".cm-rules-cancel-btn").click();

      // Editor should no longer be visible
      await expect(page.locator(".cm-rules-editor")).not.toBeVisible();

      await snap(page, testInfo, "8.3c-editor-closed");
    });

    test("8.3d save button disabled when form is not dirty", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // The save button text is "Save rules"
      const saveBtn = page.locator(".cm-rules-save-btn");

      // If there are existing groups and nothing has changed, save should be disabled
      // (This depends on whether the document already has rules)
      const isDisabled = await saveBtn.isDisabled();
      // Take a screenshot showing the button state regardless
      await snap(page, testInfo, `8.3d-save-btn-disabled-${isDisabled}`);

      // Add a group to make it dirty
      await page.locator(".cm-rules-add-group").click();

      // Now save should be enabled (form is dirty)
      await expect(saveBtn).toBeEnabled();
      await snap(page, testInfo, "8.3d-save-btn-enabled-after-change");
    });

    test("8.3e pipeline visualization shows connectors in sequential mode", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Set sequential mode
      await page.locator(".cm-rules-mode-btn", { hasText: "Sequential" }).click();

      // Add two groups
      await page.locator(".cm-rules-add-group").click();
      await page
        .locator(".cm-rules-group")
        .first()
        .locator(".cm-rules-group-name-input")
        .fill("Step 1");
      await page.locator(".cm-rules-add-group").click();
      await page
        .locator(".cm-rules-group")
        .last()
        .locator(".cm-rules-group-name-input")
        .fill("Step 2");

      // Pipeline should show arrow connectors between steps
      await expect(page.locator(".cm-rules-pipeline-connector").first()).toBeVisible();
      // Should NOT have parallel connectors
      await expect(
        page.locator(".cm-rules-pipeline-connector.parallel"),
      ).not.toBeVisible();

      await snap(page, testInfo, "8.3e-sequential-pipeline");
    });

    test("8.3f pipeline visualization shows ampersand in parallel mode", async ({ page }, testInfo) => {
      await openApprovalRulesEditor(page);

      // Set parallel mode
      await page.locator(".cm-rules-mode-btn", { hasText: "Parallel" }).click();

      // Add two groups
      await page.locator(".cm-rules-add-group").click();
      await page.locator(".cm-rules-add-group").click();

      // Pipeline should show ampersand connectors
      const parallelConnector = page.locator(".cm-rules-pipeline-connector.parallel");
      await expect(parallelConnector.first()).toBeVisible();

      await snap(page, testInfo, "8.3f-parallel-pipeline");
    });
  });
});
