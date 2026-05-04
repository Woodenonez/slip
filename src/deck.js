import katex from "katex";
import "katex/dist/katex.min.css";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLang from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import "highlight.js/styles/github.css";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdownLang);
hljs.registerLanguage("md", markdownLang);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("xml", xml);

export const sampleMarkdown = `---
title: Slip Demo
theme: clean
size: widescreen
---

<style>
h1 {
  letter-spacing: 0.02em;
}
</style>

# Slip

Browser-native Markdown slides with reliable print export.

- Write Markdown
- Preview fixed-size slides
- Print or save as PDF

???
Speaker notes are written after three question marks.

---

## Images and code

![Placeholder](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 360'%3E%3Crect width='900' height='360' fill='%23e5f2ef'/%3E%3Ctext x='450' y='190' text-anchor='middle' font-family='Arial' font-size='48' fill='%230f554c'%3EDrop images into the editor%3C/text%3E%3C/svg%3E)

\`\`\`js
const deck = parseSlides(markdown);
render(deck);
\`\`\`

Inline math works: $E = mc^2$

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

---

## Export

Use **Export > PDF** to open the browser print dialog.

The preview is designed as a print page first, then scaled for screen reading.
`;

export const newDeckMarkdown = `---
title: New Deck
theme: clean
size: widescreen
---

# Title Slide

Start with the main idea.

---

## Key Points

- First point
- Second point
- Third point

---

## Closing

End with the takeaway.
`;

export const slideSizes = {
  widescreen: {
    label: "16:9",
    width: 1280,
    height: 720,
    printWidth: "16in",
    printHeight: "9in",
    page: "16in 9in",
  },
  a4: {
    label: "A4",
    width: 794,
    height: 1123,
    printWidth: "210mm",
    printHeight: "297mm",
    page: "A4",
  },
};

export function createDeckParser() {
  let slideParseCache = new Map();

  return function parseDeck(markdown) {
    const normalized = markdown.replace(/\r\n?/g, "\n");
    const frontmatter = parseFrontmatter(normalized);
    const customCss = extractCustomCss(frontmatter.body);
    const rawSlides = splitSlides(customCss.body);
    const nextSlideCache = new Map();
    const slides = rawSlides.map((source, index) => {
      const sourceHash = hashString(source);
      const cached = slideParseCache.get(sourceHash);
      const parsed = cached || parseSlideParts(source, sourceHash);
      nextSlideCache.set(sourceHash, parsed);
      return {
        id: `slide-${index + 1}`,
        index,
        source,
        ...parsed,
        title: parsed.title || `Slide ${index + 1}`,
      };
    });
    slideParseCache = nextSlideCache;

    return {
      meta: {
        title: frontmatter.meta.title || "Untitled deck",
        theme: frontmatter.meta.theme || "clean",
        size: normalizeSlideSize(frontmatter.meta.size),
      },
      customCss: customCss.css,
      slides: slides.length ? slides : [{
        id: "slide-1",
        index: 0,
        source: "",
        content: "",
        notes: "",
        hash: hashString(""),
        title: "Slide 1",
      }],
      warnings: [...frontmatter.warnings, ...customCss.warnings],
    };
  };
}

export function normalizeSlideSize(size) {
  if (size === "a4" || size === "A4") return "a4";
  if (size === "16:9" || size === "widescreen") return "widescreen";
  return "widescreen";
}

export function renderMarkdown(markdown, options = {}) {
  const lines = markdown.split("\n");
  let html = "";
  let paragraph = [];
  let list = null;
  let inCode = false;
  let inMath = false;
  let codeBuffer = [];
  let mathBuffer = [];
  let codeLang = "";

  function flushParagraph() {
    if (!paragraph.length) return;
    html += `<p>${inlineMarkdown(paragraph.join(" "), options)}</p>`;
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    html += `<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item, options)}</li>`).join("")}</${list.type}>`;
    list = null;
  }

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, "  ");

    if (/^\s*```/.test(line)) {
      if (inMath) {
        mathBuffer.push(rawLine);
        return;
      }
      if (inCode) {
        html += codeBlockHtml(codeLang, codeBuffer.join("\n"));
        inCode = false;
        codeBuffer = [];
        codeLang = "";
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = line.replace(/^\s*```/, "").trim();
      }
      return;
    }

    if (/^\s*\$\$\s*$/.test(line)) {
      if (inCode) {
        codeBuffer.push(rawLine);
        return;
      }
      if (inMath) {
        html += mathBlockHtml(mathBuffer.join("\n"));
        inMath = false;
        mathBuffer = [];
      } else {
        flushParagraph();
        flushList();
        inMath = true;
      }
      return;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      return;
    }

    if (inMath) {
      mathBuffer.push(rawLine);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2], options)}</h${level}>`;
      return;
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      return;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html += `<blockquote>${inlineMarkdown(quote[1], options)}</blockquote>`;
      return;
    }

    paragraph.push(line.trim());
  });

  if (inCode) {
    html += codeBlockHtml(codeLang, codeBuffer.join("\n"));
  }
  if (inMath) {
    html += mathBlockHtml(mathBuffer.join("\n"));
  }
  flushParagraph();
  flushList();
  return html || "<p></p>";
}

