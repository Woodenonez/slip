import { expect, test } from "@playwright/test";

const deck = `---
title: Shared UI Deck
theme: clean
size: widescreen
---

# Share UI

Body`;

test("creates, copies, and revokes a share link from the toolbar", async ({ page }) => {
  let created = false;
  let revoked = false;
  await page.addInitScript((markdown) => {
    window.localStorage.setItem("slip.markdown", markdown);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: async (value) => { window.__copiedShareLink = value; } },
      configurable: true,
    });
  }, deck);
  await page.route("**/api/share", async (route) => {
    created = true;
    const body = route.request().postDataJSON();
    expect(body.ttlId).toBe("default");
    expect(body.markdown).toContain("# Share UI");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "share-1",
        url: "http://127.0.0.1:4174/share/share-1",
        expiresAt: "2026-05-04T18:00:00.000Z",
        ttl: "6 hours",
        ownerToken: "owner-token",
      }),
    });
  });
  await page.route("**/api/share/share-1", async (route) => {
    if (route.request().method() === "DELETE") {
      revoked = route.request().headers()["x-owner-token"] === "owner-token";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ revoked: true }),
      });
    }
  });
  await page.goto("/");
  await page.locator("#share-deck").click();
  await expect(page.locator("#share-dialog")).toBeVisible();
  await expect(page.locator("#share-summary")).toContainText("temporary read-only link");

  await page.locator("#share-create").click();
  await expect(page.locator("#share-url")).toHaveValue("http://127.0.0.1:4174/share/share-1");
  await expect(page.locator("#share-summary")).toContainText("Share link created.");
  await page.locator("#share-copy").click();
  await expect(page.locator("#status")).toHaveText("Share link copied.");
  await expect(page.evaluate(() => window.__copiedShareLink)).resolves.toBe("http://127.0.0.1:4174/share/share-1");

  await page.locator("#share-revoke").click();
  await expect(page.locator("#status")).toHaveText("Share link revoked.");
  await expect(page.locator("#share-url")).toHaveValue("");
  expect(created).toBe(true);
  expect(revoked).toBe(true);
});

test("opens a shared deck read-only and can copy it into the editor", async ({ page }) => {
  await page.route("**/api/share/read-only", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "read-only",
        payload: { type: "single-md", markdown: deck, meta: { title: "Shared UI Deck" } },
        createdAt: "2026-05-04T12:00:00.000Z",
        expiresAt: "2026-05-04T18:00:00.000Z",
        readOnly: true,
      }),
    });
  });

  await page.goto("/share/read-only");
  await expect(page.locator("#status")).toContainText("Opened shared deck read-only.");
  await expect(page.locator("#projectize")).toBeDisabled();
  await page.locator("#editor .cm-content").click();
  await page.keyboard.type(" edit");
  await expect(page.locator(".slide h1")).toHaveText("Share UI");

  await page.locator("#share-deck").click();
  await expect(page.locator("#share-copy-to-editor")).toBeVisible();
  await page.locator("#share-copy-to-editor").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#status")).toHaveText("Copied shared deck to your editor.");
  await expect(page.locator("#projectize")).toBeEnabled();
});

test("shows a clear unavailable screen for missing shared decks", async ({ page }) => {
  await page.route("**/api/share/missing", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: "not_found",
        message: "Share link was not found.",
      }),
    });
  });

  await page.goto("/share/missing");
  await expect(page.locator(".slide h1")).toHaveText("Shared Deck Not Available");
  await expect(page.locator(".slide")).toContainText("Share link was not found.");
  await expect(page.locator("#status")).toHaveText("Could not open shared deck: Share link was not found.");
});
