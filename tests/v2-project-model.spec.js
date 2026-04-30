import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

async function waitForStoredProject(page) {
  await expect.poll(() => page.evaluate(() => new Promise((resolve) => {
    const snapshot = localStorage.getItem("slip.project.document");
    if (!snapshot) {
      resolve(false);
      return;
    }
    const request = indexedDB.open("slip-project-vfs", 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("documents", "readonly");
      const store = transaction.objectStore("documents");
      const getRequest = store.get("current");
      getRequest.onsuccess = () => {
        const hasDocument = Boolean(getRequest.result);
        db.close();
        resolve(hasDocument);
      };
      getRequest.onerror = () => {
        db.close();
        resolve(false);
      };
    };
    request.onerror = () => resolve(false);
  }))).toBe(true);
}

test("imports a V2 project folder and resolves asset references", async ({ page }, testInfo) => {
  const projectDir = testInfo.outputPath("project");
  const assetsDir = path.join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  await writeFile(path.join(projectDir, "slides.md"), `---
title: Project Deck
theme: clean
size: widescreen
---

# Project Slide

![Imported asset](assets/example.svg)
`);
  await writeFile(path.join(projectDir, "config.json"), JSON.stringify({
    schema: "slip.project",
    version: 2,
    title: "Project Deck",
    theme: "clean",
    size: "widescreen",
    entry: "slides.md",
    assets: [
      {
        id: "asset-existing",
        path: "assets/example.svg",
        filename: "example.svg",
        mime: "image/svg+xml",
        size: 0,
        hash: "existing",
      },
    ],
  }));
  await writeFile(path.join(assetsDir, "example.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
  <rect width="200" height="80" fill="#e5f2ef"/>
  <text x="100" y="48" text-anchor="middle" font-family="Arial" font-size="20">Asset</text>
</svg>`);

  await page.goto("/");
  await page.locator("#import-project").setInputFiles(projectDir);

  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator("#deck-title")).toHaveText("Project Deck");
  await expect(page.locator(".slide")).toHaveCount(1);
  await expect(page.locator(".slide img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await waitForStoredProject(page);

  await page.goto("/");
  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator("#deck-title")).toHaveText("Project Deck");
  await expect(page.locator(".slide img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
});

test("migrates the current V1 deck into project mode without changing markdown", async ({ page }) => {
  const markdown = `---
title: Migration Deck
theme: paper
size: a4
---

# Keep Markdown

Single-file content remains editable.`;

  await page.addInitScript((value) => {
    window.localStorage.setItem("slip.markdown", value);
  }, markdown);
  await page.goto("/");

  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator("#projectize")).toBeDisabled();
  await expect(page.locator("#status")).toHaveText("Project mode ready: config.json and slides.md are defined.");
  await expect(page.locator(".slide h1")).toHaveText("Keep Markdown");
  await waitForStoredProject(page);
  await page.goto("/");
  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator(".slide h1")).toHaveText("Keep Markdown");
});

test("restores a project with a missing asset record and reports recovery warning", async ({ page }, testInfo) => {
  const projectDir = testInfo.outputPath("project");
  const assetsDir = path.join(projectDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  await writeFile(path.join(projectDir, "slides.md"), `---
title: Recovery Deck
theme: clean
size: widescreen
---

# Recovery

![Missing later](assets/example.svg)
`);
  await writeFile(path.join(projectDir, "config.json"), JSON.stringify({
    schema: "slip.project",
    version: 2,
    title: "Recovery Deck",
    theme: "clean",
    size: "widescreen",
    entry: "slides.md",
    assets: [
      {
        id: "asset-missing-later",
        path: "assets/example.svg",
        filename: "example.svg",
        mime: "image/svg+xml",
        size: 0,
        hash: "existing",
      },
    ],
  }));
  await writeFile(path.join(assetsDir, "example.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <text x="60" y="34" text-anchor="middle">Asset</text>
</svg>`);

  await page.goto("/");
  await page.locator("#import-project").setInputFiles(projectDir);
  await waitForStoredProject(page);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("slip-project-vfs", 1);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("assets", "readwrite");
      transaction.objectStore("assets").delete("asset-missing-later");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  }));

  await page.goto("/");
  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator("#deck-title")).toHaveText("Recovery Deck");
  await expect(page.locator("#status")).toContainText("Project restored with 1 missing asset record.");
});

test("manages project assets with usage counts and reference checks", async ({ page }, testInfo) => {
  const assetDir = testInfo.outputPath("assets");
  await mkdir(assetDir, { recursive: true });
  const assetA = path.join(assetDir, "a.svg");
  const assetB = path.join(assetDir, "b.svg");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <text x="60" y="34" text-anchor="middle">Asset</text>
</svg>`;
  await writeFile(assetA, svg);
  await writeFile(assetB, svg);

  await page.addInitScript(() => {
    window.localStorage.setItem("slip.markdown", `---
title: Asset Deck
theme: clean
size: widescreen
---

# Assets
`);
  });
  await page.goto("/");
  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await page.locator("#asset-import").setInputFiles([assetA, assetB]);

  await expect(page.locator(".asset-item")).toHaveCount(2);
  await expect(page.locator(".asset-duplicate")).toHaveCount(2);
  await expect(page.locator('[data-asset-path="assets/a.svg"]')).toContainText("used 0 times");

  await page.locator('[data-asset-path="assets/a.svg"] [data-action="insert"]').click();
  await expect(page.locator('[data-asset-path="assets/a.svg"]')).toContainText("used 1 time");
  await expect(page.getByRole("img", { name: "a.svg" })).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);

  page.once("dialog", (dialog) => dialog.accept("renamed-a.svg"));
  await page.locator('[data-asset-path="assets/a.svg"] [data-action="rename"]').click();
  await expect(page.locator('[data-asset-path="assets/renamed-a.svg"]')).toContainText("used 1 time");
  await expect(page.locator(".cm-content")).toContainText("assets/renamed-a.svg");
  await expect(page.getByRole("img", { name: "a.svg" })).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-asset-path="assets/renamed-a.svg"] [data-action="remove"]').click();
  await expect(page.locator('[data-asset-path="assets/renamed-a.svg"]')).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Unresolved asset reference: assets/renamed-a.svg.");
  await expect(page.locator(".missing-asset")).toContainText("assets/renamed-a.svg");
});
