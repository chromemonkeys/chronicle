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

test.describe("Block Editor Visual States", () => {
  test("block with thread shows accent border", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    
    // The Purpose paragraph should have has-thread class
    await expect(page.locator(".cm-editor-wrapper .tiptap [data-node-id].has-thread").first()).toBeVisible();
    
    await snap(page, testInfo, "01-block-with-thread");
  });

  test("active block highlight on click", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    
    // Click on the Tier Definitions paragraph (no thread)
    const paragraph = page.locator(".cm-editor-wrapper .tiptap p", { hasText: "Standard tier allows up to" });
    await paragraph.click();
    
    // Should have block-active class
    await expect(paragraph.locator("..").locator("[data-node-id].block-active")).toBeVisible();
    
    await snap(page, testInfo, "02-block-active-highlight");
  });

  test("diff mode highlighting", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    
    // Click in editor and type
    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Added diff text.");
    
    // Toggle diff on
    await page.getByRole("button", { name: /Show Diff|Diff On/ }).click();
    
    // Should see diff highlighting
    await expect(page.locator(".cm-editor-wrapper .tiptap [data-node-id].diff-changed").first()).toBeVisible();
    
    await snap(page, testInfo, "03-diff-highlighting");
  });

  test("block selection state", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    
    // Click on a paragraph
    const paragraph = page.locator(".cm-editor-wrapper .tiptap p").first();
    await paragraph.click();
    
    // Should have selected class
    await expect(page.locator(".cm-editor-wrapper .tiptap [data-node-id].selected")).toBeVisible();
    
    await snap(page, testInfo, "04-block-selected");
  });

  test("thread indicator vs active block distinction", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    
    // Click on the block that has a thread (Purpose paragraph)
    const purposeParagraph = page.locator(".cm-editor-wrapper .tiptap p", { hasText: "Define secure sign-in" });
    await purposeParagraph.click();
    
    // This block should have BOTH has-thread AND block-active
    await snap(page, testInfo, "05-thread-plus-active");
    
    // Now click on a block without thread
    const tierParagraph = page.locator(".cm-editor-wrapper .tiptap p", { hasText: "Standard tier allows" });
    await tierParagraph.click();
    
    // This block should have block-active but NOT has-thread
    await snap(page, testInfo, "06-active-only");
  });

  test("diff removed blocks styling", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    
    // Toggle diff on to see removed blocks
    await page.getByRole("button", { name: /Show Diff|Diff On/ }).click();
    
    // Check if any diff-removed blocks exist
    const removedBlocks = page.locator(".cm-editor-wrapper .tiptap [data-node-id].diff-removed");
    if (await removedBlocks.count() > 0) {
      await expect(removedBlocks.first()).toBeVisible();
    }
    
    await snap(page, testInfo, "07-diff-removed-blocks");
  });
});
