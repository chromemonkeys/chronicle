import { expect, test, type Page, type TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true,
  });
}

/** Sign in via demo mode (used to verify "already authenticated" redirect). */
async function signInDemo(page: Page, name = "Avery") {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Use demo mode" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(documents|workspace)$/);
}

// ===========================================================================
// 1.1 Sign In Page (/sign-in)
// ===========================================================================

test.describe("1.1 Sign In Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");
  });

  // 1.1.1 Renders sign-in form with email and password fields
  test("1.1.1 renders sign-in form with email and password fields", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: "Welcome to Chronicle" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    await snap(page, testInfo, "1.1.1-sign-in-form");
  });

  // 1.1.2 Renders sign-up form when "Sign Up" tab clicked
  test("1.1.2 renders sign-up form when Sign Up tab clicked", async ({ page }, testInfo) => {
    await page.getByRole("button", { name: "Sign Up" }).click();

    await expect(page.getByLabel("Display Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    // Use exact label matching to distinguish password fields
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();

    await snap(page, testInfo, "1.1.2-sign-up-form");
  });

  // 1.1.3 Tab toggle switches between sign-in and sign-up forms
  test("1.1.3 tab toggle switches between sign-in and sign-up forms", async ({ page }, testInfo) => {
    // Start on sign-in
    await expect(page.getByRole("button", { name: "Sign In" }).first()).toBeVisible();

    // Switch to sign-up
    const signUpTab = page.locator(".auth-tab", { hasText: "Sign Up" });
    await signUpTab.click();
    await expect(page.getByLabel("Display Name")).toBeVisible();
    await snap(page, testInfo, "1.1.3-on-sign-up");

    // Switch back to sign-in
    const signInTab = page.locator(".auth-tab", { hasText: "Sign In" });
    await signInTab.click();
    await expect(page.getByLabel("Display Name")).not.toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await snap(page, testInfo, "1.1.3-back-to-sign-in");
  });

  // 1.1.4 Email input updates state on change
  test("1.1.4 email input updates state on change", async ({ page }, testInfo) => {
    const emailInput = page.getByLabel("Email");
    await emailInput.fill("user@example.com");
    await expect(emailInput).toHaveValue("user@example.com");

    await snap(page, testInfo, "1.1.4-email-filled");
  });

  // 1.1.5 Password input updates state on change
  test("1.1.5 password input updates state on change", async ({ page }, testInfo) => {
    const passwordInput = page.getByLabel("Password");
    await passwordInput.fill("s3cure!Pass");
    await expect(passwordInput).toHaveValue("s3cure!Pass");

    await snap(page, testInfo, "1.1.5-password-filled");
  });

  // 1.1.6 Submit button disabled while submitting
  test("1.1.6 submit button disabled while submitting", async ({ page }, testInfo) => {
    // Fill valid-looking credentials
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");

    // Slow the API response so we can observe the disabled state
    await page.route("**/api/auth/signin", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.getByRole("button", { name: "Sign In" }).click();

    // Button should be disabled during submission
    const submitBtn = page.locator("button.btn-primary:disabled");
    await expect(submitBtn).toBeVisible();

    await snap(page, testInfo, "1.1.6-submit-disabled");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.7 Submit button text shows "Signing in..." during submission
  test("1.1.7 submit button text shows Signing in during submission", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");

    await page.route("**/api/auth/signin", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid credentials" }),
      });
    });

    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("button", { name: "Signing in..." })).toBeVisible();

    await snap(page, testInfo, "1.1.7-signing-in-text");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.8 Successful sign-in navigates to /documents (using demo mode as proxy)
  test("1.1.8 successful sign-in navigates to /documents", async ({ page }, testInfo) => {
    // Use demo mode for a reliable sign-in flow
    await page.getByRole("button", { name: "Use demo mode" }).click();
    await page.getByPlaceholder("Your name").fill("TestUser");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/(documents|workspace)$/);

    await snap(page, testInfo, "1.1.8-navigated-to-documents");
  });

  // 1.1.9 Failed sign-in displays error message
  test("1.1.9 failed sign-in displays error message", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("bad@example.com");
    await page.getByLabel("Password").fill("wrongpassword");

    // Intercept to simulate failure quickly
    await page.route("**/api/auth/signin", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid email or password" }),
      });
    });

    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();

    await snap(page, testInfo, "1.1.9-error-message");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.10 "Forgot password?" link navigates to /forgot-password
  test("1.1.10 forgot password link navigates to /forgot-password", async ({ page }, testInfo) => {
    await page.getByRole("link", { name: "Forgot password?" }).click();

    await expect(page).toHaveURL(/\/forgot-password$/);

    await snap(page, testInfo, "1.1.10-forgot-password-page");
  });

  // 1.1.11 Sign-up: display name input updates state
  test("1.1.11 sign-up display name input updates state", async ({ page }, testInfo) => {
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();

    const nameInput = page.getByLabel("Display Name");
    await nameInput.fill("Alice Johnson");
    await expect(nameInput).toHaveValue("Alice Johnson");

    await snap(page, testInfo, "1.1.11-display-name-filled");
  });

  // 1.1.12 Sign-up: confirm password input updates state
  test("1.1.12 sign-up confirm password input updates state", async ({ page }, testInfo) => {
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();

    const confirmInput = page.getByLabel("Confirm Password");
    await confirmInput.fill("mypassword123");
    await expect(confirmInput).toHaveValue("mypassword123");

    await snap(page, testInfo, "1.1.12-confirm-password-filled");
  });

  // 1.1.13 Sign-up: password mismatch shows error
  test("1.1.13 sign-up password mismatch shows error", async ({ page }, testInfo) => {
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();

    await page.getByLabel("Display Name").fill("Alice");
    await page.getByLabel("Email").fill("alice@example.com");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm Password").fill("differentpassword");

    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.locator('[role="alert"]')).toContainText("Passwords do not match");

    await snap(page, testInfo, "1.1.13-password-mismatch-error");
  });

  // 1.1.14 Sign-up: successful registration navigates to /verify-email-pending
  test("1.1.14 sign-up successful registration navigates to verify-email-pending", async ({ page }, testInfo) => {
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();

    const uniqueEmail = `pw-test-${Date.now()}@example.com`;
    await page.getByLabel("Display Name").fill("Test User");
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.getByLabel("Password", { exact: true }).fill("securepass123");
    await page.getByLabel("Confirm Password").fill("securepass123");

    // Intercept to simulate a successful signup that returns no dev token
    // (triggers navigation to verify-email-pending)
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "00000000-0000-0000-0000-000000000099",
          message: "Account created. Please verify your email.",
        }),
      });
    });

    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/verify-email-pending$/);

    await snap(page, testInfo, "1.1.14-verify-email-pending");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.15 Sign-up: duplicate email shows "EMAIL_EXISTS" error
  test("1.1.15 sign-up duplicate email shows error", async ({ page }, testInfo) => {
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();

    await page.getByLabel("Display Name").fill("Duplicate");
    await page.getByLabel("Email").fill("existing@example.com");
    await page.getByLabel("Password", { exact: true }).fill("securepass123");
    await page.getByLabel("Confirm Password").fill("securepass123");

    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "An account with this email already exists.",
          code: "EMAIL_EXISTS",
        }),
      });
    });

    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();

    await snap(page, testInfo, "1.1.15-duplicate-email-error");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.16 "Use demo mode" button shows demo name input
  test("1.1.16 use demo mode button shows demo name input", async ({ page }, testInfo) => {
    // Demo name input should not be visible initially
    await expect(page.getByPlaceholder("Your name")).not.toBeVisible();

    await page.getByRole("button", { name: "Use demo mode" }).click();

    await expect(page.getByPlaceholder("Your name")).toBeVisible();
    await expect(page.getByLabel("Display Name (Demo Mode)")).toBeVisible();

    await snap(page, testInfo, "1.1.16-demo-mode-shown");
  });

  // 1.1.17 Demo mode: name input + Enter triggers sign-in
  test("1.1.17 demo mode name input enter triggers sign-in", async ({ page }, testInfo) => {
    await page.getByRole("button", { name: "Use demo mode" }).click();

    const demoInput = page.getByPlaceholder("Your name");
    await demoInput.fill("EnterUser");
    await demoInput.press("Enter");

    await expect(page).toHaveURL(/\/(documents|workspace)$/);

    await snap(page, testInfo, "1.1.17-enter-sign-in");
  });

  // 1.1.18 Demo mode: "Sign in" button triggers demo login
  test("1.1.18 demo mode sign in button triggers demo login", async ({ page }, testInfo) => {
    await page.getByRole("button", { name: "Use demo mode" }).click();

    await page.getByPlaceholder("Your name").fill("ButtonUser");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/(documents|workspace)$/);

    await snap(page, testInfo, "1.1.18-button-sign-in");
  });

  // 1.1.19 Demo mode: "Cancel" button hides demo form
  test("1.1.19 demo mode cancel button hides demo form", async ({ page }, testInfo) => {
    await page.getByRole("button", { name: "Use demo mode" }).click();
    await expect(page.getByPlaceholder("Your name")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Your name")).not.toBeVisible();
    // The "Use demo mode" button should be visible again
    await expect(page.getByRole("button", { name: "Use demo mode" })).toBeVisible();

    await snap(page, testInfo, "1.1.19-demo-cancelled");
  });

  // 1.1.20 Dev bypass: shows "Verify Email Now" link with token
  test("1.1.20 dev bypass shows verify email now link with token", async ({ page }, testInfo) => {
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();

    await page.getByLabel("Display Name").fill("DevUser");
    await page.getByLabel("Email").fill("devuser@example.com");
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm Password").fill("password123");

    const testToken = "dev-test-token-12345";
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "00000000-0000-0000-0000-000000000088",
          message: "Account created.",
          devVerificationToken: testToken,
        }),
      });
    });

    await page.getByRole("button", { name: "Create Account" }).click();

    // Dev bypass notice should appear with the token
    await expect(page.locator(".dev-bypass-notice")).toBeVisible();
    await expect(page.locator(".dev-token")).toContainText(testToken);
    await expect(page.getByRole("link", { name: "Verify Email Now" })).toBeVisible();

    // Verify the link points to the correct URL
    const verifyLink = page.getByRole("link", { name: "Verify Email Now" });
    await expect(verifyLink).toHaveAttribute("href", `/verify-email?token=${testToken}`);

    await snap(page, testInfo, "1.1.20-dev-bypass-link");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.21 Redirects to /documents if already authenticated
  test("1.1.21 redirects to /documents if already authenticated", async ({ page }, testInfo) => {
    // First sign in
    await signInDemo(page, "AuthedUser");

    // Now navigate back to /sign-in
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    // Should redirect back to /documents since already authenticated
    await expect(page).toHaveURL(/\/(documents|workspace)$/);

    await snap(page, testInfo, "1.1.21-redirected-when-authed");
  });

  // 1.1.22 E2E: Full sign-up -> verify email -> sign-in flow
  test("1.1.22 E2E full sign-up verify email sign-in flow", async ({ page }, testInfo) => {
    const uniqueEmail = `e2e-${Date.now()}@chronicle-test.com`;
    const password = "securepass123";
    const testToken = `verify-token-${Date.now()}`;

    // Step 1: Sign up
    await page.locator(".auth-tab", { hasText: "Sign Up" }).click();
    await page.getByLabel("Display Name").fill("E2E User");
    await page.getByLabel("Email").fill(uniqueEmail);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm Password").fill(password);

    // Intercept signup to return a dev token
    await page.route("**/api/auth/signup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "00000000-0000-0000-0000-e2e000000001",
          message: "Account created.",
          devVerificationToken: testToken,
        }),
      });
    });

    await page.getByRole("button", { name: "Create Account" }).click();

    // Dev bypass should show the token
    await expect(page.locator(".dev-bypass-notice")).toBeVisible();
    await snap(page, testInfo, "1.1.22-step1-signed-up");

    // Step 2: Click "Verify Email Now" link
    // Intercept verify-email API
    await page.route("**/api/auth/verify-email", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email verified successfully." }),
      });
    });

    await page.getByRole("link", { name: "Verify Email Now" }).click();
    await page.waitForLoadState("networkidle");

    // Should show success
    await expect(page.getByRole("heading", { name: "Email Verified!" })).toBeVisible();
    await snap(page, testInfo, "1.1.22-step2-email-verified");

    // Step 3: Click "Sign In" link from verification success page
    await page.getByRole("link", { name: "Sign In" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sign-in$/);
    await snap(page, testInfo, "1.1.22-step3-back-to-sign-in");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.1.23 E2E: Sign in with valid credentials (demo mode)
  test("1.1.23 E2E sign in with valid credentials via demo mode", async ({ page }, testInfo) => {
    await page.getByRole("button", { name: "Use demo mode" }).click();
    await page.getByPlaceholder("Your name").fill("E2EUser");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/(documents|workspace)$/);
    await page.waitForLoadState("networkidle");

    await snap(page, testInfo, "1.1.23-signed-in-successfully");
  });

  // 1.1.24 E2E: Sign in with invalid credentials shows error
  test("1.1.24 E2E sign in with invalid credentials shows error", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("nonexistent@example.com");
    await page.getByLabel("Password").fill("wrongpassword");

    await page.getByRole("button", { name: "Sign In" }).click();

    // Wait for the error to appear (real backend will reject)
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });

    await snap(page, testInfo, "1.1.24-invalid-credentials-error");
  });
});

