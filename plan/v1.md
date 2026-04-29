# V1 Detailed Implementation Plan

Scope: V1a (core validation) + V1b (usability) in single-file mode.
Primary success signal: a user can write Markdown, preview slides instantly, present, and export reliable PDF.

## Step 1. App Shell And Tooling Baseline
Goal: bootstrap the web app with stable local dev and production build.

1. Substep 1.1: Create base app structure with routes for Editor and Present views.
Deliverable: app starts with placeholder panes and no runtime errors.

2. Substep 1.2: Add global app state container for current markdown text.
Deliverable: typing in a temporary textarea updates shared state.

3. Substep 1.3: Add build and deploy config for static hosting.
Deliverable: production build artifact can be generated and served locally.

## Step 2. Markdown Editor (CodeMirror 6)
Goal: deliver a robust editing surface as the authoring source of truth.

1. Substep 2.1: Integrate CodeMirror 6 with markdown mode.
Deliverable: syntax highlighting and editable markdown buffer.

2. Substep 2.2: Sync editor content to app state with debounce.
Deliverable: every edit updates state without typing lag.

3. Substep 2.3: Add file import (.md) into editor state.
Deliverable: user can load a local markdown file into editor.

## Step 3. Slide Parsing Core
Goal: convert markdown text into slide data model.

1. Substep 3.1: Parse frontmatter (`title`, `theme`) and body content.
Deliverable: parser returns metadata plus content string.

2. Substep 3.2: Split slides by `---` separator.
Deliverable: deterministic array of slide source blocks.

3. Substep 3.3: Parse speaker notes via `???` blocks per slide.
Deliverable: each slide object has `content` and optional `notes`.

## Step 4. Static Slide Renderer
Goal: render parsed slide objects as isolated static pages.

1. Substep 4.1: Render single slide component with fixed dimensions (1280x720).
Deliverable: one slide preview respects print-first sizing.

2. Substep 4.2: Render full slide list in preview pane.
Deliverable: all slides visible and consistently styled.

3. Substep 4.3: Enforce slide-scoped CSS and prevent style leakage.
Deliverable: styling one slide does not alter others.

4. Substep 4.4: Add minimal print CSS smoke test.
Deliverable: one rendered slide prints as one page without clipping.

## Step 5. Fast Preview Pipeline
Goal: keep text editing responsive.

1. Substep 5.1: Add change detection to re-render only modified slides. Add stable slide IDs and content hashes.
Deliverable: partial render path wired to parser output.

2. Substep 5.2: Add lightweight render path for text-only slides. Memoize SlidePreview by hash.
Deliverable: edits in plain text slides feel near-instant.

3. Substep 5.3: Instrument edit-to-preview latency logs. Add latency instrumentation.
Deliverable: timing metrics visible in development console.

## Step 6. Slow-Path Blocks
Goal: support code, math, and diagrams without blocking fast path.

1. Substep 6.1: Add syntax highlighting for fenced code blocks.
Deliverable: code blocks render with readable themes.

2. Substep 6.2: Add KaTeX rendering for math blocks.
Deliverable: valid math expressions render correctly.

3. Substep 6.3 (optional): Add Mermaid block rendering with cache keying. If this introduces unacceptable latency or complexity, defer to V2.
Deliverable: repeated diagrams avoid full re-render cost.

4. Substep 6.4: Add block-level render errors.
Deliverable: invalid math/diagram/code does not break the whole deck.

## Step 7. Export And Print Fidelity
Goal: guarantee print output matches preview.

1. Substep 7.1: Add print stylesheet matching slide dimensions and spacing.
Deliverable: browser print preview mirrors app preview.

2. Substep 7.2: Add Export to PDF flow via browser print trigger helper.
Deliverable: user can export deck to PDF from UI action.

3. Substep 7.3: Add regression checks for page breaks and clipping.
Deliverable: no slide truncation on standard browsers.

## Step 8. Navigation And Deck Outline
Goal: make medium and large decks manageable.

1. Substep 8.1: Build slide outline sidebar using heading extraction.
Deliverable: sidebar lists slide index and title fallback.

2. Substep 8.2: Wire click-to-jump between outline and preview.
Deliverable: selecting item focuses target slide.

3. Substep 8.3: Add active-slide tracking while scrolling.
Deliverable: sidebar highlight follows current slide.

## Step 9. Presentation Modes
Goal: support delivery workflows.

1. Substep 9.1: Implement Mirror Mode route with slide-only canvas.
Deliverable: distraction-free presentation view.

2. Substep 9.2: Implement Presenter Mode layout (current + next).
Deliverable: presenter sees current and upcoming slides.

3. Substep 9.3: Add notes panel and basic timer in Presenter Mode.
Deliverable: speaker notes and elapsed time shown live.

## Step 10. Asset Insertion (Single File)
Goal: handle image workflows in V1 single-file format.

1. Substep 10.1: Add drag-and-drop image insertion into editor.
Deliverable: dropped image appears as markdown image syntax.

2. Substep 10.2: Convert dropped image to base64 data URI.
Deliverable: markdown becomes self-contained.

3. Substep 10.3: Warn when base64 size exceeds 1-2MB threshold.
Deliverable: non-blocking warning displayed with guidance.

## Step 11. Themes And Custom CSS
Goal: make style customization practical while preserving isolation.

1. Substep 11.1: Define theme token variables and default theme.
Deliverable: slides read typography/color values from variables.

2. Substep 11.2: Add theme picker bound to frontmatter `theme`.
Deliverable: switching theme updates preview immediately.

3. Substep 11.3: Add custom CSS injection panel scoped to slides.
Deliverable: user CSS applies without leaking globally.

## Step 12. Auto Slide Split (Rule-Based)
Goal: provide first draft slide segmentation before AI features.

1. Substep 12.1: Implement split-on-heading rule (`#`, `##`).
Deliverable: pasted long markdown auto-splits by section.

2. Substep 12.2: Add max-content-per-slide heuristic.
Deliverable: oversized sections are divided deterministically.

3. Substep 12.3: Add preview-and-accept workflow for auto-split.
Deliverable: user can review generated slides before commit.

## Tracking Template For Execution
Use this template per substep:

- Substep ID:
- Owner:
- Branch/PR:
- Status: todo | in-progress | review | done
- Acceptance check:
- Notes/Risks:

## V1 Exit Criteria

1. Markdown import/edit/export loop works end to end.
2. Preview and print output are visually consistent.
3. Mirror and Presenter modes support a real talk flow.
4. Deck of 100+ slides remains smooth in common editing paths.
