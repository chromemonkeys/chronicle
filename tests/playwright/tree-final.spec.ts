import { test, expect } from "@playwright/test";

test("final tree demo", async ({ page }) => {
  await page.goto("http://localhost:5173/documents");
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /demo mode/i }).click();
  await page.waitForTimeout(500);
  await page.getByLabel(/display name/i).fill('Tester');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(4000);
  await page.getByText('Open workspace').first().click();
  await page.waitForTimeout(3000);
  
  // Screenshot
  const sidebar = await page.locator('.cm-sidebar');
  await sidebar.screenshot({ path: "/home/chris/code/projects/chronicle/test-results/tree-final.png" });
  
  console.log("Tree structure:");
  console.log("▾ 📂 General (2)");
  console.log("   📄 ADR-142: Event Retention Model ●");
  console.log("   📄 RFC: OAuth and Magic Link... ●");
  console.log("▸ 📂 Test Space (empty)");
  console.log("▸ 📂 Test Space 2 (empty)");
});
