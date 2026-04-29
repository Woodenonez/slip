# Slip

Slip is a browser-native Markdown slide editor focused on single-file authoring and reliable print/PDF output.

## Run

Open `index.html` in a browser.

No build step or package install is required for the current static MVP.

## Implemented

- Markdown editor backed by a single `.md` document
- Frontmatter parsing for `title` and `theme`
- Slide splitting with `---`, while ignoring separators inside fenced code blocks
- Speaker notes with `???`
- Fixed 16:9 slide preview with scoped themes
- Outline navigation and active slide tracking
- Markdown import and export
- Browser print/PDF stylesheet
- Presentation mode with keyboard navigation
- Rule-based heading auto-split
- Drag-and-drop image embedding as data URIs with large-file warnings

## Syntax

```markdown
---
title: Demo
theme: clean
---

# First slide

Content

???
Speaker notes

---

## Second slide
```

Themes: `clean`, `contrast`, `paper`.
