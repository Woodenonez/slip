# Repository Guidelines

## Project Structure & Module Organization

Slip is a Vite-powered single-page Markdown slide editor:

- `index.html` defines the app shell and presentation/dialog markup.
- `app.js` contains editor setup, parsing, rendering, presentation modes, import/export, and UI event wiring.
- `src/deck.js` contains reusable deck constants, slide parsing, Markdown rendering, KaTeX/code highlighting, HTML escaping, and scoped CSS helpers.
- `src/cloudAuth.js` contains V3 cloud auth provider configuration, Google Identity Services token auth, Microsoft PKCE auth-start, callback exchange, and session helpers.
- `src/cloudConnectors.js` contains the V3 provider-neutral cloud file connector contract, shared errors, and memory test connector.
- `src/googleDriveConnector.js` contains the Google Drive implementation of the cloud connector contract.
- `src/oneDriveConnector.js` contains the OneDrive implementation of the cloud connector contract.
- `src/i18n.js` contains English and Chinese UI translations and language selection helpers.
- `src/projectPackage.js` contains V2 project `.zip` package build/read/validation logic.
- `styles.css` contains layout, slide themes, print rules, presentation styles, and dialogs.
- `plan/` contains product and version plans; `plan/v1_done.md`, `plan/v2_done.md`, and `plan/v3_done.md` record completed scopes.
- `LOG.md` records completed work and dependencies. Update it whenever progressing the project.
- `dist/` and `node_modules/` are generated and should not be edited manually.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the local Vite server at `http://127.0.0.1:5173/`.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run check`: run `node --check app.js` for JavaScript syntax validation.
- `npm run test:v1`: run Playwright V1 browser regressions.
- `npm run test:v2`: run Playwright V2 project model regressions.
- `npm run test:v3`: run V3 cloud-auth, cloud-connector, Google Drive connector, and OneDrive connector module checks plus Playwright cloud workflow regressions.
- `npm run release:check`: run syntax, production build, V1, V2, and V3 regressions.

After a user-visible change, run `npm run check`, `npm run build`, and relevant tests. For release readiness, use `npm run release:check`.

## Coding Style & Naming Conventions

Use modern JavaScript modules, two-space indentation, and semicolons. Prefer small named functions over complex inline handlers. Keep DOM IDs and CSS classes kebab-case, for example `auto-split-dialog`. JavaScript state fields and functions use camelCase, for example `autoSplitDraft`.

Avoid broad rewrites. Follow the existing parser/render pipeline in `app.js` and keep CSS scoped to the relevant UI or slide surface.

## Testing Guidelines

Playwright covers V1 browser regressions. Current required checks are:

- `npm run check`
- `npm run build`
- `npm run test:v1` or a narrower relevant test such as `npm run test:v2` or `npm run test:v3`
- Manual browser validation at `http://127.0.0.1:5173/` when UI changed

For parser changes, test frontmatter, `---`, notes, custom CSS, code blocks, and KaTeX math. For UI copy changes, update `src/i18n.js` for both English and Chinese and test the language picker. For V2 project-mode changes, test import, migration, IndexedDB restore, asset panel behavior, reference rewriting, project package round trips, self-contained Markdown export, large-project performance, and missing-asset recovery. For V3 cloud changes, test auth configuration warnings, provider selection, Google Identity Services token auth, Microsoft OAuth callback exchange, minimal provider scopes, session status, disconnect cleanup and Google token revocation, expired-session recovery, connector selection, metadata normalization, Drive/OneDrive request mapping, cloud picker behavior, recent cloud file memory, save/save-as location binding, dirty-state prompts, conflict resolution, pending write buffering, and online retry.

## Commit & Pull Request Guidelines

Recent commits use short imperative messages, such as `Add scoped custom slide CSS` and `Add auto split review workflow`. Keep commits focused on one completed step.

Pull requests should include a concise summary, verification commands, manual browser checks, and screenshots or notes for UI changes. Mention any new dependencies explicitly and update `LOG.md`.

## Agent-Specific Instructions

V1, V2, and V3 are complete. Do not start V4 work without user confirmation. Mermaid support is deferred. If a requested change is risky, impractical, or likely to harm the project architecture, explain why and confirm before implementing.
