import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDriveListQuery,
  createGoogleDriveConnector,
  inferGoogleDriveMimeType,
  mapDriveFileMetadata,
} from "../src/googleDriveConnector.js";
import { cloudConnectorErrorCodes } from "../src/cloudConnectors.js";

const googleSession = {
  provider: "google",
  accessToken: "access-token",
  tokenType: "Bearer",
};

test("maps Google Drive metadata into the cloud file model", () => {
  const metadata = mapDriveFileMetadata({
    id: "file-1",
    name: "Deck.md",
    mimeType: "text/markdown",
    modifiedTime: "2026-05-02T10:00:00.000Z",
    headRevisionId: "rev-1",
    version: "12",
    size: "128",
    parents: ["root"],
  });

  assert.deepEqual(metadata, {
    id: "file-1",
    provider: "google",
    name: "Deck.md",
    mimeType: "text/markdown",
    modifiedTime: "2026-05-02T10:00:00.000Z",
    revisionId: "rev-1",
    size: 128,
    path: "root",
  });
});

test("builds a Drive list query for markdown and package files", () => {
  const query = buildDriveListQuery("sales 'deck'");

  assert.match(query, /trashed=false/);
  assert.match(query, /name contains '.md'/);
  assert.match(query, /name contains '.zip'/);
  assert.match(query, /name contains 'sales \\'deck\\''/);
});

test("lists Google Drive files with auth and normalized metadata", async () => {
  const requests = [];
  const connector = createGoogleDriveConnector(googleSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return jsonResponse({
        files: [{
          id: "file-1",
          name: "Deck.md",
          mimeType: "text/markdown",
          modifiedTime: "2026-05-02T10:00:00.000Z",
          version: "4",
          size: "256",
        }],
      });
    },
  });

  const files = await connector.listFiles({ query: "Deck", pageSize: 25 });

  assert.equal(requests[0].url.origin, "https://www.googleapis.com");
  assert.equal(requests[0].url.pathname, "/drive/v3/files");
  assert.equal(requests[0].url.searchParams.get("pageSize"), "25");
  assert.equal(requests[0].options.headers.Authorization, "Bearer access-token");
  assert.equal(files[0].revisionId, "4");
  assert.equal(files[0].provider, "google");
});

test("opens a Google Drive file by reading metadata then media", async () => {
  const requests = [];
  const connector = createGoogleDriveConnector(googleSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (requests.length === 1) {
        return jsonResponse({
          id: "file-1",
          name: "Deck.md",
          mimeType: "text/markdown",
          modifiedTime: "2026-05-02T10:00:00.000Z",
          headRevisionId: "rev-1",
          size: "7",
        });
      }
      return textResponse("# Deck");
    },
  });

  const opened = await connector.openFile("file-1");

  assert.equal(requests[0].url.searchParams.get("fields").includes("headRevisionId"), true);
  assert.equal(requests[1].url.searchParams.get("alt"), "media");
  assert.equal(opened.content, "# Deck");
  assert.equal(opened.metadata.revisionId, "rev-1");
});

test("saves a Google Drive file after revision check", async () => {
  const requests = [];
  const connector = createGoogleDriveConnector(googleSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (requests.length === 1) {
        return jsonResponse({
          id: "file-1",
          name: "Deck.md",
          mimeType: "text/markdown",
          modifiedTime: "2026-05-02T10:00:00.000Z",
          headRevisionId: "rev-1",
          size: "7",
        });
      }
      return jsonResponse({
        id: "file-1",
        name: "Deck.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-05-02T10:05:00.000Z",
        headRevisionId: "rev-2",
        size: "9",
      });
    },
  });

  const saved = await connector.saveFile("file-1", {
    content: "# Updated",
    expectedRevisionId: "rev-1",
  });

  assert.equal(requests[1].url.pathname, "/upload/drive/v3/files/file-1");
  assert.equal(requests[1].url.searchParams.get("uploadType"), "media");
  assert.equal(requests[1].options.method, "PATCH");
  assert.equal(requests[1].options.body, "# Updated");
  assert.equal(saved.revisionId, "rev-2");
});

test("blocks Google Drive save when the revision changed", async () => {
  const connector = createGoogleDriveConnector(googleSession, {
    fetchImpl: async () => jsonResponse({
      id: "file-1",
      name: "Deck.md",
      mimeType: "text/markdown",
      modifiedTime: "2026-05-02T10:00:00.000Z",
      headRevisionId: "remote-rev",
      size: "7",
    }),
  });

  await assert.rejects(
    () => connector.saveFile("file-1", { content: "# Local", expectedRevisionId: "local-rev" }),
    (error) => error.code === cloudConnectorErrorCodes.conflict
      && error.details.current.revisionId === "remote-rev",
  );
});

test("creates Google Drive files with multipart upload", async () => {
  const requests = [];
  const connector = createGoogleDriveConnector(googleSession, {
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return jsonResponse({
        id: "file-2",
        name: "New deck.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-05-02T10:00:00.000Z",
        headRevisionId: "rev-1",
        size: "5",
      });
    },
  });

  const created = await connector.createFile({ name: "New deck.md", content: "# New", parentId: "root" });

  assert.equal(requests[0].url.pathname, "/upload/drive/v3/files");
  assert.equal(requests[0].url.searchParams.get("uploadType"), "multipart");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.body instanceof FormData, true);
  assert.equal(created.id, "file-2");
});

test("maps Google Drive API failures to connector errors", async () => {
  const connector = createGoogleDriveConnector(googleSession, {
    fetchImpl: async () => jsonResponse({ error: { message: "File not found" } }, { ok: false, status: 404 }),
  });

  await assert.rejects(
    () => connector.openFile("missing"),
    (error) => error.code === cloudConnectorErrorCodes.notFound
      && error.message === "File not found",
  );
});

test("infers Google Drive upload MIME type from file name", () => {
  assert.equal(inferGoogleDriveMimeType("deck.md"), "text/markdown");
  assert.equal(inferGoogleDriveMimeType("project.zip"), "application/zip");
});

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
