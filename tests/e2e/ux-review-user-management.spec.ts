/**
 * UX Review: User Management Workflows
 * 
 * This test bypasses authentication by injecting auth tokens directly
 * so we can focus on reviewing the UI/UX without login friction.
 */

import { test, expect, type Page } from "@playwright/test";

// Auth bypass - inject tokens directly
async function bypassAuth(page: Page, userName: string = "UX Reviewer", isAdmin: boolean = true) {
  await page.goto("/");
  
  // Clear any existing auth
  await page.evaluate(() => {
    localStorage.clear();
  });
  
  // Inject mock auth tokens
  await page.evaluate((name) => {
    // Mock session data
    const mockSession = {
      authenticated: true,
      userName: name,
      userId: "ux-review-user-123",
      email: "ux@chronicle.dev",
      isExternal: false,
      role: "admin",
      workspaceId: "ws-123",
      workspaceName: "Chronicle UX Review"
    };
    
    localStorage.setItem("chronicle:token", "mock-jwt-token-for-ux-review");
    localStorage.setItem("chronicle:refreshToken", "mock-refresh-token");
    localStorage.setItem("chronicle:localUser", name);
    localStorage.setItem("chronicle:session", JSON.stringify(mockSession));
  }, userName);
  
  // Navigate to the app - should be auto-authenticated now
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");
}

