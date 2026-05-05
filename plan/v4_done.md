# V4 Detailed Implementation Plan

Status: complete as of 2026-05-04. The implementation follows `v4_split_done.md` as the detailed source of truth; native AI service work remains a future version because V4 shipped external AI prompt workflows without exposing AI API keys in the browser.

Scope: temporary sharing and AI-assisted markdown normalization.
Primary success signal: users can share decks quickly and convert arbitrary markdown into slide-ready structure.

## Step 1. Share Data Model And TTL Rules
Goal: define temporary sharing behavior before UI and APIs.

1. Substep 1.1: Define share object schema (`id`, payload, expiresAt).
Deliverable: clear storage contract for shared decks.

2. Substep 1.2: Define TTL policy options and default expiration.
Deliverable: consistent expiration behavior across system.

3. Substep 1.3: Add cleanup job spec for expired shares.
Deliverable: expired shares are removed predictably.

## Step 2. Temporary Share Link API
Goal: create and resolve `/share/:id` safely.

1. Substep 2.1: Implement create-share endpoint for current deck payload.
Deliverable: returns share ID and expiration timestamp.

2. Substep 2.2: Implement read-share endpoint with TTL validation.
Deliverable: valid links return payload; expired links return clear error.

3. Substep 2.3: Add rate limit and payload size limits.
Deliverable: API protected against abuse and oversized decks.

## Step 3. Share UI Flow
Goal: expose sharing through a simple user flow.

1. Substep 3.1: Add Share action in editor toolbar.
Deliverable: user can generate a temporary link.

2. Substep 3.2: Add copy-link UI with expiration info.
Deliverable: copied URL plus visible TTL confirmation.

3. Substep 3.3: Add open-shared-deck route and read-only mode.
Deliverable: shared deck opens without editing privileges by default.

## Step 4. AI Conversion Pipeline Foundation
Goal: normalize arbitrary markdown into slide-friendly markdown.

1. Substep 4.1: Define deterministic conversion contract and prompts.
Deliverable: clear input/output schema for conversion service.

2. Substep 4.2: Implement conversion service wrapper with retries.
Deliverable: conversion request returns structured markdown output.

3. Substep 4.3: Add fallback rule-based converter when AI unavailable.
Deliverable: conversion remains functional during provider issues.

## Step 5. AI Conversion Features
Goal: deliver the exact normalization functions from plan.

1. Substep 5.1: Add slide separator insertion.
Deliverable: long markdown segmented into slides.

2. Substep 5.2: Add heading normalization and section extraction.
Deliverable: heading hierarchy is consistent and slide-usable.

3. Substep 5.3: Add speaker note conversion to `???` blocks.
Deliverable: notes are structured in supported syntax.

## Step 6. Review And Apply Workflow
Goal: keep user control over AI-generated changes.

1. Substep 6.1: Show side-by-side diff (original vs converted).
Deliverable: user can inspect changes before applying.

2. Substep 6.2: Add apply-all and selective apply actions.
Deliverable: user can accept full or partial conversion output.

3. Substep 6.3: Add undo checkpoint for conversion operations.
Deliverable: one-click rollback after apply.

## Step 7. Safety, Quality, And Cost Controls
Goal: ship conversion and sharing features responsibly.

1. Substep 7.1: Add sensitive-content redaction option before send.
Deliverable: optional scrub pass before AI request.

2. Substep 7.2: Add conversion quality checks (structure validity).
Deliverable: invalid output is rejected with actionable feedback.

3. Substep 7.3: Add usage metrics (latency, errors, token/cost estimates).
Deliverable: operational dashboard inputs available.

## Tracking Template For Execution
Use this template per substep:

- Substep ID:
- Owner:
- Branch/PR:
- Status: todo | in-progress | review | done
- Acceptance check:
- Notes/Risks:

## V4 Exit Criteria

1. Temporary share links work with strict expiration.
2. Shared routes enforce read-only behavior by default.
3. AI conversion covers separators, headings/sections, and notes.
4. User can review diffs and safely apply or rollback conversions.
