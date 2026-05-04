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

V1 is finished and marked in `plan/v1_done.md`. V2 is finished and marked in `plan/v2_done.md`.

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

## 2026-04-30 (5)

- Continued V2 with Step 5: project package import/export.
- Added `Project Package` under Export to download project-mode decks as `.zip` files containing `slides.md`, `config.json`, and `assets/`.
- Added `Package` under Import to restore structured Slip `.zip` project packages into project mode and browser storage.
- Removed the older folder-based `Project` import menu option so project import/export uses the portable package path.
- Added strict package validation for supported root entries, manifest schema/version, `slides.md` entry, and asset-file consistency.
- Updated README and AGENTS with package workflow and testing expectations.
- Expanded V2 browser regression coverage for `.zip` package export/import round trips.
- Runtime dependency introduced: `jszip` for browser ZIP generation and parsing; it is dual-licensed `MIT OR GPL-3.0-or-later` and used under MIT terms.

## 2026-04-30 (6)

- Continued V2 with Step 6: optional self-contained Markdown export.
- Added `Self-contained Markdown` under Export to inline project `assets/...` references as data URLs in a single `.md` file.
- Added export blocking for unresolved project asset references so missing assets are not silently dropped.
- Added hard image-size safeguards for embedded Markdown export.
- Updated README and AGENTS with the self-contained export workflow and test expectations.
- Expanded V2 browser regression coverage for exporting self-contained Markdown and re-importing it as a single-file deck.
- No new runtime or development dependencies were introduced.
- Renamed Export menu options to `Markdown (plain)` and `Markdown (embedded)`.
- Refused embedded Markdown export when any image exceeds 350 KB or total images exceed 1.5 MB, including a specific warning reason.
- Moved embedded Markdown refusal warnings into an in-app dialog matching the Projectize warning pattern instead of the lower status warning area.

## 2026-04-30 (7)

- Continued V2 with Step 7: performance hardening for large decks and asset sets.
- Added slide-source parse caching so unchanged slide sources reuse parsed title/content/notes metadata across updates.
- Added cached image thumbnails in the Assets panel with lazy image loading.
- Added batched asset-list rendering so large projects initially render 60 assets and can reveal more in increments.
- Added stale thumbnail-cache pruning after asset rename, removal, or project replacement.
- Updated README and AGENTS with large-project performance expectations.
- Expanded V2 browser regression coverage with a 120-slide, 200-asset project stress case.
- Updated `npm run release:check` to include the V2 browser regression suite.
- Renamed `plan/v2.md` to `plan/v2_done.md` to mark the V2 plan complete.
- No new runtime or development dependencies were introduced.

# V3 Development

V3 started on 2026-05-01 and is now marked complete in `plan/v3_done.md`.

## 2026-05-01 (1)

- Started V3 Step 1 with the OAuth provider-selection shell.
- Added a `Cloud` toolbar dropdown with Google Drive and OneDrive sign-in actions.
- Added an in-app cloud sign-in dialog for missing OAuth client configuration.
- Added PKCE OAuth authorization URL generation for Google and Microsoft when `VITE_GOOGLE_CLIENT_ID` or `VITE_MICROSOFT_CLIENT_ID` is configured.
- Stored pending auth state, provider, and code verifier in `sessionStorage` for the future token exchange step.
- Added `npm run test:v3` and included it in `npm run release:check`.
- Added V3 browser regression coverage for provider selection and missing-client configuration warnings.
- Reordered the toolbar so Cloud sits beside New before Import and Export, with dividers separating cloud, file, editing, and presentation groups.
- Created a `src/` module folder and moved V3 OAuth provider/PKCE logic into `src/cloudAuth.js`.
- Moved V2 project package `.zip` build/read/validation logic into `src/projectPackage.js`.
- Changed outline navigation to instant scrolling so large-deck active slide state stays deterministic.
- Aligned presentation rendering with preview/print by scaling the same fixed-size slide instead of resizing slide content and changing font size.
- Updated README and AGENTS with the modular source layout.
- No new runtime or development dependencies were introduced.

## 2026-05-01 (2)

- Continued V3 with Substep 1.2: OAuth callback token exchange and session storage.
- Added provider token endpoints and a callback handler that validates the returned OAuth `state`, exchanges the authorization code with the saved PKCE verifier, and stores the resulting cloud session in `sessionStorage`.
- Added a cloud session status pill in the toolbar so the user can see signed-out or signed-in provider state.
- Added localized success and failure messages for cloud auth completion.
- Added Node module tests for successful token exchange, invalid-state rejection, and expired-session handling.
- Updated `npm run check` to syntax-check `src/*.js` and updated `npm run test:v3` to run the cloud-auth module tests before the browser cloud-auth regression.
- Updated README and AGENTS with callback/session behavior and V3 testing expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-01 (3)

