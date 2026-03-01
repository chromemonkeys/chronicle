const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = 'ux-review-screenshots/user-management';

// Ensure directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    // Navigate to sign-in and use demo mode
    await page.goto('http://localhost:5173/sign-in');
    await page.waitForSelector('button:has-text("demo mode")', { timeout: 5000 });
    
    // Click demo mode button
    await page.click('button:has-text("demo mode")');
    await page.waitForTimeout(300);
    
    // Enter a name in the demo mode input
    await page.fill('input#demo-name', 'UX Reviewer');
    
    // Click the Sign in button (not submit - it's a button onClick handler)
    const signInBtn = await page.locator('div.demo-mode button').first();
    await signInBtn.click();
    
    // Wait for navigation to documents
    await page.waitForURL(/\/documents/, { timeout: 5000 });
    await page.waitForTimeout(500);
    
    // Navigate to user management
    await page.goto('http://localhost:5173/admin/users');
    await page.waitForTimeout(1500);

    // Screenshot 1: Initial user directory page
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, '01-user-directory-initial.png'),
      fullPage: true 
    });
    console.log('✓ Captured: 01-user-directory-initial.png');

    // Wait for the invite button and click it
    const inviteButton = await page.locator('button:has-text("Invite Users")').first();
    if (await inviteButton.isVisible().catch(() => false)) {
      await inviteButton.click();
      await page.waitForTimeout(500);

      // Screenshot 2: Invite modal open
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '02-invite-modal-open.png'),
        fullPage: true 
      });
      console.log('✓ Captured: 02-invite-modal-open.png');

      // Click submit to trigger validation
      const submitButton = await page.locator('button[type="submit"]').first();
      if (await submitButton.isVisible().catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(500);

        // Screenshot 3: Form validation errors
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '03-form-validation-errors.png'),
          fullPage: true 
        });
        console.log('✓ Captured: 03-form-validation-errors.png');
      }

      // Fill in the email field
      const emailInput = await page.locator('textarea').first();
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill('newuser@example.com');
        await page.waitForTimeout(300);

        // Screenshot 4: Role selector visible
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '04-role-selector-visible.png'),
          fullPage: true 
        });
        console.log('✓ Captured: 04-role-selector-visible.png');
      }

      // Check role dropdown
      const roleSelect = await page.locator('select').first();
      if (await roleSelect.isVisible().catch(() => false)) {
        await roleSelect.click();
        await page.waitForTimeout(300);

        // Screenshot 5: Role dropdown expanded
        await page.screenshot({ 
          path: path.join(SCREENSHOTS_DIR, '05-role-dropdown-expanded.png'),
          fullPage: true 
        });
        console.log('✓ Captured: 05-role-dropdown-expanded.png');
      }
    }

    // Close modal and test search
    const cancelButton = await page.locator('button:has-text("Cancel")').first();
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
      await page.waitForTimeout(300);
    }

    // Test search input
    const searchInput = await page.locator('input[type="text"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test search query');
      await page.waitForTimeout(1000); // Wait to see if there's debounce

      // Screenshot 6: Search interaction
      await page.screenshot({ 
        path: path.join(SCREENSHOTS_DIR, '06-search-interaction.png'),
        fullPage: true 
      });
      console.log('✓ Captured: 06-search-interaction.png');
    }

    console.log('\n✅ All screenshots captured successfully!');
    console.log(`📁 Location: ${SCREENSHOTS_DIR}/`);

  } catch (error) {
    console.error('Error capturing screenshots:', error);
    // Capture error state
    await page.screenshot({ 
      path: path.join(SCREENSHOTS_DIR, 'error-state.png'),
      fullPage: true 
    });
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
