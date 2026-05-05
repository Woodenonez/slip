# Markdown Slides Web App — Implementation Plan (Final Compact)
## 1. Product Definition
> **Browser-native Markdown slide editor with Marp-like portability, designed as print-first slides with reliable export.**

## 2. Core Principles
* **Print-first model**
  * Slides are designed as fixed pages (A4/16:9)
  * Screen view = scaled preview of print layout
* **Static rendering only**
  * No animations, no fragments (V1/V2)
* **Single-file first**
  * `.md` is the source of truth
* **Speed-first**
  * Instant preview, partial re-render
* **Progressive complexity**
  * V1: single file → V2: project → V3+: cloud

## 3. Markdown Scope (V1)
### Supported
* `---` slide separator
* Headings, lists, paragraphs
* Images
* Code blocks
* Speaker notes (`???`)
* Basic frontmatter:
  * `title`
  * `theme`

### Not Supported (V1/V2)
* Animations / fragments
* Complex directives
* Layout systems

## 4. Rendering System
### Model
```text
Markdown → AST → Slide objects → Static HTML pages
```

### Key Rules
* Each slide = **isolated container**
* Strict CSS scoping per slide:
```css
.slide {
  width: 1280px;
  height: 720px;
}
```
* No global style leakage
* Themes applied via scoped CSS variables

### Performance Strategy
#### Fast Path
* Text-only slides → immediate render

#### Slow Path
* Code → syntax highlight
* Math → KaTeX
* Diagrams → Mermaid

Optimization:
* Render only changed slides
* Cache heavy blocks

## 5. Storage Strategy
### V1 — Single File Mode
```text
slides.md
```
Supports:
* Inline images (base64)

### Constraints
* Warn if base64 images exceed ~1–2MB
* Large assets discouraged

### Future Migration
Prepare transition to:
```text
/project/
  slides.md
  /assets/
  config.json
```
(V2 only after validation)

## 6. Development Phases
## V1a — Core Validation
### Goal
Validate:
```text
Fast Markdown → slides → export workflow
```

### Features
* Markdown editor (CodeMirror 6)
* Instant preview (no iframe)
* Static slide renderer
* Import / export `.md`

### Export (Required)
* Browser print-to-PDF
* Print CSS matches preview

### Deployment
* GitHub Pages

## V1b — Usability
### Goal
Make it usable for real presentations

### Features
#### Navigation
* Slide outline sidebar
* Click to jump

#### Presentation Modes
**Mirror Mode**
* Slide-only view

**Presenter Mode**
* Current slide
* Next slide
* Notes
* Timer

#### Assets
* Drag & drop images
* Auto convert to base64
* Size warning (1–2MB threshold)

#### Themes
* CSS-based themes
* Theme picker
* Custom CSS injection

#### Auto Slide Split (Rule-based)
> Placeholder for future AI

Rules:
* Split on headings (`#`, `##`)
* Max content per slide
* Detect sections

Flow:
```text
Paste content → Auto-split → Preview → Edit
```

## V2 — Project Mode
### Goal
Support real decks with assets

### Features
* Project structure:
```text
/project/
  slides.md
  /assets/
  config.json
```
* IndexedDB (virtual FS)
* Asset management

### Export
* `.zip` project
* Self-contained `.md` (optional)

## V3 — Cloud Sync
### Goal
Cross-device usage (user owns files)

### Features
* OAuth login (Google / Microsoft)
* Cloud integration:
  * Google Drive
  * OneDrive

### Model (like draw.io)
```text
App edits files directly in user cloud
```

## V4 — Sharing + AI
Status: complete as of 2026-05-04. Detailed completion notes are in `v4_done.md` and `v4_split_done.md`.

### Temporary Share Links
* Generate URL:
```text
/share/:id
```
* Temporary storage (TTL-based)

### AI Markdown Conversion
> Normalize arbitrary Markdown into slide format

Functions:
* Add slide separators
* Normalize headings
* Extract sections
* Convert notes

## 7. Performance Targets
* Edit → preview < 50ms (text)
* Partial re-render only
* Smooth for 100+ slides

## 8. Key Differentiators
* Print-first (stable export)
* Static slides (no animation complexity)
* Single-file portability
* Fastest browser workflow
* Progressive feature layers

## 9. Non-Goals
* Animation systems
* PowerPoint replacement
* Full Slidev feature parity

## 10. Core UX Flow
```text
Open → Paste/Write Markdown → Auto-split (optional) → Preview → Present → Export
```