- Continued V3 with Substep 1.3: logout and token-expiry recovery.
- Added `Cloud > Disconnect` to clear the active cloud session and pending auth state.
- Added expired-session detection on startup; stale sessions are cleared and the user is prompted to sign in again.
- Disabled Disconnect when no valid cloud session exists and kept the signed-in/signed-out status visible in the toolbar brand area.
- Added localized disconnect and session-expired messages.
- Expanded V3 module and browser tests for expired sessions, disconnect cleanup, and disabled logout state.
- Updated README and AGENTS with logout and expired-session recovery expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-01 (4)

- Continued V3 with Substep 2.1: cloud file connector abstraction.
- Added `src/cloudConnectors.js` with provider-neutral `listFiles`, `openFile`, `saveFile`, and `createFile` connector semantics.
- Added shared cloud connector error codes for unauthenticated access, unsupported providers, not-yet-implemented provider APIs, missing files, network failures, and revision conflicts.
- Added normalized cloud file metadata fields so Google Drive and OneDrive can later feed the same open/save workflow.
- Added an in-memory connector and registry for contract tests without introducing real provider API calls yet.
- Expanded `npm run test:v3` with cloud connector module tests for session requirements, connector selection, metadata normalization, list/open/save/create behavior, and conflict detection.
- Updated README and AGENTS with the cloud connector module and V3 test expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-01 (i18n)

- Added multiple UI language support as an extra required feature.
- Added `src/i18n.js` with English and Chinese translations and a persisted language selector.
- Localized static toolbar, panel, dialog, presentation, asset, export, package, cloud-auth, and status text where it is part of the UI workflow.
- Added browser regression coverage for switching between English and Chinese and preserving the selected language after reload.
- Updated README and AGENTS with the language selector and translation maintenance expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-02 (1)

- Continued V3 with Substep 2.2: Google Drive connector implementation.
- Added `src/googleDriveConnector.js` with Google Drive file listing, metadata mapping, media download, revision-checked save, and multipart file creation.
- Kept Google Drive on the existing least-privilege `drive.file` scope; this supports files Slip creates or files the user explicitly opens with Slip, while broad Drive browsing remains a later product/security decision.
- Added Google Drive connector tests for list queries, authorized requests, metadata normalization, open, save, conflict blocking, create, MIME inference, and API error mapping.
- Expanded `npm run test:v3` to include the Google Drive connector module tests.
- Updated README and AGENTS with the Google Drive connector module and V3 testing expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-02 (2)

- Continued V3 with Substep 2.3: OneDrive connector implementation.
- Added `src/oneDriveConnector.js` with Microsoft Graph file listing, metadata mapping, browser-safe download URL handling, revision-checked save, and small-file creation.
- Used the Graph-recommended browser pattern of fetching `@microsoft.graph.downloadUrl` before downloading file contents, avoiding `/content` redirect/CORS issues in JavaScript apps.
- Added OneDrive connector tests for supported file filtering, authorized requests, metadata normalization, open, save, conflict blocking, create, MIME inference, and API error mapping.
- Expanded `npm run test:v3` to include the OneDrive connector module tests.
- Updated README and AGENTS with the OneDrive connector module and V3 testing expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-02 (3)

- Continued V3 with Substep 3.1: Open From Cloud picker and recent file memory.
- Added `Cloud > Open From Cloud`, disabled until a cloud session is active.
- Added a cloud open dialog with provider summary, search, refresh, supported file listing, and recent cloud files persisted in `localStorage`.
- Wired the cloud picker to the active Google Drive or OneDrive connector and load selected Markdown files into the editor.
- Added project package opening support through cloud metadata and blobs so `.zip` Slip packages can be restored through the same picker.
- Localized the cloud picker UI in English and Chinese.
- Updated README and AGENTS with the new cloud open workflow and testing expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-02 (4)

- Continued V3 with Substep 3.2: Save and Save As to cloud destination.
- Added `Cloud > Save` and `Cloud > Save As`; Save is enabled only after the deck has an active cloud file, while Save As creates and binds a new cloud file.
- Followed the draw.io-style location model: once a deck is opened from cloud or saved there, Slip keeps that cloud location as the current destination.
- Added a first-party Save As dialog for naming the cloud file instead of using a browser prompt.
- Added cloud save payload generation for Markdown decks and Slip project packages, with project-mode decks defaulting to `.zip` package saves.
- Updated cloud session status to show the active cloud file name when a cloud destination is bound.
- Localized the cloud save UI in English and Chinese.
- Updated README and AGENTS with the cloud save workflow and testing expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-03 (1)

