# Slip

Slip is a browser-native Markdown slide editor focused on single-file authoring and reliable print/PDF output.

## Quick Start

Install dependencies and start Slip locally:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

## Using Slip

- Write Markdown in the editor. Slides are split with `---`.
- Use frontmatter for `title`, `theme`, and `size`.
- Add speaker notes after `???`.
- Click `Import` or `Export MD` for local Markdown files.
- Click `Auto Split` to review generated slide breaks before accepting.
- Click `CSS` to add scoped slide CSS in a top-level `<style>` block.
- Click `Present` and choose Mirror Mode or Presenter Mode.
- Click `Print / PDF` to open the browser print dialog.

## Testing

```bash
npm run check
npm run build
npm run test:v1
npm run release:check
```

`npm run test:v1` runs Playwright browser regressions for print sizing, overflow warnings, presentation modes, Auto Split, and a 120-slide deck. `npm run release:check` runs syntax validation, the production build, and the V1 browser suite.

The last self-contained no-build baseline is preserved in git commit `044fa79`.

## V1 Complete

- Markdown editor backed by a single `.md` document
- CodeMirror 6 editing surface with Markdown mode, line numbers, undo history, search keybindings, and editor selection behavior
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
- V1 browser regressions for print, presentation, Auto Split, and 100+ slide decks
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

Preview the production build locally:

```bash
npm run preview
```

The generated `dist/` directory is static-hosting ready. Vite is configured with relative asset paths, so the build can be served from a domain root or a subpath such as GitHub Pages.

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

## License

MIT. See [LICENSE](LICENSE).
