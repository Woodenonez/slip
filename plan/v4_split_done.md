# Slip V4 Detailed Implementation Plan — Split Version

Status: complete as of 2026-05-04.

Scope: V4 is split into two independent tracks:

- **V4a — Temporary Sharing**
- **V4b — AI-Assisted Markdown Workflows**

Primary success signal: users can quickly share decks through temporary links and use AI-assisted workflows to convert, refine, or repurpose Slip Markdown.

Completion notes:
- V4a shipped temporary single-Markdown share links with TTL, read-only shared routes, revoke, sanitization, and copy-to-editor.
- V4b shipped external AI prompt mode with File to Slip Markdown, Refine Slip Markdown, Slip to Report, local prompt preferences, copyable fenced prompt output, result validation, current/result comparison, apply, and undo.
- Native AI remains explicitly future backend work because browser-only API calls would expose credentials.

---

# V4a — Temporary Sharing

## Scope

Temporary sharing lets users generate short-lived read-only links for Slip decks.

This part requires a backend because share links need server-side storage, expiration, cleanup, and abuse protection.

## Primary Success Signal

A user can create a temporary share link, send it to someone else, and the recipient can open the deck in read-only mode before the link expires.

---

## Step 1. Share Data Model And TTL Rules

Goal: define temporary sharing behavior before UI and APIs.

### Substep 1.1: Define share object schema

Deliverable: clear storage contract for shared decks.

Example schema:

```ts
type ShareObject = {
  id: string;
  payload: SharePayload;
  createdAt: string;
  expiresAt: string;
  ownerToken?: string;
};

type SharePayload =
  | {
      type: "single-md";
      markdown: string;
      meta?: DeckMeta;
    }
  | {
      type: "project-zip";
      zipBase64: string;
    };
```

Recommended V4a starting point:

```text
Support single-md first.
Project zip sharing can come later.
```

### Substep 1.2: Define TTL policy options and default expiration

Deliverable: consistent expiration behavior across system.

Suggested default:

```text
Default TTL: 7 days
Short TTL option: 24 hours
Long TTL option: 30 days
```

### Substep 1.3: Add cleanup job spec for expired shares

Deliverable: expired shares are removed predictably.

Possible cleanup strategies:

```text
Scheduled cron job
Serverless scheduled function
Lazy cleanup during read/create requests
```

---

## Step 2. Temporary Share Link API

Goal: create and resolve `/share/:id` safely.

### Substep 2.1: Implement create-share endpoint

Deliverable: returns share ID and expiration timestamp.

Example:

```http
POST /api/share
```

Response:

```json
{
  "id": "abc123",
  "url": "https://slip.app/share/abc123",
  "expiresAt": "2026-05-11T12:00:00Z"
}
```

### Substep 2.2: Implement read-share endpoint with TTL validation

Deliverable: valid links return payload; expired links return clear error.

Example:

```http
GET /api/share/:id
```

### Substep 2.3: Add rate limit and payload size limits

Deliverable: API protected against abuse and oversized decks.

Suggested limits:

```text
Max single Markdown payload: 2–5 MB
Max share creation per IP: configurable
Max share read per IP: configurable
```

### Substep 2.4: Add share deletion/revocation endpoint

Deliverable: user can revoke a temporary link before expiration.

Example:

```http
DELETE /api/share/:id
```

Use an `ownerToken` or similar secret to authorize deletion for anonymous users.

### Substep 2.5: Add payload sanitization and security rules

Deliverable: shared decks cannot inject unsafe behavior.

Important checks:

```text
Sanitize custom CSS
Block external CSS imports
Block script-like URLs
Disallow script execution
Use strict Content Security Policy
```

---

## Step 3. Share UI Flow

Goal: expose sharing through a simple user flow.

### Substep 3.1: Add Share action in editor toolbar

Deliverable: user can generate a temporary link.

### Substep 3.2: Add copy-link UI with expiration info

Deliverable: copied URL plus visible TTL confirmation.

Example UI text:

```text
Share link created. Expires in 7 days.
Copy link
Revoke link
```

### Substep 3.3: Add open-shared-deck route and read-only mode

Deliverable: shared deck opens without editing privileges by default.

Route:

```text
/share/:id
```

### Substep 3.4: Add “Copy to My Editor” flow

Deliverable: recipient can copy a shared deck into their local editor state.

This does not modify the original shared deck.

---

## V4a Exit Criteria

