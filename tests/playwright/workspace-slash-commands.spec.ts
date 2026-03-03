import { expect, test, type Page, type TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signIn(page: Page, name = "Avery") {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use demo mode" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(documents|workspace)/);
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true,
  });
}

async function navigateToWorkspace(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");

  const docLink = page.locator(".tree-node-label").first();
  await expect(docLink).toBeVisible({ timeout: 10_000 });
  await docLink.click();
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 15_000 });
  await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });
}

async function ensureToolbarVisible(page: Page) {
  const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
  if (!(await toolbar.isVisible({ timeout: 2_000 }).catch(() => false))) {
    const startBtn = page.locator("button", { hasText: "Start Proposal" });
    if (await startBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });
    }
  }
}

/**
 * Open the slash command menu by creating an empty paragraph and typing "/".
 * This focuses the editor, presses Enter to create a new empty paragraph,
 * then types "/" to trigger the slash commands menu.
 */
async function openSlashMenu(page: Page) {
  const editor = page.locator(".tiptap, .ProseMirror").first();
  await editor.click();

  // Press Enter to create a new empty paragraph
  await page.keyboard.press("Enter");
  // Small wait for ProseMirror to process the Enter
  await page.waitForTimeout(100);

  // Type "/" to trigger slash commands
  await page.keyboard.type("/");
  // Wait for the menu to appear
  await expect(page.locator(".cm-slash-menu")).toBeVisible({ timeout: 3_000 });
}

// ---------------------------------------------------------------------------
// 4.3 Slash Commands
// ---------------------------------------------------------------------------

