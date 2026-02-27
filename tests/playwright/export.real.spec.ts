import { expect, test } from "@playwright/test";

test.describe("Document export (real backend)", () => {
  test("export PDF succeeds from workspace UI", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Display name").fill("Avery");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/documents$/);

    await page.goto("/workspace/rfc-auth");
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();

    const exportResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "POST" &&
        /\/api\/documents\/[^/]+\/export$/.test(new URL(response.url()).pathname)
      );
    });

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("button", { name: "Download as PDF" }).click();

    const exportResponse = await exportResponsePromise;
    const responseBody = await exportResponse.text();

    expect(
      exportResponse.status(),
      `export status=${exportResponse.status()} body=${responseBody}`
    ).toBe(200);
    expect(exportResponse.headers()["content-type"] ?? "").toContain("application/pdf");
  });
});
