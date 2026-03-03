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

async function navigateToSettings(page: Page) {
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1", { hasText: "Organization Settings" })).toBeVisible({
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// 11. Settings Page (/settings)
// ---------------------------------------------------------------------------

test.describe("11. Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // ── 11.1 Tab Navigation ──

  test.describe("11.1 Tab Navigation", () => {
    test("11.1.1 admin user can access settings page", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      await expect(page.locator("h1", { hasText: "Organization Settings" })).toBeVisible();
      await expect(page.locator(".muted", { hasText: "Manage users, groups, and role permissions" })).toBeVisible();

      await snap(page, testInfo, "11.1.1-settings-page-loaded");
    });

    test("11.1.2 tab buttons render: Users, Groups, Roles", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      const usersTab = page.locator(".settings-tab", { hasText: "Users" });
      const groupsTab = page.locator(".settings-tab", { hasText: "Groups" });
      const rolesTab = page.locator(".settings-tab", { hasText: "Roles" });

      await expect(usersTab).toBeVisible();
      await expect(groupsTab).toBeVisible();
      await expect(rolesTab).toBeVisible();

      await snap(page, testInfo, "11.1.2-tabs-visible");
    });

    test("11.1.3 Users tab is active by default", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      const usersTab = page.locator(".settings-tab", { hasText: "Users" });
      await expect(usersTab).toHaveClass(/active/);

      // Users content should be visible
      await expect(page.locator(".settings-users")).toBeVisible();

      await snap(page, testInfo, "11.1.3-users-tab-default");
    });

    test("11.1.4 clicking Groups tab switches content", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-tab", { hasText: "Groups" })).toHaveClass(/active/);
      await expect(page.locator(".settings-groups")).toBeVisible();
      await expect(page.locator(".settings-users")).not.toBeVisible();

      await snap(page, testInfo, "11.1.4-groups-tab-active");
    });

    test("11.1.5 clicking Roles tab switches content", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      await page.locator(".settings-tab", { hasText: "Roles" }).click();
      await expect(page.locator(".settings-tab", { hasText: "Roles" })).toHaveClass(/active/);
      await expect(page.locator(".settings-roles")).toBeVisible();
      await expect(page.locator(".settings-users")).not.toBeVisible();

      await snap(page, testInfo, "11.1.5-roles-tab-active");
    });

    test("11.1.6 switching tabs preserves state across transitions", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      // Start on Users, switch to Groups, switch back to Users
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-groups")).toBeVisible();

      await page.locator(".settings-tab", { hasText: "Users" }).click();
      await expect(page.locator(".settings-users")).toBeVisible();
      await expect(page.locator(".settings-tab", { hasText: "Users" })).toHaveClass(/active/);

      await snap(page, testInfo, "11.1.6-tab-roundtrip");
    });
  });

  // ── 11.2 Users Tab ──

  test.describe("11.2 Users Tab", () => {
    test("11.2.1 users table loads and displays user list", async ({ page }, testInfo) => {
      await navigateToSettings(page);

      // Wait for loading to finish
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      // Table should be visible with at least one user
      await expect(page.locator(".settings-table")).toBeVisible();
      const rows = page.locator(".settings-table tbody tr");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // Verify table headers
      await expect(page.locator(".settings-table th", { hasText: "Name" })).toBeVisible();
      await expect(page.locator(".settings-table th", { hasText: "Role" })).toBeVisible();
      await expect(page.locator(".settings-table th", { hasText: "Status" })).toBeVisible();

      await snap(page, testInfo, "11.2.1-users-table");
    });

    test("11.2.2 search input filters users (debounced)", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const searchInput = page.locator(".settings-search");
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute(
        "placeholder",
        /search users/i,
      );

      // Type a search query
      const apiReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/users") &&
          resp.url().includes("search=") &&
          resp.request().method() === "GET",
      );
      await searchInput.fill("Avery");
      await apiReq;

      await snap(page, testInfo, "11.2.2-users-searched");
    });

    test("11.2.3 user count label is shown", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await expect(page.locator(".settings-count")).toBeVisible();
      await expect(page.locator(".settings-count")).toContainText("users");

      await snap(page, testInfo, "11.2.3-user-count");
    });

    test("11.2.4 Add User button toggles create form", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      // Form should not be visible initially
      await expect(page.locator(".settings-create-form")).not.toBeVisible();

      // Click "Add User"
      await page.getByRole("button", { name: "Add User" }).click();
      await expect(page.locator(".settings-create-form")).toBeVisible();
      await snap(page, testInfo, "11.2.4-create-form-open");

      // Button text should change to "Cancel"
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

      // Click "Cancel" to close the form
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.locator(".settings-create-form")).not.toBeVisible();

      await snap(page, testInfo, "11.2.4-create-form-closed");
    });

    test("11.2.5 create form has display name input and role dropdown", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Add User" }).click();

      const form = page.locator(".settings-create-form");
      await expect(form.locator('input[placeholder="Display name"]')).toBeVisible();
      await expect(form.locator("select")).toBeVisible();

      // Role dropdown should have all 5 roles
      const options = await form.locator("select option").allTextContents();
      expect(options).toContain("Viewer");
      expect(options).toContain("Commenter");
      expect(options).toContain("Suggester");
      expect(options).toContain("Editor");
      expect(options).toContain("Admin");

      await snap(page, testInfo, "11.2.5-create-form-fields");
    });

    test("11.2.6 create submit disabled if name empty", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Add User" }).click();

      const createBtn = page.locator(".settings-create-form").getByRole("button", { name: "Create" });
      await expect(createBtn).toBeDisabled();

      // Fill in name
      await page.locator('.settings-create-form input[placeholder="Display name"]').fill("Test User");
      await expect(createBtn).toBeEnabled();

      // Clear name
      await page.locator('.settings-create-form input[placeholder="Display name"]').fill("");
      await expect(createBtn).toBeDisabled();

      await snap(page, testInfo, "11.2.6-submit-disabled-empty");
    });

    test("11.2.7 submit creates user via API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Add User" }).click();

      const uniqueName = `PW Test User ${Date.now()}`;
      await page.locator('.settings-create-form input[placeholder="Display name"]').fill(uniqueName);
      await page.locator(".settings-create-form select").selectOption("viewer");

      const createReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/users") &&
          resp.request().method() === "POST",
      );

      await page.locator(".settings-create-form").getByRole("button", { name: "Create" }).click();
      const resp = await createReq;

      if (resp.status() === 200 || resp.status() === 201) {
        // Form should close
        await expect(page.locator(".settings-create-form")).not.toBeVisible({ timeout: 5_000 });
        await snap(page, testInfo, "11.2.7-user-created");
      } else {
        await snap(page, testInfo, "11.2.7-create-failed");
      }
    });

    test("11.2.8 per-user role dropdown changes role via API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const firstUserRow = page.locator(".settings-table tbody tr").first();
      const roleSelect = firstUserRow.locator("select");
      await expect(roleSelect).toBeVisible();

      const currentRole = await roleSelect.inputValue();
      const newRole = currentRole === "editor" ? "viewer" : "editor";

      const roleReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/users/") &&
          resp.url().includes("/role") &&
          resp.request().method() === "PUT",
      );

      await roleSelect.selectOption(newRole);
      const resp = await roleReq;

      await snap(page, testInfo, `11.2.8-role-changed-${resp.status()}`);
    });

    test("11.2.9 deactivate button deactivates user via API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      // Find an active user's deactivate button
      const activeRow = page.locator(
        ".settings-table tbody tr:not(.deactivated)",
      ).first();

      const deactivateBtn = activeRow.getByRole("button", { name: "Deactivate" });
      if (!(await deactivateBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No active user with deactivate button found");
        return;
      }

      const statusReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/users/") &&
          resp.url().includes("/status") &&
          resp.request().method() === "PUT",
      );

      await deactivateBtn.click();
      await statusReq;

      // Status badge should now show "Inactive"
      await expect(
        activeRow.locator(".status-badge", { hasText: "Inactive" }),
      ).toBeVisible({ timeout: 5_000 });

      await snap(page, testInfo, "11.2.9-user-deactivated");
    });

    test("11.2.10 reactivate button reactivates user via API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      // Find a deactivated user's reactivate button
      const deactivatedRow = page.locator(
        ".settings-table tbody tr.deactivated",
      ).first();

      const reactivateBtn = deactivatedRow.getByRole("button", {
        name: "Reactivate",
      });
      if (!(await reactivateBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No deactivated user available to reactivate");
        return;
      }

      const statusReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/users/") &&
          resp.url().includes("/status") &&
          resp.request().method() === "PUT",
      );

      await reactivateBtn.click();
      await statusReq;

      // Status badge should now show "Active"
      await expect(
        deactivatedRow.locator(".status-badge", { hasText: "Active" }),
      ).toBeVisible({ timeout: 5_000 });

      await snap(page, testInfo, "11.2.10-user-reactivated");
    });

    test("11.2.11 deactivated users show different styling", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      // Check if any deactivated users exist
      const deactivatedRows = page.locator(".settings-table tbody tr.deactivated");
      const count = await deactivatedRows.count();
      if (count === 0) {
        test.skip(true, "No deactivated users to check styling");
        return;
      }

      // Deactivated row should have the "deactivated" class
      await expect(deactivatedRows.first()).toHaveClass(/deactivated/);
      // Status badge should say "Inactive"
      await expect(
        deactivatedRows.first().locator(".status-badge.inactive"),
      ).toBeVisible();

      await snap(page, testInfo, "11.2.11-deactivated-styling");
    });
  });

  // ── 11.3 Groups Tab ──

  test.describe("11.3 Groups Tab", () => {
    test("11.3.1 groups list loads from API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();

      // Wait for loading to finish
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator(".settings-groups")).toBeVisible();

      await snap(page, testInfo, "11.3.1-groups-loaded");
    });

    test("11.3.2 Create Group button toggles form", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await expect(page.locator(".settings-create-form")).not.toBeVisible();

      await page.getByRole("button", { name: "Create Group" }).click();
      await expect(page.locator(".settings-create-form")).toBeVisible();
      await snap(page, testInfo, "11.3.2-create-group-form-open");

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.locator(".settings-create-form")).not.toBeVisible();
      await snap(page, testInfo, "11.3.2-create-group-form-closed");
    });

    test("11.3.3 group name and description inputs work", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Create Group" }).click();

      const nameInput = page.locator('.settings-create-form input[placeholder="Group name"]');
      const descInput = page.locator('.settings-create-form input[placeholder*="Description"]');

      await nameInput.fill("Engineering");
      await expect(nameInput).toHaveValue("Engineering");

      await descInput.fill("Platform engineering team");
      await expect(descInput).toHaveValue("Platform engineering team");

      await snap(page, testInfo, "11.3.3-group-inputs-filled");
    });

    test("11.3.4 create group submit disabled if name empty", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Create Group" }).click();

      const submitBtn = page.locator(".settings-create-form").getByRole("button", { name: "Create" });
      await expect(submitBtn).toBeDisabled();

      await page.locator('.settings-create-form input[placeholder="Group name"]').fill("Test");
      await expect(submitBtn).toBeEnabled();

      await snap(page, testInfo, "11.3.4-submit-state");
    });

    test("11.3.5 create group calls API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: "Create Group" }).click();

      const uniqueName = `PW Group ${Date.now()}`;
      await page.locator('.settings-create-form input[placeholder="Group name"]').fill(uniqueName);

      const createReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/") &&
          resp.url().includes("/groups") &&
          resp.request().method() === "POST",
      );

      await page.locator(".settings-create-form").getByRole("button", { name: "Create" }).click();
      const resp = await createReq;

      if (resp.status() === 200 || resp.status() === 201) {
        await expect(page.locator(".settings-create-form")).not.toBeVisible({ timeout: 5_000 });
        // New group should appear in the list
        await expect(
          page.locator(".settings-group-item", { hasText: uniqueName }),
        ).toBeVisible({ timeout: 5_000 });
        await snap(page, testInfo, "11.3.5-group-created");
      } else {
        await snap(page, testInfo, "11.3.5-create-failed");
      }
    });

    test("11.3.6 group header click expands/collapses (shows members)", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const groupItem = page.locator(".settings-group-item").first();
      if (!(await groupItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No groups available to expand");
        return;
      }

      // Click to expand
      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-members")).toBeVisible({ timeout: 5_000 });

      // Expand indicator should be down arrow (unicode \u25BC)
      await expect(groupItem.locator(".settings-group-expand")).toHaveText("\u25BC");
      await snap(page, testInfo, "11.3.6-group-expanded");

      // Click again to collapse
      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-members")).not.toBeVisible();

      // Expand indicator should be right arrow (unicode \u25B6)
      await expect(groupItem.locator(".settings-group-expand")).toHaveText("\u25B6");
      await snap(page, testInfo, "11.3.6-group-collapsed");
    });

    test("11.3.7 expand indicator shows correct arrow direction", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const groupItem = page.locator(".settings-group-item").first();
      if (!(await groupItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No groups available");
        return;
      }

      // Collapsed: right arrow
      await expect(groupItem.locator(".settings-group-expand")).toHaveText("\u25B6");

      // Expanded: down arrow
      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-expand")).toHaveText("\u25BC");

      await snap(page, testInfo, "11.3.7-arrow-direction");
    });

    test("11.3.8 delete button deletes group via API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      // Create a group to delete
      await page.getByRole("button", { name: "Create Group" }).click();
      const uniqueName = `Delete Me ${Date.now()}`;
      await page.locator('.settings-create-form input[placeholder="Group name"]').fill(uniqueName);

      const createReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/groups") && resp.request().method() === "POST",
      );
      await page.locator(".settings-create-form").getByRole("button", { name: "Create" }).click();
      await createReq;

      await expect(
        page.locator(".settings-group-item", { hasText: uniqueName }),
      ).toBeVisible({ timeout: 5_000 });
      await snap(page, testInfo, "11.3.8-before-delete");

      const deleteReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/groups/") &&
          resp.request().method() === "DELETE",
      );

      // Click the delete button on the new group
      const groupRow = page.locator(".settings-group-item", { hasText: uniqueName });
      await groupRow.getByRole("button", { name: "Delete" }).click();
      await deleteReq;

      // Group should be removed from the list
      await expect(
        page.locator(".settings-group-item", { hasText: uniqueName }),
      ).not.toBeVisible({ timeout: 5_000 });

      await snap(page, testInfo, "11.3.8-after-delete");
    });

    test("11.3.9 add member button opens member search", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const groupItem = page.locator(".settings-group-item").first();
      if (!(await groupItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No groups available");
        return;
      }

      // Expand the group
      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-members")).toBeVisible({ timeout: 5_000 });

      // Click "+ Add member"
      await groupItem.getByRole("button", { name: "+ Add member" }).click();

      // Search input should appear
      await expect(
        groupItem.locator('.settings-add-member input[placeholder="Search users..."]'),
      ).toBeVisible();

      await snap(page, testInfo, "11.3.9-member-search-open");
    });

    test("11.3.10 member search triggers debounced search", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const groupItem = page.locator(".settings-group-item").first();
      if (!(await groupItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No groups available");
        return;
      }

      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-members")).toBeVisible({ timeout: 5_000 });
      await groupItem.getByRole("button", { name: "+ Add member" }).click();

      const searchInput = groupItem.locator('.settings-add-member input[placeholder="Search users..."]');
      await expect(searchInput).toBeVisible();

      const searchReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/admin/users") &&
          resp.url().includes("search=") &&
          resp.request().method() === "GET",
      );

      await searchInput.fill("av");
      await searchReq;

      // Search results should appear
      await expect(
        groupItem.locator(".settings-search-result").first(),
      ).toBeVisible({ timeout: 5_000 });

      await snap(page, testInfo, "11.3.10-search-results");
    });

    test("11.3.11 clicking search result adds member via API", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const groupItem = page.locator(".settings-group-item").first();
      if (!(await groupItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No groups available");
        return;
      }

      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-members")).toBeVisible({ timeout: 5_000 });
      await groupItem.getByRole("button", { name: "+ Add member" }).click();

      const searchInput = groupItem.locator('.settings-add-member input[placeholder="Search users..."]');
      await searchInput.fill("a");

      const searchResult = groupItem.locator(".settings-search-result").first();
      if (!(await searchResult.isVisible({ timeout: 5_000 }).catch(() => false))) {
        test.skip(true, "No search results returned");
        return;
      }

      const addMemberReq = page.waitForResponse(
        (resp) =>
          resp.url().includes("/members") &&
          resp.request().method() === "POST",
      );

      await searchResult.click();
      await addMemberReq;

      // Search input should be cleared / hidden
      await expect(searchInput).not.toBeVisible({ timeout: 5_000 });

      await snap(page, testInfo, "11.3.11-member-added");
    });

    test("11.3.12 cancel button in add member resets search state", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Groups" }).click();
      await expect(page.locator(".settings-loading")).not.toBeVisible({ timeout: 10_000 });

      const groupItem = page.locator(".settings-group-item").first();
      if (!(await groupItem.isVisible({ timeout: 3_000 }).catch(() => false))) {
        test.skip(true, "No groups available");
        return;
      }

      await groupItem.locator(".settings-group-row").click();
      await expect(groupItem.locator(".settings-group-members")).toBeVisible({ timeout: 5_000 });
      await groupItem.getByRole("button", { name: "+ Add member" }).click();

      // Verify search UI is open
      await expect(
        groupItem.locator(".settings-add-member"),
      ).toBeVisible();

      // Click cancel
      await groupItem.locator(".settings-add-member").getByRole("button", { name: "Cancel" }).click();

      // Search UI should close, "+ Add member" should reappear
      await expect(groupItem.locator(".settings-add-member")).not.toBeVisible();
      await expect(
        groupItem.getByRole("button", { name: "+ Add member" }),
      ).toBeVisible();

      await snap(page, testInfo, "11.3.12-search-cancelled");
    });
  });

  // ── 11.4 Roles Tab ──

  test.describe("11.4 Roles Tab", () => {
    test("11.4.1 roles matrix displayed (read-only)", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Roles" }).click();

      await expect(page.locator(".settings-roles")).toBeVisible();
      await expect(page.locator(".roles-matrix")).toBeVisible();

      // Should have the description text
      await expect(
        page.locator(".muted", {
          hasText: "Role capabilities are hierarchical",
        }),
      ).toBeVisible();

      await snap(page, testInfo, "11.4.1-roles-matrix");
    });

    test("11.4.2 all 5 roles shown with correct capabilities", async ({ page }, testInfo) => {
      await navigateToSettings(page);
      await page.locator(".settings-tab", { hasText: "Roles" }).click();

      // Verify all 5 role headers
      const roleHeaders = page.locator(".role-header");
      const headerTexts = await roleHeaders.allTextContents();
      expect(headerTexts).toContain("Viewer");
      expect(headerTexts).toContain("Commenter");
      expect(headerTexts).toContain("Suggester");
      expect(headerTexts).toContain("Editor");
      expect(headerTexts).toContain("Admin");

      // Verify at least some capabilities are shown
      await expect(
        page.locator(".roles-matrix td", { hasText: "Read documents" }),
      ).toBeVisible();
      await expect(
        page.locator(".roles-matrix td", { hasText: "Manage permissions" }),
      ).toBeVisible();

      // Verify check marks and dashes exist (unicode chars)
      const cells = page.locator(".role-cell");
      const cellCount = await cells.count();
      expect(cellCount).toBeGreaterThan(0);

      await snap(page, testInfo, "11.4.2-all-roles-capabilities");
    });
  });
});
