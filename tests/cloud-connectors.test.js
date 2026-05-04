import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudConnectorError,
  cloudConnectorErrorCodes,
  createCloudConnectorRegistry,
  createMemoryCloudConnector,
  createUnsupportedCloudConnector,
  normalizeCloudFileMetadata,
  requireCloudSession,
} from "../src/cloudConnectors.js";

test("normalizes cloud file metadata for provider-neutral workflows", () => {
  const metadata = normalizeCloudFileMetadata({
    id: 42,
    name: "deck.md",
    mimeType: "text/markdown",
    revisionId: 7,
    size: "32",
  }, "google");

  assert.deepEqual(metadata, {
    id: "42",
    provider: "google",
    name: "deck.md",
    mimeType: "text/markdown",
    modifiedTime: metadata.modifiedTime,
    revisionId: "7",
    size: 32,
    path: "",
  });
  assert.match(metadata.modifiedTime, /^\d{4}-\d{2}-\d{2}T/);
});

test("requires an authenticated cloud session before connector use", () => {
  assert.throws(
    () => requireCloudSession(null),
    (error) => error instanceof CloudConnectorError
      && error.code === cloudConnectorErrorCodes.unauthenticated,
  );
  assert.equal(requireCloudSession({ provider: "google", accessToken: "token" }).provider, "google");
});

test("selects connectors by active session provider", () => {
  const google = createMemoryCloudConnector({ provider: "google", label: "Google Drive" });
  const registry = createCloudConnectorRegistry([google]);

  assert.equal(registry.requireForSession({ provider: "google", accessToken: "token" }), google);
  assert.throws(
    () => registry.requireForSession({ provider: "microsoft", accessToken: "token" }),
    (error) => error.code === cloudConnectorErrorCodes.unsupportedProvider,
  );
});

test("memory connector implements list, open, save, and create contract", async () => {
  const connector = createMemoryCloudConnector({
    provider: "google",
    label: "Google Drive",
    files: [{ id: "deck-1", name: "Quarterly deck.md", content: "# First", revisionId: "1" }],
  });

  assert.equal(connector.provider, "google");
  const files = await connector.listFiles({ query: "quarterly" });
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "Quarterly deck.md");

  const opened = await connector.openFile("deck-1");
  assert.equal(opened.content, "# First");
  assert.equal(opened.metadata.revisionId, "1");

  const saved = await connector.saveFile("deck-1", {
    content: "# Updated",
    expectedRevisionId: opened.metadata.revisionId,
  });
  assert.equal(saved.revisionId, "2");
  assert.equal(saved.size, 9);

  const created = await connector.createFile({ name: "New deck.md", content: "# New" });
  assert.equal(created.name, "New deck.md");
  assert.equal(created.revisionId, "1");
});

test("memory connector reports revision conflicts", async () => {
  const connector = createMemoryCloudConnector({
    files: [{ id: "deck-1", name: "Deck.md", content: "# Deck", revisionId: "3" }],
  });

  await assert.rejects(
    () => connector.saveFile("deck-1", { content: "# Local", expectedRevisionId: "2" }),
    (error) => error.code === cloudConnectorErrorCodes.conflict
      && error.details.current.revisionId === "3",
  );
});

test("unsupported connector placeholders fail with not implemented", async () => {
  const connector = createUnsupportedCloudConnector({ id: "google", label: "Google Drive" });

  await assert.rejects(
    () => connector.listFiles(),
    (error) => error.code === cloudConnectorErrorCodes.notImplemented
      && error.details.operation === "listFiles",
  );
});
