# Slip

Slip is a browser-native Markdown slide editor focused on single-file authoring and reliable print/PDF output.

Status: alpha test version ready. V1 through V4 are complete; V4 adds temporary sharing and external AI prompt workflows.

## Quick Start

Install dependencies and start Slip locally:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://127.0.0.1:5173/`.

For V4 temporary sharing API checks after building, run:

```bash
npm run build
npm run share:server
```

This serves the built app and share endpoints at `http://127.0.0.1:4174/`.

## Using Slip

- Write Markdown in the editor. Slides are split with `---`.
- Use frontmatter for `title`, `theme`, and `size`.
- Add speaker notes after `???`.
- Use the language selector to switch the UI between English and Chinese.
- Click `Import` and choose `File` for local Markdown files.
- Click `Export` and choose `Plain (md)` to download the current deck as `.md`.
- Click `Projectize`, then confirm, to convert the current deck into the V2 project model.
- Click `Export` and choose `Embedded (md)` to inline project assets as data URLs in one `.md` file. Embedded Markdown export is refused when any image is over 350 KB or total images exceed 1.5 MB.
- Click `Export` and choose `Package` to download a project-mode deck as a `.zip` containing `slides.md`, `config.json`, and `assets/`.
- Click `Import` and choose `Package` to restore a structured Slip `.zip` project package.
- Click `Cloud` to start Google Drive or OneDrive sign-in. Google uses Google Identity Services with the `drive.file` scope and requires `VITE_GOOGLE_CLIENT_ID`. OneDrive uses the OAuth callback flow with `Files.ReadWrite` and requires `VITE_MICROSOFT_CLIENT_ID`. Slip stores short-lived cloud sessions in browser `sessionStorage`; use `Cloud > Disconnect` to revoke Google access when possible, clear the active session, and remove local cloud cache for that provider. Expired sessions prompt re-auth.
- Click `Cloud > Open From Cloud` after sign-in to browse supported Markdown decks and Slip project packages from the active provider. Opened cloud files are remembered in a local recent list.
- Use `Cloud > Save` to write back to the currently opened or saved cloud file. Use `Cloud > Save As` to create a new cloud file and bind the deck to that location, similar to draw.io's location-based cloud workflow.
- Cloud-bound decks show `*` beside the cloud file name when local edits are unsaved. Closing the tab or replacing the deck warns before those cloud edits are discarded.
- If the cloud revision changes before save, Slip blocks the write and offers Reload Remote, Save Duplicate, or Overwrite.
- If a cloud save fails because the network/provider is unavailable, Slip buffers the latest write locally, marks the file as pending, and retries when the browser comes back online.
- Click `Share` to create a temporary read-only share link when the app is served by `npm run share:server`. Share links default to 6 hours, can be extended to 24 hours or 7 days, can be copied, and can be revoked with the local owner token.
- Open `/share/:id` links to view a shared deck read-only. Use `Copy to My Editor` to make an editable local copy.
- Click `AI Tools` to generate prompts for external AI tools. Choose File to Slip Markdown when you will attach a TXT/PDF file in the external AI tool, or choose Refine Slip Markdown / Slip to Report for an existing deck. File to Slip does not include the current editor content. Prompt preferences for audience, detail, slide density, output language, and custom instructions are stored locally. Click `Generate` to build the prompt after setting requirements. Paste the external AI result back into the review area to compare current/result content, check blocking issues and warnings, apply it, or undo the last AI apply. Slip does not send content to an AI service.
- Project decks are autosaved in browser storage and restored on refresh.
- Use the `Assets` panel in project mode to add files, insert image references, sort by name/size/usage, rename assets with reference rewriting, and remove assets with reference warnings.
- Large asset lists render lazily in batches with cached image thumbnails to keep the panel responsive.
- Missing `assets/...` references are shown as non-blocking warnings and placeholders in preview.
- Click `Auto Split` to review generated slide breaks before accepting.
- Click `Style` to add scoped slide CSS in a top-level `<style>` block. Use the Target / Property / Value helper to add heading, text, bullet, or page background/margin rules without writing CSS manually. Color properties show a color picker that writes the chosen HEX value into Value. You can clear all style rules or edit the CSS text directly.
- Click `Present` and choose Mirror Mode or Presenter Mode.
- In presentation mode, external website links open in a picture-in-picture web panel with open-in-new-tab and close controls. Some websites block embedding; use the arrow button to open those links directly.
- Click `Export` and choose `PDF` to open the browser print dialog.

