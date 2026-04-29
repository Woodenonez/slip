# Repository Guidelines

## Project Structure & Module Organization

Slip is a Vite-powered single-page Markdown slide editor:

- `index.html` defines the app shell and presentation/dialog markup.
- `app.js` contains editor setup, parsing, rendering, presentation modes, import/export, and UI event wiring.
- `styles.css` contains layout, slide themes, print rules, presentation styles, and dialogs.
- `plan/` contains product and version plans; `plan/v1_done.md` records the completed V1 scope.
- `LOG.md` records completed work and dependencies. Update it whenever progressing the project.
- `dist/` and `node_modules/` are generated and should not be edited manually.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the local Vite server at `http://127.0.0.1:5173/`.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the production build locally.
- `npm run check`: run `node --check app.js` for JavaScript syntax validation.
- `npm run test:v1`: run Playwright V1 browser regressions.
- `npm run release:check`: run syntax, production build, and V1 regressions.

After a user-visible change, run `npm run check`, `npm run build`, and relevant tests. For V1 release readiness, use `npm run release:check`.

## Coding Style & Naming Conventions

Use modern JavaScript modules, two-space indentation, and semicolons. Prefer small named functions over complex inline handlers. Keep DOM IDs and CSS classes kebab-case, for example `auto-split-dialog`. JavaScript state fields and functions use camelCase, for example `autoSplitDraft`.

Avoid broad rewrites. Follow the existing parser/render pipeline in `app.js` and keep CSS scoped to the relevant UI or slide surface.

## Testing Guidelines

Playwright covers V1 browser regressions. Current required checks are:

- `npm run check`
- `npm run build`
- `npm run test:v1`
- Manual browser validation at `http://127.0.0.1:5173/` when UI changed

For parser changes, test frontmatter, `---`, notes, custom CSS, code blocks, and KaTeX math.

## Commit & Pull Request Guidelines

Recent commits use short imperative messages, such as `Add scoped custom slide CSS` and `Add auto split review workflow`. Keep commits focused on one completed step.

Pull requests should include a concise summary, verification commands, manual browser checks, and screenshots or notes for UI changes. Mention any new dependencies explicitly and update `LOG.md`.

## Agent-Specific Instructions

V1 is complete; do not start V1.5/V2 work without user confirmation. Mermaid support is deferred. If a requested change is risky, impractical, or likely to harm the project architecture, explain why and confirm before implementing.
