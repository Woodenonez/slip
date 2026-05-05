export const aiPromptModes = [
  {
    id: "file-to-slip",
    label: "File to Slip Markdown",
  },
  {
    id: "refine-slip",
    label: "Refine Slip Markdown",
  },
  {
    id: "slip-to-report",
    label: "Slip to Report",
  },
];

export const aiPromptSources = [
  {
    id: "current",
    label: "Current Slip Markdown",
  },
  {
    id: "pasted",
    label: "User-pasted external content",
  },
  {
    id: "template",
    label: "No content, prompt template only",
  },
];

export const aiPromptPreferenceDefaults = {
  audience: "general",
  detail: "balanced",
  slideDensity: "balanced",
  outputLanguage: "same",
  customInstruction: "",
};

const aiPromptPreferenceOptions = {
  audience: new Set(["general", "technical", "executive", "teaching"]),
  detail: new Set(["concise", "balanced", "detailed"]),
  slideDensity: new Set(["compact", "balanced", "spacious"]),
  outputLanguage: new Set(["same", "english", "chinese"]),
};

export function normalizeAiPromptPreferences(preferences = {}) {
  const normalized = { ...aiPromptPreferenceDefaults };
  Object.keys(aiPromptPreferenceOptions).forEach((key) => {
    if (aiPromptPreferenceOptions[key].has(preferences[key])) normalized[key] = preferences[key];
  });
  normalized.customInstruction = String(preferences.customInstruction || "").trim().slice(0, 600);
  return normalized;
}

export function buildAiPrompt({ mode, source, content = "", preferences = {} }) {
  const normalizedMode = aiPromptModes.some((item) => item.id === mode) ? mode : aiPromptModes[0].id;
  const normalizedSource = aiPromptSources.some((item) => item.id === source) ? source : aiPromptSources[0].id;
  const trimmedContent = normalizedSource === "template" ? "" : String(content || "").trim();
  const normalizedPreferences = normalizeAiPromptPreferences(preferences);

  if (normalizedMode === "refine-slip") return refineSlipPrompt(trimmedContent, normalizedPreferences);
  if (normalizedMode === "slip-to-report") return slipToReportPrompt(trimmedContent, normalizedPreferences);
  return fileToSlipPrompt(trimmedContent, normalizedPreferences);
}

