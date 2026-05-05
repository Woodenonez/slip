import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createShareServer } from "../server/shareServer.js";
import { FileShareStore } from "../server/shareStore.js";

test("creates, reads, and revokes a share link", async () => {
  const fixture = await createFixture();
  try {
    const created = await fixture.request("/api/share", {
      method: "POST",
      body: {
        markdown: "# Shared Deck",
        meta: { title: "Shared Deck", theme: "clean", size: "widescreen" },
      },
    });

    assert.equal(created.status, 201);
    assert.match(created.body.url, /\/share\/[A-Za-z0-9_-]+$/);
    assert.equal(created.body.ttl, "6 hours");
    assert.ok(created.body.ownerToken);

    const read = await fixture.request(`/api/share/${created.body.id}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.readOnly, true);
    assert.equal(read.body.payload.type, "single-md");
    assert.equal(read.body.payload.markdown, "# Shared Deck");

    const rejectedDelete = await fixture.request(`/api/share/${created.body.id}`, { method: "DELETE" });
    assert.equal(rejectedDelete.status, 403);

    const deleted = await fixture.request(`/api/share/${created.body.id}`, {
      method: "DELETE",
      headers: { "x-owner-token": created.body.ownerToken },
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.revoked, true);

    const missing = await fixture.request(`/api/share/${created.body.id}`);
    assert.equal(missing.status, 404);
  } finally {
    await fixture.close();
  }
});

test("rejects unsafe or oversized share payloads", async () => {
  const fixture = await createFixture();
  try {
    const unsafe = await fixture.request("/api/share", {
      method: "POST",
      body: { markdown: "# Bad\n\n<script>alert(1)</script>" },
    });
    assert.equal(unsafe.status, 400);
    assert.equal(unsafe.body.error, "unsafe_payload");

    const oversized = await fixture.request("/api/share", {
      method: "POST",
      body: { markdown: "# Big\n\n".padEnd(2 * 1024 * 1024 + 1, "x") },
    });
    assert.equal(oversized.status, 413);
  } finally {
    await fixture.close();
  }
});

test("expires shares during read", async () => {
  const fixture = await createFixture();
  try {
    const share = await fixture.store.save({
      schema: "slip.share",
      version: 1,
      id: "expired-share",
      payload: { type: "single-md", markdown: "# Old", meta: {} },
      createdAt: "2026-05-04T00:00:00.000Z",
      expiresAt: "2026-05-04T01:00:00.000Z",
      ttlId: "default",
      ownerToken: "owner",
    });

    assert.equal(share.id, "expired-share");
    const response = await fixture.request("/api/share/expired-share");
    assert.equal(response.status, 410);
    assert.equal(await fixture.store.get("expired-share"), null);
  } finally {
    await fixture.close();
  }
});

test("serves built assets from shared deck routes", async () => {
  const fixture = await createFixture({
    files: {
      "index.html": "<!doctype html><script type=\"module\" src=\"./assets/app.js\"></script>",
      "assets/app.js": "window.__slipAssetLoaded = true;",
    },
  });
  try {
    const index = await fixture.rawRequest("/share/example");
    assert.equal(index.status, 200);
    assert.match(index.text, /assets\/app\.js/);

    const asset = await fixture.rawRequest("/share/assets/app.js");
    assert.equal(asset.status, 200);
    assert.equal(asset.text, "window.__slipAssetLoaded = true;");
  } finally {
    await fixture.close();
  }
});

async function createFixture(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "slip-share-test-"));
  const publicDirectory = await mkdtemp(join(tmpdir(), "slip-share-public-"));
  await writeFixtureFiles(publicDirectory, options.files || {});
  const store = new FileShareStore({ directory });
  const server = createShareServer({ store, publicDirectory });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    store,
    async request(path, options = {}) {
      const response = await this.rawRequest(path, options);
      return {
        status: response.status,
        body: JSON.parse(response.text),
      };
    },
    async rawRequest(path, options = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return {
        status: response.status,
        text: await response.text(),
      };
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
      await rm(publicDirectory, { recursive: true, force: true });
    },
  };
}

async function writeFixtureFiles(root, files) {
  await Promise.all(Object.entries(files).map(async ([path, content]) => {
    const fullPath = join(root, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }));
}
