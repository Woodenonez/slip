import { expect, test } from "@playwright/test";

const deck = `---
title: AI Prompt Deck
theme: clean
size: widescreen
---

# Current Deck

- Keep this point.

---

# Second Slide

Details.`;

async function openAiPrompt(page) {
  await page.locator("#ai-tools-menu-button").click();
  if (!(await page.locator("#ai-tools-menu-options").isVisible())) {
    await page.locator("#ai-tools-menu-button").click();
  }
  await expect(page.locator("#ai-tools-menu-options")).toBeVisible();
  await page.locator("#ai-tools").click();
}

test("generates and copies external AI prompts", async ({ page }) => {
  await page.addInitScript((markdown) => {
    window.localStorage.setItem("slip.markdown", markdown);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: async (value) => { window.__copiedAiPrompt = value; } },
      configurable: true,
    });
  }, deck);

  await page.goto("/");
  await openAiPrompt(page);
  await expect(page.locator("#ai-tools-dialog")).toBeVisible();
  await expect(page.locator("#ai-tools-dialog")).toContainText("Slip does not send content to an AI service");
  await expect(page.locator("#ai-prompt-source")).not.toContainText("Selected text only");
  await expect(page.locator("#ai-prompt-source")).toHaveValue("template");
  await expect(page.locator("#ai-prompt-source")).toBeDisabled();
  await expect(page.locator("#ai-external-content")).toBeDisabled();
  await expect(page.locator("#ai-generated-prompt")).toHaveValue("");
  await expect(page.locator("#ai-generate-prompt")).toHaveText("▶");
  await expect(page.locator("#ai-generate-prompt")).toHaveAttribute("title", "Generate");
  await expect(page.locator("#ai-reset-preferences")).toHaveText("↻");
  await expect(page.locator("#ai-reset-preferences")).toHaveAttribute("title", "Reset");

  await page.locator("#ai-generate-prompt").click();
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Task: Convert the provided text or PDF-extracted content into valid Slip Markdown/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Return exactly one Markdown code block containing only the Slip Markdown deck/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Treat each slide as one presentation page/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Keep each page short enough for a 16:9 slide/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/\[ATTACH OR PROVIDE THE TXT\/PDF CONTENT IN THE AI TOOL\]/);
  await expect(page.locator("#ai-generated-prompt")).not.toHaveValue(/# Current Deck/);

  await page.locator("#ai-audience").selectOption("technical");
  await page.locator("#ai-detail").selectOption("detailed");
  await page.locator("#ai-slide-density").selectOption("spacious");
  await page.locator("#ai-output-language").selectOption("chinese");
  await page.locator("#ai-custom-instruction").fill("Keep terminology consistent.");
  await expect(page.locator("#ai-generated-prompt")).toHaveValue("");

  await page.locator("#ai-generate-prompt").click();
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Audience: technical audience/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Detail level: detailed/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Slide density: spacious slides with more slide breaks/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Output language: Chinese/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Additional instruction: Keep terminology consistent/);

  await page.reload();
  await openAiPrompt(page);
  await expect(page.locator("#ai-audience")).toHaveValue("technical");
  await expect(page.locator("#ai-custom-instruction")).toHaveValue("Keep terminology consistent.");

  await page.locator("#ai-reset-preferences").click();
  await expect(page.locator("#ai-audience")).toHaveValue("general");
  await expect(page.locator("#ai-detail")).toHaveValue("balanced");
  await expect(page.locator("#ai-custom-instruction")).toHaveValue("");

  await page.locator("#ai-prompt-mode").selectOption("slip-to-report");
  await expect(page.locator("#ai-prompt-source")).not.toBeDisabled();
  await expect(page.locator("#ai-prompt-source option[value='current']")).not.toBeDisabled();
  await page.locator("#ai-prompt-source").selectOption("current");
  await page.locator("#ai-generate-prompt").click();
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Task: Convert the provided Slip Markdown deck into a coherent written report/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/# Current Deck/);

  await page.locator("#ai-prompt-mode").selectOption("refine-slip");
  await expect(page.locator("#ai-prompt-source option[value='current']")).not.toBeDisabled();
  await page.locator("#ai-prompt-source").selectOption("current");
  await page.locator("#ai-generate-prompt").click();
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/Task: Refine the provided Slip Markdown deck/);
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/# Current Deck/);

  await page.locator("#ai-prompt-source").selectOption("pasted");
  await page.locator("#ai-external-content").fill("External article paragraph.");
  await expect(page.locator("#ai-generated-prompt")).toHaveValue("");

  await page.locator("#ai-generate-prompt").click();
  await expect(page.locator("#ai-generated-prompt")).toHaveValue(/External article paragraph/);
  await expect(page.locator("#ai-generated-prompt")).not.toHaveValue(/# Current Deck/);

  await page.locator("#ai-copy-prompt").click();
  await expect(page.locator("#status")).toHaveText("AI prompt copied.");
  await expect(page.evaluate(() => window.__copiedAiPrompt)).resolves.toContain("External article paragraph.");
});

test("reviews and applies external AI output", async ({ page }) => {
  await page.addInitScript((markdown) => {
    window.localStorage.setItem("slip.markdown", markdown);
  }, deck);

  await page.goto("/");
  await openAiPrompt(page);

  const chattyResult = "Here is the deck:\n\n# Wrapped";
  await page.locator("#ai-result").fill(chattyResult);
  await expect(page.locator("#ai-result-review")).toContainText("Remove the AI preface");
  await expect(page.locator("#ai-apply-result")).toBeDisabled();

  const wrappedResult = "```markdown\n# Wrapped\n```";
  await page.locator("#ai-result").fill(wrappedResult);
  await expect(page.locator("#ai-result-review")).toContainText("No slide separators found");
  await expect(page.locator("#ai-apply-result")).toBeEnabled();

  const validResult = "```markdown\n# AI Result\n\n- Applied point.\n\n---\n\n# Second Result\n\nDetails.\n```";
  await page.locator("#ai-result").fill(validResult);
  await expect(page.locator("#ai-result-review")).toHaveText("Result is ready to apply.");
  await expect(page.locator("#ai-current-preview")).toHaveValue(/# Current Deck/);
  await expect(page.locator("#ai-result-preview")).toHaveValue(/# AI Result/);
  await expect(page.locator("#ai-result-preview")).not.toHaveValue(/```markdown/);
  await expect(page.locator("#ai-apply-result")).toBeEnabled();

  await page.locator("#ai-apply-result").click();
  await expect(page.locator("#ai-tools-dialog")).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("AI Result");
  await expect(page.locator("#status")).toHaveText("AI result applied to the editor.");

  await openAiPrompt(page);
  await expect(page.locator("#ai-undo-apply")).toBeEnabled();
  await page.locator("#ai-undo-apply").click();
  await expect(page.locator(".cm-content")).toContainText("Current Deck");
  await expect(page.locator("#status")).toHaveText("AI apply undone.");
});
