import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

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

async function writeProjectPackage(packagePath, { markdown, manifest, assets }) {
  const zip = new JSZip();
  zip.file("slides.md", markdown);
  zip.file("config.json", JSON.stringify(manifest, null, 2));
  assets.forEach((asset) => {
    zip.file(asset.path, asset.content);
  });
  await writeFile(packagePath, await zip.generateAsync({ type: "nodebuffer" }));
}

test("imports a V2 project package and resolves asset references", async ({ page }, testInfo) => {
  const packagePath = testInfo.outputPath("project.zip");
  const markdown = `---
title: Project Deck
theme: clean
size: widescreen
---

# Project Slide

![Imported asset](assets/example.svg)
`;
  const assetContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
  <rect width="200" height="80" fill="#e5f2ef"/>
  <text x="100" y="48" text-anchor="middle" font-family="Arial" font-size="20">Asset</text>
</svg>`;
  await writeProjectPackage(packagePath, {
    markdown,
    manifest: {
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
    },
    assets: [{ path: "assets/example.svg", content: assetContent }],
  });

  await page.goto("/");
  await page.locator("#import-package").setInputFiles(packagePath);

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
  const packagePath = testInfo.outputPath("recovery.zip");
  const markdown = `---
title: Recovery Deck
theme: clean
size: widescreen
---

# Recovery

![Missing later](assets/example.svg)
`;
  await writeProjectPackage(packagePath, {
    markdown,
    manifest: {
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
    },
    assets: [{
      path: "assets/example.svg",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <text x="60" y="34" text-anchor="middle">Asset</text>
</svg>`,
    }],
  });

  await page.goto("/");
  await page.locator("#import-package").setInputFiles(packagePath);
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
  await page.locator('[data-asset-path="assets/a.svg"] [data-action="insert-sized"][data-width="50%"]').click();
  await expect(page.locator(".cm-content")).toContainText("![a.svg](assets/a.svg){width=50%}");
  await expect(page.getByRole("img", { name: "a.svg" })).toHaveAttribute("style", /width: 50%;/);
  await expect(page.locator('[data-asset-path="assets/a.svg"]')).toContainText("used 1 time");
  await expect(page.getByRole("img", { name: "a.svg" })).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);

  await page.locator('[data-asset-path="assets/b.svg"] [data-action="insert"]').click();
  await page.locator('[data-asset-path="assets/b.svg"] .asset-custom-width').fill("320");
  await page.locator('[data-asset-path="assets/b.svg"] [data-action="insert-custom"]').click();
  await expect(page.locator(".cm-content")).toContainText("![b.svg](assets/b.svg){width=320px}");

  await page.locator('[data-asset-path="assets/a.svg"] [data-action="rename"]').click();
  await page.locator('[data-asset-path="assets/a.svg"] .asset-name-input').fill("renamed-a.svg");
  await page.locator('[data-asset-path="assets/a.svg"] .asset-name-input').press("Enter");
  await expect(page.locator('[data-asset-path="assets/renamed-a.svg"]')).toContainText("used 1 time");
  await expect(page.locator(".cm-content")).toContainText("assets/renamed-a.svg");
  await expect(page.getByRole("img", { name: "a.svg" })).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);

  await page.locator('[data-asset-path="assets/renamed-a.svg"] [data-action="rename"]').click();
  await page.locator('[data-asset-path="assets/renamed-a.svg"] .asset-name-input').fill("");
  await page.locator('[data-asset-path="assets/renamed-a.svg"] .asset-name-input').press("Enter");
  await expect(page.locator('[data-asset-path="assets/renamed-a.svg"]')).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-asset-path="assets/renamed-a.svg"] [data-action="remove"]').click();
  await expect(page.locator('[data-asset-path="assets/renamed-a.svg"]')).toHaveCount(0);
  await expect(page.locator("#status")).toContainText("Removed renamed-a.svg; 1 reference now unresolved.");
  await expect(page.locator(".missing-asset")).toContainText("assets/renamed-a.svg");
});