export function scopeCustomCss(css) {
  if (!css.trim()) return "";
  return css
    .split("}")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const parts = rule.split("{");
      if (parts.length < 2) return "";
      const selectors = parts.shift().trim();
      const declarations = parts.join("{").trim();
      if (!selectors || !declarations || selectors.startsWith("@")) return "";
      const scopedSelectors = selectors
        .split(",")
        .map((selector) => `.slide ${selector.trim()}`)
        .join(", ");
      return `${scopedSelectors} { ${declarations} }`;
    })
    .filter(Boolean)
    .join("\n");
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function unescapeHtml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
}

export function hashString(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function parseSlideParts(source, sourceHash = hashString(source)) {
  const noteParts = source.split(/\n\?\?\?\n?/);
  const content = (noteParts.shift() || "").trim();
  const notes = noteParts.join("\n???\n").trim();
  return {
    content,
    notes,
    hash: hashString(`${sourceHash}:${content}\n???\n${notes}`),
    title: extractTitle(content),
  };
}

export function extractCustomCss(markdown) {
  const warnings = [];
  const styleMatch = markdown.match(/^\s*<style>\n([\s\S]*?)\n<\/style>\s*/i);
  if (!styleMatch) return { body: markdown, css: "", warnings };
  return {
    body: markdown.slice(styleMatch[0].length),
    css: styleMatch[1].trim(),
    warnings,
  };
}

function parseFrontmatter(markdown) {
  const result = { meta: {}, body: markdown, warnings: [] };
  if (!markdown.startsWith("---\n")) return result;

  const end = markdown.indexOf("\n---", 4);
  if (end === -1) {
    result.warnings.push("Frontmatter start found without closing marker.");
    return result;
  }

  const raw = markdown.slice(4, end).trim();
  result.body = markdown.slice(end + 4).replace(/^\n/, "");
  raw.split("\n").forEach((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) result.meta[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  });
  return result;
}

function splitSlides(body) {
  const slides = [];
  let current = [];
  let inFence = false;

  body.split("\n").forEach((line) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^---\s*$/.test(line)) {
      slides.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  });
  slides.push(current.join("\n"));
  return slides.map((slide) => slide.trim()).filter((slide, index, all) => slide || all.length === 1 || index < all.length - 1);
}

export function extractTitle(markdown) {
  const heading = markdown.match(/^#{1,3}\s+(.+)$/m);
  if (heading) return stripMarkdown(heading[1]).slice(0, 80);
  const firstText = markdown.split("\n").find((line) => line.trim() && !line.trim().startsWith("!"));
  return firstText ? stripMarkdown(firstText).slice(0, 80) : "";
}

function codeBlockHtml(language, code) {
  const lang = language.trim();
  const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
  const highlighted = highlightCode(lang, code);
  return `<pre>${label}<code class="hljs" data-lang="${escapeHtml(lang)}">${highlighted}</code></pre>`;
}

function highlightCode(language, code) {
  const normalizedLanguage = language.toLowerCase();
  if (!normalizedLanguage || !hljs.getLanguage(normalizedLanguage)) {
    return escapeHtml(code);
  }
  try {
    return hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value;
  } catch (_error) {
    return escapeHtml(code);
  }
}

function mathBlockHtml(source) {
  return `<div class="math-block">${renderMath(source, true)}</div>`;
}

function inlineMarkdown(text, options) {
  const codeSpans = [];
  let output = escapeHtml(text);
  output = output.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `@@CODE${codeSpans.length}@@`;
    codeSpans.push(`<code>${code}</code>`);
    return token;
  });
  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, source) => {
    const rawSource = unescapeHtml(source);
    const resolvedSource = options.resolveAssetUrl
      ? options.resolveAssetUrl(rawSource)
      : rawSource;
    if (!resolvedSource) {
      return options.renderMissingAsset?.(rawSource) || "";
    }
    return `<img alt="${escapeHtml(unescapeHtml(alt))}" src="${escapeHtml(resolvedSource)}">`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_match, prefix, source) => `${prefix}${renderMath(unescapeHtml(source), false)}`);
  codeSpans.forEach((code, index) => {
    output = output.replace(`@@CODE${index}@@`, code);
  });
  return output;
}

function renderMath(source, displayMode) {
  try {
    return katex.renderToString(source.trim(), {
      displayMode,
      throwOnError: false,
      strict: "warn",
      trust: false,
    });
  } catch (_error) {
    return `<code class="math-error">${escapeHtml(source)}</code>`;
  }
}

function stripMarkdown(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .trim();
}
