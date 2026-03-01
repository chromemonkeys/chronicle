import { test, expect, Page } from "@playwright/test";

// Helper to sign in as admin
async function signInAsAdmin(page: Page, name: string = "Admin User") {
  await page.goto("/sign-in");
  // Use demo mode for simplicity
  await page.click('button:has-text("Use demo mode")');
  await page.waitForSelector('input[placeholder="Enter your name"]');
  await page.fill('input[placeholder="Enter your name"]', name);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL("/");
}

// Helper to navigate to User Management
async function navigateToUserManagement(page: Page) {
  await page.goto("/admin/users");
  await page.waitForLoadState("networkidle");
}

test.describe("Role Management UX Review", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test.describe("Visual States", () => {
    test("default role display - shows role badges with correct colors", async ({ page }) => {
      await navigateToUserManagement(page);
      
      // Wait for table to load
      await page.waitForSelector(".users-table");
      
      // Check role badges are visible
      const roleBadges = await page.locator(".role-badge").all();
      expect(roleBadges.length).toBeGreaterThan(0);
      
      // Screenshot for visual review
      await page.screenshot({ 
        path: "test-results/role-management-default-view.png",
        fullPage: true 
      });
    });

    test("role dropdown open state", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Click "Change Role" on first user
      await page.click('button:has-text("Change Role")');
      
      // Wait for dialog
      await page.waitForSelector('[role="dialog"]');
      
      // Open role dropdown
      await page.click('select');
      
      await page.screenshot({ 
        path: "test-results/role-dropdown-open.png" 
      });
    });

    test("loading state during save", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Open role change dialog
      await page.click('button:has-text("Change Role")');
      await page.waitForSelector('[role="dialog"]');
      
      // Select different role
      await page.selectOption('select', 'editor');
      
      // Click update and capture loading state
      const updateButton = page.locator('button:has-text("Update Role")');
      await updateButton.click();
      
      // Capture loading state immediately
      await page.screenshot({ 
        path: "test-results/role-update-loading.png" 
      });
      
      // Wait for completion
      await page.waitForSelector('.alert-success', { timeout: 5000 });
    });

    test("success confirmation state", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Find a user and change role
      await page.click('button:has-text("Change Role")');
      await page.waitForSelector('[role="dialog"]');
      await page.selectOption('select', 'viewer');
      await page.click('button:has-text("Update Role")');
      
      // Wait for success message
      await page.waitForSelector('.alert-success', { timeout: 5000 });
      
      await page.screenshot({ 
        path: "test-results/role-update-success.png",
        fullPage: true 
      });
    });
  });

  test.describe("Error Prevention", () => {
    test("should show confirmation for destructive role changes (admin to lower)", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Look for an admin user and try to demote
      const adminRows = await page.locator("tr:has(.role-badge:has-text('Admin'))").all();
      if (adminRows.length > 0) {
        // Click change role on admin user
        await adminRows[0].locator('button:has-text("Change Role")').click();
        await page.waitForSelector('[role="dialog"]');
        
        // Try to change to viewer
        await page.selectOption('select', 'viewer');
        
        // Check if there's a warning (current implementation may not have this)
        await page.screenshot({ 
          path: "test-results/admin-demotion-attempt.png" 
        });
      }
    });

    test("should prevent or warn on self-deactivation", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Try to find current user's row (should be "Admin User")
      const userRows = await page.locator("tr:has-text('Admin User')").all();
      
      if (userRows.length > 0) {
        // Check if deactivate button exists and is enabled/disabled
        const deactivateButton = userRows[0].locator('button:has-text("Deactivate")');
        const isDisabled = await deactivateButton.isDisabled().catch(() => false);
        
        await page.screenshot({ 
          path: "test-results/self-deactivation-check.png" 
        });
        
        // Document the behavior
        console.log("Self-deactivation button disabled:", isDisabled);
      }
    });
  });

  test.describe("Role Descriptions & Content", () => {
    test("role selector shows all available roles", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      await page.click('button:has-text("Change Role")');
      await page.waitForSelector('[role="dialog"]');
      
      // Get all role options
      const options = await page.locator('select option').allTextContents();
      
      // Expected roles based on product vision
      const expectedRoles = ['Viewer', 'Commenter', 'Suggester', 'Editor', 'Admin'];
      
      for (const role of expectedRoles) {
        expect(options).toContain(role);
      }
      
      await page.screenshot({ 
        path: "test-results/role-selector-options.png" 
      });
    });

    test("invite modal role selector", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Open invite modal
      await page.click('button:has-text("Invite Users")');
      await page.waitForSelector('[role="dialog"]:has-text("Invite Users")');
      
      // Check role selector in invite form
      const options = await page.locator('select option').allTextContents();
      
      await page.screenshot({ 
        path: "test-results/invite-role-selector.png" 
      });
    });
  });

  test.describe("Edge Cases", () => {
    test("empty state when no users match filter", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Search for non-existent user
      await page.fill('input[placeholder="Search by name or email..."]', "xyznonexistent12345");
      
      // Wait for filter to apply
      await page.waitForTimeout(500);
      
      await page.screenshot({ 
        path: "test-results/role-management-empty-state.png",
        fullPage: true 
      });
    });

    test("filter by role shows correct users", async ({ page }) => {
      await navigateToUserManagement(page);
      await page.waitForSelector(".users-table");
      
      // Filter by admin role
      await page.selectOption('.role-filter', 'admin');
      await page.waitForTimeout(500);
      
      await page.screenshot({ 
        path: "test-results/role-filter-admin.png",
        fullPage: true 
      });
    });
  });
});
