import assert from "node:assert/strict";
import test from "node:test";
import { cloudConnectorErrorCodes } from "../src/cloudConnectors.js";
import {
  createOneDriveConnector,
  inferOneDriveMimeType,
  isSlipFile,
  mapOneDriveItemMetadata,
} from "../src/oneDriveConnector.js";

const microsoftSession = {
  provider: "microsoft",
  accessToken: "access-token",
  tokenType: "Bearer",
};

test("maps OneDrive driveItem metadata into the cloud file model", () => {
  const metadata = mapOneDriveItemMetadata({
    id: "item-1",
    name: "Deck.md",
    size: 128,
    eTag: "etag-1",
    cTag: "ctag-1",
    lastModifiedDateTime: "2026-05-02T10:00:00.000Z",
    parentReference: { path: "/drive/root:/Slip" },
    file: { mimeType: "text/markdown" },
  });

  assert.deepEqual(metadata, {
    id: "item-1",
    provider: "microsoft",
    name: "Deck.md",
    mimeType: "text/markdown",
    modifiedTime: "2026-05-02T10:00:00.000Z",
    revisionId: "etag-1",
    size: 128,
    path: "/drive/root:/Slip",
  });
});

test("identifies Slip-supported OneDrive files", () => {
  assert.equal(isSlipFile({ name: "deck.md", file: {} }), true);
  assert.equal(isSlipFile({ name: "deck.markdown", file: {} }), true);
  assert.equal(isSlipFile({ name: "project.zip", file: {} }), true);
  assert.equal(isSlipFile({ name: "folder", folder: {} }), false);
  assert.equal(isSlipFile({ name: "notes.txt", file: {} }), false);
});

test("lists OneDrive files with auth and client-side Slip file filtering", async () => {
  const requests = [];
  const connector = createOneDriveConnector(microsoftSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return jsonResponse({
        value: [
          oneDriveItem({ id: "item-1", name: "Deck.md", eTag: "etag-1" }),
          oneDriveItem({ id: "item-2", name: "Notes.txt", eTag: "etag-2" }),
        ],
      });
    },
  });

  const files = await connector.listFiles({ query: "deck", pageSize: 25 });

  assert.equal(requests[0].url.origin, "https://graph.microsoft.com");
  assert.equal(requests[0].url.pathname, "/v1.0/me/drive/root/children");
  assert.equal(requests[0].url.searchParams.get("$top"), "25");
  assert.equal(requests[0].options.headers.Authorization, "Bearer access-token");
  assert.equal(files.length, 1);
  assert.equal(files[0].provider, "microsoft");
  assert.equal(files[0].revisionId, "etag-1");
});

test("opens OneDrive file by fetching metadata download URL then content", async () => {
  const requests = [];
  const connector = createOneDriveConnector(microsoftSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) {
        return jsonResponse({
          ...oneDriveItem({ id: "item-1", name: "Deck.md", eTag: "etag-1" }),
          "@microsoft.graph.downloadUrl": "https://download.example/deck",
        });
      }
      return textResponse("# Deck");
    },
  });

  const opened = await connector.openFile("item-1");

  assert.equal(new URL(requests[0].url).pathname, "/v1.0/me/drive/items/item-1");
  assert.equal(requests[1].url, "https://download.example/deck");
  assert.equal(requests[1].options, undefined);
  assert.equal(opened.content, "# Deck");
  assert.equal(opened.metadata.revisionId, "etag-1");
});

test("saves OneDrive file after revision check", async () => {
  const requests = [];
  const connector = createOneDriveConnector(microsoftSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (requests.length === 1) {
        return jsonResponse(oneDriveItem({ id: "item-1", name: "Deck.md", eTag: "etag-1" }));
      }
      return jsonResponse(oneDriveItem({ id: "item-1", name: "Deck.md", eTag: "etag-2", size: 9 }));
    },
  });

  const saved = await connector.saveFile("item-1", {
    content: "# Updated",
    expectedRevisionId: "etag-1",
  });

  assert.equal(requests[1].url.pathname, "/v1.0/me/drive/items/item-1/content");
  assert.equal(requests[1].options.method, "PUT");
  assert.equal(requests[1].options.body, "# Updated");
  assert.equal(saved.revisionId, "etag-2");
});

test("blocks OneDrive save when the revision changed", async () => {
  const connector = createOneDriveConnector(microsoftSession, {
    fetchImpl: async () => jsonResponse(oneDriveItem({ id: "item-1", name: "Deck.md", eTag: "remote-etag" })),
  });

  await assert.rejects(
    () => connector.saveFile("item-1", { content: "# Local", expectedRevisionId: "local-etag" }),
    (error) => error.code === cloudConnectorErrorCodes.conflict
      && error.details.current.revisionId === "remote-etag",
  );
});

test("creates OneDrive files with small-file content upload", async () => {
  const requests = [];
  const connector = createOneDriveConnector(microsoftSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return jsonResponse(oneDriveItem({ id: "item-2", name: "New deck.md", eTag: "etag-1", size: 5 }));
    },
  });

  const created = await connector.createFile({ name: "New deck.md", content: "# New", parentId: "root" });

  assert.equal(requests[0].url.pathname, "/v1.0/me/drive/root:/New%20deck.md:/content");
  assert.equal(requests[0].options.method, "PUT");
  assert.equal(requests[0].options.headers["Content-Type"], "text/markdown");
  assert.equal(created.id, "item-2");
});

test("maps Microsoft Graph failures to connector errors", async () => {
  const connector = createOneDriveConnector(microsoftSession, {
    fetchImpl: async () => jsonResponse({ error: { message: "Not found" } }, { ok: false, status: 404 }),
  });

  await assert.rejects(
    () => connector.openFile("missing"),
    (error) => error.code === cloudConnectorErrorCodes.notFound
      && error.message === "Not found",
  );
});

test("infers OneDrive upload MIME type from file name", () => {
  assert.equal(inferOneDriveMimeType("deck.md"), "text/markdown");
  assert.equal(inferOneDriveMimeType("project.zip"), "application/zip");
});

function oneDriveItem(overrides = {}) {
  return {
    id: overrides.id || "item-1",
    name: overrides.name || "Deck.md",
    size: overrides.size ?? 128,
    eTag: overrides.eTag || "etag-1",
    cTag: overrides.cTag || "ctag-1",
    lastModifiedDateTime: "2026-05-02T10:00:00.000Z",
    parentReference: { path: "/drive/root:/Slip" },
    file: { mimeType: inferOneDriveMimeType(overrides.name || "Deck.md") },
  };
}

function jsonResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status || 200,
    statusText: options.statusText || "OK",
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function textResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status || 200,
    statusText: options.statusText || "OK",
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}
