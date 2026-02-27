import { expect, test, type Page } from "@playwright/test";
import { ChroniclePlaywrightAgent, createDefaultWorkspacePayload } from "./ChroniclePlaywrightAgent";

async function installAgent(page: Page, options?: ConstructorParameters<typeof ChroniclePlaywrightAgent>[1]) {
  const agent = new ChroniclePlaywrightAgent(page, options);
  await agent.install();
  return agent;
}

async function installAndSignIn(page: Page, options?: ConstructorParameters<typeof ChroniclePlaywrightAgent>[1]) {
  const agent = await installAgent(page, options);
  await agent.signIn("Avery");
  return agent;
}

async function gotoWithRetry(page: Page, path: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(150);
    }
  }
}

test.describe("Chronicle frontend Playwright coverage", () => {
  test("unauthenticated navigation redirects to sign-in", async ({ page }) => {
    await installAgent(page);

    await page.goto("/documents");

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Welcome to Chronicle" })).toBeVisible();
  });

  test("sign-in and documents list render from mocked API", async ({ page }) => {
    await installAndSignIn(page);

    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
    await expect(page.getByText("RFC: OAuth and Magic Link Session Flow")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open workspace" }).first()).toBeVisible();
  });

  test("create document action creates a draft workspace", async ({ page }) => {
    await installAndSignIn(page);

    const createRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await page.getByRole("button", { name: "Create document" }).first().click();
    await page.getByLabel("Document title").fill("Playwright Fresh ADR");
    await Promise.all([
      createRequest,
      page.locator(".inline-form").getByRole("button", { name: "Create document" }).click()
    ]);

    await expect(page).toHaveURL(/\/workspace\//);
    await expect(page.locator(".cm-doc-status")).toContainText("Draft");
    await expect(page.getByRole("button", { name: "Start Proposal" }).first()).toBeVisible();
    await expect(page.getByText("No active proposal discussion")).toBeVisible();
    await expect(
      page.locator(".cm-panel-fallback-card", { hasText: "No active proposal discussion" }).getByRole("button", { name: "Start Proposal" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Ready to merge" })).toHaveCount(0);
  });

  test("sign out returns user to sign-in page", async ({ page }) => {
    await installAndSignIn(page);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Welcome to Chronicle" })).toBeVisible();
  });

  test("unknown route renders not found page", async ({ page }) => {
    await installAgent(page);

    await gotoWithRetry(page, "/route-that-does-not-exist");

    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Return to documents|Go to Documents/i })).toBeVisible();
  });

  test("documents empty state is displayed", async ({ page }) => {
    await installAndSignIn(page, { documents: [] });

    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create document" }).first()).toBeVisible();
  });

  test("documents error state supports retry", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        documents: 2
      }
    });

    await expect(page.getByRole("heading", { name: "Could not load documents" })).toBeVisible();

    await page.getByRole("button", { name: /Retry|Try again/i }).click();

    await expect(page.getByRole("heading", { name: "All Documents" })).toBeVisible();
    await expect(page.getByText("RFC: OAuth and Magic Link Session Flow")).toBeVisible();
  });

  test("approvals queue reflects merge-gate blockers", async ({ page }) => {
    await installAndSignIn(page);

    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await expect(page.getByText("Current gate status")).toBeVisible();
    await expect(page.getByText("Needs your review")).toBeVisible();
    await expect(page.getByText("Awaiting 3 approvals")).toBeVisible();
    await expect(page.getByText("RFC: OAuth and Magic Link Session Flow")).toBeVisible();
    await expect(page.getByText("Blocked").first()).toBeVisible();

    await page.getByRole("link", { name: "Review next request" }).click();
    await expect(page).toHaveURL(/\/workspace\/rfc-auth$/);
  });

  test("approvals empty state is rendered", async ({ page }) => {
    await installAndSignIn(page, {
      approvals: {
        mergeGate: {
          security: "Approved",
          architectureCommittee: "Approved",
          legal: "Approved"
        },
        queue: []
      }
    });

    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "No pending approvals" })).toBeVisible();
  });

  test("approvals error state supports retry", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        approvals: 2
      }
    });

    await page.goto("/approvals");

    await expect(page.getByRole("heading", { name: "Approval queue unavailable" })).toBeVisible();

    await page.getByRole("button", { name: /Retry|Try again/i }).click();

    await expect(page.getByText("Current gate status")).toBeVisible();
  });

  test("approvals loading state shows delayed recovery guidance", async ({ page }) => {
    await installAndSignIn(page);

    await page.route("**/api/approvals", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mergeGate: {
            security: "Pending",
            architectureCommittee: "Pending",
            legal: "Pending"
          },
          queue: [
            {
              id: "rfc-auth",
              documentId: "rfc-auth",
              proposalId: "proposal-rfc-auth",
              title: "RFC: OAuth and Magic Link Session Flow",
              requestedBy: "Avery",
              status: "Blocked"
            }
          ]
        })
      });
    });

    await page.goto("/approvals");
    await expect(page.getByRole("heading", { name: "Loading approval queue..." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry loading" })).toBeVisible();
  });

  test("create space failure hides internal API route details", async ({ page }) => {
    await installAndSignIn(page);

    await page.route("**/api/spaces", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Unhandled mocked API route: POST /api/spaces"
        })
      });
    });

    await page.getByRole("button", { name: /\+ New space/i }).click();
    await page.getByPlaceholder("Space name").fill("Security");
    await page.locator(".space-sidebar-form").getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText("Could not create space. Please retry or cancel.")).toBeVisible();
    await expect(page.getByText(/\/api\/spaces/i)).toHaveCount(0);
  });

  test("workspace load error fallback appears when API fails", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        workspace: 2
      }
    });

    await page.goto("/workspace/rfc-auth");

    await expect(page.getByRole("heading", { name: "Workspace failed to load" })).toBeVisible();
  });

  test("workspace discussion and approval panel state toggles render expected fallback content", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();

    const discussionState = page.locator('[aria-label="Discussion panel state"]');
    await expect(discussionState).toBeVisible();
    await discussionState.getByRole("button", { name: "Empty" }).click();
    await expect(page.getByRole("heading", { name: "No open threads" })).toBeVisible();

    await discussionState.getByRole("button", { name: "Error" }).click();
    await expect(page.getByRole("heading", { name: "Thread feed unavailable" })).toBeVisible();
    await page.locator(".cm-panel-fallback-card").getByRole("button", { name: "Retry" }).click();
    await expect(page.locator(".cm-thread-card").first()).toBeVisible();

    await page.getByRole("tab", { name: "Required approvals" }).click();
    const approvalState = page.locator('[aria-label="Approvals panel state"]');
    await approvalState.getByRole("button", { name: "Empty" }).click();
    await expect(page.getByText("No pending approvers remain. Merge gate is clear.")).toBeVisible();

    await approvalState.getByRole("button", { name: "Error" }).click();
    await expect(page.getByText("Approval service request failed.")).toBeVisible();
    await page
      .locator(".cm-approval-fallback", { hasText: "Approval service request failed." })
      .getByRole("button", { name: "Retry" })
      .click();
    await expect(page.locator(".cm-approver-row", { hasText: "Security" })).toBeVisible();
  });

  test("review mode renders compare error fallback when compare API fails", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        compare: 1
      }
    });
    await page.goto("/workspace/rfc-auth");

    await page.getByLabel("Workspace mode").getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByText("Compare request failed.")).toBeVisible();
  });

  test("editor save persists across full page reload", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const marker = " Persisted after reload coverage.";
    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(marker);

    const saveRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/workspace/rfc-auth") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      saveRequest,
      page.getByRole("button", { name: "Save Draft" }).click()
    ]);
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor-wrapper .tiptap")).toContainText("Persisted after reload coverage.");
  });

  test("review mode compare flows render diff cards and history compare summary", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Compare side-by-side coverage.");
    await page.getByRole("button", { name: "Save Draft" }).click();

    await page.getByLabel("Workspace mode").getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.getByText("Review Diff vs Main")).toBeVisible();

    const compareRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/compare") &&
        response.request().method() === "GET" &&
        response.status() === 200
      );
    });

    await Promise.all([
      compareRequest,
      page.getByRole("button", { name: /Compare/ }).click()
    ]);
    await expect(page.locator(".cm-diff-split-panel").first()).toBeVisible();

    await page.getByRole("button", { name: /History/ }).click();
    await expect(page.locator(".cm-approval-fallback strong", { hasText: "Latest Compare" })).toBeVisible();
    await expect(
      page.locator(".cm-approval-fallback .cm-commit-meta", {
        hasText: /title:|subtitle:|purpose:|tiers:|enforce:|doc:/
      }).first()
    ).toBeVisible();

    await page.getByRole("button", { name: "Close Compare" }).click();
    await expect(page.locator(".cm-diff-split-panel")).toHaveCount(0);
  });

  test("history compare picker compares selected commits", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Compare picker coverage.");
    await page.getByRole("button", { name: "Save Draft" }).click();

    await page.getByRole("button", { name: /History/ }).click();
    await expect(page.getByLabel("Compare from commit")).toBeVisible();
    await expect(page.getByLabel("Compare to commit")).toBeVisible();

    const compareRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/compare") &&
        response.request().method() === "GET" &&
        response.status() === 200
      );
    });
    await Promise.all([
      compareRequest,
      page.getByRole("button", { name: "Compare Selected" }).click()
    ]);

    await expect(page.locator(".cm-diff-split-panel").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Close Compare" })).toBeVisible();
  });

  test("history commit row click compares selected version against current version", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Commit row click coverage.");
    await page.getByRole("button", { name: "Save Draft" }).click();

    await page.getByRole("button", { name: /History/ }).click();

    const compareRequest = page.waitForResponse((response) => {
      if (!response.url().includes("/api/documents/rfc-auth/compare") || response.request().method() !== "GET") {
        return false;
      }
      const url = new URL(response.url());
      return response.status() === 200 && url.searchParams.get("to") === "pw-0001";
    });

    await Promise.all([compareRequest, page.locator(".cm-commit-row", { hasText: "Initial proposal branch commit" }).first().click()]);

    await expect(page.locator(".cm-diff-split-panel").first()).toBeVisible();
  });

  test("diff mode toggle switches between unified highlights and split panels", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Added by split-unified test.");

    await page.getByRole("button", { name: /Show Diff|Diff On/ }).click();
    await expect(page.locator(".cm-editor-wrapper .tiptap [data-node-id].diff-changed").first()).toBeVisible();

    await page.locator(".cm-diff-toggle").getByRole("button", { name: "Split" }).click({ force: true });
    await expect(page.locator(".cm-diff-split-panel").first()).toBeVisible();

    const unifiedButton = page.locator(".cm-diff-toggle").getByRole("button", { name: "Unified" });
    await unifiedButton.click({ force: true });
    await expect(page.locator(".cm-editor-wrapper .tiptap [data-node-id].diff-changed").first()).toBeVisible();
  });

  test("decisions tab filters query decision-log endpoint", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const initialDecisionRequest = page.waitForResponse((response) => {
      return response.url().includes("/api/documents/rfc-auth/decision-log") && response.status() === 200;
    });
    await page.getByRole("tab", { name: "Log" }).click();
    await initialDecisionRequest;

    await expect(page.getByText("Auto-generated from resolved threads and merges. Filters query the decision log API.")).toBeVisible();
    await expect(page.getByText("Legal sign-off deferred until technical approvers complete review.")).toBeVisible();

    const acceptedFilterRequest = page.waitForResponse((response) => {
      return response.url().includes("decision-log") && response.url().includes("outcome=ACCEPTED") && response.status() === 200;
    });
    await page.locator(".cm-decision-controls").getByLabel("Outcome").selectOption("ACCEPTED");
    await acceptedFilterRequest;
    await expect(page.locator(".cm-decision-item")).toHaveCount(0);

    const deferredFilterRequest = page.waitForResponse((response) => {
      return response.url().includes("decision-log") && response.url().includes("outcome=DEFERRED") && response.status() === 200;
    });
    await page.locator(".cm-decision-controls").getByLabel("Outcome").selectOption("DEFERRED");
    await deferredFilterRequest;
    await expect(page.locator(".cm-decision-item")).toHaveCount(1);

    const authorFilterRequest = page.waitForResponse((response) => {
      return response.url().includes("decision-log") && response.url().includes("author=Avery") && response.status() === 200;
    });
    await page.locator(".cm-decision-controls").getByLabel("Author").fill("Avery");
    await authorFilterRequest;
    await expect(page.locator(".cm-decision-item")).toHaveCount(1);
  });

  test("decision log gracefully falls back to workspace decisions when API fails", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        decisionLog: 1
      }
    });
    await page.goto("/workspace/rfc-auth");

    const failedDecisionRequest = page.waitForResponse((response) => {
      return response.url().includes("/api/documents/rfc-auth/decision-log") && response.status() === 500;
    });
    await page.getByRole("tab", { name: "Log" }).click();
    await failedDecisionRequest;

    await expect(page.locator(".cm-decision-item")).toHaveCount(1);
    await expect(page.getByText("Legal sign-off deferred until technical approvers complete review.")).toBeVisible();
  });

  test("history tab renders history error message when history API fails", async ({ page }) => {
    await installAndSignIn(page, {
      failFirst: {
        history: 1
      }
    });
    await page.goto("/workspace/rfc-auth");

    await page.getByRole("button", { name: /History/ }).click();
    await expect(page.getByText("History service request failed.")).toBeVisible();
  });

  test("start proposal action creates proposal when document has no active proposal", async ({ page }) => {
    const workspace = createDefaultWorkspacePayload();
    workspace.document.proposalId = null;
    workspace.document.status = "Draft";
    workspace.document.branch = "main";

    await installAndSignIn(page, {
      workspaces: {
        [workspace.document.id]: workspace
      }
    });
    await page.goto("/workspace/rfc-auth");

    const startProposalButton = page.getByRole("button", { name: "Start Proposal" }).first();
    await expect(startProposalButton).toBeVisible();

    const createProposalRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals") &&
        !response.url().includes("/submit") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      createProposalRequest,
      startProposalButton.click()
    ]);

    await expect(page.getByRole("button", { name: /Request Review/ })).toBeVisible();
    await expect(page.locator(".cm-doc-branch")).toContainText("proposal/rfc-auth-playwright -> main");
  });

  test("request review updates document status and save version appears in history", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await expect(page.locator(".cm-doc-status")).toContainText("In review");

    await page.getByRole("button", { name: /History/ }).click();
    await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");

    page.once("dialog", (dialog) => dialog.accept("Playwright Snapshot v1"));
    await page.getByRole("button", { name: /Save Version/ }).click();

    await expect(page.getByText("Named Versions")).toBeVisible();
    await expect(
      page
        .locator(".cm-approval-fallback", { has: page.getByText("Named Versions") })
        .locator(".cm-commit-row")
        .filter({ hasText: /Playwright Snapshot v1/ })
    ).toBeVisible();

    const viewNamedVersionRequest = page.waitForResponse((response) => {
      if (!response.url().includes("/api/documents/rfc-auth/compare") || response.request().method() !== "GET") {
        return false;
      }
      const url = new URL(response.url());
      return response.status() === 200 && url.searchParams.get("from") === url.searchParams.get("to");
    });
    await Promise.all([
      viewNamedVersionRequest,
      page
        .locator(".cm-approval-fallback", { has: page.getByText("Named Versions") })
        .locator(".cm-commit-row", { hasText: "Playwright Snapshot v1" })
        .click()
    ]);
    await expect(page.locator(".cm-compare-banner", { hasText: /Viewing named version: Playwright Snapshot v1/ })).toBeVisible();

    const submitRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/submit") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });

    await Promise.all([
      submitRequest,
      page.getByRole("button", { name: /Request Review/ }).click()
    ]);

    await expect(page.locator(".cm-doc-status")).toContainText("Ready for approval");
  });

  test("thread actions update visibility, replies, votes, reactions, and inline resolve action", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const threadCard = page.locator(".cm-thread-card").first();
    await expect(threadCard.getByRole("button", { name: "Internal" })).toBeVisible();

    const visibilityRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/visibility") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      visibilityRequest,
      threadCard.getByRole("button", { name: "Internal" }).click()
    ]);
    await expect(threadCard.getByRole("button", { name: "External" })).toBeVisible();

    const replyRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/replies") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      replyRequest,
      (async () => {
        await threadCard.getByRole("button", { name: /Reply/ }).click();
        await threadCard.getByPlaceholder("Reply in thread...").fill("Adding a reply from Playwright.");
        await threadCard.getByRole("button", { name: "Send Reply" }).click();
      })()
    ]);
    await expect(threadCard.getByText("Adding a reply from Playwright.")).toBeVisible();

    await expect(threadCard.locator(".cm-vote-count")).toHaveText("2");
    const voteRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/vote") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      voteRequest,
      threadCard.getByRole("button", { name: "Upvote thread" }).click()
    ]);
    await expect(threadCard.locator(".cm-vote-count")).toHaveText("3");

    const reactionRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/reactions") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      reactionRequest,
      threadCard.getByRole("button", { name: "👍" }).click()
    ]);
    await expect(threadCard.getByText(/👍\s*1/)).toBeVisible();

    const resolveRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/resolve") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      resolveRequest,
      (async () => {
        await threadCard.getByRole("button", { name: "Resolve" }).click();
        await threadCard.getByLabel("Outcome").selectOption("ACCEPTED");
        await threadCard.getByRole("button", { name: "Confirm Resolve" }).click();
      })()
    ]);
    await expect(threadCard.getByText(/Resolved by/i)).toBeVisible();
  });

  test("comment composer supports type and visibility fields", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page.getByPlaceholder("Add a comment… click a paragraph to anchor it").fill("New external security note");
    await page.locator(".cm-compose-box").getByLabel("Type").selectOption("SECURITY");
    await page.locator(".cm-compose-box").getByLabel("Visibility").selectOption("EXTERNAL");

    const createThreadRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });

    await Promise.all([
      createThreadRequest,
      page.getByRole("button", { name: "Comment" }).click()
    ]);

    const newThread = page.locator(".cm-thread-card", { hasText: "New external security note" });
    await expect(newThread).toBeVisible();
    await expect(newThread.getByRole("button", { name: "External" })).toBeVisible();
    await expect(newThread.locator(".cm-thread-type")).toHaveText("SECURITY");
  });

  test("reopening a resolved thread re-blocks merge gate", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await page
      .locator(".cm-approver-row", { hasText: "Security" })
      .getByRole("button", { name: "Approve" })
      .click();
    await page
      .locator(".cm-approver-row", { hasText: "Architecture Committee" })
      .getByRole("button", { name: "Approve" })
      .click();
    await page
      .locator(".cm-approver-row", { hasText: "Legal" })
      .getByRole("button", { name: "Approve" })
      .click();

    const resolveRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/resolve") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      resolveRequest,
      (async () => {
        const threadCard = page.locator(".cm-thread-card").first();
        await threadCard.getByRole("button", { name: "Resolve" }).click();
        await threadCard.getByRole("button", { name: "Confirm Resolve" }).click();
      })()
    ]);
    await expect(page.getByText("Merge Gate Ready")).toBeVisible();

    const reopenRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/reopen") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      reopenRequest,
      page.locator(".cm-thread-card").first().getByRole("button", { name: "Reopen" }).click()
    ]);

    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();
    await expect(page.getByRole("button", { name: "Resolve open threads" })).toBeDisabled();
  });

  test("workspace merge remains blocked until approvals and thread resolution complete", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();
    await page.getByRole("tab", { name: "Required approvals" }).click();

    const legalRow = page.locator(".cm-approver-row", { hasText: "Legal" });
    await expect(legalRow.getByRole("button", { name: "Blocked" })).toBeDisabled();

    await page
      .locator(".cm-approver-row", { hasText: "Security" })
      .getByRole("button", { name: "Approve" })
      .click();

    await page
      .locator(".cm-approver-row", { hasText: "Architecture Committee" })
      .getByRole("button", { name: "Approve" })
      .click();

    await expect(legalRow.getByRole("button", { name: "Approve" })).toBeEnabled();
    await legalRow.getByRole("button", { name: "Approve" }).click();

    const mergeButton = page.getByRole("button", { name: "Resolve open threads" });
    await expect(mergeButton).toBeDisabled();

    const resolveRequest = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/documents/rfc-auth/proposals/proposal-rfc-auth/threads/purpose/resolve") &&
        response.request().method() === "POST" &&
        response.status() === 200
      );
    });
    await Promise.all([
      resolveRequest,
      (async () => {
        const threadCard = page.locator(".cm-thread-card").first();
        await threadCard.getByRole("button", { name: "Resolve" }).click();
        await threadCard.getByLabel("Outcome").selectOption("ACCEPTED");
        await threadCard.getByRole("button", { name: "Confirm Resolve" }).click();
      })()
    ]);

    await expect(page.getByText(/Resolved by/i)).toBeVisible();
    const readyMergeButton = page.getByRole("button", { name: "Ready to merge" });
    await expect(readyMergeButton).toBeEnabled();
    await readyMergeButton.click();

    await expect(page.locator(".cm-doc-status")).toContainText("Approved");
  });

  test("tabs are keyboard navigable and mobile viewport keeps workspace usable", async ({ page }) => {
    await installAndSignIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/rfc-auth");

    await expect(page.getByRole("tab", { name: "Discussion" })).toBeVisible();
    await page.getByRole("tab", { name: "Discussion" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Required approvals" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "History" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Log" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Discussion" })).toHaveAttribute("aria-selected", "true");

    await expect(page.locator(".cm-doc-toolbar")).toBeVisible();
    await expect(page.locator(".cm-discussion-panel")).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1);
    expect(hasHorizontalOverflow).toBeFalsy();
  });

  test("workspace sidebars can collapse and expand via header controls", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const leftSidebar = page.locator(".cm-sidebar");
    const rightPanel = page.locator(".cm-discussion-panel");

    await expect(leftSidebar).not.toHaveClass(/collapsed/);
    await expect(rightPanel).not.toHaveClass(/collapsed/);

    await page.getByRole("button", { name: "Collapse left sidebar" }).click();
    await expect(leftSidebar).toHaveClass(/collapsed/);
    await expect(page.getByRole("button", { name: "Expand left sidebar" })).toBeVisible();

    await page.getByRole("button", { name: "Collapse right panel" }).click();
    await expect(rightPanel).toHaveClass(/collapsed/);
    await expect(page.locator(".cm-panel-main")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Expand right panel" })).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Log" }).click();
    await expect(page.getByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Expand right panel" }).click();
    await expect(rightPanel).not.toHaveClass(/collapsed/);
    await expect(page.locator(".cm-panel-main")).toHaveCount(1);

    await page.getByRole("button", { name: "Expand left sidebar" }).click();
    await expect(leftSidebar).not.toHaveClass(/collapsed/);
  });
});
