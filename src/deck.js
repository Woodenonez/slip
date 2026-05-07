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
import sampleDeckTemplate from "../templates/sample_deck.md?raw";
import newDeckTemplate from "../templates/new_deck.md?raw";

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

export const sampleMarkdown = sampleDeckTemplate;
export const newDeckMarkdown = newDeckTemplate;

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

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.replace(/\t/g, "  ");

    if (/^\s*```/.test(line)) {
      if (inMath) {
        mathBuffer.push(rawLine);
        continue;
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
      continue;
    }

    if (/^\s*\$\$\s*$/.test(line)) {
      if (inCode) {
        codeBuffer.push(rawLine);
        continue;
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
      continue;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    if (inMath) {
      mathBuffer.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const columns = line.match(/^:::columns\s+(\d+)\s*:\s*(\d+)\s*$/);
    if (columns) {
      flushParagraph();
      flushList();
      const parsedColumns = parseColumnsBlock(lines, lineIndex, Number(columns[1]), Number(columns[2]), options);
      html += parsedColumns.html;
      lineIndex = parsedColumns.endIndex;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html += `<h${level}>${inlineMarkdown(heading[2], options)}</h${level}>`;
      continue;
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
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      html += `<blockquote>${inlineMarkdown(quote[1], options)}</blockquote>`;
      continue;
    }

    paragraph.push(line.trim());
  }

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

function parseColumnsBlock(lines, startIndex, left, right, options) {
  const invalidRatio = left + right !== 10 || left <= 0 || right <= 0;
  const columns = ["", ""];
  let currentColumn = -1;
  let endIndex = startIndex;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === ":::end") {
      endIndex = index;
      break;
    }
    if (line === ":::column") {
      currentColumn += 1;
      continue;
    }
    if (currentColumn >= 0 && currentColumn < 2) {
      columns[currentColumn] += `${lines[index]}\n`;
    }
  }

  if (endIndex === startIndex || invalidRatio || currentColumn < 1) {
    return {
      endIndex,
      html: `<div class="slip-columns-warning">${escapeHtml("Invalid columns block: ratio must add up to 10 and include two columns.")}</div>`,
    };
  }

  const leftHtml = renderMarkdown(columns[0].trim(), options);
  const rightHtml = renderMarkdown(columns[1].trim(), options);
  return {
    endIndex,
    html: `<div class="slip-columns" style="grid-template-columns: ${left}fr ${right}fr;">
      <div class="slip-column">${leftHtml}</div>
      <div class="slip-column">${rightHtml}</div>
    </div>`,
  };
}

export function scopeCustomCss(css) {
  if (!css.trim()) return "";
  const scopeSelector = (selector) => {
    const trimmed = selector.trim();
    if (trimmed === ":page") return ".slide .slide-inner";
    if (trimmed === ":page-content") return ".slide .slide-inner";
    if (trimmed.startsWith(".slide")) return trimmed;
    return `.slide ${trimmed}`;
  };
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
        .map(scopeSelector)
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
  if (lang === "slip-chart") return slipChartHtml(code);
  const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
  const highlighted = highlightCode(lang, code);
  return `<pre>${label}<code class="hljs" data-lang="${escapeHtml(lang)}">${highlighted}</code></pre>`;
}

function slipChartHtml(source) {
  const chart = parseSlipChart(source);
  const rendered = renderSlipChart(chart);
  return `<pre class="slip-chart"><code>${escapeHtml(rendered)}</code></pre>`;
}

function parseSlipChart(source) {
  const chart = { type: "horizontal-bar", caption: "", unit: 10, data: {} };
  source.split("\n").forEach((line) => {
    const match = line.match(/^([A-Za-z-]+):\s*(.+)$/);
    if (!match) return;
    const key = match[1].trim();
    const value = match[2].trim();
    if (key === "type") chart.type = value;
    if (key === "caption") chart.caption = value.replace(/^["']|["']$/g, "");
    if (key === "value-per-bar" || key === "value-per-point") chart.unit = Math.max(1, Number(value) || 10);
    if (key === "data") {
      try {
        chart.data = JSON.parse(value);
      } catch {
        chart.data = {};
      }
    }
  });
  return chart;
}

function renderSlipChart(chart) {
  if (chart.type === "vertical-bar" || chart.type === "vertical-point") return renderVerticalChart(chart);
  if (chart.type === "horizontal-point") return renderHorizontalChart(chart, "•", "point");
  if (chart.type === "progress-bar") return renderProgressChart(chart);
  return renderHorizontalChart(chart, "█", "bar");
}

function chartCaption(chart) {
  return chart.caption ? `${chart.caption}\n` : "";
}

function chartEntries(data) {
  return Object.entries(data)
    .map(([label, value]) => [String(label), Number(value) || 0]);
}

function renderHorizontalChart(chart, mark, unitName) {
  const maxMarks = unitName === "point" ? 50 : 50;
  const lines = chartEntries(chart.data).map(([label, value]) => {
    const count = Math.floor(value / chart.unit);
    const clipped = count > maxMarks;
    const marks = mark.repeat(Math.max(0, Math.min(count, maxMarks))) + (clipped ? "~" : "");
    return `${label.padStart(3)} | ${marks} ${value}`;
  });
  return `${chartCaption(chart)}${lines.join("\n")}`.trimEnd();
}

function renderProgressChart(chart) {
  const lines = chartEntries(chart.data).map(([label, value]) => {
    const percent = Math.max(0, Math.min(100, value));
    const filled = Math.floor(percent / chart.unit);
    const empty = Math.max(0, Math.floor(100 / chart.unit) - filled);
    return `${label.padEnd(8)} [${"█".repeat(filled)}${"░".repeat(empty)}] ${percent}%`;
  });
  return `${chartCaption(chart)}${lines.join("\n")}`.trimEnd();
}

function renderVerticalChart(chart) {
  const mark = chart.type === "vertical-point" ? "•" : "█";
  const entries = chartEntries(chart.data).map(([label, value]) => ({
    label: label.slice(0, 2).padEnd(2),
    value,
    count: Math.floor(value / chart.unit),
  }));
  const maxRows = 10;
  const clipped = entries.some((entry) => entry.count > maxRows);
  const height = Math.min(maxRows, Math.max(1, ...entries.map((entry) => entry.count)));
  const lines = [];
  if (clipped) {
    lines.push(`      ${entries.map((entry) => entry.count > maxRows ? "~ " : "  ").join(" ")}`);
  }
  for (let row = height; row >= 1; row -= 1) {
    const valueLabel = String(row * chart.unit).padStart(3);
    const cells = entries.map((entry) => entry.count >= row ? `${mark} ` : "  ").join(" ");
    lines.push(`${valueLabel} | ${cells}`);
  }
  lines.push(`    +${"-".repeat(Math.max(1, entries.length * 3))}`);
  lines.push(`      ${entries.map((entry) => entry.label).join(" ")}`);
  return `${chartCaption(chart)}${lines.join("\n")}`.trimEnd();
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
  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)(\{[^}]*\})?/g, (_match, alt, source, attributes = "") => {
    const rawSource = unescapeHtml(source);
    const resolvedSource = options.resolveAssetUrl
      ? options.resolveAssetUrl(rawSource)
      : rawSource;
    if (!resolvedSource) {
      return options.renderMissingAsset?.(rawSource) || "";
    }
    const width = parseImageWidthAttribute(unescapeHtml(attributes));
    const style = width ? ` style="width: ${escapeHtml(width)};"` : "";
    return `<img alt="${escapeHtml(unescapeHtml(alt))}" src="${escapeHtml(resolvedSource)}"${style}>`;
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

function parseImageWidthAttribute(attributes) {
  const match = attributes.match(/\bwidth\s*=\s*([^\s}]+)/i);
  if (!match) return "";
  const value = match[1].trim().replace(/^["']|["']$/g, "");
  if (/^\d+(\.\d+)?(px|%)$/i.test(value)) return value;
  return "";
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
    .replace(/!\[([^\]]*)\]\([^)]+\)(\{[^}]*\})?/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#-]/g, "")
    .trim();
}