1. Temporary share links work with strict expiration.
2. Shared routes enforce read-only behavior by default.
3. Users can revoke active share links.
4. Shared deck rendering is sanitized and safe.
5. Users can copy shared decks into their own editor.

---

# V4b — AI-Assisted Markdown Workflows

## Scope

AI assistance helps users convert, refine, and repurpose Markdown content for Slip.

V4b has two modes:

1. **Native AI** — future built-in AI service inside Slip.
2. **External AI** — current practical mode where Slip generates prompts that users paste into any AI platform.

---

# V4b Mode 1 — Native AI

## Status

Placeholder for future work.

Native AI would require a backend because API keys and model calls should not be exposed in frontend code.

## Future Capabilities

Potential future Native AI features:

```text
Slip calls AI service directly
User receives converted Markdown inside Slip
Structured output validation
Diff preview
Selective apply
Undo checkpoint
Cost and quota tracking
Privacy controls
```

## Native AI Placeholder Steps

### Step N1. Native AI Backend Endpoint

Goal: define but do not implement the backend service for AI conversion.

Deliverable: placeholder interface only.

Example:

```ts
type NativeAIRequest = {
  mode: "file-to-slip" | "refine-slip" | "slip-to-report";
  input: string;
  options?: Record<string, unknown>;
};

type NativeAIResponse = {
  output: string;
  warnings: string[];
};
```

### Step N2. Native AI UI Placeholder

Goal: reserve UI structure for future native AI.

Deliverable: disabled UI section with explanation.

Suggested UI text:

```text
Native AI is planned for a future version. For now, use External AI Prompt Mode.
```

---

# V4b Mode 2 — External AI Prompt Mode

## Purpose

External AI mode does not call any AI API.

Instead, Slip generates well-structured prompts that users can copy and paste into any AI platform, such as ChatGPT, Claude, Gemini, Copilot, or a local model.

## Primary Success Signal

A user can choose a task, copy a generated prompt, paste it into an external AI tool, and receive output that can be pasted back into Slip.

---

## Step E1. External AI Prompt Panel

Goal: provide a simple UI for generating reusable prompts.

### Substep E1.1: Add AI Tools panel

Deliverable: panel contains prompt modes and copy buttons.

Modes:

```text
1. File to Slip Markdown
2. Refine Slip Markdown
3. Slip to Report
```

### Substep E1.2: Add input source selector

Deliverable: user can choose what content is included in the prompt.

Input options:

```text
Current Slip Markdown
User-pasted external content
No content, prompt template only
```

### Substep E1.3: Add copy prompt button

Deliverable: generated prompt is copied to clipboard.

---

## Step E2. Prompt Template 1 — File to Slip Markdown

Goal: generate a prompt that asks external AI to convert long regular Markdown, report text, or PDF-extracted text into proper Slip Markdown.

### Use Case

The user has:

```text
Long regular Markdown
PDF text extraction
Research notes
Article draft
Report content
Lecture notes
```

They want:

```text
Slide-ready Slip Markdown
Clear slide separators
Reasonable headings
Speaker notes if useful
No unsupported Slip features
```

### Generated Prompt Template

```markdown
You are helping me convert source material into Slip Markdown for a browser-native Markdown slide app.

Slip Markdown rules:
- Use `---` to separate slides.
- Use normal Markdown headings, lists, paragraphs, images, and code blocks.
- Use `???` for speaker notes when useful.
- Do not use animations, fragments, complex directives, or layout-specific syntax.
- Keep slides readable and not overcrowded.
- Prefer one main idea per slide.
- Preserve important technical details, definitions, examples, and conclusions.
- If the input looks like PDF-extracted text, repair broken line breaks, headers, footers, page numbers, and repeated artifacts.

Task:
Convert the following content into clean Slip Markdown.

Output requirements:
- Return only the final Slip Markdown.
- Start with optional frontmatter if title/theme can be inferred:

```yaml
---
title: "..."
theme: default
---
```

- Then write slides separated by `---`.
- Use concise slide titles.
- Use bullet points where helpful.
- Put detailed explanation into `???` speaker notes when appropriate.
- Do not invent unsupported facts.
- If something is unclear, keep it general rather than fabricating details.

Source content:

[PASTE CONTENT HERE]
```

---

## Step E3. Prompt Template 2 — Refine Slip Markdown

Goal: generate a prompt that asks external AI to improve the structure, formatting, and wording of existing Slip Markdown.

### Use Case

The user already has Slip Markdown but wants:

```text
Cleaner slide structure
Better wording
More consistent headings
Less overcrowded slides
Better speaker notes
Improved flow
```

