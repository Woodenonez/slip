import { expect, test } from "@playwright/test";

const baseFrontmatter = `---
title: Regression Deck
theme: clean
size: widescreen
---
`;

async function openDeck(page, markdown, expectedSlides) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("slip.markdown", value);
  }, markdown);
  await page.goto("/");
  await expect(page.locator(".slide")).toHaveCount(expectedSlides);
}

test("renders fixed-size slides and print page CSS", async ({ page }) => {
  await openDeck(page, `---
title: A4 Deck
theme: paper
size: a4
---

# First

Print sizing should match the selected page shape.`, 1);

  const slideSize = await page.locator(".slide").first().evaluate((slide) => {
    const style = window.getComputedStyle(slide);
    return {
      width: Math.round(Number.parseFloat(style.width)),
      height: Math.round(Number.parseFloat(style.height)),
    };
  });
  expect(slideSize).toEqual({ width: 794, height: 1123 });
  const printCss = await page.locator("#print-page-size").evaluate((style) => style.textContent);
  expect(printCss).toMatch(/@page \{ size: A4; margin: 0; \}/);
});

test("reports every slide that may clip in print or PDF", async ({ page }) => {
  const longLines = Array.from({ length: 34 }, (_, index) => `- Overflow line ${index + 1}`).join("\n");
  await openDeck(page, `${baseFrontmatter}

# One

${longLines}

---

# Two

${longLines}`, 2);

  await expect(page.locator("#status")).toContainText("Slides 1, 2 may clip in print/PDF.");
  await expect(page.locator(".slide-frame.has-overflow")).toHaveCount(2);
});

test("opens mirror and presenter modes with expected presentation surfaces", async ({ page }) => {
  await openDeck(page, `${baseFrontmatter}

# Current

Body

???
Presenter notes

---

## Next

Upcoming`, 2);

  await page.locator("#present-menu-button").click();
  await page.locator("#present-mirror").click();
  await expect(page.locator("#presentation")).toHaveClass(/presentation-mirror/);
  await expect(page.locator("#presentation-slide h1")).toHaveText("Current");
  await page.locator("#exit-present").click();

  await page.locator("#present-menu-button").click();
  await page.locator("#present-speaker").click();
  await expect(page.locator("#presentation")).toHaveClass(/presentation-presenter/);
  await expect(page.locator("#presentation-count")).toHaveText("1 / 2");
  await expect(page.locator("#presentation-next h2")).toHaveText("Next");
  await expect(page.locator("#presentation-notes")).toHaveText("Presenter notes");
});

test("shows consolidated toolbar dropdown actions", async ({ page }) => {
  await openDeck(page, `${baseFrontmatter}

# Toolbar

Menu actions should be grouped.`, 1);

  await expect(page.locator("#import-menu-button")).toHaveClass(/menu-button/);
  await expect(page.locator("#export-menu-button")).toHaveClass(/menu-button/);
  await expect(page.locator("#present-menu-button")).toHaveClass(/menu-button/);
  await expect(page.locator(".toolbar-divider")).toHaveCount(2);
  await expect(page.locator(".toolbar-actions > *").first()).toHaveAttribute("id", "new-deck");

  await page.locator("#import-menu-button").click();
  await expect(page.locator("#import-menu-options")).toBeVisible();
  await expect(page.locator("#import-menu-options")).toContainText("File");
  await expect(page.locator("#import-menu-options")).toContainText("Project");

  await page.locator("#export-menu-button").click();
  await expect(page.locator("#import-menu-options")).toBeHidden();
  await expect(page.locator("#export-menu-options")).toBeVisible();
  await expect(page.locator("#export-menu-options")).toContainText("Markdown");
  await expect(page.locator("#export-menu-options")).toContainText("PDF");
});

test("starts a new three slide deck after confirmation", async ({ page }) => {
  await openDeck(page, `${baseFrontmatter}

# Existing Work

Unsaved single-file content.`, 1);

  await page.locator("#new-deck").click();
  await expect(page.locator("#new-deck-dialog")).toBeVisible();
  await expect(page.locator("#new-deck-dialog")).toContainText("Starting a new deck will discard the current content.");
  await expect(page.locator("#new-deck-dialog")).toContainText("not saved as a project");
  await page.locator("#new-deck-cancel").click();
  await expect(page.locator(".slide h1")).toHaveText("Existing Work");

  await page.locator("#new-deck").click();
  await page.locator("#new-deck-confirm").click();
  await expect(page.locator("#deck-title")).toHaveText("New Deck");
  await expect(page.locator(".slide")).toHaveCount(3);
  await expect(page.locator(".slide h1")).toHaveText("Title Slide");
  await expect(page.locator("#project-mode")).toHaveText("Single file");
});

test("confirms before projectizing the current deck", async ({ page }) => {
  await openDeck(page, `${baseFrontmatter}

# Projectize

Confirmation is required.`, 1);

  await page.locator("#projectize").click();
  await expect(page.locator("#projectize-dialog")).toBeVisible();
  await expect(page.locator("#projectize-dialog")).toContainText("This operation cannot be reverted.");
  await page.locator("#projectize-cancel").click();
  await expect(page.locator("#project-mode")).toHaveText("Single file");

  await page.locator("#projectize").click();
  await page.locator("#projectize-confirm").click();
  await expect(page.locator("#project-mode")).toHaveText("Project");
  await expect(page.locator("#projectize")).toBeDisabled();
});

test("reviews auto split before applying generated separators", async ({ page }) => {
  await openDeck(page, `---
title: Split Deck
theme: clean
size: widescreen
---

# Alpha

First section.

## Beta

Second section.`, 1);

  await page.locator("#auto-split").click();
  await expect(page.locator("#auto-split-dialog")).toBeVisible();
  await expect(page.locator("#auto-split-list li")).toHaveCount(2);
  await page.locator("#auto-split-accept").click();
  await expect(page.locator(".slide")).toHaveCount(2);
  await expect(page.locator("#status")).toHaveText("Auto Split applied: 2 slides.");
});

test("renders and navigates a 120 slide deck within the V1 budget", async ({ page }) => {
  const slides = Array.from({ length: 120 }, (_, index) => `# Slide ${index + 1}

- Point A
- Point B
- Point C`).join("\n\n---\n\n");
  const markdown = `---
title: Large Deck
theme: clean
size: widescreen
---

${slides}`;

  const started = Date.now();
  await openDeck(page, markdown, 120);
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(4_000);
  await expect(page.locator("#status")).toContainText("120 slides rendered");
  await expect(page.locator("#outline-list .outline-item")).toHaveCount(120);

  await page.locator("#outline-list .outline-item").nth(119).click();
  await expect(page.locator("#outline-list .outline-item").nth(119)).toHaveClass(/active/);
});