test.describe("4.3 Slash Commands", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);
  });

  // 4.3.1 Typing "/" at start of empty paragraph opens menu
  test('4.3.1 typing "/" opens slash command menu', async ({ page }, testInfo) => {
    await openSlashMenu(page);
    await expect(page.locator(".cm-slash-menu")).toBeVisible();
    await snap(page, testInfo, "4.3.1-slash-menu-open");
  });

  // 4.3.2 Menu shows all 11 options
  test("4.3.2 menu shows all 11 command options", async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const items = page.locator(".cm-slash-item");
    await expect(items).toHaveCount(11);

    // Verify all expected labels are present
    const expectedLabels = [
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bullet List",
      "Ordered List",
      "Code Block",
      "Blockquote",
      "Task List",
      "Table",
      "Horizontal Rule",
      "Image",
    ];

    for (const label of expectedLabels) {
      await expect(page.locator(".cm-slash-label", { hasText: label })).toBeVisible();
    }

    await snap(page, testInfo, "4.3.2-all-11-options");
  });

  // 4.3.3 ArrowDown moves selection down
  test("4.3.3 ArrowDown moves selection down", async ({ page }, testInfo) => {
    await openSlashMenu(page);

    // First item should be selected initially
    const firstItem = page.locator(".cm-slash-item").first();
    await expect(firstItem).toHaveClass(/active/);

    // Press ArrowDown
    await page.keyboard.press("ArrowDown");

    // Second item should now be selected
    const secondItem = page.locator(".cm-slash-item").nth(1);
    await expect(secondItem).toHaveClass(/active/);
    await expect(firstItem).not.toHaveClass(/active/);

    await snap(page, testInfo, "4.3.3-arrow-down");
  });

  // 4.3.4 ArrowUp moves selection up
  test("4.3.4 ArrowUp moves selection up", async ({ page }, testInfo) => {
    await openSlashMenu(page);

    // Move down first, then up
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const thirdItem = page.locator(".cm-slash-item").nth(2);
    await expect(thirdItem).toHaveClass(/active/);

    await page.keyboard.press("ArrowUp");
    const secondItem = page.locator(".cm-slash-item").nth(1);
    await expect(secondItem).toHaveClass(/active/);

    await snap(page, testInfo, "4.3.4-arrow-up");
  });

  // 4.3.5 Enter executes selected command
  test("4.3.5 Enter executes selected command", async ({ page }, testInfo) => {
    await openSlashMenu(page);
    await snap(page, testInfo, "4.3.5-before-enter");

    // Press Enter to execute the first command (Heading 1)
    await page.keyboard.press("Enter");

    // The slash menu should close
    await expect(page.locator(".cm-slash-menu")).not.toBeVisible({ timeout: 2_000 });

    // A heading 1 should now exist in the editor
    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("h1")).toBeVisible({ timeout: 3_000 });

    await snap(page, testInfo, "4.3.5-after-enter");
  });

  // 4.3.6 Escape closes menu
  test("4.3.6 Escape closes menu", async ({ page }, testInfo) => {
    await openSlashMenu(page);
    await expect(page.locator(".cm-slash-menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-slash-menu")).not.toBeVisible({ timeout: 2_000 });

    await snap(page, testInfo, "4.3.6-escape-closed");
  });

  // 4.3.7 Any other key closes menu
  test("4.3.7 typing another key closes menu", async ({ page }, testInfo) => {
    await openSlashMenu(page);
    await expect(page.locator(".cm-slash-menu")).toBeVisible();

    // Type a regular character
    await page.keyboard.press("a");
    await expect(page.locator(".cm-slash-menu")).not.toBeVisible({ timeout: 2_000 });

    await snap(page, testInfo, "4.3.7-other-key-closed");
  });

  // 4.3.8 Clicking menu item executes command
  test("4.3.8 clicking menu item executes command", async ({ page }, testInfo) => {
    await openSlashMenu(page);

    // Click the "Heading 2" option
    const h2Item = page.locator(".cm-slash-item", { hasText: "Heading 2" });
    await expect(h2Item).toBeVisible();
    await h2Item.click();

    // Menu should close
    await expect(page.locator(".cm-slash-menu")).not.toBeVisible({ timeout: 2_000 });

    // H2 should exist
    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("h2")).toBeVisible({ timeout: 3_000 });

    await snap(page, testInfo, "4.3.8-click-heading2");
  });

  // 4.3.9 "Heading 1" option creates h1
  test('4.3.9 "Heading 1" creates h1', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const h1Item = page.locator(".cm-slash-item", { hasText: "Heading 1" });
    await h1Item.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("h1")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.9-h1-created");
  });

  // 4.3.10 "Heading 2" option creates h2
  test('4.3.10 "Heading 2" creates h2', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const h2Item = page.locator(".cm-slash-item", { hasText: "Heading 2" });
    await h2Item.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("h2")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.10-h2-created");
  });

  // 4.3.11 "Heading 3" option creates h3
  test('4.3.11 "Heading 3" creates h3', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const h3Item = page.locator(".cm-slash-item", { hasText: "Heading 3" });
    await h3Item.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("h3")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.11-h3-created");
  });

  // 4.3.12 "Bullet List" option creates bullet list
  test('4.3.12 "Bullet List" creates bullet list', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const bulletItem = page.locator(".cm-slash-item", { hasText: "Bullet List" });
    await bulletItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("ul")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.12-bullet-list");
  });

  // 4.3.13 "Ordered List" option creates ordered list
  test('4.3.13 "Ordered List" creates ordered list', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const olItem = page.locator(".cm-slash-item", { hasText: "Ordered List" });
    await olItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("ol")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.13-ordered-list");
  });

  // 4.3.14 "Code Block" option creates code block
  test('4.3.14 "Code Block" creates code block', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const codeItem = page.locator(".cm-slash-item", { hasText: "Code Block" });
    await codeItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("pre")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.14-code-block");
  });

  // 4.3.15 "Blockquote" option creates blockquote
  test('4.3.15 "Blockquote" creates blockquote', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const quoteItem = page.locator(".cm-slash-item", { hasText: "Blockquote" });
    await quoteItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("blockquote")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.15-blockquote");
  });

  // 4.3.16 "Task List" option creates task list
  test('4.3.16 "Task List" creates task list', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const taskItem = page.locator(".cm-slash-item", { hasText: "Task List" });
    await taskItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    // Task lists render as ul with data-type="taskList" or with checkboxes
    await expect(editor.locator('[data-type="taskList"], ul[data-type="taskList"]')).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.16-task-list");
  });

  // 4.3.17 "Table" option creates 3x3 table
  test('4.3.17 "Table" creates 3x3 table', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const tableItem = page.locator(".cm-slash-item", { hasText: "Table" });
    await tableItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("table")).toBeVisible({ timeout: 3_000 });

    // Verify 3x3 structure: 1 header row + 2 body rows = 3 rows, 3 columns each
    const rows = editor.locator("table tr");
    await expect(rows).toHaveCount(3);
    // First row should have header cells
    const headerCells = editor.locator("table tr:first-child th");
    await expect(headerCells).toHaveCount(3);

    await snap(page, testInfo, "4.3.17-table");
  });

  // 4.3.18 "Horizontal Rule" option inserts HR
  test('4.3.18 "Horizontal Rule" inserts hr', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const hrItem = page.locator(".cm-slash-item", { hasText: "Horizontal Rule" });
    await hrItem.click();

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor.locator("hr")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.3.18-horizontal-rule");
  });

  // 4.3.19 "Image" option opens file picker (we verify the menu item exists)
  test('4.3.19 "Image" option is present and clickable', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const imageItem = page.locator(".cm-slash-item", { hasText: "Image" });
    await expect(imageItem).toBeVisible();
    // Verify it has the correct description
    await expect(imageItem.locator(".cm-slash-desc")).toContainText("Insert an image from file");

    await snap(page, testInfo, "4.3.19-image-option");
    // Note: We cannot fully test file picker opening in Playwright without
    // filechooser events, but we verify the menu item renders correctly.
  });

  // 4.3.20 Menu positioned within viewport bounds
  test("4.3.20 menu is positioned within viewport", async ({ page }, testInfo) => {
    await openSlashMenu(page);

    const menu = page.locator(".cm-slash-menu");
    await expect(menu).toBeVisible();

    const boundingBox = await menu.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      const viewport = page.viewportSize()!;
      expect(boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(boundingBox.y).toBeGreaterThanOrEqual(0);
      expect(boundingBox.x + boundingBox.width).toBeLessThanOrEqual(viewport.width + 8);
      expect(boundingBox.y + boundingBox.height).toBeLessThanOrEqual(viewport.height + 8);
    }

    await snap(page, testInfo, "4.3.20-menu-positioned");
  });

  // 4.3.21 "/" character removed after command execution
  test('4.3.21 "/" character removed after executing command', async ({ page }, testInfo) => {
    await openSlashMenu(page);

    // Select Heading 1
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-slash-menu")).not.toBeVisible({ timeout: 2_000 });

    // The "/" should not appear in the editor text
    const editor = page.locator(".tiptap, .ProseMirror").first();
    const editorText = await editor.textContent();
    // The newly created heading should not contain "/"
    // We check the last heading element specifically
    const headings = editor.locator("h1");
    const lastHeading = headings.last();
    if (await lastHeading.isVisible()) {
      const headingText = await lastHeading.textContent();
      expect(headingText).not.toContain("/");
    }

    await snap(page, testInfo, "4.3.21-slash-removed");
  });
});
