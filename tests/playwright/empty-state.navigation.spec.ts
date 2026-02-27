import { expect, test, type Page } from "@playwright/test";
import { ChroniclePlaywrightAgent } from "./ChroniclePlaywrightAgent";

async function installAgent(page: Page, options?: ConstructorParameters<typeof ChroniclePlaywrightAgent>[1]) {
  const agent = new ChroniclePlaywrightAgent(page, options);
  await agent.install();
  return agent;
}

async function installAndSignIn(page: Page, options?: ConstructorParameters<typeof ChroniclePlaywrightAgent>[1]) {
  const agent = await installAgent(page, options);
  await agent.signIn("Avery");
  return agent;
}

test.describe("Empty State and Navigation Recovery", () => {
  test("documents error state shows retry and go back navigation", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        documents: 2
      }
    });

    await expect(page.getByRole("heading", { name: "Could not load documents" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Go back/i })).toBeVisible();
  });

  test("documents empty state shows create action with expected outcome", async ({ page }) => {
    await installAndSignIn(page, { documents: [] });

    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
    await expect(page.getByText(/Create your first/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create document" }).first()).toBeVisible();
  });

  test("approvals error state shows retry and navigation fallback", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        approvals: 2
      }
    });

    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "Approval queue unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to Documents/i })).toBeVisible();
  });

  test("approvals empty state has browse action", async ({ page }) => {
    await installAndSignIn(page, {
      approvals: {
        mergeGate: {
          security: "Approved",
          architectureCommittee: "Approved",
          legal: "Approved"
        },
        queue: []
      }
    });

    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "No pending approvals" })).toBeVisible();
    await expect(page.getByText(/Documents will appear here/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse documents" })).toBeVisible();
  });

  test("workspace error state has retry and navigation options", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        workspace: 2
      }
    });

    await page.goto("/workspace/rfc-auth");

    await expect(page.getByRole("heading", { name: "Workspace failed to load" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Go back/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to Documents/i })).toBeVisible();
  });

  test("not found page has go back and go home navigation", async ({ page }) => {
    await installAgent(page);

    await page.goto("/non-existent-page");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByText(/doesn't exist/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Go back/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Documents" })).toBeVisible();
  });

  test("go back button navigates to previous page", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        workspace: 2
      }
    });

    // First go to documents (landing page after sign-in)
    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
    
    // Navigate to a workspace that will fail
    await page.goto("/workspace/rfc-auth");
    await expect(page.getByRole("heading", { name: "Workspace failed to load" })).toBeVisible();

    // Click go back
    await page.getByRole("button", { name: /Go back/i }).click();

    // Should return to documents
    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
  });

  test("go to documents link navigates to documents page", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        approvals: 2
      }
    });

    await page.goto("/approvals");
    await expect(page.getByRole("heading", { name: "Approval queue unavailable" })).toBeVisible();

    await page.getByRole("link", { name: /Go to Documents/i }).click();

    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
  });

  test("empty state actions are keyboard accessible", async ({ page }) => {
    await installAndSignIn(page, { documents: [] });

    const createButton = page.getByRole("button", { name: "Create document" }).first();
    await expect(createButton).toBeVisible();
    
    // Test keyboard navigation
    await createButton.focus();
    await expect(createButton).toBeFocused();
    
    // Verify the button is actionable via keyboard
    await page.keyboard.press("Enter");
    await expect(page.locator("[role='dialog']")).toHaveCount(0);
  });

  test("error states have consistent visual styling", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        documents: 2
      }
    });

    const emptyState = page.locator(".empty-state").first();
    await expect(emptyState).toBeVisible();
    
    // Verify icon is present
    const icon = emptyState.locator(".empty-state-icon svg");
    await expect(icon).toBeVisible();
    
    // Verify title has proper styling
    const title = emptyState.locator(".empty-state-title");
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("font-weight", "600");
    
    // Verify action buttons are in a row
    const actions = emptyState.locator(".empty-state-actions");
    await expect(actions).toBeVisible();
    await expect(actions).toHaveCSS("display", "flex");
  });

  test("workspace breadcrumb provides navigation escape hatch", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    // Verify breadcrumb has clickable workspace link (Chronicle brand)
    const workspaceLink = page.locator(".cm-breadcrumb-link").first();
    await expect(workspaceLink).toBeVisible();
    
    // Navigate to a document first to create history
    await page.goto("/documents");
    await page.goto("/workspace/rfc-auth");
    
    // Click the breadcrumb link to go back to documents
    await page.locator(".cm-breadcrumb-link").first().click();
    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
  });
});
