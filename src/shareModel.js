export const shareSchemaVersion = 1;

export const sharePayloadTypes = {
  singleMarkdown: "single-md",
  projectZip: "project-zip",
};

export const supportedSharePayloadTypes = [sharePayloadTypes.singleMarkdown];

export const shareTtlOptions = {
  default: {
    id: "default",
    label: "6 hours",
    milliseconds: 6 * 60 * 60 * 1000,
  },
  short: {
    id: "short",
    label: "24 hours",
    milliseconds: 24 * 60 * 60 * 1000,
  },
  max: {
    id: "max",
    label: "7 days",
    milliseconds: 7 * 24 * 60 * 60 * 1000,
  },
};

export const defaultShareTtlId = "default";

export const shareCleanupSpec = {
  preferred: "scheduled-job",
  fallback: "lazy-cleanup",
  strategies: [
    {
      id: "scheduled-job",
      description: "Run a scheduled backend cleanup that deletes shares whose expiresAt is in the past.",
    },
    {
      id: "serverless-schedule",
      description: "Use a provider scheduled function when the backend is deployed serverlessly.",
    },
    {
      id: "lazy-cleanup",
      description: "Delete expired shares during create/read requests as a fallback safety net.",
    },
  ],
};

export function createSingleMarkdownSharePayload(markdown, meta = {}) {
  const normalizedMarkdown = String(markdown || "");
  if (!normalizedMarkdown.trim()) {
    throw new Error("Shared Markdown payload cannot be empty.");
  }
  return {
    type: sharePayloadTypes.singleMarkdown,
    markdown: normalizedMarkdown,
    meta: normalizeShareMeta(meta),
  };
}

export function createShareObject(payload, options = {}) {
  validateSharePayload(payload);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const ttl = resolveShareTtl(options.ttlId);
  return {
    schema: "slip.share",
    version: shareSchemaVersion,
    id: options.id || createShareToken(12, options.randomBytes),
    payload,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl.milliseconds).toISOString(),
    ttlId: ttl.id,
    ownerToken: options.ownerToken || createShareToken(24, options.randomBytes),
  };
}

export function validateShareObject(share) {
  if (!share || typeof share !== "object") {
    return { valid: false, reason: "Share object must be an object." };
  }
  if (share.schema !== "slip.share") {
    return { valid: false, reason: "Share object schema must be slip.share." };
  }
  if (Number(share.version) !== shareSchemaVersion) {
    return { valid: false, reason: `Share object version must be ${shareSchemaVersion}.` };
  }
  if (!isNonEmptyString(share.id)) {
    return { valid: false, reason: "Share object id is required." };
  }
  if (!isValidIsoDate(share.createdAt) || !isValidIsoDate(share.expiresAt)) {
    return { valid: false, reason: "Share object requires valid createdAt and expiresAt ISO timestamps." };
  }
  if (new Date(share.expiresAt).getTime() <= new Date(share.createdAt).getTime()) {
    return { valid: false, reason: "Share object expiresAt must be after createdAt." };
  }
  const payloadResult = validateSharePayload(share.payload, { returnResult: true });
  if (!payloadResult.valid) return payloadResult;
  return { valid: true, reason: "" };
}

export function validateSharePayload(payload, options = {}) {
  let result = { valid: true, reason: "" };
  if (!payload || typeof payload !== "object") {
    result = { valid: false, reason: "Share payload must be an object." };
  } else if (!supportedSharePayloadTypes.includes(payload.type)) {
    result = { valid: false, reason: `Share payload type ${payload.type || "(missing)"} is not supported yet.` };
  } else if (payload.type === sharePayloadTypes.singleMarkdown && !String(payload.markdown || "").trim()) {
    result = { valid: false, reason: "Single Markdown share payload requires markdown content." };
  }

  if (!result.valid && !options.returnResult) {
    throw new Error(result.reason);
  }
  return result;
}

export function resolveShareTtl(ttlId = defaultShareTtlId) {
  return shareTtlOptions[ttlId] || shareTtlOptions[defaultShareTtlId];
}

export function isShareExpired(share, now = Date.now()) {
  return new Date(share.expiresAt).getTime() <= Number(now instanceof Date ? now.getTime() : now);
}

export function selectExpiredShares(shares, now = Date.now()) {
  return shares.filter((share) => isShareExpired(share, now));
}

function normalizeShareMeta(meta) {
  return {
    title: meta.title ? String(meta.title) : "",
    theme: meta.theme ? String(meta.theme) : "",
    size: meta.size ? String(meta.size) : "",
  };
}

function createShareToken(byteCount, randomBytes) {
  const bytes = randomBytes ? randomBytes(byteCount) : secureRandomBytes(byteCount);
  return base64UrlFromBytes(bytes);
}

function secureRandomBytes(byteCount) {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.getRandomValues) {
    throw new Error("Secure random token generation is unavailable.");
  }
  const bytes = new Uint8Array(byteCount);
  cryptoRef.getRandomValues(bytes);
  return bytes;
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}
