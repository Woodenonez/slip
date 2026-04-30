# Project Log

# V1 Development

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

## 2026-04-29 (4)

- Added a custom CSS panel and top-level `<style>` block support.
- Scoped custom CSS selectors to slide content before injecting styles.
- Preserved custom CSS in the Markdown source of truth.
- Verified custom CSS support with `node --check app.js` and `npm run build`; the existing large bundle warning remains.
- Committed the custom CSS step as `e32ca55`.
- Started the next V1 usability step without adding dependencies.
- Reworked Auto Split into a review-and-accept workflow instead of immediately rewriting the deck.
- Preserved frontmatter and top-level custom CSS when generating split drafts.
- Added a deterministic max-content heuristic for oversized heading sections.
- Verified the Auto Split review workflow with `node --check app.js` and `npm run build`; the existing large bundle warning remains.

## 2026-04-29 (5)

- Started V1 exit-quality regression testing.
- Introduced Playwright test tooling as a development dependency for real browser layout checks.
- Added `npm run test` and `npm run test:v1` scripts.
- Added V1 browser regression coverage for fixed slide sizing, print page CSS, multi-slide overflow reporting, Mirror Mode, Presenter Mode, and Auto Split review acceptance.
- Documented the V1 regression command in `README.md`.
- Installed the Playwright Chromium browser binary required to run local browser regressions.
- Verified with `npm run check`, `npm run build`, and `npm run test:v1`; the existing Vite large bundle warning remains.

## 2026-04-29 (6)

- Continued V1 exit-quality work without adding dependencies.
- Added development console timing for preview renders with slide count, elapsed milliseconds, and warning count.
- Added a Playwright regression for a 120-slide deck covering render completion, outline population, and outline navigation.
- Verified with `npm run check`, `npm run build`, and `npm run test:v1`; the V1 browser suite now runs 5 passing tests.
- Continued V1 production/static-hosting polish without adding dependencies.
- Added `vite.config.js` with relative asset paths so `dist/` can be hosted from a domain root or subpath.
- Added `npm run release:check` to run syntax validation, production build, and V1 browser regressions together.
- Documented production preview, static hosting, and release-check commands in `README.md`.
- Verified with `npm run release:check`; the V1 browser suite still runs 5 passing tests and the existing Vite large bundle warning remains.
- Renamed `plan/v1.md` to `plan/v1_done.md` to mark V1 as complete.
- Smoke-tested the production preview with `npm run preview` and confirmed `http://127.0.0.1:4173/` returns HTTP 200.

## Dependencies

- Runtime dependencies introduced: CodeMirror 6 packages for the editor, KaTeX for math rendering, highlight.js for code highlighting.
- Build and test dependencies introduced: Vite, Playwright.
- External packages introduced: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/lang-markdown`, `@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete`, `@lezer/highlight`, `highlight.js`, `katex`, `vite`, and `@playwright/test`.
- Verification tools used: `node --check app.js`, `npm run build`, `npm run test:v1`, `npm run release:check`.
- Browser APIs used: `localStorage`, `FileReader`, `Blob`, `URL.createObjectURL`, drag-and-drop events, and `window.print()`.

## 2026-04-29 (7)

- Reviewed dependency license metadata before publishing.
- Found project metadata still declared `ISC`; changed root package metadata to `MIT`.
- Added a root MIT `LICENSE` file and documented the license in `README.md`.
- Compatibility notes: runtime dependencies are MIT or BSD-style; development/build dependencies include Apache-2.0 and MPL-2.0 packages that do not block publishing Slip under MIT when their notices are preserved.
- Added README contributors for Ze and OpenAI Codex without introducing dependencies.

---

# V2 Development

V1 is finished and marked in `plan/v1_done.md`. Entries below track V2 work based on the current `plan/v2.md`.

## 2026-04-30 (1)

- Started V2 Step 1: project model foundation.
- Added an internal V2 manifest shape for `config.json` with `schema`, `version`, title, theme, size, entry, and asset index metadata.
- Added project state that keeps stable asset IDs, paths, MIME type, size, hash, and data URLs in memory.
- Added project-folder import support for folders containing `slides.md`, optional `config.json`, and `assets/`.
- Added `Projectize` to migrate the current V1 markdown deck into V2 project mode without changing the Markdown source.
- Updated image rendering so `assets/...` Markdown image references resolve against imported project assets.
- Added `npm run test:v2` with Playwright coverage for project-folder import and V1-to-project migration.
- Updated README and AGENTS with V2 project model usage and test commands.
- No new runtime or development dependencies were introduced.

## 2026-04-30 (2)

- Continued V2 with Step 2: IndexedDB virtual file system.
- Added versioned IndexedDB stores for project documents and asset records.
- Added automatic autosave for project-mode Markdown, manifest metadata, and asset records.
- Added project restore on refresh so imported or projectized decks return in project mode.
- Added recovery warnings when stored project data is invalid, storage is unavailable, or referenced asset records are missing.
- Updated V2 Playwright coverage for refresh restore and missing-asset recovery.
- Updated README and AGENTS with project autosave and V2 storage test expectations.
- Merged Markdown file import and project import into a single `Import` dropdown.
- Merged Markdown export and PDF print into a single `Export` dropdown.
- Added dropdown triangle indicators to Import, Export, and Present menu buttons.
- Added toolbar dividers so the order is `Import`, `Export`, divider, `Projectize`, `Auto Split`, `CSS`, divider, `Present`.
- Added a Projectize confirmation dialog warning that the operation cannot be reverted, with Confirm and Cancel actions.
- Reused the existing import, export, and print behavior without changing file formats or storage.
- Added browser regression coverage for the consolidated toolbar dropdowns and Projectize confirmation.
- Updated README usage text for the consolidated menus.
- No new runtime or development dependencies were introduced.

## 2026-04-30 (3)

- Continued V2 with Step 3: asset management UI.
- Added an Assets panel for project-mode decks with sorting by name, size, or usage count.
- Added asset import into `/assets` using the existing project asset model and browser file APIs.
- Added per-asset Insert, Rename, and Remove actions.
- Added reference checks: used assets show usage counts, active-reference rename is blocked until reference rewriting is added, and active-reference removal requires confirmation.
- Added duplicate asset detection based on content hash and flags duplicate content in the panel.
- Updated README and AGENTS with asset panel usage and test expectations.
- Added V2 browser regression coverage for asset import, usage counts, duplicate detection, rename, insertion, and referenced-asset removal.
- No new runtime or development dependencies were introduced.

## 2026-04-30 (4)

- Continued V2 with Step 4: Markdown reference rewriting.
- Kept project asset path resolution in the render path and added missing-asset preview placeholders for unresolved `assets/...` image references.
- Added non-blocking unresolved asset diagnostics in the status line.
- Updated asset rename to rewrite matching Markdown image/link references automatically.
- Updated referenced-asset removal messaging to indicate when Markdown references become unresolved.
- Updated README and AGENTS with reference rewriting and missing-asset expectations.
- Expanded V2 browser regression coverage for referenced asset rename, Markdown rewrite, missing preview placeholders, and unresolved-reference messaging.
- No new runtime or development dependencies were introduced.
