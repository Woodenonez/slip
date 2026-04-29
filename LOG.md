# Project Log

## 2026-04-29 (1)

- Reviewed `/plan/plan.md` and version plans `v1.md` through `v4.md`.
- Compared the plan against similar products and frameworks: Marp, Slidev, reveal.js/HedgeDoc, DeckDeckGo, Pitch, Beautiful.ai, and Gamma.
- Recommended narrowing the first milestone to a print-first Markdown MVP before cloud, sharing, AI, or broad export scope.
- Implemented a dependency-free static MVP:
  - Added `index.html` app shell.
  - Added `styles.css` for editor layout, slide preview, presentation mode, themes, and print/PDF output.
  - Added `app.js` for Markdown parsing, frontmatter parsing, slide splitting, notes parsing, preview rendering, outline navigation, import/export, presentation mode, auto-split, and image data URI embedding.
  - Added `README.md` with run instructions and supported syntax.
- Verified JavaScript syntax with `node --check app.js`.
- Clarified dependency status: `node` was used only as a development verification tool, not as an app runtime or build dependency.
- Prepared the current project snapshot for the initial git commit.

## 2026-04-29 (2)

- Continued V1 with performance hardening instead of adding new packages.
- Deferred Mermaid diagram support to a later optional V1.5 milestone.
- Added stable per-slide hashes to the parsed slide model.
- Updated preview rendering to preserve unchanged slide frames and replace only slides whose content, notes, or theme changed.
- Expanded Presenter Mode with a current slide, next-slide preview, speaker notes, elapsed timer, and navigation hints.
- Split presentation into selectable Mirror Mode and Presenter Mode from the Present dropdown.
- Added dependency-free slide overflow detection with preview badges, outline highlighting, and status warnings for content that may clip in print/PDF.
- Fixed overflow detection to check only editor preview slides and report all overflowing slide numbers, not just the first.
- Improved fenced code block rendering with dependency-free language labels and safer preformatted styling.
- Added `size` frontmatter support with UI selection for `widescreen` and `a4`, including preview dimensions and print/PDF page sizing.
- Committed the dependency-free version as the self-contained V1 baseline (`044fa79`).

## 2026-04-29 (3)

- Introduced Vite and CodeMirror 6 dependencies for the next V1 editor step.
- Replaced the plain textarea with a CodeMirror 6 Markdown editor while preserving the existing render/import/export workflow.
- Added `.gitignore` entries for dependency and build output directories.
- Verified the dependency-backed app with `node --check app.js` and `npm run build`.
- Installed KaTeX and added inline `$...$` plus block `$$...$$` math rendering with non-fatal error output.
- Verified the KaTeX step with `node --check app.js` and `npm run build`; Vite reports a large bundle warning to revisit after V1.
- Installed `highlight.js` and added syntax highlighting for common fenced code block languages with safe plain-text fallback for unknown languages.
- Verified the syntax highlighting step with `node --check app.js` and `npm run build`; the existing large bundle warning remains.
- Updated `README.md` to document partial preview rendering.
- Dependency status changed after the self-contained baseline: Vite and CodeMirror 6 are now required for active development and builds.

## Dependencies

- Runtime dependencies introduced: CodeMirror 6 packages for the editor, KaTeX for math rendering, highlight.js for code highlighting.
- Build dependencies introduced: Vite.
- External packages introduced: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete`, `@lezer/highlight`, `highlight.js`, `katex`, and `vite`.
- Verification tools used: `node --check app.js`, `npm run build`.
- Browser APIs used: `localStorage`, `FileReader`, `Blob`, `URL.createObjectURL`, drag-and-drop events, and `window.print()`.
