#!/usr/bin/env node
/**
 * Script to take a screenshot of the thread anchoring in the UI
 */

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to the app
  await page.goto('http://127.0.0.1:43173');
  
  // Wait for sign in page
  await page.waitForSelector('text=Sign in to Chronicle');
  
  // Sign in
  await page.fill('input[placeholder="Your name"]', 'Test User');
  await page.click('button:has-text("Sign in")');
  
  // Wait for documents list and navigate to workspace
  await page.waitForSelector('text=All Documents');
  await page.click('text=ADR-142: Event Retention Model');
  
  // Wait for workspace to load
  await page.waitForSelector('.cm-thread-card');
  
  // Take screenshot of the thread list
  await page.screenshot({ 
    path: 'test-results/thread-anchors-before.png',
    clip: { x: 900, y: 100, width: 400, height: 600 }
  });
  
  console.log('Screenshot saved to test-results/thread-anchors-before.png');
  console.log('Thread anchors shown in UI:');
  
  // Get all thread anchor texts
  const anchors = await page.$$eval('.cm-thread-anchor', elements => 
    elements.map(el => el.textContent)
  );
  
  anchors.forEach((anchor, i) => {
    console.log(`  Thread ${i + 1}: ${anchor}`);
  });
  
  await browser.close();
})();
