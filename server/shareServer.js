import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
  createShareObject,
  createSingleMarkdownSharePayload,
  isShareExpired,
  resolveShareTtl,
  shareTtlOptions,
} from "../src/shareModel.js";
import { FileShareStore } from "./shareStore.js";

const defaultPort = Number(process.env.PORT || 4174);
const defaultHost = process.env.HOST || "127.0.0.1";
const maxMarkdownBytes = 2 * 1024 * 1024;
const maxJsonBytes = maxMarkdownBytes + 16 * 1024;

export function createShareServer(options = {}) {
  const store = options.store || new FileShareStore({ directory: options.shareDirectory });
  const publicDirectory = options.publicDirectory || "dist";
  const rateLimiter = options.rateLimiter || createRateLimiter();

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", requestOrigin(request));
      if (url.pathname === "/api/share" && request.method === "POST") {
        await handleCreateShare(request, response, store, rateLimiter, url.origin);
        return;
      }
      if (url.pathname.startsWith("/api/share/") && request.method === "GET") {
        await handleReadShare(request, response, store, rateLimiter, url.pathname.split("/").pop());
        return;
      }
      if (url.pathname.startsWith("/api/share/") && request.method === "DELETE") {
        await handleDeleteShare(request, response, store, rateLimiter, url.pathname.split("/").pop());
        return;
      }
      await serveStatic(publicDirectory, url.pathname, response);
    } catch (error) {
      sendJson(response, 500, { error: "server_error", message: error.message });
    }
  });
}

async function handleCreateShare(request, response, store, rateLimiter, origin) {
  if (!rateLimiter.allow(clientKey(request, "create"), 20, 60 * 60 * 1000)) {
    sendJson(response, 429, { error: "rate_limited", message: "Too many share creation requests." });
    return;
  }
  const body = await readJson(request);
  const markdown = String(body.markdown || body.payload?.markdown || "");
  const size = new TextEncoder().encode(markdown).byteLength;
  if (size > maxMarkdownBytes) {
    sendJson(response, 413, { error: "payload_too_large", message: "Shared Markdown must be 2 MB or smaller." });
    return;
  }
  const securityIssue = validateMarkdownForSharing(markdown);
  if (securityIssue) {
    sendJson(response, 400, { error: "unsafe_payload", message: securityIssue });
    return;
  }
  const ttlId = Object.hasOwn(shareTtlOptions, body.ttlId) ? body.ttlId : undefined;
  const payload = createSingleMarkdownSharePayload(markdown, body.meta || {});
  const share = createShareObject(payload, {
    ttlId,
    randomBytes: (byteCount) => randomBytes(byteCount),
  });
  await store.deleteExpired();
  await store.save(share);
  sendJson(response, 201, {
    id: share.id,
    url: `${origin}/share/${share.id}`,
    expiresAt: share.expiresAt,
    ttl: resolveShareTtl(share.ttlId).label,
    ownerToken: share.ownerToken,
  });
}

async function handleReadShare(request, response, store, rateLimiter, id) {
  if (!rateLimiter.allow(clientKey(request, "read"), 120, 60 * 1000)) {
    sendJson(response, 429, { error: "rate_limited", message: "Too many share read requests." });
    return;
  }
  const share = await store.get(id);
  if (!share) {
    sendJson(response, 404, { error: "not_found", message: "Share link was not found." });
    return;
  }
  if (isShareExpired(share)) {
    await store.delete(id);
    sendJson(response, 410, { error: "expired", message: "Share link has expired." });
    return;
  }
  sendJson(response, 200, {
    id: share.id,
    payload: share.payload,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    readOnly: true,
  });
}

async function handleDeleteShare(request, response, store, rateLimiter, id) {
  if (!rateLimiter.allow(clientKey(request, "delete"), 30, 60 * 1000)) {
    sendJson(response, 429, { error: "rate_limited", message: "Too many share deletion requests." });
    return;
  }
  const share = await store.get(id);
  if (!share) {
    sendJson(response, 404, { error: "not_found", message: "Share link was not found." });
    return;
  }
  const ownerToken = request.headers["x-owner-token"] || new URL(request.url || "/", requestOrigin(request)).searchParams.get("ownerToken");
  if (!ownerToken || ownerToken !== share.ownerToken) {
    sendJson(response, 403, { error: "forbidden", message: "Owner token is required to revoke this share link." });
    return;
  }
  await store.delete(id);
  sendJson(response, 200, { revoked: true });
}

function validateMarkdownForSharing(markdown) {
  if (!markdown.trim()) return "Shared Markdown cannot be empty.";
  if (/<script[\s>]/i.test(markdown)) return "Shared Markdown cannot contain script tags.";
  if (/\]\(\s*javascript:/i.test(markdown)) return "Shared Markdown cannot contain javascript: links.";
  if (/<style>[\s\S]*@import/i.test(markdown)) return "Shared Markdown cannot import external CSS.";
  return "";
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxJsonBytes) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(publicDirectory, pathname, response) {
  const normalizedPath = pathname.replace(/^\/share\/assets\//, "/assets/");
  const relativePath = normalizedPath === "/" || /^\/share\/[^/]+\/?$/.test(normalizedPath)
    ? "index.html"
    : normalizedPath.replace(/^\/+/, "");
  const publicRoot = resolve(publicDirectory);
  const filePath = resolve(publicRoot, relativePath);
  if (!filePath.startsWith(publicRoot)) {
    sendJson(response, 403, { error: "forbidden", message: "Forbidden." });
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(content);
  } catch (_error) {
    sendJson(response, 404, { error: "not_found", message: "Not found." });
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function createRateLimiter() {
  const buckets = new Map();
  return {
    allow(key, limit, windowMs) {
      const now = Date.now();
      const bucket = buckets.get(key) || [];
      const next = bucket.filter((timestamp) => now - timestamp < windowMs);
      if (next.length >= limit) {
        buckets.set(key, next);
        return false;
      }
      next.push(now);
      buckets.set(key, next);
      return true;
    },
  };
}

function clientKey(request, action) {
  return `${action}:${request.socket.remoteAddress || "unknown"}`;
}

function requestOrigin(request) {
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${request.headers.host || `${defaultHost}:${defaultPort}`}`;
}

function contentType(filePath) {
  if (extname(filePath) === ".html") return "text/html; charset=utf-8";
  if (extname(filePath) === ".css") return "text/css; charset=utf-8";
  if (extname(filePath) === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createShareServer();
  server.listen(defaultPort, defaultHost, () => {
    console.log(`Slip share server running at http://${defaultHost}:${defaultPort}/`);
  });
}