### Generated Prompt Template

```markdown
You are helping me refine an existing Slip Markdown deck.

Slip Markdown rules:
- Use `---` to separate slides.
- Use normal Markdown headings, lists, paragraphs, images, and code blocks.
- Use `???` for speaker notes.
- Do not use animations, fragments, complex directives, or layout-specific syntax.
- Preserve the original meaning and factual content.
- Improve clarity, structure, wording, and slide readability.
- Keep slides concise and avoid overcrowding.
- If a slide has too much content, split it into multiple slides.
- If speaker notes are missing but useful, add them under `???`.

Task:
Refine the following Slip Markdown deck.

Output requirements:
- Return only the refined Slip Markdown.
- Preserve valid frontmatter if present.
- Keep or improve slide separators.
- Keep image references and code blocks intact unless clearly broken.
- Do not remove important technical details.
- Do not invent new facts.
- Make the deck easier to present.

Slip Markdown input:

[PASTE SLIP MARKDOWN HERE]
```

---

## Step E4. Prompt Template 3 — Slip to Report

Goal: generate a prompt that asks external AI to convert Slip Markdown into a pure text report.

### Use Case

The user has a slide deck and wants:

```text
A written report
A narrative summary
A document-style explanation
A blog/article draft
A handout
```

### Generated Prompt Template

```markdown
You are helping me convert a Slip Markdown slide deck into a pure text report.

Slip Markdown rules:
- Slides are separated by `---`.
- Speaker notes may appear after `???`.
- The deck may include headings, bullets, code blocks, images, and math.

Task:
Convert the following Slip Markdown into a coherent text report.

Output requirements:
- Return only the report text.
- Do not keep slide separators.
- Do not describe the slide format unless relevant.
- Convert bullet points into readable prose where appropriate.
- Preserve the logical structure of the deck.
- Use headings and subheadings for the report.
- Incorporate speaker notes into the report naturally.
- Preserve important technical details, examples, and conclusions.
- For images, mention them only if their alt text or surrounding context is meaningful.
- Do not invent unsupported details.

Slip Markdown input:

[PASTE SLIP MARKDOWN HERE]
```

---

## Step E5. Review And Apply Workflow For External AI

Goal: let users safely paste external AI output back into Slip.

### Substep E5.1: Add paste-result area

Deliverable: user can paste AI output into a review panel.

### Substep E5.2: Validate returned Markdown

Deliverable: Slip checks basic structure before applying.

Validation examples:

```text
Has slide separators
Has no unsupported directives
Frontmatter is valid if present
Code fences are balanced
Speaker note blocks are valid
```

### Substep E5.3: Show side-by-side diff

Deliverable: user can compare current content and AI output.

### Substep E5.4: Add apply and undo checkpoint

Deliverable: user can apply the result and rollback in one click.

---

## Step E6. Prompt Presets And Customization

Goal: make prompt generation useful without being rigid.

### Substep E6.1: Add tone/detail controls

Deliverable: user can adjust generated prompt.

Options:

```text
Concise
Detailed
Academic
Teaching-oriented
Business presentation
Technical presentation
```

### Substep E6.2: Add deck constraints

Deliverable: user can specify output constraints.

Options:

```text
Approximate number of slides
Maximum bullets per slide
Speaker notes: none / brief / detailed
Audience level
Language
```

### Substep E6.3: Save custom prompt templates locally

Deliverable: user can reuse personalized prompt patterns.

Storage:

```text
IndexedDB or localStorage
```

---

## V4b Exit Criteria

1. Native AI is clearly marked as a future placeholder.
2. External AI mode generates useful prompts without requiring an API key or backend.
3. Prompt modes cover:
   - File to Slip Markdown
   - Refine Slip Markdown
   - Slip to Report
4. Users can paste external AI output back into Slip.
5. Slip validates, previews, diffs, applies, and rolls back AI-generated changes.

---

# Tracking Template For Execution

Use this template per substep:

```text
- Substep ID:
- Owner:
- Branch/PR:
- Status: todo | in-progress | review | done
- Acceptance check:
- Notes/Risks:
```

---

# Combined V4 Exit Criteria

1. Temporary share links work with strict expiration.
2. Shared routes enforce read-only behavior by default.
3. Share payloads are sanitized and revocable.
4. Native AI is reserved as a future backend-based feature.
5. External AI prompt mode supports conversion, refinement, and report generation.
6. Users can review, validate, apply, and undo AI-assisted output.
