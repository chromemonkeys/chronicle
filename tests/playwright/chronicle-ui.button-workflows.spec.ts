import { expect, test, type Page, type TestInfo } from "@playwright/test";
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

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true
  });
}

test.describe("Chronicle button and workflow coverage", () => {
  test("global button coverage on sign-in, documents, and approvals", async ({ page }, testInfo) => {
    await installAgent(page);

    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Magic link (soon)" })).toBeDisabled();
    await snap(page, testInfo, "01-sign-in");

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
    await snap(page, testInfo, "02-documents");

    page.once("dialog", (dialog) => dialog.accept("Playwright Space"));
    await page.getByRole("button", { name: "+ Create Space" }).click();
    await snap(page, testInfo, "03-space-created");

    await page.getByRole("link", { name: "Approvals" }).click();
    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await snap(page, testInfo, "04-approvals");

    await page.getByRole("link", { name: "Documents" }).click();
    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await snap(page, testInfo, "05-sign-out");
  });

  test("workspace toolbar and sidebar button coverage", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();
    await snap(page, testInfo, "10-workspace-initial");

    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByText("Review Diff vs Main")).toBeVisible();
    await page.getByRole("button", { name: "Proposal", exact: true }).click();

    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Toolbar button sweep text.");

    const editorButtons = [
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Heading 2",
      "Heading 3",
      "Bullet list",
      "Blockquote",
      "Align left",
      "Align center",
      "Align right"
    ] as const;

    for (const name of editorButtons) {
      await page.getByRole("button", { name }).click();
    }

    await page.getByRole("button", { name: "Font ▾" }).click();
    await page.getByRole("button", { name: "Serif" }).click();
    await page.getByRole("button", { name: "Font ▾" }).click();
    await page.getByRole("button", { name: "Default" }).click();

    await page.getByRole("button", { name: "A ▾" }).click();
    await page.getByRole("button", { name: "Default color" }).click();

    await page.getByRole("button", { name: "⬒ ▾" }).click();
    await page.getByRole("button", { name: "Yellow" }).click();
    await page.getByRole("button", { name: "⬒ ▾" }).click();
    await page.getByRole("button", { name: "No highlight" }).click();

    await page.getByRole("button", { name: /Show Diff|Diff On/ }).click();
    await page.locator(".cm-diff-toggle").getByRole("button", { name: "Unified" }).click({ force: true });
    await page.locator(".cm-diff-toggle").getByRole("button", { name: "Split" }).click({ force: true });
    await expect(page.getByRole("button", { name: "Proposal Mode" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit Mode" })).toHaveCount(0);
    await snap(page, testInfo, "11-toolbar-buttons");

    await page.getByRole("button", { name: /Save$/ }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.getByRole("button", { name: "Open Reviews" }).click();
    await page.getByRole("button", { name: "Merged" }).click();
    await page.getByRole("button", { name: "Decision Log" }).click();
    await page.getByRole("button", { name: "All Documents" }).first().click();
    await expect(page).toHaveURL(/\/documents$/);
    await snap(page, testInfo, "12-sidebar-navigation");
  });

  test("proposal-to-merge workflow buttons with screenshots", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page.getByRole("button", { name: /History/ }).click();
    await expect(page.getByRole("button", { name: "Compare Selected" })).toBeVisible();
    await snap(page, testInfo, "20-history-panel");

    await page.getByRole("tab", { name: "Discussion" }).click();

    const threadCard = page.locator(".cm-thread-card").first();
    await threadCard.getByRole("button", { name: "Internal" }).click();
    await threadCard.getByRole("button", { name: "↩ Reply" }).click();
    await threadCard.getByPlaceholder("Reply in thread...").fill("Playwright inline reply");
    await threadCard.getByRole("button", { name: "Send Reply" }).click();
    await threadCard.getByRole("button", { name: "▲" }).click();
    await threadCard.getByRole("button", { name: "👍" }).click();
    await snap(page, testInfo, "21-thread-actions");

    await page.locator(".cm-approver-row", { hasText: "Security" }).getByRole("button", { name: "Approve" }).click();
    await page.locator(".cm-approver-row", { hasText: "Architecture Committee" }).getByRole("button", { name: "Approve" }).click();
    await page.locator(".cm-approver-row", { hasText: "Legal" }).getByRole("button", { name: "Approve" }).click();

    await threadCard.getByRole("button", { name: "✓ Resolve" }).click();
    await threadCard.getByLabel("Outcome").selectOption("ACCEPTED");
    await threadCard.getByRole("button", { name: "Confirm Resolve" }).click();
    await expect(page.getByText("Merge Gate Ready")).toBeVisible();

    await page.getByRole("button", { name: "✓ Ready to merge" }).click();
    await expect(page.locator(".cm-doc-status")).toContainText("Approved");
    await snap(page, testInfo, "22-merged");
  });
});