## Testing

```bash
npm run check
npm run build
npm run test:v1
npm run test:v2
npm run test:v3
npm run test:v4
npm run test:v5
npm run release:check
```

`npm run test:v1` runs Playwright browser regressions for print sizing, overflow warnings, presentation modes, UI language switching, Auto Split, and a 120-slide deck. `npm run release:check` runs syntax validation, the production build, and the V1, V2, V3, V4, and V5 suites.

`npm run test:v2` runs the V2 project-mode regressions for project import, migration, autosave restore, asset management, reference rewriting, package import/export, self-contained export, large-project performance, and missing-asset recovery.

`npm run test:v3` runs V3 cloud-auth module checks for callback token exchange, minimal scopes, session expiry, token revocation, and disconnect cleanup, connector-contract checks for list/open/save/create semantics, Google Drive and OneDrive connector checks, plus browser regressions for provider selection, missing-client configuration warnings, session status, cloud open picker behavior, cloud save flows, dirty-state prompts, conflict resolution, offline retry behavior, and local cloud-cache cleanup.

`npm run test:v4` runs V4 temporary sharing model checks for payload schema, TTL options, expiration, cleanup selection, and current single-Markdown support.
It also checks the local Node share API for create, read, revoke, expiration, size limits, and basic sanitization, plus browser regressions for Share UI creation/copy/revoke, read-only shared deck routes, external AI prompt generation, prompt preferences, and AI result review/apply/undo behavior.

`npm run test:v5` runs V5 presentation-link browser coverage for the website picture-in-picture panel, open-in-new-tab fallback, and close behavior.

The last self-contained no-build baseline is preserved in git commit `044fa79`.

V1, V2, V3, and V4 are complete in `plan/`. V4 completion is recorded in `plan/v4_done.md` and `plan/v4_split_done.md`; native AI service calls remain future backend work.

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

## V3 Complete

- Google Drive sign-in through Google Identity Services with `drive.file`
- OneDrive sign-in through Microsoft OAuth with `Files.ReadWrite`
- Provider-neutral cloud connector layer for list, open, save, and create
- Cloud open picker with recent cloud file memory
- Cloud Save and Save As for Markdown decks and project packages
- Cloud dirty-state indicator and discard warnings
- Revision-safe cloud conflict detection with reload, duplicate, and overwrite choices
- Offline cloud-save buffering with retry on reconnect
- Disconnect cleanup for sessions, pending cloud writes, recent provider cache, and Google token revocation when available

## Build

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The generated `dist/` directory is static-hosting ready. Vite is configured with relative asset paths, so the build can be served from a domain root or a subpath such as GitHub Pages.

## Structure

- `index.html`: app shell, toolbar, dialogs, and presentation markup
- `app.js`: editor orchestration, rendering, project state, and UI event wiring
- `src/deck.js`: sample decks, slide sizing, deck parsing, Markdown rendering, KaTeX math, code highlighting, HTML escaping, and slide CSS scoping
- `src/i18n.js`: English and Chinese UI translation table and language helper
- `src/projectPackage.js`: V2 `.zip` project package build/read/validation helpers
- `src/cloudAuth.js`: V3 OAuth provider setup, PKCE authorization, callback exchange, and session helpers
- `src/cloudConnectors.js`: V3 provider-neutral cloud file connector contract, shared errors, and memory test connector
- `src/googleDriveConnector.js`: Google Drive connector for listing, opening, saving, and creating Markdown or project package files
- `src/oneDriveConnector.js`: OneDrive connector for listing, opening, saving, and creating Markdown or project package files
- `src/shareModel.js`: V4a share object schema, supported payload types, TTL policy, owner-token field, and cleanup helpers
- `src/aiPrompts.js`: V4b external AI prompt modes, input-source contract, local preference normalization, prompt generation helpers, and AI result validation
- `server/shareServer.js`: V4a local Node share API and static build server
- `server/shareStore.js`: V4a filesystem share storage used by the local server
- `styles.css`: app layout, slide themes, print rules, dialogs, and presentation styles
- `tests/`: Playwright browser regressions split by version scope
- `plan/`: product plans and completed version plans

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

## Contributors

- Ze: project owner and direction.
- OpenAI Codex: implementation assistance, testing support, and documentation updates.

## License

MIT. See [LICENSE](LICENSE).