- Changed the Google sign-in path from browser-based authorization-code exchange to Google Identity Services token auth.
- Fixed the real Google login blocker where Google's Web OAuth client required a `client_secret` during token exchange; Slip no longer sends Google auth codes to the token endpoint from the browser.
- Kept Microsoft on the existing PKCE redirect and callback flow.
- Stored GIS access-token responses in the existing cloud session shape so Google Drive connectors, cloud open, and cloud save continue using the same session API.
- Updated V3 auth tests for Google GIS token sessions and provider-selection behavior with or without a configured Google client ID.
- Updated README and AGENTS to distinguish Google GIS auth from Microsoft OAuth callback auth.
- Added `.gitignore` coverage for local environment files so `.env.local` stays out of commits.
- No new runtime or development dependencies were introduced.

## 2026-05-03 (2)

- Continued V3 with Substep 3.3 and Step 4: dirty-state prompts plus conflict detection and resolution.
- Added cloud document dirty tracking; cloud-bound decks show `*` beside the active cloud file name when local edits are not saved to the cloud destination.
- Added browser `beforeunload` protection and in-app discard warnings before replacing a cloud-bound deck with unsaved local edits.
- Added explicit conflict handling when provider revision IDs differ during save.
- Added a cloud conflict dialog with Reload Remote, Save Duplicate, and Overwrite choices.
- Wired conflict reload to reopen the provider copy, duplicate to create a local-copy cloud file, and overwrite to save without the stale expected revision.
- Expanded V3 browser tests for dirty indicators, discard warning, conflict dialog actions, and overwrite resolution.
- Updated README and AGENTS with dirty-state and conflict-resolution expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-04 (1)

- Continued V3 with Step 5: offline and recovery behavior.
- Added a local pending cloud-write buffer in `localStorage` for failed cloud saves caused by network/provider availability issues.
- Added cloud sync status labels in the cloud status pill: local, syncing, synced, pending, and conflict.
- Added automatic retry of pending cloud writes when the browser fires the `online` event, as long as the local document still matches the queued write.
- Added stale-pending protection so Slip does not auto-upload an older queued version after the user has made newer local edits.
- Serialized pending Markdown writes as text and project package writes as data URLs so retries survive reloads without new dependencies.
- Expanded V3 browser tests for offline save buffering and online retry.
- Updated README and AGENTS with offline retry behavior and testing expectations.
- No new runtime or development dependencies were introduced.

## 2026-05-04 (2)

- Continued V3 with Step 6: cloud security and permissions.
- Reduced Google auth to the `drive.file` scope only; removed identity scopes because Slip does not need a Google profile to open and save files.
- Reduced Microsoft auth to `Files.ReadWrite`; removed `offline_access` and identity scopes because Slip does not store refresh tokens or need profile claims.
- Added Google Identity Services token revocation on `Cloud > Disconnect` when the browser provider API is available.
- Extended disconnect cleanup to remove pending cloud writes and recent cloud-file cache entries for the disconnected provider.
- Added V3 tests for minimal scopes, Google token revocation, non-Google revocation avoidance, and local cloud-cache cleanup on disconnect.
- Updated README and AGENTS with security, scope, and disconnect-cleanup behavior.
- No new runtime or development dependencies were introduced.

## 2026-05-04 (3)

- Cleaned up the project structure after V3 cloud work.
- Extracted deck constants, slide sizing, parsing, Markdown rendering, KaTeX math rendering, code highlighting, HTML escaping, hashing, and scoped CSS helpers from `app.js` into `src/deck.js`.
- Kept `app.js` focused on editor state, DOM rendering, project workflows, cloud workflows, and event wiring.
- Removed leftover preview render debug logging from production code.
- Added an editor-update flush before cloud saves so delayed render status updates cannot overwrite cloud save/offline retry messages.
- Updated README and AGENTS with the new deck module.
- No new runtime or development dependencies were introduced.

## 2026-05-04 (4)

- Marked V3 as complete.
- Renamed `plan/v3.md` to `plan/v3_done.md` and added a completion status note.
- Updated README with the completed V3 cloud-sync scope.
- Updated AGENTS so future work treats V1, V2, and V3 as complete and does not begin V4 without confirmation.
- No new runtime or development dependencies were introduced.