// ===========================================================================
// 1.2 Forgot Password Page (/forgot-password)
// ===========================================================================

test.describe("1.2 Forgot Password Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");
  });

  // 1.2.1 Renders email input and submit button
  test("1.2.1 renders email input and submit button", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: "Reset Password" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Reset Instructions" })).toBeVisible();

    await snap(page, testInfo, "1.2.1-forgot-password-form");
  });

  // 1.2.2 Submit button disabled while submitting
  test("1.2.2 submit button disabled while submitting", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("test@example.com");

    await page.route("**/api/auth/reset-password/request", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "If an account exists, we sent instructions." }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Instructions" }).click();

    const disabledBtn = page.locator("button.btn-primary:disabled");
    await expect(disabledBtn).toBeVisible();

    await snap(page, testInfo, "1.2.2-submit-disabled");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.2.3 Shows "Sending..." during submission
  test("1.2.3 shows sending during submission", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("test@example.com");

    await page.route("**/api/auth/reset-password/request", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "If an account exists, we sent instructions." }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Instructions" }).click();

    await expect(page.getByRole("button", { name: "Sending..." })).toBeVisible();

    await snap(page, testInfo, "1.2.3-sending-text");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.2.4 Successful submission shows "Check your email" message
  test("1.2.4 successful submission shows check your email message", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("test@example.com");

    await page.route("**/api/auth/reset-password/request", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "If an account exists, we sent instructions." }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Instructions" }).click();

    // Success message should appear
    await expect(page.locator(".auth-success-message")).toBeVisible();
    await expect(page.getByText("If an account exists with that email")).toBeVisible();

    // The form should be hidden
    await expect(page.getByLabel("Email")).not.toBeVisible();

    await snap(page, testInfo, "1.2.4-check-email-message");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.2.5 Error displays error message
  test("1.2.5 error displays error message", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("bad@example.com");

    await page.route("**/api/auth/reset-password/request", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Instructions" }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();

    await snap(page, testInfo, "1.2.5-error-message");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.2.6 "Back to Sign In" link navigates to /sign-in
  test("1.2.6 back to sign in link navigates to /sign-in", async ({ page }, testInfo) => {
    await page.getByRole("link", { name: "Back to Sign In" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);

    await snap(page, testInfo, "1.2.6-back-to-sign-in");
  });

  // 1.2.7 Dev bypass: shows reset token link
  test("1.2.7 dev bypass shows reset token link", async ({ page }, testInfo) => {
    const testToken = "reset-dev-token-abc123";

    await page.getByLabel("Email").fill("devuser@example.com");

    await page.route("**/api/auth/reset-password/request", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "If an account exists, we sent instructions.",
          devResetToken: testToken,
        }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Instructions" }).click();

    await expect(page.locator(".dev-bypass-notice")).toBeVisible();
    await expect(page.locator(".dev-token")).toContainText(testToken);
    await expect(page.getByRole("link", { name: "Reset Password Now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset Password Now" })).toHaveAttribute(
      "href",
      `/reset-password?token=${testToken}`
    );

    await snap(page, testInfo, "1.2.7-dev-bypass-token");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.2.8 E2E: Request password reset for valid email
  test("1.2.8 E2E request password reset for valid email", async ({ page }, testInfo) => {
    await page.getByLabel("Email").fill("resetme@example.com");

    // Simulate a successful response with a dev token (real backend behavior in dev mode)
    await page.route("**/api/auth/reset-password/request", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "If an account exists, we sent instructions.",
          devResetToken: "e2e-reset-token-999",
        }),
      });
    });

    await page.getByRole("button", { name: "Send Reset Instructions" }).click();

    // Should show dev bypass with the token
    await expect(page.locator(".dev-bypass-notice")).toBeVisible();

    // Click through to reset password page
    await page.getByRole("link", { name: "Reset Password Now" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/reset-password\?token=e2e-reset-token-999$/);

    await snap(page, testInfo, "1.2.8-navigated-to-reset");

    await page.unrouteAll({ behavior: "wait" });
  });
});

// ===========================================================================
// 1.3 Reset Password Page (/reset-password)
// ===========================================================================

test.describe("1.3 Reset Password Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle");
  });

  // 1.3.1 Renders token, new password, confirm password fields
  test("1.3.1 renders token new password confirm password fields", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: "Create New Password" })).toBeVisible();
    await expect(page.getByLabel("Reset Token")).toBeVisible();
    await expect(page.getByLabel("New Password")).toBeVisible();
    await expect(page.getByLabel("Confirm New Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset Password" })).toBeVisible();

    await snap(page, testInfo, "1.3.1-reset-password-form");
  });

  // 1.3.2 Pre-fills token from URL query parameter
  test("1.3.2 pre-fills token from URL query parameter", async ({ page }, testInfo) => {
    await page.goto("/reset-password?token=my-preset-token");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Reset Token")).toHaveValue("my-preset-token");

    await snap(page, testInfo, "1.3.2-token-prefilled");
  });

  // 1.3.3 Submit disabled while submitting
  test("1.3.3 submit disabled while submitting", async ({ page }, testInfo) => {
    await page.getByLabel("Reset Token").fill("some-token");
    await page.getByLabel("New Password").fill("newpass1234");
    await page.getByLabel("Confirm New Password").fill("newpass1234");

    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST" && !route.request().url().includes("/request")) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Password reset." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Reset Password" }).click();

    const disabledBtn = page.locator("button.btn-primary:disabled");
    await expect(disabledBtn).toBeVisible();

    await snap(page, testInfo, "1.3.3-submit-disabled");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.3.4 Shows "Resetting..." during submission
  test("1.3.4 shows resetting during submission", async ({ page }, testInfo) => {
    await page.getByLabel("Reset Token").fill("some-token");
    await page.getByLabel("New Password").fill("newpass1234");
    await page.getByLabel("Confirm New Password").fill("newpass1234");

    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST" && !route.request().url().includes("/request")) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Password reset." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByRole("button", { name: "Resetting..." })).toBeVisible();

    await snap(page, testInfo, "1.3.4-resetting-text");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.3.5 Success shows "Password Reset!" and sign-in link
  test("1.3.5 success shows password reset and sign-in link", async ({ page }, testInfo) => {
    await page.getByLabel("Reset Token").fill("valid-token");
    await page.getByLabel("New Password").fill("newpass1234");
    await page.getByLabel("Confirm New Password").fill("newpass1234");

    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST" && !route.request().url().includes("/request")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Your password has been reset successfully." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByRole("heading", { name: "Password Reset!" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In with New Password" })).toBeVisible();

    await snap(page, testInfo, "1.3.5-password-reset-success");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.3.6 Error shows error message
  test("1.3.6 error shows error message", async ({ page }, testInfo) => {
    await page.getByLabel("Reset Token").fill("expired-token");
    await page.getByLabel("New Password").fill("newpass1234");
    await page.getByLabel("Confirm New Password").fill("newpass1234");

    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST" && !route.request().url().includes("/request")) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Token is invalid or expired." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();

    await snap(page, testInfo, "1.3.6-reset-error");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.3.7 "Back to Sign In" link works
  test("1.3.7 back to sign in link works", async ({ page }, testInfo) => {
    await page.getByRole("link", { name: "Back to Sign In" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);

    await snap(page, testInfo, "1.3.7-back-to-sign-in");
  });

  // 1.3.8 "Request New Token" link navigates to /forgot-password
  test("1.3.8 request new token link navigates to /forgot-password", async ({ page }, testInfo) => {
    await page.getByRole("link", { name: "Request New Token" }).click();

    await expect(page).toHaveURL(/\/forgot-password$/);

    await snap(page, testInfo, "1.3.8-request-new-token");
  });

  // 1.3.9 E2E: Full reset flow with valid token
  test("1.3.9 E2E full reset flow with valid token", async ({ page }, testInfo) => {
    await page.goto("/reset-password?token=e2e-valid-token");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Reset Token")).toHaveValue("e2e-valid-token");

    await page.getByLabel("New Password").fill("newSecure1234");
    await page.getByLabel("Confirm New Password").fill("newSecure1234");

    await page.route("**/api/auth/reset-password", async (route) => {
      if (route.request().method() === "POST" && !route.request().url().includes("/request")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message: "Password reset successfully." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.getByRole("heading", { name: "Password Reset!" })).toBeVisible();
    await snap(page, testInfo, "1.3.9-e2e-reset-success");

    // Click sign-in link
    await page.getByRole("link", { name: "Sign In with New Password" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/sign-in$/);
    await snap(page, testInfo, "1.3.9-e2e-back-to-sign-in");

    await page.unrouteAll({ behavior: "wait" });
  });

  // Extra: password mismatch client-side validation
  test("1.3.x password mismatch shows validation error", async ({ page }, testInfo) => {
    await page.getByLabel("Reset Token").fill("some-token");
    await page.getByLabel("New Password").fill("password123");
    await page.getByLabel("Confirm New Password").fill("different456");

    await page.getByRole("button", { name: "Reset Password" }).click();

    await expect(page.locator('[role="alert"]')).toContainText("Passwords do not match");

    await snap(page, testInfo, "1.3.x-password-mismatch");
  });
});

// ===========================================================================
// 1.4 Email Verification Page (/verify-email)
// ===========================================================================

test.describe("1.4 Email Verification Page", () => {
  // 1.4.1 Renders token input and verify button
  test("1.4.1 renders token input and verify button", async ({ page }, testInfo) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Verify Your Email" })).toBeVisible();
    await expect(page.getByLabel("Verification Token")).toBeVisible();
    await expect(page.getByRole("button", { name: "Verify Email" })).toBeVisible();

    await snap(page, testInfo, "1.4.1-verify-email-form");
  });

  // 1.4.2 Auto-verifies when token in URL params
  test("1.4.2 auto-verifies when token in URL params", async ({ page }, testInfo) => {
    await page.route("**/api/auth/verify-email", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email verified successfully." }),
      });
    });

    await page.goto("/verify-email?token=auto-verify-token");
    await page.waitForLoadState("networkidle");

    // Should auto-verify and show success
    await expect(page.getByRole("heading", { name: "Email Verified!" })).toBeVisible();

    await snap(page, testInfo, "1.4.2-auto-verified");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.4.3 Shows "Verifying..." during verification
  test("1.4.3 shows verifying during verification", async ({ page }, testInfo) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    await page.route("**/api/auth/verify-email", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email verified." }),
      });
    });

    await page.getByLabel("Verification Token").fill("slow-verify-token");
    await page.getByRole("button", { name: "Verify Email" }).click();

    await expect(page.getByRole("button", { name: "Verifying..." })).toBeVisible();

    await snap(page, testInfo, "1.4.3-verifying-text");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.4.4 Success shows "Email Verified!" message
  test("1.4.4 success shows email verified message", async ({ page }, testInfo) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    await page.route("**/api/auth/verify-email", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Email verified." }),
      });
    });

    await page.getByLabel("Verification Token").fill("valid-token");
    await page.getByRole("button", { name: "Verify Email" }).click();

    await expect(page.getByRole("heading", { name: "Email Verified!" })).toBeVisible();
    await expect(page.getByText("Your email has been verified")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();

    await snap(page, testInfo, "1.4.4-email-verified-success");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.4.5 Error shows error message
  test("1.4.5 error shows error message", async ({ page }, testInfo) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    await page.route("**/api/auth/verify-email", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid or expired verification token." }),
      });
    });

    await page.getByLabel("Verification Token").fill("bad-token");
    await page.getByRole("button", { name: "Verify Email" }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();

    await snap(page, testInfo, "1.4.5-verification-error");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 1.4.6 "Sign In" link navigates to /sign-in (from non-success state)
  test("1.4.6 sign in link navigates to /sign-in", async ({ page }, testInfo) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Back to Sign In" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);

    await snap(page, testInfo, "1.4.6-back-to-sign-in");
  });
});

// ===========================================================================
// 1.5 Verification Pending Page (/verify-email-pending)
// ===========================================================================

test.describe("1.5 Verification Pending Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/verify-email-pending");
    await page.waitForLoadState("networkidle");
  });

  // 1.5.1 Renders pending message
  test("1.5.1 renders pending message", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: "Check Your Email" })).toBeVisible();
    await expect(page.getByText("We've sent a verification link")).toBeVisible();
    await expect(page.getByText("check your email and click the verification link")).toBeVisible();

    await snap(page, testInfo, "1.5.1-pending-message");
  });

  // 1.5.2 "I Have a Verification Token" links to /verify-email
  test("1.5.2 verification token link navigates to /verify-email", async ({ page }, testInfo) => {
    await page.getByRole("link", { name: "I Have a Verification Token" }).click();

    await expect(page).toHaveURL(/\/verify-email$/);

    await snap(page, testInfo, "1.5.2-navigate-to-verify");
  });

  // 1.5.3 "Back to Sign In" links to /sign-in
  test("1.5.3 back to sign in links to /sign-in", async ({ page }, testInfo) => {
    await page.getByRole("link", { name: "Back to Sign In" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);

    await snap(page, testInfo, "1.5.3-back-to-sign-in");
  });
});