// UX Review Helper - capture screenshots with annotations
async function captureUXState(page: Page, name: string, notes: string[] = []) {
  const screenshotPath = `ux-review-screenshots/user-management/${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  
  // Log findings
  console.log(`\n📸 Screenshot: ${name}`);
  if (notes.length > 0) {
    console.log("Notes:");
    notes.forEach(note => console.log(`  - ${note}`));
  }
  
  return screenshotPath;
}

test.describe("UX Review: User Management Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await bypassAuth(page, "Admin User", true);
  });

  test("Workflow 1: View User Directory", async ({ page }) => {
    // Navigate to user management
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    
    // Capture initial state
    await captureUXState(page, "01-user-directory-initial", [
      "Check: Page title visible",
      "Check: User list renders",
      "Check: Search/filter controls present",
      "Check: Add user button prominent"
    ]);
    
    // Check for empty states
    const emptyState = await page.locator("[data-testid='empty-state']").count();
    if (emptyState > 0) {
      await captureUXState(page, "01b-empty-state", [
        "Empty state visible - is it helpful?",
        "Does it guide user to add first user?"
      ]);
    }
    
    // Test search interaction
    const searchInput = page.locator("input[type='search'], [placeholder*='Search']").first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("test");
      await page.waitForTimeout(300); // Debounce check
      
      await captureUXState(page, "02-search-with-results", [
        "Search results appear promptly",
        "Loading state shown during search?",
        "Clear button available?"
      ]);
    }
  });

  test("Workflow 2: Add New User Flow", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    
    // Find and click add user button
    const addButton = page.locator("button:has-text('Add User'), button:has-text('Invite'), [data-testid='add-user']").first();
    
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      
      await captureUXState(page, "03-add-user-modal", [
        "Modal/dialog opens smoothly",
        "Form fields clearly labeled",
        "Email field has proper validation",
        "Role selector visible",
        "Cancel and Submit buttons clear"
      ]);
      
      // Test form validation
      const submitButton = page.locator("button[type='submit']").first();
      await submitButton.click();
      
      await captureUXState(page, "04-form-validation-errors", [
        "Validation errors shown for empty required fields",
        "Error messages clear and actionable",
        "Fields with errors visually highlighted"
      ]);
      
      // Fill form
      await page.fill("input[type='email']", "newuser@example.com");
      await page.fill("input[name='displayName'], input[name='name']", "New Test User");
      
      // Role selection
      const roleSelect = page.locator("select[name='role'], [data-testid='role-select']").first();
      if (await roleSelect.isVisible().catch(() => false)) {
        await roleSelect.selectOption("editor");
        
        await captureUXState(page, "05-role-descriptions", [
          "Role options clear",
          "Role description visible?",
          "Permissions preview shown?"
        ]);
      }
    }
  });

  test("Workflow 3: Edit User & Role Change", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    
    // Find first user row
    const userRow = page.locator("tr, [data-testid='user-row']").first();
    
    if (await userRow.isVisible().catch(() => false)) {
      // Look for edit action
      const editButton = userRow.locator("button:has-text('Edit'), [data-testid='edit-user']").first();
      const moreActions = userRow.locator("button[aria-label*='more'], button[aria-label*='actions']").first();
      
      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();
      } else if (await moreActions.isVisible().catch(() => false)) {
        await moreActions.click();
        await page.click("text=Edit");
      }
      
      await captureUXState(page, "06-edit-user-modal", [
        "Edit modal pre-filled with user data",
        "Email field disabled (immutable)?",
        "Role change options visible",
        "Delete option accessible but protected"
      ]);
      
      // Test self-deactivation guard
      // If this is the current user's own record
      const emailField = page.locator("input[type='email']").first();
      const email = await emailField.inputValue().catch(() => "");
      
      if (email.includes("admin") || email.includes("ux")) {
        const deactivateBtn = page.locator("button:has-text('Deactivate'), button:has-text('Delete')").first();
        if (await deactivateBtn.isVisible().catch(() => false)) {
          await captureUXState(page, "07-self-deactivation-guard", [
            "Warning shown for self-deactivation?",
            "Extra confirmation required?",
            "Prevents accidental lockout?"
          ]);
        }
      }
    }
  });

  test("Workflow 4: Guest User Management", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    
    // Look for guest/external user section
    const guestTab = page.locator("button:has-text('Guests'), button:has-text('External'), [data-testid='guests-tab']").first();
    
    if (await guestTab.isVisible().catch(() => false)) {
      await guestTab.click();
      
      await captureUXState(page, "08-guest-users-list", [
        "Guest users visually differentiated",
        "Access expiry dates visible",
        "Revoke access action available",
        "Clear indication of limited permissions"
      ]);
    }
  });

  test("Workflow 5: Organization Settings Navigation", async ({ page }) => {
    // Test navigation discoverability
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    
    await captureUXState(page, "09-main-nav-before", [
      "Admin/org settings accessible from main nav?",
      "User avatar/menu leads to settings?",
      "Breadcrumb shows location"
    ]);
    
    // Look for settings link
    const settingsLink = page.locator("a:has-text('Settings'), a:has-text('Admin'), button:has-text('Settings')").first();
    const userMenu = page.locator("[data-testid='user-menu'], button:has-text('Admin')").first();
    
    if (await settingsLink.isVisible().catch(() => false)) {
      await settingsLink.click();
    } else if (await userMenu.isVisible().catch(() => false)) {
      await userMenu.click();
      await page.click("text=Settings");
    }
    
    await page.waitForLoadState("networkidle");
    
    await captureUXState(page, "10-org-settings-page", [
      "Settings page has clear sections",
      "Navigation between settings categories",
      "Save/Cancel actions prominent",
      "Form validation inline"
    ]);
  });

  test("Workflow 6: Responsive Mobile UX", async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    
    await captureUXState(page, "11-mobile-user-directory", [
      "Table converts to cards/list on mobile",
      "Touch targets minimum 44x44px",
      "Horizontal scroll avoided",
      "Actions accessible via touch"
    ]);
    
    // Test add user on mobile
    const addButton = page.locator("button:has-text('Add')").first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      
      await captureUXState(page, "12-mobile-add-user", [
        "Modal full-screen or bottom sheet on mobile",
        "Form fields easily tappable",
        "Keyboard doesn't obscure inputs",
        "Scrollable if form is long"
      ]);
    }
  });

  test("Accessibility: Keyboard Navigation", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");
    
    // Test tab navigation
    await page.keyboard.press("Tab");
    await captureUXState(page, "13-keyboard-focus-states", [
      "Focus indicators clearly visible",
      "Tab order logical",
      "Skip links available?",
      "Focus trapped in modals?"
    ]);
    
    // Count interactive elements
    const buttons = await page.locator("button").count();
    const links = await page.locator("a").count();
    const inputs = await page.locator("input, select, textarea").count();
    
    console.log(`Interactive elements: ${buttons} buttons, ${links} links, ${inputs} inputs`);
  });
});

// Summary report
test.afterAll(async () => {
  console.log("\n" + "=".repeat(60));
  console.log("UX REVIEW: User Management - Complete");
  console.log("=".repeat(60));
  console.log("\nScreenshots saved to: ux-review-screenshots/user-management/");
  console.log("\nKey workflows tested:");
  console.log("  ✓ View User Directory");
  console.log("  ✓ Add New User Flow");
  console.log("  ✓ Edit User & Role Change");
  console.log("  ✓ Guest User Management");
  console.log("  ✓ Organization Settings Navigation");
  console.log("  ✓ Responsive Mobile UX");
  console.log("  ✓ Keyboard Navigation");
  console.log("\nNext: Review screenshots and file GitHub issues for findings.");
});
