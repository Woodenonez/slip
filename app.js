(function () {
  const sampleMarkdown = `---
title: Slip Demo
theme: clean
size: widescreen
---

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

---

## Export

Use **Print / PDF** to open the browser print dialog.

The preview is designed as a print page first, then scaled for screen reading.
`;

  const state = {
    markdown: localStorage.getItem("slip.markdown") || sampleMarkdown,
    deck: null,
    activeSlide: 0,
    showNotes: false,
    presentationOpen: false,
    presentationMode: "presenter",
    presentationStartedAt: 0,
    presentationTimer: 0,
    previewKeys: new Map(),
    overflowSlides: new Set(),
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

  const elements = {
    app: document.getElementById("app"),
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    outline: document.getElementById("outline-list"),
    status: document.getElementById("status"),
    deckTitle: document.getElementById("deck-title"),
    themePicker: document.getElementById("theme-picker"),
    sizePicker: document.getElementById("size-picker"),
    showNotes: document.getElementById("show-notes"),
    importFile: document.getElementById("import-file"),
    exportMd: document.getElementById("export-md"),
    autoSplit: document.getElementById("auto-split"),
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

  function parseDeck(markdown) {
    const normalized = markdown.replace(/\r\n?/g, "\n");
    const frontmatter = parseFrontmatter(normalized);
    const rawSlides = splitSlides(frontmatter.body);
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
      slides: slides.length ? slides : [{ id: "slide-1", index: 0, source: "", content: "", notes: "", hash: hashString(""), title: "Slide 1" }],
      warnings: frontmatter.warnings,
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
    let codeBuffer = [];
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

      if (inCode) {
        codeBuffer.push(rawLine);
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
    flushParagraph();
    flushList();
    return html || "<p></p>";
  }

  function codeBlockHtml(language, code) {
    const lang = language.trim();
    const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
    return `<pre>${label}<code data-lang="${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`;
  }

  function inlineMarkdown(text) {
    let output = escapeHtml(text);
    output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    return output;
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
    state.markdown = elements.editor.value;
    state.deck = parseDeck(state.markdown);
    localStorage.setItem("slip.markdown", state.markdown);
    render();
    const elapsed = Math.round(performance.now() - started);
    const warnings = collectWarnings(state.deck);
    elements.status.textContent = warnings.length
      ? warnings[0]
      : `${state.deck.slides.length} slide${state.deck.slides.length === 1 ? "" : "s"} rendered in ${elapsed}ms`;
    elements.status.classList.toggle("warning", warnings.length > 0);
  }

  function collectWarnings(deck) {
    const warnings = [...deck.warnings];
    const largeDataImage = state.markdown.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
    if (largeDataImage && largeDataImage[1].length > 1_400_000) {
      warnings.push("Large embedded image detected. Consider V2 project assets for decks over 1-2MB.");
    }
    return warnings;
  }

  function render() {
    const deck = state.deck;
    elements.deckTitle.textContent = deck.meta.title;
    elements.themePicker.value = ["clean", "contrast", "paper"].includes(deck.meta.theme) ? deck.meta.theme : "clean";
    elements.sizePicker.value = deck.meta.size;
    setSlideSizeVars(deck.meta.size);
    updatePrintSize(deck.meta.size);
    updatePresentationSizeClass(deck.meta.size);
    elements.preview.classList.toggle("show-notes", state.showNotes);
    renderOutline(deck);
    renderPreview(deck);
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
    const nextKeys = new Map();
    const fragment = document.createDocumentFragment();

    deck.slides.forEach((slide, index) => {
      const key = `${theme}:${size}:${slide.hash}`;
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

  function setTheme(theme) {
    setFrontmatterValue("theme", theme);
  }

  function setSize(size) {
    setFrontmatterValue("size", size);
  }

  function setFrontmatterValue(key, value) {
    const markdown = elements.editor.value;
    if (markdown.startsWith("---\n")) {
      const end = markdown.indexOf("\n---", 4);
      if (end !== -1) {
        const frontmatter = markdown.slice(4, end);
        const body = markdown.slice(end);
        const keyPattern = new RegExp(`^${key}:\\s*.*$`, "m");
        const nextFrontmatter = keyPattern.test(frontmatter)
          ? frontmatter.replace(keyPattern, `${key}: ${value}`)
          : `${frontmatter.trim()}\n${key}: ${value}\n`;
        elements.editor.value = `---\n${nextFrontmatter.trim()}\n${body}`;
        update();
        return;
      }
    }
    elements.editor.value = `---\n${key}: ${value}\n---\n\n${markdown}`;
    update();
  }

  function autoSplitMarkdown() {
    const markdown = elements.editor.value;
    const parsed = parseDeck(markdown);
    if (parsed.slides.length > 1) {
      elements.status.textContent = "Auto Split skipped: deck already contains slide separators.";
      return;
    }

    const frontmatter = markdown.startsWith("---\n") ? markdown.slice(0, markdown.indexOf("\n---", 4) + 4) : "";
    const body = frontmatter ? markdown.slice(frontmatter.length).trim() : markdown.trim();
    const sections = [];
    let current = [];
    body.split("\n").forEach((line) => {
      if (/^#{1,2}\s+/.test(line) && current.length) {
        sections.push(current.join("\n").trim());
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.length) sections.push(current.join("\n").trim());
    if (sections.length <= 1) {
      elements.status.textContent = "Auto Split needs at least two top-level headings.";
      return;
    }
    elements.editor.value = `${frontmatter}${frontmatter ? "\n\n" : ""}${sections.join("\n\n---\n\n")}`;
    update();
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
      elements.editor.value = String(reader.result || "");
      update();
    };
    reader.readAsText(file);
  }

  function insertAtCursor(text) {
    const editor = elements.editor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = `${editor.value.slice(0, start)}${text}${editor.value.slice(end)}`;
    editor.selectionStart = editor.selectionEnd = start + text.length;
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

  let updateTimer = 0;
  elements.editor.value = state.markdown;
  elements.editor.addEventListener("input", () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(update, 80);
  });
  elements.editor.addEventListener("drop", handleDrop);
  elements.editor.addEventListener("dragover", (event) => event.preventDefault());
  elements.importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importFile(file);
    event.target.value = "";
  });
  elements.exportMd.addEventListener("click", exportMarkdown);
  elements.autoSplit.addEventListener("click", autoSplitMarkdown);
  elements.printPdf.addEventListener("click", () => window.print());
  elements.presentMenuButton.addEventListener("click", () => {
    const isOpen = !elements.presentMenuOptions.hidden;
    elements.presentMenuOptions.hidden = isOpen;
    elements.presentMenuButton.setAttribute("aria-expanded", String(!isOpen));
  });
  elements.presentMirror.addEventListener("click", () => {
    elements.presentMenuOptions.hidden = true;
    elements.presentMenuButton.setAttribute("aria-expanded", "false");
    openPresentation("mirror");
  });
  elements.presentSpeaker.addEventListener("click", () => {
    elements.presentMenuOptions.hidden = true;
    elements.presentMenuButton.setAttribute("aria-expanded", "false");
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
    if (!event.target.closest(".present-menu")) {
      elements.presentMenuOptions.hidden = true;
      elements.presentMenuButton.setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.presentationOpen) closePresentation();
    if (event.key === "ArrowRight" || event.key === "PageDown") movePresentation(1);
    if (event.key === "ArrowLeft" || event.key === "PageUp") movePresentation(-1);
  });

  update();
})();
