import { EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  highlightSelectionMatches,
  searchKeymap,
} from "@codemirror/search";
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

  const sampleMarkdown = `---
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

  const newDeckMarkdown = `---
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

  const projectStorage = {
    dbName: "slip-project-vfs",
    dbVersion: 1,
    currentProjectId: "current",
    localSnapshotKey: "slip.project.document",
    documentStore: "documents",
    assetStore: "assets",
  };

  const initialProjectDocument = readLocalProjectSnapshot();

  const state = {
    markdown: initialProjectDocument?.markdown || localStorage.getItem("slip.markdown") || sampleMarkdown,
    deck: null,
    activeSlide: 0,
    showNotes: false,
    presentationOpen: false,
    presentationMode: "presenter",
    presentationStartedAt: 0,
    presentationTimer: 0,
    autoSplitDraft: null,
    project: initialProjectDocument
      ? createProjectFromMarkdown(initialProjectDocument.markdown, [], initialProjectDocument.manifest)
      : createSingleFileProject(),
    db: null,
    storageReady: false,
    storageWarning: "",
    saveTimer: 0,
    previewKeys: new Map(),
    overflowSlides: new Set(),
    assetSort: "name",
  };

  const slideSizes = {
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

  function createSingleFileProject() {
    return {
      mode: "single-file",
      manifest: null,
      assets: new Map(),
    };
  }

  function createProjectManifest(deck, assetRecords = []) {
    return {
      schema: "slip.project",
      version: 2,
      title: deck.meta.title,
      theme: deck.meta.theme,
      size: deck.meta.size,
      entry: "slides.md",
      assets: assetRecords.map((asset) => ({
        id: asset.id,
        path: asset.path,
        filename: asset.filename,
        mime: asset.mime,
        size: asset.size,
        hash: asset.hash,
      })),
    };
  }

  function openProjectDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }

      const request = indexedDB.open(projectStorage.dbName, projectStorage.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(projectStorage.documentStore)) {
          db.createObjectStore(projectStorage.documentStore, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(projectStorage.assetStore)) {
          const assets = db.createObjectStore(projectStorage.assetStore, { keyPath: "id" });
          assets.createIndex("projectId", "projectId", { unique: false });
          assets.createIndex("path", "path", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open project storage."));
      request.onblocked = () => reject(new Error("Project storage is blocked by another open Slip tab."));
    });
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function idbTransactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
    });
  }

  function normalizeProjectManifest(rawManifest, deck, assets) {
    const manifest = rawManifest && typeof rawManifest === "object" ? rawManifest : {};
    const normalizedAssets = assets.map((asset) => {
      const existing = Array.isArray(manifest.assets)
        ? manifest.assets.find((item) => item.path === asset.path || item.hash === asset.hash)
        : null;
      return {
        ...asset,
        id: existing?.id || asset.id,
      };
    });

    return {
      schema: "slip.project",
      version: Number(manifest.version) || 2,
      title: String(manifest.title || deck.meta.title || "Untitled deck"),
      theme: String(manifest.theme || deck.meta.theme || "clean"),
      size: normalizeSlideSize(manifest.size || deck.meta.size),
      entry: "slides.md",
      assets: normalizedAssets.map((asset) => ({
        id: asset.id,
        path: asset.path,
        filename: asset.filename,
        mime: asset.mime,
        size: asset.size,
        hash: asset.hash,
      })),
    };
  }

  const elements = {
    app: document.getElementById("app"),
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    outline: document.getElementById("outline-list"),
    status: document.getElementById("status"),
    deckTitle: document.getElementById("deck-title"),
    projectMode: document.getElementById("project-mode"),
    newDeck: document.getElementById("new-deck"),
    newDeckDialog: document.getElementById("new-deck-dialog"),
    newDeckMessage: document.getElementById("new-deck-message"),
    newDeckConfirm: document.getElementById("new-deck-confirm"),
    newDeckCancel: document.getElementById("new-deck-cancel"),
    themePicker: document.getElementById("theme-picker"),
    sizePicker: document.getElementById("size-picker"),
    showNotes: document.getElementById("show-notes"),
    importMenuButton: document.getElementById("import-menu-button"),
    importMenuOptions: document.getElementById("import-menu-options"),
    importFile: document.getElementById("import-file"),
    importProject: document.getElementById("import-project"),
    projectize: document.getElementById("projectize"),
    projectizeDialog: document.getElementById("projectize-dialog"),
    projectizeConfirm: document.getElementById("projectize-confirm"),
    projectizeCancel: document.getElementById("projectize-cancel"),
    exportMenuButton: document.getElementById("export-menu-button"),
    exportMenuOptions: document.getElementById("export-menu-options"),
    exportMd: document.getElementById("export-md"),
    autoSplit: document.getElementById("auto-split"),
    customCssToggle: document.getElementById("custom-css-toggle"),
    customCssPanel: document.getElementById("custom-css-panel"),
    customCssEditor: document.getElementById("custom-css-editor"),
    customCssClose: document.getElementById("custom-css-close"),
    customCssStatus: document.getElementById("custom-css-status"),
    assetPanel: document.getElementById("asset-panel"),
    assetImport: document.getElementById("asset-import"),
    assetList: document.getElementById("asset-list"),
    assetSort: document.getElementById("asset-sort"),
    autoSplitDialog: document.getElementById("auto-split-dialog"),
    autoSplitSummary: document.getElementById("auto-split-summary"),
    autoSplitList: document.getElementById("auto-split-list"),
    autoSplitAccept: document.getElementById("auto-split-accept"),
    autoSplitCancel: document.getElementById("auto-split-cancel"),
    printPdf: document.getElementById("print-pdf"),
    presentMenuButton: document.getElementById("present-menu-button"),
    presentMenuOptions: document.getElementById("present-menu-options"),
    presentMirror: document.getElementById("present-mirror"),
    presentSpeaker: document.getElementById("present-speaker"),
    presentation: document.getElementById("presentation"),
    presentationSlide: document.getElementById("presentation-slide"),
    presentationNext: document.getElementById("presentation-next"),
    presentationCount: document.getElementById("presentation-count"),
    presentationTimer: document.getElementById("presentation-timer"),
    presentationNotes: document.getElementById("presentation-notes"),
    exitPresent: document.getElementById("exit-present"),
  };

  let updateTimer = 0;
  const editorView = new EditorView({
    parent: elements.editor,
    state: EditorState.create({
      doc: state.markdown,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown(),
        keymap.of([
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((viewUpdate) => {
          if (!viewUpdate.docChanged) return;
          clearTimeout(updateTimer);
          updateTimer = window.setTimeout(update, 80);
        }),
      ],
    }),
  });

  function getEditorValue() {
    return editorView.state.doc.toString();
  }

  function setEditorValue(value) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: value },
    });
    update();
  }

  function setEditorValueWithoutUpdate(value) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: value },
    });
  }

  function parseDeck(markdown) {
    const normalized = markdown.replace(/\r\n?/g, "\n");
    const frontmatter = parseFrontmatter(normalized);
    const customCss = extractCustomCss(frontmatter.body);
    const rawSlides = splitSlides(customCss.body);
    const slides = rawSlides.map((source, index) => {
      const noteParts = source.split(/\n\?\?\?\n?/);
      const content = (noteParts.shift() || "").trim();
      const notes = noteParts.join("\n???\n").trim();
      return {
        id: `slide-${index + 1}`,
        index,
        source,
        content,
        notes,
        hash: hashString(`${content}\n???\n${notes}`),
        title: extractTitle(content) || `Slide ${index + 1}`,
      };
    });

    return {
      meta: {
        title: frontmatter.meta.title || "Untitled deck",
        theme: frontmatter.meta.theme || "clean",
        size: normalizeSlideSize(frontmatter.meta.size),
      },
      customCss: customCss.css,
      slides: slides.length ? slides : [{ id: "slide-1", index: 0, source: "", content: "", notes: "", hash: hashString(""), title: "Slide 1" }],
      warnings: [...frontmatter.warnings, ...customCss.warnings],
    };
  }

  function extractCustomCss(markdown) {
    const warnings = [];
    const styleMatch = markdown.match(/^\s*<style>\n([\s\S]*?)\n<\/style>\s*/i);
    if (!styleMatch) return { body: markdown, css: "", warnings };
    return {
      body: markdown.slice(styleMatch[0].length),
      css: styleMatch[1].trim(),
      warnings,
    };
  }

  function normalizeSlideSize(size) {
    if (size === "a4" || size === "A4") return "a4";
    if (size === "16:9" || size === "widescreen") return "widescreen";
    return "widescreen";
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

  function extractTitle(markdown) {
    const heading = markdown.match(/^#{1,3}\s+(.+)$/m);
    if (heading) return stripMarkdown(heading[1]).slice(0, 80);
    const firstText = markdown.split("\n").find((line) => line.trim() && !line.trim().startsWith("!"));
    return firstText ? stripMarkdown(firstText).slice(0, 80) : "";
  }

  function renderMarkdown(markdown) {
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
      html += `<p>${inlineMarkdown(paragraph.join(" "))}</p>`;
      paragraph = [];
    }

    function flushList() {
      if (!list) return;
      html += `<${list.type}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${list.type}>`;
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
        html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
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
        html += `<blockquote>${inlineMarkdown(quote[1])}</blockquote>`;
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

  function inlineMarkdown(text) {
    const codeSpans = [];
    let output = escapeHtml(text);
    output = output.replace(/`([^`]+)`/g, (_match, code) => {
      const token = `@@CODE${codeSpans.length}@@`;
      codeSpans.push(`<code>${code}</code>`);
      return token;
    });
    output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, source) => {
      const resolvedSource = resolveProjectAssetUrl(unescapeHtml(source));
      if (!resolvedSource) {
        return missingAssetPlaceholder(unescapeHtml(source));
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
    } catch (error) {
      return `<code class="math-error">${escapeHtml(source)}</code>`;
    }
  }

  function unescapeHtml(value) {
    return String(value)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function stripMarkdown(text) {
    return text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>#-]/g, "")
      .trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function hashString(value) {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
  }

  function update() {
    const started = performance.now();
    state.markdown = getEditorValue();
    state.deck = parseDeck(state.markdown);
    syncProjectFromDeck();
    localStorage.setItem("slip.markdown", state.markdown);
    scheduleProjectSave();
    render();
    const elapsed = Math.round(performance.now() - started);
    const warnings = collectWarnings(state.deck);
    elements.status.textContent = warnings.length
      ? warnings[0]
      : `${state.deck.slides.length} slide${state.deck.slides.length === 1 ? "" : "s"} rendered in ${elapsed}ms`;
    elements.status.classList.toggle("warning", warnings.length > 0);
    console.debug("[Slip] preview render", {
      slides: state.deck.slides.length,
      elapsedMs: elapsed,
      warnings: warnings.length,
    });
  }

  function collectWarnings(deck) {
    const warnings = [...deck.warnings];
    if (state.storageWarning) warnings.push(state.storageWarning);
    const unresolvedAssets = findUnresolvedAssetReferences(state.markdown);
    if (unresolvedAssets.length) {
      warnings.push(`Unresolved asset reference${unresolvedAssets.length === 1 ? "" : "s"}: ${formatAssetReferenceList(unresolvedAssets)}.`);
    }
    const largeDataImage = state.markdown.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
    if (largeDataImage && largeDataImage[1].length > 1_400_000) {
      warnings.push("Large embedded image detected. Consider V2 project assets for decks over 1-2MB.");
    }
    return warnings;
  }

  function render() {
    const deck = state.deck;
    const isProjectMode = state.project.mode === "project";
    elements.deckTitle.textContent = deck.meta.title;
    elements.projectMode.textContent = isProjectMode ? "Project" : "Single file";
    elements.projectize.disabled = isProjectMode;
    elements.themePicker.value = ["clean", "contrast", "paper"].includes(deck.meta.theme) ? deck.meta.theme : "clean";
    elements.sizePicker.value = deck.meta.size;
    setSlideSizeVars(deck.meta.size);
    updatePrintSize(deck.meta.size);
    updatePresentationSizeClass(deck.meta.size);
    updateCustomCss(deck.customCss);
    elements.preview.classList.toggle("show-notes", state.showNotes);
    renderOutline(deck);
    renderPreview(deck);
    renderAssetPanel();
    if (state.presentationOpen) renderPresentation();
  }

  function renderOutline(deck) {
    elements.outline.innerHTML = "";
    deck.slides.forEach((slide, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `outline-item${index === state.activeSlide ? " active" : ""}${state.overflowSlides.has(slide.id) ? " has-overflow" : ""}`;
      button.dataset.slideId = slide.id;
      button.innerHTML = `<span class="outline-index">${index + 1}</span><span>${escapeHtml(slide.title)}</span>`;
      button.addEventListener("click", () => scrollToSlide(index));
      li.appendChild(button);
      elements.outline.appendChild(li);
    });
  }

  function renderPreview(deck) {
    const theme = ["clean", "contrast", "paper"].includes(deck.meta.theme) ? deck.meta.theme : "clean";
    const size = deck.meta.size;
    const assetRenderKey = projectAssetRenderKey();
    const nextKeys = new Map();
    const fragment = document.createDocumentFragment();

    deck.slides.forEach((slide, index) => {
      const key = `${theme}:${size}:${slide.hash}:${assetRenderKey}`;
      nextKeys.set(slide.id, key);

      let frame = elements.preview.querySelector(`[data-slide-id="${slide.id}"]`);
      if (!frame || state.previewKeys.get(slide.id) !== key) {
        frame = createSlideFrame(slide, index, theme, size);
      } else {
        updateSlideFrameMetadata(frame, slide, index);
      }
      fragment.appendChild(frame);
    });

    elements.preview.replaceChildren(fragment);
    state.previewKeys = nextKeys;
    scaleSlides();
    requestAnimationFrame(detectSlideOverflow);
  }

  function projectAssetRenderKey() {
    if (state.project.mode !== "project") return "single-file";
    return [...state.project.assets.values()]
      .map((asset) => `${asset.path}:${asset.hash}`)
      .sort()
      .join("|");
  }

  function createSlideFrame(slide, index, theme, size) {
    const frame = document.createElement("div");
    frame.className = "slide-frame";
    frame.id = `frame-${index}`;
    frame.dataset.slideId = slide.id;
    frame.dataset.slideIndex = String(index);
    frame.innerHTML = `<div class="slide-number">Slide ${index + 1}</div>
      ${slideHtml(slide, theme, size)}
      <div class="overflow-badge" aria-hidden="true">May clip in PDF</div>
      <div class="notes">${escapeHtml(slide.notes || "No speaker notes")}</div>`;
    return frame;
  }

  function updateSlideFrameMetadata(frame, slide, index) {
    frame.id = `frame-${index}`;
    frame.dataset.slideIndex = String(index);
    const slideNumber = frame.querySelector(".slide-number");
    if (slideNumber) slideNumber.textContent = `Slide ${index + 1}`;
    const slideElement = frame.querySelector(".slide");
    if (slideElement) slideElement.setAttribute("aria-label", slide.title);
  }

  function slideHtml(slide, theme, size) {
    return `<section class="slide theme-${theme} size-${size}" aria-label="${escapeHtml(slide.title)}">
      <div class="slide-inner">${renderMarkdown(slide.content)}</div>
    </section>`;
  }

  function scaleSlides() {
    const size = slideSizes[state.deck?.meta.size] || slideSizes.widescreen;
    const frames = elements.preview.querySelectorAll(".slide-frame");
    const available = Math.max(320, elements.preview.clientWidth - 36);
    const scale = Math.min(1, available / size.width);
    frames.forEach((frame) => {
      const slide = frame.querySelector(".slide");
      slide.style.transform = `scale(${scale})`;
      slide.style.marginBottom = `${size.height * scale - size.height}px`;
    });
  }

  function setSlideSizeVars(sizeName) {
    const size = slideSizes[sizeName] || slideSizes.widescreen;
    document.documentElement.style.setProperty("--slide-width", `${size.width}px`);
    document.documentElement.style.setProperty("--slide-height", `${size.height}px`);
    document.documentElement.style.setProperty("--print-slide-width", size.printWidth);
    document.documentElement.style.setProperty("--print-slide-height", size.printHeight);
  }

  function updatePrintSize(sizeName) {
    const size = slideSizes[sizeName] || slideSizes.widescreen;
    let printStyle = document.getElementById("print-page-size");
    if (!printStyle) {
      printStyle = document.createElement("style");
      printStyle.id = "print-page-size";
      document.head.appendChild(printStyle);
    }
    printStyle.textContent = `@page { size: ${size.page}; margin: 0; }`;
  }

  function updateCustomCss(css) {
    let style = document.getElementById("custom-slide-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "custom-slide-css";
      document.head.appendChild(style);
    }
    style.textContent = scopeCustomCss(css);
    if (elements.customCssEditor.value !== css) {
      elements.customCssEditor.value = css;
    }
    elements.customCssStatus.textContent = css ? "Applied to slide content." : "No custom CSS.";
  }

  function scopeCustomCss(css) {
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

  function detectSlideOverflow() {
    const nextOverflowSlides = new Set();
    const frames = elements.preview.querySelectorAll(":scope > .slide-frame");

    frames.forEach((frame) => {
      const slideInner = frame.querySelector(".slide-inner");
      if (!slideInner) return;
      const hasOverflow = slideInner.scrollHeight > slideInner.clientHeight + 1 || slideInner.scrollWidth > slideInner.clientWidth + 1;
      frame.classList.toggle("has-overflow", hasOverflow);
      if (hasOverflow) nextOverflowSlides.add(frame.dataset.slideId);
    });

    state.overflowSlides = nextOverflowSlides;
    markOutlineOverflow();
    updateOverflowStatus();
  }

  function markOutlineOverflow() {
    elements.outline.querySelectorAll(".outline-item").forEach((item) => {
      item.classList.toggle("has-overflow", state.overflowSlides.has(item.dataset.slideId));
    });
  }

  function updateOverflowStatus() {
    if (!state.overflowSlides.size) return;
    const overflowIndexes = state.deck.slides
      .map((slide, index) => state.overflowSlides.has(slide.id) ? index + 1 : null)
      .filter(Boolean);

    if (overflowIndexes.length) {
      elements.status.textContent = `${formatSlideList(overflowIndexes)} may clip in print/PDF.`;
      elements.status.classList.add("warning");
    }
  }

  function formatSlideList(slideNumbers) {
    if (slideNumbers.length === 1) return `Slide ${slideNumbers[0]}`;
    if (slideNumbers.length <= 4) return `Slides ${slideNumbers.join(", ")}`;
    return `Slides ${slideNumbers.slice(0, 4).join(", ")} and ${slideNumbers.length - 4} more`;
  }

  function renderAssetPanel() {
    const isProjectMode = state.project.mode === "project";
    elements.assetPanel.classList.toggle("is-inactive", !isProjectMode);
    elements.assetImport.disabled = !isProjectMode;
    elements.assetSort.disabled = !isProjectMode;

    if (!isProjectMode) {
      elements.assetList.innerHTML = '<p class="asset-empty">Projectize or import a project to manage assets.</p>';
      return;
    }

    const usage = countAssetUsage(state.markdown);
    const duplicates = findDuplicateAssetHashes();
    const assets = sortAssets([...state.project.assets.values()], usage);

    if (!assets.length) {
      elements.assetList.innerHTML = '<p class="asset-empty">No project assets yet.</p>';
      return;
    }

    elements.assetList.innerHTML = "";
    assets.forEach((asset) => {
      const item = document.createElement("section");
      item.className = "asset-item";
      item.dataset.assetPath = asset.path;
      const useCount = usage.get(asset.path) || 0;
      item.innerHTML = `<div class="asset-name" title="${escapeHtml(asset.filename)}">${escapeHtml(asset.filename)}</div>
        <div class="asset-path" title="${escapeHtml(asset.path)}">${escapeHtml(asset.path)}</div>
        <div class="asset-meta">${formatBytes(asset.size)} · used ${useCount} time${useCount === 1 ? "" : "s"}</div>
        ${duplicates.has(asset.hash) ? '<div class="asset-duplicate">Duplicate content</div>' : ""}
        <div class="asset-item-actions">
          <button type="button" data-action="insert">Insert</button>
          <button type="button" data-action="rename">Rename</button>
          <button type="button" data-action="remove">Remove</button>
        </div>`;
      elements.assetList.appendChild(item);
    });
  }

  function countAssetUsage(markdown) {
    const usage = new Map();
    extractMarkdownAssetReferences(markdown).forEach((path) => {
      usage.set(path, (usage.get(path) || 0) + 1);
    });
    return usage;
  }

  function extractMarkdownAssetReferences(markdown) {
    const references = [];
    const pattern = /!?\[[^\]]*]\(([^)]+)\)/g;
    let match = pattern.exec(markdown);
    while (match) {
      const path = normalizeAssetPath(unescapeHtml(match[1]));
      if (path.startsWith("assets/")) references.push(path);
      match = pattern.exec(markdown);
    }
    return references;
  }

  function findUnresolvedAssetReferences(markdown) {
    if (state.project.mode !== "project") return [];
    return [...new Set(extractMarkdownAssetReferences(markdown))]
      .filter((path) => !state.project.assets.has(path));
  }

  function formatAssetReferenceList(paths) {
    if (paths.length <= 3) return paths.join(", ");
    return `${paths.slice(0, 3).join(", ")} and ${paths.length - 3} more`;
  }

  function rewriteAssetReferences(markdown, oldPath, newPath) {
    return markdown.replace(/(!?\[[^\]]*]\()([^)]+)(\))/g, (match, prefix, source, suffix) => {
      const normalizedSource = normalizeAssetPath(unescapeHtml(source));
      if (normalizedSource !== oldPath) return match;
      return `${prefix}${newPath}${suffix}`;
    });
  }

  function hasProjectAsset(path) {
    return state.project.mode === "project" && state.project.assets.has(normalizeAssetPath(path));
  }

  function isProjectAssetReference(path) {
    return normalizeAssetPath(path).startsWith("assets/");
  }

  function missingAssetPlaceholder(path) {
    return `<span class="missing-asset" role="img" aria-label="Missing asset">${escapeHtml(path)}</span>`;
  }

  function markdownAssetCount(markdown, path) {
    return extractMarkdownAssetReferences(markdown)
      .filter((reference) => reference === path)
      .length;
  }

  function updateMarkdownAfterAssetRename(oldPath, newPath) {
    const nextMarkdown = rewriteAssetReferences(getEditorValue(), oldPath, newPath);
    if (nextMarkdown !== getEditorValue()) {
      setEditorValue(nextMarkdown);
    } else {
      render();
      scheduleProjectSave();
    }
  }

  function findDuplicateAssetHashes() {
    const counts = new Map();
    state.project.assets.forEach((asset) => {
      counts.set(asset.hash, (counts.get(asset.hash) || 0) + 1);
    });
    return new Set([...counts.entries()].filter((entry) => entry[1] > 1).map((entry) => entry[0]));
  }

  function sortAssets(assets, usage) {
    return assets.sort((left, right) => {
      if (state.assetSort === "size") return right.size - left.size || left.filename.localeCompare(right.filename);
      if (state.assetSort === "usage") return (usage.get(right.path) || 0) - (usage.get(left.path) || 0) || left.filename.localeCompare(right.filename);
      return left.filename.localeCompare(right.filename);
    });
  }

  function formatBytes(bytes) {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
    return `${bytes} B`;
  }

  function scrollToSlide(index) {
    state.activeSlide = index;
    document.getElementById(`frame-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    renderOutline(state.deck);
  }

  function exportMarkdown() {
    const blob = new Blob([state.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(state.deck.meta.title)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function slugify(value) {
    return (value || "slides").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "slides";
  }

  function syncProjectFromDeck() {
    if (state.project.mode !== "project" || !state.deck) return;
    const assets = [...state.project.assets.values()];
    state.project.manifest = createProjectManifest(state.deck, assets);
  }

  function migrateCurrentDeckToProject() {
    state.project = createProjectFromMarkdown(getEditorValue());
    syncProjectFromDeck();
    elements.status.textContent = "Project mode ready: config.json and slides.md are defined.";
    elements.status.classList.remove("warning");
    render();
    scheduleProjectSave();
  }

  function openProjectizeDialog() {
    closeToolbarMenus();
    elements.projectizeDialog.hidden = false;
  }

  function closeProjectizeDialog() {
    elements.projectizeDialog.hidden = true;
  }

  function confirmProjectize() {
    closeProjectizeDialog();
    migrateCurrentDeckToProject();
  }

  function requestNewDeck() {
    closeToolbarMenus();
    if (!hasUserContent()) {
      startNewDeck();
      return;
    }
    elements.newDeckMessage.textContent = newDeckWarningMessage();
    elements.newDeckDialog.hidden = false;
  }

  function hasUserContent() {
    return normalizeMarkdownForCompare(getEditorValue()) !== normalizeMarkdownForCompare(newDeckMarkdown);
  }

  function normalizeMarkdownForCompare(markdown) {
    return markdown.replace(/\r\n?/g, "\n").trim();
  }

  function newDeckWarningMessage() {
    const parts = ["Starting a new deck will discard the current content."];
    if (state.project.mode !== "project") {
      parts.push("The current deck is not saved as a project.");
    }
    return parts.join(" ");
  }

  function closeNewDeckDialog() {
    elements.newDeckDialog.hidden = true;
  }

  function confirmNewDeck() {
    closeNewDeckDialog();
    startNewDeck();
  }

  function startNewDeck() {
    state.project = createSingleFileProject();
    state.storageWarning = "";
    state.activeSlide = 0;
    state.overflowSlides = new Set();
    state.previewKeys = new Map();
    clearCurrentProjectStorage().catch((error) => {
      state.storageWarning = `Could not clear stored project: ${error.message}`;
    });
    setEditorValue(newDeckMarkdown);
    elements.status.textContent = "Started a new deck from the template.";
    elements.status.classList.remove("warning");
  }

  function createProjectFromMarkdown(markdown, assetRecords = [], manifest = null) {
    const deck = parseDeck(markdown);
    const normalizedManifest = normalizeProjectManifest(manifest, deck, assetRecords);
    const assets = new Map();
    assetRecords.forEach((asset) => {
      const manifestAsset = normalizedManifest.assets.find((item) => item.path === asset.path);
      assets.set(asset.path, {
        ...asset,
        id: manifestAsset?.id || asset.id,
      });
    });
    return {
      mode: "project",
      manifest: normalizedManifest,
      assets,
    };
  }

  async function initializeProjectStorage() {
    try {
      state.db = await openProjectDatabase();
      state.storageReady = true;
      await restoreCurrentProject();
    } catch (error) {
      state.storageWarning = `Project storage unavailable: ${error.message}`;
      state.storageReady = false;
    } finally {
      update();
    }
  }

  async function restoreCurrentProject() {
    const document = await readCurrentProjectDocument();
    if (!document) return;

    if (typeof document.markdown !== "string" || !document.manifest) {
      state.storageWarning = "Stored project is invalid. Using the current single-file deck.";
      return;
    }

    const storedAssets = await readStoredAssets(document.assetIds || []);
    const assetRecords = storedAssets.records.map((asset) => ({
      id: asset.id,
      path: asset.path,
      filename: asset.filename,
      mime: asset.mime,
      size: asset.size,
      hash: asset.hash,
      dataUrl: asset.dataUrl,
      lastModified: asset.lastModified || 0,
    }));

    state.project = createProjectFromMarkdown(document.markdown, assetRecords, document.manifest);
    setEditorValueWithoutUpdate(document.markdown);
    if (storedAssets.missing.length) {
      state.storageWarning = `Project restored with ${storedAssets.missing.length} missing asset record${storedAssets.missing.length === 1 ? "" : "s"}. Re-import missing files.`;
    } else {
      state.storageWarning = "";
    }
  }

  async function readCurrentProjectDocument() {
    const transaction = state.db.transaction(projectStorage.documentStore, "readonly");
    const store = transaction.objectStore(projectStorage.documentStore);
    const document = await idbRequest(store.get(projectStorage.currentProjectId));
    if (document) return document;
    return readLocalProjectSnapshot();
  }

  function readLocalProjectSnapshot() {
    try {
      const snapshot = localStorage.getItem(projectStorage.localSnapshotKey);
      if (!snapshot) return null;
      const document = JSON.parse(snapshot);
      return document?.id === projectStorage.currentProjectId ? document : null;
    } catch (_error) {
      return null;
    }
  }

  async function readStoredAssets(assetIds) {
    const transaction = state.db.transaction(projectStorage.assetStore, "readonly");
    const store = transaction.objectStore(projectStorage.assetStore);
    const records = [];
    const missing = [];

    for (const assetId of assetIds) {
      const asset = await idbRequest(store.get(assetId));
      if (asset) {
        records.push(asset);
      } else {
        missing.push(assetId);
      }
    }

    return { records, missing };
  }

  function scheduleProjectSave() {
    if (!state.storageReady || state.project.mode !== "project" || !state.deck) return;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      state.saveTimer = 0;
      saveCurrentProject().catch((error) => {
        state.storageWarning = `Project autosave failed: ${error.message}`;
        render();
      });
    }, 250);
  }

  async function saveCurrentProject() {
    const assets = [...state.project.assets.values()];
    const assetIds = assets.map((asset) => asset.id);
    const documentRecord = {
      id: projectStorage.currentProjectId,
      manifest: state.project.manifest,
      markdown: state.markdown,
      assetIds,
      updatedAt: new Date().toISOString(),
    };
    const transaction = state.db.transaction([projectStorage.documentStore, projectStorage.assetStore], "readwrite");
    const documents = transaction.objectStore(projectStorage.documentStore);
    const assetStore = transaction.objectStore(projectStorage.assetStore);

    documents.put(documentRecord);
    localStorage.setItem(projectStorage.localSnapshotKey, JSON.stringify(documentRecord));

    assets.forEach((asset) => {
      assetStore.put({
        ...asset,
        projectId: projectStorage.currentProjectId,
      });
    });

    await idbTransactionComplete(transaction);
    if (state.storageWarning.startsWith("Project autosave failed:")) {
      state.storageWarning = "";
      render();
    }
  }

  async function clearCurrentProjectStorage() {
    localStorage.removeItem(projectStorage.localSnapshotKey);
    if (!state.storageReady) return;
    const transaction = state.db.transaction([projectStorage.documentStore, projectStorage.assetStore], "readwrite");
    transaction.objectStore(projectStorage.documentStore).delete(projectStorage.currentProjectId);
    const assetStore = transaction.objectStore(projectStorage.assetStore);
    const index = assetStore.index("projectId");
    const request = index.openCursor(IDBKeyRange.only(projectStorage.currentProjectId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await idbTransactionComplete(transaction);
  }

  function resolveProjectAssetUrl(source) {
    if (state.project.mode !== "project") return source;
    if (/^(data:|https?:|blob:|#|mailto:)/i.test(source)) return source;
    const normalized = normalizeAssetPath(source);
    const asset = state.project.assets.get(normalized);
    if (asset) return asset.dataUrl;
    if (isProjectAssetReference(normalized)) return "";
    return source;
  }

  function normalizeAssetPath(path) {
    return path
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");
  }

  function setTheme(theme) {
    setFrontmatterValue("theme", theme);
  }

  function setSize(size) {
    setFrontmatterValue("size", size);
  }

  function setCustomCss(css) {
    const markdown = getEditorValue();
    const parts = splitFrontmatterBlock(markdown);
    const withoutCss = parts.body.replace(/^\s*<style>\n[\s\S]*?\n<\/style>\s*/i, "");
    const nextMarkdown = css.trim()
      ? `${parts.frontmatter}<style>\n${css.trim()}\n</style>\n\n${withoutCss.trimStart()}`
      : `${parts.frontmatter}${withoutCss.trimStart()}`;
    setEditorValue(nextMarkdown);
  }

  function splitFrontmatterBlock(markdown) {
    if (!markdown.startsWith("---\n")) return { frontmatter: "", body: markdown };
    const end = markdown.indexOf("\n---", 4);
    if (end === -1) return { frontmatter: "", body: markdown };
    return {
      frontmatter: `${markdown.slice(0, end + 4).trim()}\n\n`,
      body: markdown.slice(end + 4).replace(/^\n+/, ""),
    };
  }

  function setFrontmatterValue(key, value) {
    const markdown = getEditorValue();
    if (markdown.startsWith("---\n")) {
      const end = markdown.indexOf("\n---", 4);
      if (end !== -1) {
        const frontmatter = markdown.slice(4, end);
        const body = markdown.slice(end);
        const keyPattern = new RegExp(`^${key}:\\s*.*$`, "m");
        const nextFrontmatter = keyPattern.test(frontmatter)
          ? frontmatter.replace(keyPattern, `${key}: ${value}`)
          : `${frontmatter.trim()}\n${key}: ${value}\n`;
        setEditorValue(`---\n${nextFrontmatter.trim()}\n${body}`);
        return;
      }
    }
    setEditorValue(`---\n${key}: ${value}\n---\n\n${markdown}`);
  }

  function autoSplitMarkdown() {
    const markdown = getEditorValue();
    const draft = createAutoSplitDraft(markdown);
    if (draft.error) {
      elements.status.textContent = draft.error;
      elements.status.classList.add("warning");
      return;
    }
    state.autoSplitDraft = draft;
    renderAutoSplitDialog(draft);
  }

  function createAutoSplitDraft(markdown) {
    const parsed = parseDeck(markdown);
    if (parsed.slides.length > 1) {
      return { error: "Auto Split skipped: deck already contains slide separators." };
    }

    const parts = splitFrontmatterBlock(markdown);
    const customCss = extractCustomCss(parts.body);
    const sections = splitMarkdownSections(customCss.body.trim());
    if (sections.length <= 1) {
      return { error: "Auto Split needs at least two top-level headings." };
    }

    const slides = sections.flatMap((section) => splitOversizedSection(section));
    const styleBlock = customCss.css ? `<style>\n${customCss.css}\n</style>\n\n` : "";
    const nextMarkdown = `${parts.frontmatter}${styleBlock}${slides.join("\n\n---\n\n")}`;
    return {
      markdown: nextMarkdown,
      slides: slides.map((slide, index) => ({
        index,
        title: extractTitle(slide) || `Slide ${index + 1}`,
        lineCount: slide.split("\n").filter((line) => line.trim()).length,
      })),
    };
  }

  function splitMarkdownSections(markdown) {
    const sections = [];
    let current = [];
    markdown.split("\n").forEach((line) => {
      if (/^#{1,2}\s+/.test(line) && current.some((item) => item.trim())) {
        sections.push(current.join("\n").trim());
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.some((line) => line.trim())) sections.push(current.join("\n").trim());
    return sections.filter(Boolean);
  }

  function splitOversizedSection(section) {
    const maxContentLines = 12;
    const lines = section.split("\n");
    const heading = lines[0]?.match(/^(#{1,2})\s+(.+)$/);
    const contentLines = heading ? lines.slice(1) : lines;
    const contentCount = contentLines.filter((line) => line.trim()).length;
    if (contentCount <= maxContentLines) return [section];

    const chunks = [];
    let chunk = [];
    contentLines.forEach((line) => {
      if (chunk.filter((item) => item.trim()).length >= maxContentLines && !line.trim()) {
        chunks.push(chunk.join("\n").trim());
        chunk = [];
        return;
      }
      chunk.push(line);
      if (chunk.filter((item) => item.trim()).length >= maxContentLines + 3) {
        chunks.push(chunk.join("\n").trim());
        chunk = [];
      }
    });
    if (chunk.some((line) => line.trim())) chunks.push(chunk.join("\n").trim());

    if (!heading) return chunks;
    return chunks.map((chunkBody, index) => {
      const title = index === 0 ? heading[2] : `${heading[2]} (continued)`;
      return `${heading[1]} ${title}\n\n${chunkBody}`.trim();
    });
  }

  function renderAutoSplitDialog(draft) {
    elements.autoSplitSummary.textContent = `Auto Split will create ${draft.slides.length} slides. Review the generated outline before accepting.`;
    elements.autoSplitList.innerHTML = "";
    draft.slides.forEach((slide) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="split-review-index">${slide.index + 1}</span>
        <span class="split-review-title">${escapeHtml(slide.title)}</span>
        <span class="split-review-meta">${slide.lineCount} lines</span>`;
      elements.autoSplitList.appendChild(item);
    });
    elements.autoSplitDialog.hidden = false;
  }

  function acceptAutoSplit() {
    if (!state.autoSplitDraft) return;
    setEditorValue(state.autoSplitDraft.markdown);
    elements.status.textContent = `Auto Split applied: ${state.autoSplitDraft.slides.length} slides.`;
    elements.status.classList.remove("warning");
    closeAutoSplitDialog();
  }

  function closeAutoSplitDialog() {
    state.autoSplitDraft = null;
    elements.autoSplitDialog.hidden = true;
  }

  function openPresentation(mode) {
    state.presentationOpen = true;
    state.presentationMode = mode;
    state.presentationStartedAt = Date.now();
    elements.presentation.classList.toggle("presentation-mirror", mode === "mirror");
    elements.presentation.classList.toggle("presentation-presenter", mode === "presenter");
    updatePresentationSizeClass(state.deck.meta.size);
    elements.presentation.hidden = false;
    elements.app.setAttribute("aria-hidden", "true");
    startPresentationTimer();
    renderPresentation();
  }

  function updatePresentationSizeClass(size) {
    elements.presentation.classList.toggle("presentation-size-a4", size === "a4");
    elements.presentation.classList.toggle("presentation-size-widescreen", size !== "a4");
  }

  function closePresentation() {
    state.presentationOpen = false;
    stopPresentationTimer();
    elements.presentation.hidden = true;
    elements.app.removeAttribute("aria-hidden");
  }

  function renderPresentation() {
    const deck = state.deck;
    const slide = deck.slides[state.activeSlide] || deck.slides[0];
    const nextSlide = deck.slides[state.activeSlide + 1];
    const theme = ["clean", "contrast", "paper"].includes(deck.meta.theme) ? deck.meta.theme : "clean";
    elements.presentationSlide.innerHTML = slideHtml(slide, theme, deck.meta.size);
    elements.presentationNext.innerHTML = nextSlide
      ? slideHtml(nextSlide, theme, deck.meta.size)
      : '<div class="presentation-end">End of deck</div>';
    elements.presentationCount.textContent = `${state.activeSlide + 1} / ${deck.slides.length}`;
    elements.presentationNotes.textContent = slide.notes || "No speaker notes.";
    updatePresentationTimer();
  }

  function startPresentationTimer() {
    stopPresentationTimer();
    state.presentationTimer = window.setInterval(updatePresentationTimer, 1000);
  }

  function stopPresentationTimer() {
    if (state.presentationTimer) {
      window.clearInterval(state.presentationTimer);
      state.presentationTimer = 0;
    }
  }

  function updatePresentationTimer() {
    if (!state.presentationStartedAt) {
      elements.presentationTimer.textContent = "00:00";
      return;
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - state.presentationStartedAt) / 1000));
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    elements.presentationTimer.textContent = `${minutes}:${seconds}`;
  }

  function movePresentation(delta) {
    if (!state.presentationOpen) return;
    state.activeSlide = Math.max(0, Math.min(state.deck.slides.length - 1, state.activeSlide + delta));
    renderPresentation();
    renderOutline(state.deck);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      state.project = createSingleFileProject();
      clearCurrentProjectStorage().catch((error) => {
        state.storageWarning = `Could not clear stored project: ${error.message}`;
      });
      setEditorValue(String(reader.result || ""));
    };
    reader.readAsText(file);
  }

  async function importProjectFiles(fileList) {
    const files = [...fileList];
    const slidesFile = findProjectFile(files, "slides.md");
    if (!slidesFile) {
      elements.status.textContent = "Project import needs /project/slides.md or slides.md.";
      elements.status.classList.add("warning");
      return;
    }

    try {
      const markdown = await slidesFile.text();
      const manifestFile = findProjectFile(files, "config.json");
      const manifest = manifestFile ? JSON.parse(await manifestFile.text()) : null;
      const assetFiles = files.filter((file) => getProjectRelativePath(file).startsWith("assets/"));
      const assetRecords = await Promise.all(assetFiles.map(readAssetRecord));
      state.project = createProjectFromMarkdown(markdown, assetRecords, manifest);
      setEditorValue(markdown);
      elements.status.textContent = `Project imported: ${assetRecords.length} asset${assetRecords.length === 1 ? "" : "s"} indexed.`;
      elements.status.classList.remove("warning");
    } catch (error) {
      elements.status.textContent = `Project import failed: ${error.message}`;
      elements.status.classList.add("warning");
    }
  }

  function findProjectFile(files, filename) {
    return files.find((file) => getProjectRelativePath(file) === filename || getProjectRelativePath(file) === `project/${filename}`);
  }

  function getProjectRelativePath(file) {
    const rawPath = file.webkitRelativePath || file.name;
    const normalized = normalizeAssetPath(rawPath);
    return normalized.replace(/^project\//, "");
  }

  async function readAssetRecord(file) {
    return createAssetRecord(file, getProjectRelativePath(file));
  }

  async function createAssetRecord(file, path) {
    const dataUrl = await readFileAsDataUrl(file);
    const hash = hashString(dataUrl);
    return {
      id: createAssetId(path, hash),
      path,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      hash,
      dataUrl,
      lastModified: file.lastModified || 0,
    };
  }

  async function importAssetFiles(fileList) {
    if (state.project.mode !== "project") {
      elements.status.textContent = "Projectize or import a project before adding assets.";
      elements.status.classList.add("warning");
      return;
    }

    const files = [...fileList];
    if (!files.length) return;

    const records = await Promise.all(files.map(async (file) => {
      const path = uniqueAssetPath(file.name);
      return createAssetRecord(file, path);
    }));

    records.forEach((asset) => state.project.assets.set(asset.path, asset));
    syncProjectFromDeck();
    render();
    scheduleProjectSave();
    const duplicateCount = records.filter((asset) => [...state.project.assets.values()].some((item) => item.path !== asset.path && item.hash === asset.hash)).length;
    elements.status.textContent = `Added ${records.length} asset${records.length === 1 ? "" : "s"}${duplicateCount ? `; ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} flagged` : ""}.`;
    elements.status.classList.toggle("warning", duplicateCount > 0);
  }

  function uniqueAssetPath(filename) {
    const safeName = sanitizeFilename(filename);
    const dot = safeName.lastIndexOf(".");
    const base = dot > 0 ? safeName.slice(0, dot) : safeName;
    const extension = dot > 0 ? safeName.slice(dot) : "";
    let candidate = `assets/${safeName}`;
    let index = 2;
    while (state.project.assets.has(candidate)) {
      candidate = `assets/${base}-${index}${extension}`;
      index += 1;
    }
    return candidate;
  }

  function sanitizeFilename(filename) {
    const fallback = "asset";
    const cleaned = filename
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || fallback;
  }

  function handleAssetAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = button.closest(".asset-item");
    const asset = state.project.assets.get(item?.dataset.assetPath || "");
    if (!asset) return;

    if (button.dataset.action === "insert") insertAssetReference(asset);
    if (button.dataset.action === "rename") renameAsset(asset);
    if (button.dataset.action === "remove") removeAsset(asset);
  }

  function insertAssetReference(asset) {
    insertAtCursor(`\n![${asset.filename}](${asset.path})\n`);
  }

  function renameAsset(asset) {
    const nextName = window.prompt("New asset filename", asset.filename);
    if (!nextName) return;
    if (sanitizeFilename(nextName) === asset.filename) return;
    const nextPath = uniqueAssetPath(nextName);
    if (nextPath === asset.path) return;

    const oldPath = asset.path;
    const usage = markdownAssetCount(state.markdown, oldPath);
    state.project.assets.delete(asset.path);
    state.project.assets.set(nextPath, {
      ...asset,
      path: nextPath,
      filename: nextPath.split("/").pop(),
      id: createAssetId(nextPath, asset.hash),
    });
    syncProjectFromDeck();
    updateMarkdownAfterAssetRename(oldPath, nextPath);
    elements.status.textContent = `Renamed asset to ${nextPath}${usage ? ` and updated ${usage} reference${usage === 1 ? "" : "s"}` : ""}.`;
    elements.status.classList.remove("warning");
  }

  function removeAsset(asset) {
    const usage = countAssetUsage(state.markdown).get(asset.path) || 0;
    if (usage > 0 && !window.confirm(`This asset is referenced ${usage} time${usage === 1 ? "" : "s"}. Remove it anyway?`)) {
      return;
    }
    state.project.assets.delete(asset.path);
    syncProjectFromDeck();
    render();
    scheduleProjectSave();
    elements.status.textContent = usage
      ? `Removed ${asset.filename}; ${usage} reference${usage === 1 ? "" : "s"} now unresolved.`
      : `Removed ${asset.filename}.`;
    elements.status.classList.toggle("warning", usage > 0);
  }

  function createAssetId(path, hash) {
    return `asset-${hash}-${slugify(path.split("/").pop() || "file")}`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  function setMenuOpen(button, menu, open) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function closeToolbarMenus() {
    setMenuOpen(elements.importMenuButton, elements.importMenuOptions, false);
    setMenuOpen(elements.exportMenuButton, elements.exportMenuOptions, false);
    setMenuOpen(elements.presentMenuButton, elements.presentMenuOptions, false);
  }

  function toggleToolbarMenu(button, menu) {
    const shouldOpen = menu.hidden;
    closeToolbarMenus();
    setMenuOpen(button, menu, shouldOpen);
  }

  function insertAtCursor(text) {
    const selection = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
      scrollIntoView: true,
    });
    editorView.focus();
    update();
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      insertAtCursor(`\n![${file.name}](${reader.result})\n`);
      if (file.size > 1_000_000) {
        elements.status.textContent = "Large image embedded. Single-file decks work best below 1-2MB.";
        elements.status.classList.add("warning");
      }
    };
    reader.readAsDataURL(file);
  }

  elements.editor.addEventListener("drop", handleDrop);
  elements.editor.addEventListener("dragover", (event) => event.preventDefault());
  elements.newDeck.addEventListener("click", requestNewDeck);
  elements.newDeckConfirm.addEventListener("click", confirmNewDeck);
  elements.newDeckCancel.addEventListener("click", closeNewDeckDialog);
  elements.newDeckDialog.addEventListener("click", (event) => {
    if (event.target === elements.newDeckDialog) closeNewDeckDialog();
  });
  elements.importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importFile(file);
    event.target.value = "";
    closeToolbarMenus();
  });
  elements.importProject.addEventListener("change", (event) => {
    if (event.target.files.length) importProjectFiles(event.target.files);
    event.target.value = "";
    closeToolbarMenus();
  });
  elements.assetImport.addEventListener("change", (event) => {
    if (event.target.files.length) importAssetFiles(event.target.files);
    event.target.value = "";
  });
  elements.assetList.addEventListener("click", handleAssetAction);
  elements.assetSort.addEventListener("change", (event) => {
    state.assetSort = event.target.value;
    renderAssetPanel();
  });
  elements.importMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.importMenuButton, elements.importMenuOptions);
  });
  elements.projectize.addEventListener("click", openProjectizeDialog);
  elements.projectizeConfirm.addEventListener("click", confirmProjectize);
  elements.projectizeCancel.addEventListener("click", closeProjectizeDialog);
  elements.projectizeDialog.addEventListener("click", (event) => {
    if (event.target === elements.projectizeDialog) closeProjectizeDialog();
  });
  elements.exportMd.addEventListener("click", () => {
    exportMarkdown();
    closeToolbarMenus();
  });
  elements.exportMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.exportMenuButton, elements.exportMenuOptions);
  });
  elements.autoSplit.addEventListener("click", autoSplitMarkdown);
  elements.autoSplitAccept.addEventListener("click", acceptAutoSplit);
  elements.autoSplitCancel.addEventListener("click", closeAutoSplitDialog);
  elements.autoSplitDialog.addEventListener("click", (event) => {
    if (event.target === elements.autoSplitDialog) closeAutoSplitDialog();
  });
  elements.customCssToggle.addEventListener("click", () => {
    elements.customCssPanel.hidden = !elements.customCssPanel.hidden;
  });
  elements.customCssClose.addEventListener("click", () => {
    elements.customCssPanel.hidden = true;
  });
  elements.customCssEditor.addEventListener("input", () => {
    clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => setCustomCss(elements.customCssEditor.value), 250);
  });
  elements.printPdf.addEventListener("click", () => {
    closeToolbarMenus();
    window.print();
  });
  elements.presentMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.presentMenuButton, elements.presentMenuOptions);
  });
  elements.presentMirror.addEventListener("click", () => {
    closeToolbarMenus();
    openPresentation("mirror");
  });
  elements.presentSpeaker.addEventListener("click", () => {
    closeToolbarMenus();
    openPresentation("presenter");
  });
  elements.exitPresent.addEventListener("click", closePresentation);
  elements.themePicker.addEventListener("change", (event) => setTheme(event.target.value));
  elements.sizePicker.addEventListener("change", (event) => setSize(event.target.value));
  elements.showNotes.addEventListener("change", (event) => {
    state.showNotes = event.target.checked;
    render();
  });
  elements.preview.addEventListener("scroll", () => {
    const frames = [...elements.preview.querySelectorAll(".slide-frame")];
    const top = elements.preview.getBoundingClientRect().top;
    const closest = frames
      .map((frame, index) => ({ index, distance: Math.abs(frame.getBoundingClientRect().top - top) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (closest && closest.index !== state.activeSlide) {
      state.activeSlide = closest.index;
      renderOutline(state.deck);
    }
  });
  window.addEventListener("resize", () => {
    scaleSlides();
    requestAnimationFrame(detectSlideOverflow);
  });
  window.addEventListener("click", (event) => {
    if (!event.target.closest(".toolbar-menu")) closeToolbarMenus();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !state.presentationOpen && !elements.newDeckDialog.hidden) closeNewDeckDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.projectizeDialog.hidden) closeProjectizeDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.autoSplitDialog.hidden) closeAutoSplitDialog();
    if (event.key === "Escape" && state.presentationOpen) closePresentation();
    if (event.key === "ArrowRight" || event.key === "PageDown") movePresentation(1);
    if (event.key === "ArrowLeft" || event.key === "PageUp") movePresentation(-1);
  });

  initializeProjectStorage();
