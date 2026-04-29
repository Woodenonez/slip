# Slip

Slip is a browser-native Markdown slide editor focused on single-file authoring and reliable print/PDF output.

## Run

Open `index.html` in a browser.

No build step or package install is required for the current static MVP.

## Implemented

- Markdown editor backed by a single `.md` document
- Frontmatter parsing for `title` and `theme`
- Frontmatter parsing for `title`, `theme`, and `size`
- Slide splitting with `---`, while ignoring separators inside fenced code blocks
- Speaker notes with `???`
- Fixed 16:9 slide preview with scoped themes
- Content overflow warnings for slides that may clip in PDF
- Fenced code block rendering with language labels
- Outline navigation and active slide tracking
- Partial preview rendering with stable slide hashes
- Markdown import and export
- Browser print/PDF stylesheet
- Mirror presentation mode for audience-facing slide display
- Presenter mode with current slide, next slide, notes, timer, and keyboard navigation
- Rule-based heading auto-split
- Drag-and-drop image embedding as data URIs with large-file warnings

## Syntax

```markdown
---
title: Demo
theme: clean
size: widescreen
---

# First slide

Content

???
Speaker notes

---

## Second slide
```

Themes: `clean`, `contrast`, `paper`.

Slide sizes: `widescreen` or `a4`.
