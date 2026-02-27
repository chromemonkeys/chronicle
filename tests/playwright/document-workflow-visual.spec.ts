import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { ChroniclePlaywrightAgent } from "./ChroniclePlaywrightAgent";

async function installAndSignIn(page: Page, options?: ConstructorParameters<typeof ChroniclePlaywrightAgent>[1]) {
  const agent = new ChroniclePlaywrightAgent(page, options);
  await agent.install();
  await agent.signIn("Avery");
  return agent;
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true
  });
}

test.describe("Document Editor Workflow - Visual Steps", () => {
  test("complete workflow with screenshots", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    
    // Step 1: Initial document state
    await page.goto("/workspace/rfc-auth");
    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();
    await snap(page, testInfo, "01-initial-document-state");

    // Step 2: Click in editor to add content
    await page.locator(".cm-editor-wrapper .tiptap p", { hasText: "Standard tier allows" }).click();
    await snap(page, testInfo, "02-paragraph-active");
    
    // Step 3: Add new paragraph with content
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("This is a new section about implementation details.");
    await snap(page, testInfo, "03-added-new-content");

    // Step 4: Add 20 more lines of content to push the view
    await page.keyboard.press("Enter");
    for (let i = 1; i <= 20; i++) {
      await page.keyboard.type(`Line ${i}: Additional content about OAuth implementation and security considerations.`);
      await page.keyboard.press("Enter");
    }
    await snap(page, testInfo, "04-added-20-lines");

    // Step 5: Scroll to see the new content
    await page.evaluate(() => window.scrollTo(0, 500));
    await snap(page, testInfo, "05-scrolled-to-new-content");

    // Step 6: Scroll back up to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, testInfo, "06-back-to-top");

    // Step 7: Click on Purpose paragraph to anchor a comment
    await page.locator(".cm-editor-wrapper .tiptap p", { hasText: "Define secure sign-in" }).click();
    await snap(page, testInfo, "07-selected-purpose-paragraph");

    // Step 8: Type a comment
    const commentBox = page.locator(".cm-compose-input");
    await commentBox.fill("This paragraph needs technical review for accuracy.");
    await snap(page, testInfo, "08-typing-comment");

    // Step 9: Submit comment
    await page.getByRole("button", { name: "Comment" }).click();
    await expect(page.getByText("This paragraph needs technical review")).toBeVisible();
    await snap(page, testInfo, "09-comment-posted");

    // Step 10: Check discussion panel state
    await snap(page, testInfo, "10-discussion-panel-state");

    // Step 11: Add reply to the comment
    const threadCard = page.locator(".cm-thread-card", { hasText: "This paragraph needs technical review" });
    await threadCard.getByRole("button", { name: /Reply/ }).click();
    await threadCard.getByPlaceholder("Reply in thread...").fill("I will review the technical details today.");
    await snap(page, testInfo, "11-typing-reply");

    // Step 12: Send reply
    await threadCard.getByRole("button", { name: "Send Reply" }).click();
    await expect(threadCard.getByText("I will review the technical details today.")).toBeVisible();
    await snap(page, testInfo, "12-reply-posted");

    // Step 13: Check thread indicators visible
    await snap(page, testInfo, "13-thread-indicators-visible");

    // Step 14: Switch to History tab
    await page.getByRole("tab", { name: "History" }).click();
    await snap(page, testInfo, "14-history-tab");

    // Step 15: Switch to Log tab
    await page.getByRole("tab", { name: "Log" }).click();
    await snap(page, testInfo, "15-log-tab");

    // Step 16: Back to Discussion
    await page.getByRole("tab", { name: "Discussion" }).click();
    await snap(page, testInfo, "16-back-to-discussion");

    // Step 17: Scroll to bottom to see all content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await snap(page, testInfo, "17-scrolled-to-bottom");
  });
});
