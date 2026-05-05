import assert from "node:assert/strict";
import test from "node:test";
import {
  createShareObject,
  createSingleMarkdownSharePayload,
  defaultShareTtlId,
  isShareExpired,
  resolveShareTtl,
  selectExpiredShares,
  shareCleanupSpec,
  sharePayloadTypes,
  shareTtlOptions,
  supportedSharePayloadTypes,
  validateShareObject,
  validateSharePayload,
} from "../src/shareModel.js";

const fixedNow = new Date("2026-05-04T12:00:00.000Z");
const deterministicBytes = (byteCount) => new Uint8Array(Array.from({ length: byteCount }, (_value, index) => index + 1));

test("defines V4a share TTL options and default expiration", () => {
  assert.equal(defaultShareTtlId, "default");
  assert.equal(shareTtlOptions.default.milliseconds, 6 * 60 * 60 * 1000);
  assert.equal(shareTtlOptions.short.milliseconds, 24 * 60 * 60 * 1000);
  assert.equal(shareTtlOptions.max.milliseconds, 7 * 24 * 60 * 60 * 1000);
  assert.equal(resolveShareTtl("unknown").id, "default");
});

test("creates a single Markdown share payload with normalized metadata", () => {
  const payload = createSingleMarkdownSharePayload("# Deck", {
    title: "Deck",
    theme: "clean",
    size: "widescreen",
  });

  assert.deepEqual(payload, {
    type: "single-md",
    markdown: "# Deck",
    meta: {
      title: "Deck",
      theme: "clean",
      size: "widescreen",
    },
  });
});

test("creates a complete share object with id, owner token, and TTL timestamps", () => {
  const share = createShareObject(
    createSingleMarkdownSharePayload("# Deck", { title: "Deck" }),
    {
      now: fixedNow,
      ttlId: "default",
      randomBytes: deterministicBytes,
    },
  );

  assert.equal(share.schema, "slip.share");
  assert.equal(share.version, 1);
  assert.equal(share.ttlId, "default");
  assert.equal(share.createdAt, "2026-05-04T12:00:00.000Z");
  assert.equal(share.expiresAt, "2026-05-04T18:00:00.000Z");
  assert.match(share.id, /^[A-Za-z0-9_-]+$/);
  assert.match(share.ownerToken, /^[A-Za-z0-9_-]+$/);
  assert.equal(validateShareObject(share).valid, true);
});

test("supports single Markdown first and rejects project zip payloads for now", () => {
  assert.deepEqual(supportedSharePayloadTypes, [sharePayloadTypes.singleMarkdown]);
  assert.equal(validateSharePayload({
    type: sharePayloadTypes.projectZip,
    zipBase64: "abc",
  }, { returnResult: true }).valid, false);
});

test("detects expired shares for cleanup", () => {
  const active = createShareObject(createSingleMarkdownSharePayload("# Active"), {
    id: "active",
    ownerToken: "owner-active",
    now: fixedNow,
    ttlId: "max",
  });
  const expired = createShareObject(createSingleMarkdownSharePayload("# Expired"), {
    id: "expired",
    ownerToken: "owner-expired",
    now: fixedNow,
    ttlId: "short",
  });
  const now = new Date("2026-05-06T12:00:00.000Z");

  assert.equal(isShareExpired(active, now), false);
  assert.equal(isShareExpired(expired, now), true);
  assert.deepEqual(selectExpiredShares([active, expired], now).map((share) => share.id), ["expired"]);
});

test("documents cleanup strategies for the future backend", () => {
  assert.equal(shareCleanupSpec.preferred, "scheduled-job");
  assert.equal(shareCleanupSpec.fallback, "lazy-cleanup");
  assert.ok(shareCleanupSpec.strategies.some((strategy) => strategy.id === "serverless-schedule"));
});
