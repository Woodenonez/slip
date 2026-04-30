# V2 Detailed Implementation Plan

Scope: project mode with explicit assets and package export.
Primary success signal: user can manage a deck as a project folder and export/import it reliably.

## Step 1. Project Model Foundation
Goal: define the V2 file model and compatibility with V1.

1. Substep 1.1: Define project manifest schema (`config.json`).
Deliverable: manifest captures version, title, theme, and asset index metadata.

2. Substep 1.2: Add project loader for `/project/slides.md` + `/assets`. Use stable asset IDs internally (filenames can change, but IDs and hashes help with rename, deduplication, and cache invalidation).
Deliverable: app can open project structure into working state.

3. Substep 1.3: Add migration path from V1 single-file markdown.
Deliverable: V1 deck can be converted into V2 project in-app.

## Step 2. Virtual File System (IndexedDB)
Goal: persist project files in-browser between sessions.

1. Substep 2.1: Create IndexedDB stores for documents and binary assets.
Deliverable: database schema initialized and versioned.

2. Substep 2.2: Save and restore current project state automatically.
Deliverable: refresh returns to last project content.

3. Substep 2.3: Add corruption/fallback recovery for missing records.
Deliverable: graceful recovery path with user prompt.

## Step 3. Asset Management UI
Goal: manage real asset files instead of only base64 embeds.

1. Substep 3.1: Build Asset panel listing filename, size, and usage count.
Deliverable: assets are visible and sortable.

2. Substep 3.2: Add import action to place files into `/assets`.
Deliverable: imported files stored and referenced by path.

3. Substep 3.3: Add remove/rename asset actions with reference checks.
Deliverable: destructive actions warn on active references.

4. Substep 3.4: Add duplicate asset detection by hash.
Deliverable: system identifies and flags duplicate assets based on their content.

## Step 4. Markdown Reference Rewriter
Goal: keep markdown references valid as assets change.

1. Substep 4.1: Resolve relative asset paths during render.
Deliverable: images load from virtual project structure.

2. Substep 4.2: Rewrite markdown links on asset rename.
Deliverable: references remain valid after rename action.

3. Substep 4.3: Flag unresolved asset links in editor diagnostics.
Deliverable: broken links are surfaced non-blockingly.

## Step 5. Import/Export Project Package
Goal: move projects across devices and collaborators.

1. Substep 5.1: Export current project as `.zip`.
Deliverable: zip includes `slides.md`, `/assets`, and `config.json`.

2. Substep 5.2: Import `.zip` project package.
Deliverable: imported package recreates project in virtual FS. Only allow strictly structured zips to prevent security issues.

3. Substep 5.3: Validate package integrity and version compatibility.
Deliverable: invalid package yields actionable error messages.

## Step 6. Optional Self-Contained Markdown Export
Goal: preserve V1 portability option for users who want one file.

1. Substep 6.1: Add export option to inline project assets as base64.
Deliverable: generated markdown contains embedded assets.

2. Substep 6.2: Add large-asset threshold warning before export.
Deliverable: user sees size-impact estimate and can cancel.

3. Substep 6.3: Compare output with original for rendering parity.
Deliverable: exported self-contained markdown renders equivalently.

## Step 7. Performance Hardening For Large Decks
Goal: maintain responsiveness with many assets and slides.

1. Substep 7.1: Add asset thumbnail cache and lazy loading in panel.
Deliverable: asset UI stays responsive with large lists.

2. Substep 7.2: Add parser cache keys based on file hash changes.
Deliverable: unchanged slides avoid re-parse.

3. Substep 7.3: Add stress tests for 100+ slides and 200+ assets.
Deliverable: measurable baseline and regression guard.

4. Substep 7.4 Add missing-asset placeholders and unresolved-link test cases.
Deliverable: missing assets render as placeholders and broken links are flagged in tests.

## Tracking Template For Execution
Use this template per substep:

- Substep ID:
- Owner:
- Branch/PR:
- Status: todo | in-progress | review | done
- Acceptance check:
- Notes/Risks:

## V2 Exit Criteria

1. User can open, edit, and persist `/project` decks in browser.
2. Asset references remain valid across rename/remove flows.
3. Import/export `.zip` round trip preserves rendering.
4. Optional self-contained markdown export remains available.
