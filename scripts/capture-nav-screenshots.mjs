/**
 * UX Review: Capture Navigation & Settings Screenshots
 * Issues: #130 (Admin navigation), #128 (Organization Settings)
 */
import { chromium } from "playwright";
import { mkdir } from "fs/promises";

const BASE_URL = "http://127.0.0.1:43173";
const OUTPUT_DIR = "ux-review-findings";

async function captureScreenshots() {
  console.log("Starting UX Review: Navigation & Settings");
  console.log("=".repeat(60));
  
  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  const findings = [];
  
  // === STEP 1: Sign in via demo mode ===
  console.log("\n🔐 Signing in via demo mode...");
  await page.goto(`${BASE_URL}/sign-in`);
  await page.waitForLoadState("networkidle");
  
  // Click demo mode button to reveal the input
  await page.click("button:has-text('Use demo mode')");
  await page.waitForTimeout(300);
  
  // Fill in the demo name
  await page.fill("input#demo-name", "UX Reviewer");
  
  // Click the Sign in button
  await page.click(".demo-mode button:has-text('Sign in')");
  await page.waitForTimeout(1000);
  
  // Wait for navigation to documents
  try {
    await page.waitForURL("**/documents", { timeout: 5000 });
    console.log("   ✅ Successfully signed in");
  } catch {
    console.log("   ⚠️ Navigation timeout, checking current URL...");
  }
  
  const currentUrl = page.url();
  console.log(`   Current URL: ${currentUrl}`);
  
  // === SCREENSHOT 1: Main Navigation (Documents Page) ===
  console.log("\n📸 Capturing: Main Navigation");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  
  const mainNavPath = `${OUTPUT_DIR}/01-main-navigation.png`;
  await page.screenshot({ path: mainNavPath, fullPage: false });
  console.log(`   Saved: ${mainNavPath}`);
  
  // Analyze main navigation
  const navLinks = await page.locator("header .nav-link, header nav a").all();
  const navItems = [];
  for (const link of navLinks) {
    const text = await link.textContent().catch(() => "");
    const href = await link.getAttribute("href").catch(() => "");
    navItems.push({ text: text.trim(), href });
  }
  
  // Check for header elements
  const headerExists = await page.locator("header").count() > 0;
  const userNavExists = await page.locator(".user-nav").count() > 0;
  
  findings.push({
    category: "Main Navigation",
    screenshot: mainNavPath,
    navItems,
    headerExists,
    userNavExists,
    currentUrl: page.url(),
    issues: []
  });
  
  // === SCREENSHOT 2: User Menu / Avatar area ===
  console.log("\n📸 Capturing: User Menu Area");
  const userMenuPath = `${OUTPUT_DIR}/02-user-menu-area.png`;
  
  // Try to capture just the header area
  const header = await page.locator("header").first();
  if (await header.isVisible().catch(() => false)) {
    await header.screenshot({ path: userMenuPath });
    console.log(`   Saved: ${userMenuPath}`);
  } else {
    await page.screenshot({ path: userMenuPath, fullPage: false });
    console.log(`   Saved (full page): ${userMenuPath}`);
  }
  
  // Check for user menu elements
  const userName = await page.locator(".user-nav .chip, header .chip").textContent().catch(() => null);
  const signOutBtn = await page.locator("button:has-text('Sign out')").count() > 0;
  
  findings.push({
    category: "User Menu",
    screenshot: userMenuPath,
    userName,
    hasSignOut: signOutBtn,
    issues: []
  });
  
  // === SCREENSHOT 3: Admin Users Page ===
  console.log("\n📸 Capturing: Admin Users Page");
  await page.goto(`${BASE_URL}/admin/users`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  
  const adminUsersPath = `${OUTPUT_DIR}/03-admin-users-page.png`;
  await page.screenshot({ path: adminUsersPath, fullPage: true });
  console.log(`   Saved: ${adminUsersPath}`);
  
  // Analyze page content
  const pageTitle = await page.locator("h1").textContent().catch(() => "");
  
  // Check for breadcrumb
  const breadcrumb = await page.locator(".breadcrumb, [aria-label*='breadcrumb']").count();
  
  // Check header actions
  const headerActions = await page.locator(".header-actions button").all();
  const headerActionTexts = [];
  for (const btn of headerActions) {
    const text = await btn.textContent().catch(() => "");
    headerActionTexts.push(text.trim());
  }
  
  // Check for link to org settings
  const hasOrgSettingsLink = await page.locator("a:has-text('Organization Settings'), button:has-text('Organization Settings')").count() > 0;
  
  findings.push({
    category: "Admin Users Page",
    screenshot: adminUsersPath,
    pageTitle,
    hasBreadcrumb: breadcrumb > 0,
    headerActions: headerActionTexts,
    hasOrgSettingsLink,
    currentUrl: page.url(),
    issues: []
  });
  
  // === SCREENSHOT 4: Organization Settings Page ===
  console.log("\n📸 Capturing: Organization Settings Page");
  await page.goto(`${BASE_URL}/settings/organization`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  
  const orgSettingsPath = `${OUTPUT_DIR}/04-org-settings-page.png`;
  await page.screenshot({ path: orgSettingsPath, fullPage: true });
  console.log(`   Saved: ${orgSettingsPath}`);
  
  // Analyze page content
  const settingsTitle = await page.locator("h1").textContent().catch(() => "");
  
  // Check for tabs
  const tabs = await page.locator("[role='tab'], .tab, button[class*='tab']").all();
  const tabTexts = [];
  for (const tab of tabs) {
    const text = await tab.textContent().catch(() => "");
    if (text.trim()) tabTexts.push(text.trim());
  }
  
  // Check for settings sections
  const sections = await page.locator(".settings-section h2, section h2").all();
  const sectionTitles = [];
  for (const section of sections) {
    const text = await section.textContent().catch(() => "");
    if (text.trim()) sectionTitles.push(text.trim());
  }
  
  // Check for save button
  const hasSaveButton = await page.locator("button:has-text('Save'), button[type='submit']").count() > 0;
  
  // Check for link back to user management
  const hasUserMgmtLink = await page.locator("a:has-text('User Management'), button:has-text('User Management')").count() > 0;
  
  findings.push({
    category: "Organization Settings",
    screenshot: orgSettingsPath,
    pageTitle: settingsTitle,
    tabs: tabTexts,
    sections: sectionTitles,
    hasSaveButton,
    hasUserMgmtLink,
    currentUrl: page.url(),
    issues: []
  });
  
  // === SCREENSHOT 5: Mobile View (Navigation) ===
  console.log("\n📸 Capturing: Mobile Navigation View");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/documents`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  
  const mobileNavPath = `${OUTPUT_DIR}/05-mobile-navigation.png`;
  await page.screenshot({ path: mobileNavPath, fullPage: false });
  console.log(`   Saved: ${mobileNavPath}`);
  
  // Check for mobile menu button
  const hasMobileMenu = await page.locator("button[aria-label*='menu'], .mobile-menu-btn, .hamburger").count() > 0;
  
  findings.push({
    category: "Mobile Navigation",
    screenshot: mobileNavPath,
    hasMobileMenu,
    issues: []
  });
  
  // === SCREENSHOT 6: Settings Tab Navigation ===
  console.log("\n📸 Capturing: Settings Tab Navigation");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/settings/organization`);
  await page.waitForLoadState("networkidle");
  
  // Click through each tab
  const tabLabels = ["Security", "Statistics"];
  for (const tabLabel of tabLabels) {
    const tabButton = page.locator(`button:has-text("${tabLabel}"), [data-tab]`).first();
    if (await tabButton.isVisible().catch(() => false)) {
      await tabButton.click();
      await page.waitForTimeout(400);
      
      const tabPath = `${OUTPUT_DIR}/06-settings-tab-${tabLabel.toLowerCase()}.png`;
      await page.screenshot({ path: tabPath, fullPage: false });
      console.log(`   Saved: ${tabPath}`);
    }
  }
  
  await browser.close();
  
  // Generate findings report
  console.log("\n" + "=".repeat(60));
  console.log("UX REVIEW FINDINGS SUMMARY");
  console.log("=".repeat(60));
  
  for (const finding of findings) {
    console.log(`\n📁 ${finding.category}`);
    console.log(`   Screenshot: ${finding.screenshot}`);
    console.log(`   URL: ${finding.currentUrl || "N/A"}`);
    if (finding.navItems && finding.navItems.length > 0) {
      console.log(`   Nav Items: ${finding.navItems.map(i => i.text).join(", ")}`);
    }
    if (finding.headerActions && finding.headerActions.length > 0) {
      console.log(`   Header Actions: ${finding.headerActions.join(", ")}`);
    }
    if (finding.tabs && finding.tabs.length > 0) {
      console.log(`   Tabs: ${finding.tabs.join(", ")}`);
    }
    if (finding.sections && finding.sections.length > 0) {
      console.log(`   Sections: ${finding.sections.join(", ")}`);
    }
    if (finding.pageTitle) {
      console.log(`   Page Title: ${finding.pageTitle}`);
    }
    if (finding.userName) {
      console.log(`   User Name Display: ${finding.userName}`);
    }
    console.log(`   Header Exists: ${finding.headerExists || false}`);
    console.log(`   User Nav Exists: ${finding.userNavExists || false}`);
    console.log(`   Has Breadcrumb: ${finding.hasBreadcrumb || false}`);
    console.log(`   Has Save Button: ${finding.hasSaveButton || false}`);
    console.log(`   Has Org Settings Link: ${finding.hasOrgSettingsLink || false}`);
    console.log(`   Has User Mgmt Link: ${finding.hasUserMgmtLink || false}`);
  }
  
  return findings;
}

captureScreenshots()
  .then(findings => {
    console.log("\n✅ Screenshot capture complete");
    console.log(`\n📂 Output directory: ${OUTPUT_DIR}/`);
    process.exit(0);
  })
  .catch(err => {
    console.error("\n❌ Error:", err);
    process.exit(1);
  });