export function validateAiResult({ mode, content = "" }) {
  const normalizedMode = aiPromptModes.some((item) => item.id === mode) ? mode : aiPromptModes[0].id;
  const text = normalizeAiResultContent(content);
  const errors = [];
  const warnings = [];

  if (!text) {
    errors.push("empty");
    return { valid: false, errors, warnings };
  }

  if (/^(here(?:'s| is)|sure[,:\s]|certainly[,:\s]|i (?:can|will|have)|below is)/i.test(text)) {
    errors.push("chatty-prefix");
  }

  if (normalizedMode === "slip-to-report") {
    if (/^---\s*$/m.test(text)) warnings.push("report-has-slide-separators");
    if (/^\?\?\?\s*$/m.test(text)) warnings.push("report-has-speaker-notes");
    return { valid: errors.length === 0, errors, warnings };
  }

  if (!/^---\s*$/m.test(text)) warnings.push("missing-slide-separators");
  if (/^\s*(:::+|<!--\s*(?:fragment|slide|layout)|\+\+\+|====)\s*/im.test(text)) {
    warnings.push("unsupported-directive");
  }
  if (/<script\b|javascript:/i.test(text)) warnings.push("unsafe-markup");

  return { valid: errors.length === 0, errors, warnings };
}

export function normalizeAiResultContent(content = "") {
  const text = String(content || "").trim();
  const fence = text.match(/^```(?:markdown|md|text)?\s*\n?([\s\S]*?)\n?```$/i);
  return fence ? fence[1].trim() : text;
}

function promptContent(content, placeholder) {
  return content || placeholder;
}

function preferenceBlock(preferences) {
  const lines = [
    `- Audience: ${preferenceLabel("audience", preferences.audience)}.`,
    `- Detail level: ${preferenceLabel("detail", preferences.detail)}.`,
    `- Slide density: ${preferenceLabel("slideDensity", preferences.slideDensity)}.`,
    `- Output language: ${preferenceLabel("outputLanguage", preferences.outputLanguage)}.`,
  ];
  if (preferences.customInstruction) {
    lines.push(`- Additional instruction: ${preferences.customInstruction}`);
  }
  return `Prompt preferences:
${lines.join("\n")}`;
}

function preferenceLabel(type, value) {
  const labels = {
    audience: {
      general: "general audience",
      technical: "technical audience",
      executive: "executive audience",
      teaching: "teaching or classroom audience",
    },
    detail: {
      concise: "concise",
      balanced: "balanced",
      detailed: "detailed",
    },
    slideDensity: {
      compact: "compact slides with fewer total slides",
      balanced: "balanced slide count and content density",
      spacious: "spacious slides with more slide breaks",
    },
    outputLanguage: {
      same: "same language as the reference content",
      english: "English",
      chinese: "Chinese",
    },
  };
  return labels[type]?.[value] || value;
}

function fileToSlipPrompt(content, preferences) {
  return `Task: Convert the provided text or PDF-extracted content into valid Slip Markdown.

Output contract:
- Return exactly one Markdown code block containing only the Slip Markdown deck.
- Return the complete final deck, not a summary, partial excerpt, patch, diff, or instructions.
- Do not include explanations, acknowledgements, comments, or analysis outside the code block.
- Do not invent facts. If source details are unclear, keep wording general.

Reference boundary:
- Treat only the content between \`<<<\` and \`>>>\` as the source text or PDF extraction.
- Do not use any existing Slip Markdown deck as input for this task.
- Do not include the \`<<<\` or \`>>>\` markers in the output.

${preferenceBlock(preferences)}

Slip Markdown constraints:
- Separate slides with \`---\`.
- Treat each slide as one presentation page.
- Keep each page short enough for a 16:9 slide: concise title, brief body, and no overcrowded paragraphs.
- Use normal Markdown headings, paragraphs, lists, tables, images, math, and code blocks.
- If notation or equations are needed, use $...$ for inline equations and $$...$$ for block equations, ensuring block equations are written on separate lines with the opening $$, the equation, and the closing $$ each on their own line and not sharing a line with any other text.
- Use \`???\` only for speaker notes.
- Do not use animations, fragments, directives, HTML scripts, or layout-specific syntax.
- Start with YAML frontmatter only when title or theme can be inferred.
- Keep slides readable: one main idea per slide, concise titles, short bullets.
- Split long sections across multiple pages instead of creating dense slides.
- Move supporting detail into speaker notes when it helps presentation flow.
- Preserve technical details, definitions, examples, conclusions, and source order when useful.
- Repair obvious PDF/text-extraction artifacts such as broken line breaks, repeated headers or footers, page numbers, and hyphenated word breaks.

Source material:

<<<
${promptContent(content, "[ATTACH OR PROVIDE THE TXT/PDF CONTENT IN THE AI TOOL]")}
>>>`;
}

function refineSlipPrompt(content, preferences) {
  return `Task: Refine the provided Slip Markdown deck.

Output contract:
- Return exactly one Markdown code block containing only the refined Slip Markdown deck.
- Return the complete refined deck, not a summary, partial excerpt, patch, diff, or instructions.
- Do not include explanations, acknowledgements, comments, or analysis outside the code block.
- Do not invent facts or add unsupported claims.

Reference boundary:
- Treat only the content between \`<<<\` and \`>>>\` as the input deck.
- Do not include the \`<<<\` or \`>>>\` markers in the output.

${preferenceBlock(preferences)}

Refinement rules:
- Preserve valid frontmatter if present.
- Preserve the original meaning, factual content, source order, image references, math, and code blocks unless clearly broken.
- Separate slides with \`---\`.
- Use normal Markdown headings, paragraphs, lists, tables, images, math, and code blocks.
- If notation or equations are needed, use $...$ for inline equations and $$...$$ for block equations, ensuring block equations are written on separate lines with the opening $$, the equation, and the closing $$ each on their own line and not sharing a line with any other text.
- Use \`???\` only for speaker notes.
- Do not use animations, fragments, directives, HTML scripts, or layout-specific syntax.
- Improve wording, heading consistency, slide flow, and readability.
- Split overcrowded slides into multiple slides.
- Merge only when adjacent slides are clearly redundant.
- Add speaker notes only when they clarify presentation delivery.

Slip Markdown input:

<<<
${promptContent(content, "[PASTE SLIP MARKDOWN HERE]")}
>>>`;
}

function slipToReportPrompt(content, preferences) {
  return `Task: Convert the provided Slip Markdown deck into a coherent written report.

Output contract:
- Return exactly one Markdown code block containing only the report text.
- Return the complete final report, not a summary, partial excerpt, patch, diff, or instructions.
- Do not include explanations, acknowledgements, comments, or analysis outside the code block.
- Do not invent facts or add unsupported claims.

Reference boundary:
- Treat only the content between \`<<<\` and \`>>>\` as the input deck.
- Do not include the \`<<<\` or \`>>>\` markers in the output.

${preferenceBlock(preferences)}

Report rules:
- Remove slide separators and presentation-only syntax.
- Do not mention that the source was a slide deck unless the content itself requires it.
- Use document-style headings and subheadings.
- Convert bullets into readable prose when that improves flow.
- Keep bullets only for lists that are naturally list-shaped.
- Preserve the deck's logical structure, technical details, examples, conclusions, math, and code blocks.
- Incorporate speaker notes after \`???\` naturally into the report.
- For images, mention them only if their alt text or surrounding context is meaningful.

Slip Markdown input:

<<<
${promptContent(content, "[PASTE SLIP MARKDOWN HERE]")}
>>>`;
}
