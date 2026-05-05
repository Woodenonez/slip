import assert from "node:assert/strict";
import test from "node:test";
import {
  aiPromptModes,
  aiPromptPreferenceDefaults,
  aiPromptSources,
  buildAiPrompt,
  normalizeAiPromptPreferences,
  normalizeAiResultContent,
  validateAiResult,
} from "../src/aiPrompts.js";

test("defines external AI prompt modes and input sources", () => {
  assert.deepEqual(aiPromptModes.map((mode) => mode.id), ["file-to-slip", "refine-slip", "slip-to-report"]);
  assert.deepEqual(aiPromptSources.map((source) => source.id), ["current", "pasted", "template"]);
  assert.equal(aiPromptPreferenceDefaults.detail, "balanced");
});

test("builds a file-to-slip prompt with supplied source content", () => {
  const prompt = buildAiPrompt({
    mode: "file-to-slip",
    source: "pasted",
    content: "Research notes about temporary links.",
  });

  assert.match(prompt, /Task: Convert the provided text or PDF-extracted content into valid Slip Markdown/);
  assert.match(prompt, /Return exactly one Markdown code block containing only the Slip Markdown deck/);
  assert.match(prompt, /Return the complete final deck, not a summary, partial excerpt, patch, diff, or instructions/);
  assert.match(prompt, /Treat only the content between `<<<` and `>>>` as the source text or PDF extraction/);
  assert.match(prompt, /Do not use any existing Slip Markdown deck as input for this task/);
  assert.match(prompt, /Do not include the `<<<` or `>>>` markers in the output/);
  assert.match(prompt, /Treat each slide as one presentation page/);
  assert.match(prompt, /Keep each page short enough for a 16:9 slide/);
  assert.match(prompt, /Split long sections across multiple pages/);
  assert.match(prompt, /use \$\.\.\.\$ for inline equations and \$\$\.\.\.\$\$ for block equations/);
  assert.match(prompt, /Repair obvious PDF\/text-extraction artifacts/);
  assert.match(prompt, /Research notes about temporary links/);
  assert.match(prompt, /<<<\nResearch notes about temporary links\.\n>>>/);
  assert.doesNotMatch(prompt, /You are helping me/);
});

test("normalizes prompt preferences and includes them in generated prompts", () => {
  assert.deepEqual(normalizeAiPromptPreferences({
    audience: "expert",
    detail: "detailed",
    slideDensity: "spacious",
    outputLanguage: "chinese",
    customInstruction: "Use a formal tone.",
  }), {
    audience: "general",
    detail: "detailed",
    slideDensity: "spacious",
    outputLanguage: "chinese",
    customInstruction: "Use a formal tone.",
  });

  const prompt = buildAiPrompt({
    mode: "file-to-slip",
    source: "template",
    preferences: {
      audience: "technical",
      detail: "concise",
      slideDensity: "compact",
      outputLanguage: "english",
      customInstruction: "Prefer examples over definitions.",
    },
  });

  assert.match(prompt, /Prompt preferences:/);
  assert.match(prompt, /Audience: technical audience/);
  assert.match(prompt, /Detail level: concise/);
  assert.match(prompt, /Slide density: compact slides with fewer total slides/);
  assert.match(prompt, /Output language: English/);
  assert.match(prompt, /Additional instruction: Prefer examples over definitions/);
  assert.match(prompt, /\[ATTACH OR PROVIDE THE TXT\/PDF CONTENT IN THE AI TOOL\]/);
});

test("builds a template-only prompt without editor content", () => {
  const prompt = buildAiPrompt({
    mode: "refine-slip",
    source: "template",
    content: "# Current Deck",
  });

  assert.match(prompt, /Task: Refine the provided Slip Markdown deck/);
  assert.match(prompt, /Return exactly one Markdown code block containing only the refined Slip Markdown deck/);
  assert.match(prompt, /Return the complete refined deck, not a summary, partial excerpt, patch, diff, or instructions/);
  assert.match(prompt, /Treat only the content between `<<<` and `>>>` as the input deck/);
  assert.match(prompt, /use \$\.\.\.\$ for inline equations and \$\$\.\.\.\$\$ for block equations/);
  assert.match(prompt, /\[PASTE SLIP MARKDOWN HERE\]/);
  assert.doesNotMatch(prompt, /# Current Deck/);
});

test("builds a slip-to-report prompt", () => {
  const prompt = buildAiPrompt({
    mode: "slip-to-report",
    source: "current",
    content: "# Deck\n\n---\n\n# Second",
  });

  assert.match(prompt, /Task: Convert the provided Slip Markdown deck into a coherent written report/);
  assert.match(prompt, /Return exactly one Markdown code block containing only the report text/);
  assert.match(prompt, /Return the complete final report, not a summary, partial excerpt, patch, diff, or instructions/);
  assert.match(prompt, /Remove slide separators and presentation-only syntax/);
  assert.match(prompt, /# Deck\n\n---\n\n# Second/);
});

test("validates AI markdown results before applying", () => {
  assert.deepEqual(validateAiResult({ mode: "file-to-slip", content: "" }), {
    valid: false,
    errors: ["empty"],
    warnings: [],
  });

  assert.deepEqual(validateAiResult({
    mode: "file-to-slip",
    content: "```markdown\n# Wrapped\n```",
  }), {
    valid: true,
    errors: [],
    warnings: ["missing-slide-separators"],
  });

  assert.deepEqual(validateAiResult({
    mode: "refine-slip",
    content: "# Slide\n\n::: notes",
  }), {
    valid: true,
    errors: [],
    warnings: ["missing-slide-separators", "unsupported-directive"],
  });

  assert.deepEqual(validateAiResult({
    mode: "slip-to-report",
    content: "# Report\n\n---\n\nText\n\n???\n\nNote",
  }), {
    valid: true,
    errors: [],
    warnings: ["report-has-slide-separators", "report-has-speaker-notes"],
  });
});

test("normalizes a single AI markdown code fence wrapper", () => {
  assert.equal(normalizeAiResultContent("```markdown\n# Slide\n\n---\n\n# Second\n```"), "# Slide\n\n---\n\n# Second");
  assert.equal(normalizeAiResultContent("# Slide"), "# Slide");
});
