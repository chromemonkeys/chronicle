import { test, expect } from "@playwright/test";

test("check document tree with expand/collapse", async ({ page }) => {
  // Navigate and sign in
  await page.goto("http://localhost:5173/documents");
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /demo mode/i }).click();
  await page.waitForTimeout(500);
  await page.getByLabel(/display name/i).fill('Tester');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(4000);
  
  // Open a workspace
  await page.getByText('Open workspace').first().click();
  await page.waitForTimeout(3000);
  
  console.log("=== Document Tree Structure ===");
  const items = await page.locator('.cm-tree-item').all();
  for (const item of items) {
    const text = await item.textContent();
    const icon = await item.locator('.cm-tree-icon').textContent();
    const isFolder = icon === '📂';
    const toggle = await item.locator('.cm-tree-toggle').textContent().catch(() => '');
    console.log(`${toggle}${isFolder ? '📂' : '📄'} ${text?.substring(0, 40)}`);
  }
  
  // Screenshot
  const sidebar = await page.locator('.cm-sidebar').first();
  await sidebar.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/tree-nested.png" });
  
  // Test collapse
  console.log("\n=== Collapsing General folder ===");
  await page.locator('.cm-tree-item:has-text("General") .cm-tree-toggle').click();
  await page.waitForTimeout(500);
  await sidebar.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/tree-collapsed.png" });
  
  const itemsAfterCollapse = await page.locator('.cm-tree-item').count();
  console.log(`Items after collapse: ${itemsAfterCollapse}`);
});