test("exports and imports a structured project package", async ({ page }, testInfo) => {
  const assetDir = testInfo.outputPath("package-assets");
  await mkdir(assetDir, { recursive: true });
  const assetPath = path.join(assetDir, "package.svg");
  await writeFile(assetPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <text x="60" y="34" text-anchor="middle">Package</text>
</svg>`);

  await page.addInitScript(() => {
    window.localStorage.setItem("slip.markdown", `---
title: Package Deck
theme: clean
size: widescreen
---

# Package
`);
  });
  await page.goto("/");
  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await page.locator("#asset-import").setInputFiles(assetPath);
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.locator('[data-asset-path="assets/package.svg"] [data-action="insert"]').click();
  await page.locator('[data-asset-path="assets/package.svg"] [data-action="insert-sized"][data-width="100%"]').click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-menu-button").click();
  await page.locator("#export-project-package").click();
  const download = await downloadPromise;
  const packagePath = testInfo.outputPath("package-deck.zip");
  await download.saveAs(packagePath);

  const zip = await JSZip.loadAsync(await readFile(packagePath));
  expect(zip.file("slides.md")).toBeTruthy();
  expect(zip.file("config.json")).toBeTruthy();
  expect(zip.file("assets/package.svg")).toBeTruthy();

  await page.locator("#new-deck").click();
  await page.locator("#new-deck-confirm").click();
  await page.locator("#import-package").setInputFiles(packagePath);

  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator("#deck-title")).toHaveText("Package Deck");
  await expect(page.locator(".slide img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
});

test("exports self-contained markdown with project assets inlined", async ({ page }, testInfo) => {
  const assetDir = testInfo.outputPath("self-contained-assets");
  await mkdir(assetDir, { recursive: true });
  const assetPath = path.join(assetDir, "inline.svg");
  await writeFile(assetPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <text x="60" y="34" text-anchor="middle">Inline</text>
</svg>`);

  await page.addInitScript(() => {
    window.localStorage.setItem("slip.markdown", `---
title: Inline Deck
theme: clean
size: widescreen
---

# Inline
`);
  });
  await page.goto("/");
  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await page.locator("#asset-import").setInputFiles(assetPath);
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.locator('[data-asset-path="assets/inline.svg"] [data-action="insert"]').click();
  await page.locator('[data-asset-path="assets/inline.svg"] [data-action="insert-sized"][data-width="100%"]').click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-menu-button").click();
  await page.locator("#export-self-contained-md").click();
  const download = await downloadPromise;
  const markdownPath = testInfo.outputPath("inline-self-contained.md");
  await download.saveAs(markdownPath);

  const exported = await readFile(markdownPath, "utf8");
  expect(exported).toContain("data:image/svg+xml;base64,");
  expect(exported).not.toContain("assets/inline.svg");

  await page.locator("#new-deck").click();
  await page.locator("#new-deck-confirm").click();
  await page.locator("#import-file").setInputFiles(markdownPath);
  await expect(page.locator("#project-mode")).toHaveText("Single file");
  await expect(page.locator("#deck-title")).toHaveText("Inline Deck");
  await expect(page.locator(".slide img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
});

test("refuses embedded markdown when image size limits are exceeded", async ({ page }, testInfo) => {
  const assetDir = testInfo.outputPath("large-assets");
  await mkdir(assetDir, { recursive: true });
  const oversizedAsset = path.join(assetDir, "oversized.svg");
  await writeFile(oversizedAsset, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <desc>${"x".repeat(360 * 1024)}</desc>
</svg>`);

  await page.addInitScript(() => {
    window.localStorage.setItem("slip.markdown", `---
title: Large Asset Deck
theme: clean
size: widescreen
---

# Large Asset
`);
  });
  await page.goto("/");
  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await page.locator("#asset-import").setInputFiles(oversizedAsset);
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.locator('[data-asset-path="assets/oversized.svg"] [data-action="insert"]').click();
  await page.locator('[data-asset-path="assets/oversized.svg"] [data-action="insert-sized"][data-width="100%"]').click();

  await page.locator("#export-menu-button").click();
  await page.locator("#export-self-contained-md").click();

  await expect(page.locator("#embedded-export-dialog")).toBeVisible();
  await expect(page.locator("#embedded-export-dialog")).toContainText("Embedded Markdown export refused: assets/oversized.svg");
  await expect(page.locator("#embedded-export-dialog")).toContainText("above the 350 KB per-image limit");
  await page.locator("#embedded-export-ok").click();
  await expect(page.locator("#embedded-export-dialog")).toBeHidden();
});

test("refuses embedded markdown when total image size limit is exceeded", async ({ page }, testInfo) => {
  const assetDir = testInfo.outputPath("total-large-assets");
  await mkdir(assetDir, { recursive: true });
  const assets = [];
  for (let index = 1; index <= 5; index += 1) {
    const assetPath = path.join(assetDir, `total-${index}.svg`);
    await writeFile(assetPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <desc>${"x".repeat(320 * 1024)}</desc>
</svg>`);
    assets.push(assetPath);
  }

  await page.addInitScript(() => {
    window.localStorage.setItem("slip.markdown", `---
title: Total Asset Deck
theme: clean
size: widescreen
---

# Total Asset
`);
  });
  await page.goto("/");
  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await page.locator("#asset-import").setInputFiles(assets);
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  for (let index = 1; index <= 5; index += 1) {
    await page.locator(`[data-asset-path="assets/total-${index}.svg"] [data-action="insert"]`).click();
    await page.locator(`[data-asset-path="assets/total-${index}.svg"] [data-action="insert-sized"][data-width="100%"]`).click();
  }

  await page.locator("#export-menu-button").click();
  await page.locator("#export-self-contained-md").click();

  await expect(page.locator("#embedded-export-dialog")).toBeVisible();
  await expect(page.locator("#embedded-export-dialog")).toContainText("Embedded Markdown export refused: total image size");
  await expect(page.locator("#embedded-export-dialog")).toContainText("above the 1.5 MB limit");
  await page.locator("#embedded-export-close").click();
  await expect(page.locator("#embedded-export-dialog")).toBeHidden();
});

test("keeps large projects responsive with lazy asset panel rendering", async ({ page }, testInfo) => {
  const assetDir = testInfo.outputPath("stress-assets");
  await mkdir(assetDir, { recursive: true });
  const assets = [];
  for (let index = 1; index <= 200; index += 1) {
    const assetPath = path.join(assetDir, `asset-${String(index).padStart(3, "0")}.svg`);
    await writeFile(assetPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40">
  <text x="40" y="24" text-anchor="middle">${index}</text>
</svg>`);
    assets.push(assetPath);
  }

  const slides = Array.from({ length: 120 }, (_item, index) => `## Slide ${index + 1}\n\nContent ${index + 1}`).join("\n\n---\n\n");
  await page.addInitScript((markdown) => {
    window.localStorage.setItem("slip.markdown", markdown);
  }, `---
title: Stress Deck
theme: clean
size: widescreen
---

${slides}
`);

  await page.goto("/");
  await expect(page.locator(".slide")).toHaveCount(120);
  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await page.locator("#asset-import").setInputFiles(assets);

  await expect(page.locator(".asset-item")).toHaveCount(60);
  await expect(page.locator(".asset-show-more")).toContainText("Show 60 more assets");
  await expect(page.locator(".asset-thumb img")).toHaveCount(60);

  await page.locator(".asset-show-more").click();
  await expect(page.locator(".asset-item")).toHaveCount(120);
  await expect(page.locator(".asset-show-more")).toContainText("Show 60 more assets");
});
