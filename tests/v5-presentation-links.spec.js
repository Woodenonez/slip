import { expect, test } from "@playwright/test";

async function openDeck(page, markdown) {
  await page.addInitScript((value) => {
    window.localStorage.setItem("slip.markdown", value);
  }, markdown);
  await page.goto("/");
  await expect(page.locator(".slide")).toHaveCount(1);
}

test("opens external presentation links in a website panel", async ({ page }) => {
  await page.addInitScript(() => {
    window.__slipOpenedLinks = [];
    window.open = (url, target, features) => {
      window.__slipOpenedLinks.push({ url, target, features });
      return null;
    };
  });
  await openDeck(page, `---
title: V5 Links
theme: clean
size: widescreen
---

# External Link

[Open Example](https://example.com/path)`);

  await page.locator("#present-menu-button").click();
  await page.locator("#present-mirror").click();
  await page.locator("#presentation-slide a").click();

  await expect(page.locator("#presentation-web-panel")).toBeVisible();
  await expect(page.locator("#presentation-web-frame")).toHaveAttribute("src", "https://example.com/path");

  await page.locator("#presentation-web-open").click();
  await expect.poll(() => page.evaluate(() => window.__slipOpenedLinks)).toEqual([
    {
      url: "https://example.com/path",
      target: "_blank",
      features: "noopener,noreferrer",
    },
  ]);

  await page.locator("#presentation-web-close").click();
  await expect(page.locator("#presentation-web-panel")).toBeHidden();
  await expect(page.locator("#presentation-web-frame")).not.toHaveAttribute("src", /.+/);
});

test("adds custom CSS rules from the visual builder", async ({ page }) => {
  await openDeck(page, `---
title: V5 CSS
theme: clean
size: widescreen
---

# Styled Heading

Regular paragraph

- Bullet item`);

  await expect(page.locator("#present-menu-button")).toHaveCSS("background-color", "rgb(21, 128, 61)");

  await page.locator("#custom-css-toggle").click();
  await page.locator("#custom-css-target").selectOption("h1");
  await page.locator("#custom-css-property").selectOption("font-size");
  await page.locator("#custom-css-value").fill("52");
  await page.locator("#custom-css-add").click();

  await expect(page.locator("#custom-css-editor")).toHaveValue(/h1 \{\n  font-size: 52px;\n\}/);
  await expect(page.locator(".preview h1").first()).toHaveCSS("font-size", "52px");

  await page.locator("#custom-css-target").selectOption("p");
  await page.locator("#custom-css-property").selectOption("letter-spacing");
  await page.locator("#custom-css-value").fill("0.08em");
  await page.locator("#custom-css-add").click();

  await expect(page.locator("#custom-css-editor")).toHaveValue(/p \{\n  letter-spacing: 0.08em;\n\}/);

  await page.locator("#custom-css-target").selectOption("li");
  await page.locator("#custom-css-property").selectOption("color");
  await expect(page.locator("#custom-css-color")).toBeVisible();
  await page.locator("#custom-css-color").fill("#2563eb");
  await expect(page.locator("#custom-css-value")).toHaveValue("#2563eb");
  await page.locator("#custom-css-add").click();
  await expect(page.locator("#custom-css-editor")).toHaveValue(/li \{\n  color: #2563eb;\n\}/);

  await page.locator("#custom-css-target").selectOption("page");
  await expect(page.locator("#custom-css-property option")).toHaveText([
    "Background color",
    "Top margin",
    "Bottom margin",
    "Left margin",
    "Right margin",
  ]);
  await page.locator("#custom-css-property").selectOption("background-color");
  await expect(page.locator("#custom-css-color")).toBeVisible();
  await page.locator("#custom-css-color").fill("#ddeeff");
  await expect(page.locator("#custom-css-value")).toHaveValue("#ddeeff");
  await page.locator("#custom-css-add").click();
  await expect(page.locator("#theme-picker")).toHaveValue("custom");
  await expect(page.locator("#custom-css-editor")).toHaveValue(/:page \{\n  background-color: #ddeeff;\n\}/);
  await expect(page.locator(".preview .slide-inner").first()).toHaveCSS("background-color", "rgb(221, 238, 255)");

  await page.locator("#custom-css-property").selectOption("padding-top");
  await page.locator("#custom-css-value").fill("80");
  await page.locator("#custom-css-add").click();
  await expect(page.locator("#custom-css-editor")).toHaveValue(/:page-content \{\n  padding-top: 80px;\n\}/);

  await page.locator("#theme-picker").selectOption("clean");
  await expect(page.locator("#theme-picker")).toHaveValue("clean");
  await expect(page.locator("#custom-css-editor")).not.toHaveValue(/background-color: #ddeeff/);
  await expect(page.locator(".preview .slide-inner").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.locator("#custom-css-clear").click();
  await expect(page.locator("#custom-css-editor")).toHaveValue("");
  await expect(page.locator(".preview h1").first()).not.toHaveCSS("font-size", "52px");
});
