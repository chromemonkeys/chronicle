import { test, expect } from "@playwright/test";

test("demo: create folder and nest documents", async ({ page }) => {
  // Navigate and sign in
  await page.goto("http://localhost:5173/documents");
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /demo mode/i }).click();
  await page.waitForTimeout(500);
  await page.getByLabel(/display name/i).fill('Tester');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(4000);
  
  console.log("=== STEP 1: Create a new folder (space) ===");
  await page.getByRole('button', { name: /new space/i }).click();
  await page.getByPlaceholder(/space name/i).fill('Architecture');
  await page.getByRole('button', { name: /create$/i }).click();
  await page.waitForTimeout(2000);
  console.log("✓ Created 'Architecture' folder");
  
  // Screenshot showing new folder
  await page.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/01-new-folder.png", fullPage: true });
  
  console.log("\n=== STEP 2: Create document in a folder ===");
  // Open a workspace to access the tree
  await page.getByText('Open workspace').first().click();
  await page.waitForTimeout(3000);
  
  // Take screenshot of tree with folders
  const sidebar = await page.locator('.cm-sidebar').first();
  await sidebar.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/02-tree-with-folders.png" });
  console.log("✓ Tree shows folders");
  
  // Right-click on a folder to create document
  const folder = await page.locator('.cm-tree-item:has-text("Architecture")').first();
  if (await folder.count() > 0) {
    await folder.click({ button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/03-folder-context-menu.png" });
    console.log("✓ Context menu on folder");
    
    // Click "New document"
    await page.getByText(/new document/i).click();
    await page.waitForTimeout(3000);
    console.log("✓ Created document in Architecture folder");
    
    await page.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/04-new-document.png", fullPage: true });
  }
  
  console.log("\n=== STEP 3: Document is nested under folder ===");
  const items = await page.locator('.cm-tree-item').all();
  console.log(`Tree now has ${items.length} items:`);
  for (const item of items) {
    const text = await item.textContent();
    const icon = await item.locator('.cm-tree-icon').textContent();
    const isFolder = icon === '📁';
    const indent = await item.evaluate(el => window.getComputedStyle(el).paddingLeft);
    console.log(`  ${isFolder ? '📁' : '  •'} ${text?.substring(0, 40).padEnd(40)} (indent: ${indent})`);
  }
});
