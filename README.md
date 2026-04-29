# Slip

Slip is a browser-native Markdown slide editor focused on single-file authoring and reliable print/PDF output.

## Run

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

The last self-contained no-build baseline is preserved in git commit `044fa79`.

## Implemented

- Markdown editor backed by a single `.md` document
- CodeMirror 6 editing surface with Markdown mode, line numbers, undo history, search keybindings, and editor selection behavior
- Frontmatter parsing for `title` and `theme`
- Frontmatter parsing for `title`, `theme`, and `size`
- Slide splitting with `---`, while ignoring separators inside fenced code blocks
- Speaker notes with `???`
- Fixed 16:9 slide preview with scoped themes
- Content overflow warnings for slides that may clip in PDF
- Highlighted fenced code blocks with language labels for common languages
- KaTeX math rendering for inline `$...$` and block `$$...$$` expressions
- Scoped custom slide CSS through a top-level `<style>` block
- Outline navigation and active slide tracking
- Partial preview rendering with stable slide hashes
- Markdown import and export
- Browser print/PDF stylesheet
- Mirror presentation mode for audience-facing slide display
- Presenter mode with current slide, next slide, notes, timer, and keyboard navigation
- Rule-based heading auto-split with a review-and-accept dialog
- Drag-and-drop image embedding as data URIs with large-file warnings

## Build

```bash
npm run build
```

## Syntax

```markdown
---
title: Demo
theme: clean
size: widescreen
---

<style>
h1 {
  color: #0f554c;
}
</style>

# First slide

Content

???
Speaker notes

---

## Second slide
```

Themes: `clean`, `contrast`, `paper`.

Slide sizes: `widescreen` or `a4`.

Custom CSS is scoped to slide content and must be placed after frontmatter.

Highlighted code languages: `js`, `ts`, `python`, `bash`, `html`, `css`, `json`, and `markdown`.

Math:

```markdown
Inline: $E = mc^2$

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```
