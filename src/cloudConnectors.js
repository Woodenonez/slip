export const cloudConnectorErrorCodes = Object.freeze({
  unauthenticated: "unauthenticated",
  unsupportedProvider: "unsupported_provider",
  notImplemented: "not_implemented",
  notFound: "not_found",
  conflict: "conflict",
  network: "network",
});

export class CloudConnectorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CloudConnectorError";
    this.code = code;
    this.details = details;
  }
}

export function requireCloudSession(session) {
  if (!session?.provider || !session.accessToken) {
    throw new CloudConnectorError(
      cloudConnectorErrorCodes.unauthenticated,
      "A valid cloud session is required.",
    );
  }
  return session;
}

export function createUnsupportedCloudConnector(provider) {
  return {
    provider: provider.id,
    label: provider.label,
    async listFiles() {
      throw notImplemented(provider.label, "listFiles");
    },
    async openFile() {
      throw notImplemented(provider.label, "openFile");
    },
    async saveFile() {
      throw notImplemented(provider.label, "saveFile");
    },
    async createFile() {
      throw notImplemented(provider.label, "createFile");
    },
  };
}

export function createCloudConnectorRegistry(connectors = []) {
  const byProvider = new Map(connectors.map((connector) => [connector.provider, connector]));

  return {
    get(provider) {
      return byProvider.get(provider) || null;
    },
    requireForSession(session) {
      requireCloudSession(session);
      const connector = byProvider.get(session.provider);
      if (!connector) {
        throw new CloudConnectorError(
          cloudConnectorErrorCodes.unsupportedProvider,
          `No cloud connector is registered for ${session.provider}.`,
          { provider: session.provider },
        );
      }
      return connector;
    },
    list() {
      return [...byProvider.values()];
    },
  };
}

export function normalizeCloudFileMetadata(file, provider) {
  if (!file?.id || !file.name) {
    throw new TypeError("Cloud file metadata requires id and name.");
  }
  return {
    id: String(file.id),
    provider,
    name: String(file.name),
    mimeType: file.mimeType || "text/markdown",
    modifiedTime: file.modifiedTime || new Date().toISOString(),
    revisionId: file.revisionId ? String(file.revisionId) : "",
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
    path: file.path || "",
  };
}

export function createMemoryCloudConnector(options = {}) {
  const provider = options.provider || "memory";
  const label = options.label || "Memory Cloud";
  let nextId = 1;
  const files = new Map();

  (options.files || []).forEach((file) => {
    const id = file.id || String(nextId++);
    files.set(id, createMemoryFile({ ...file, id }, provider));
    nextId = Math.max(nextId, Number(id) + 1 || nextId);
  });

  return {
    provider,
    label,
    async listFiles(params = {}) {
      const query = params.query?.trim().toLowerCase() || "";
      return [...files.values()]
        .filter((file) => !query || file.name.toLowerCase().includes(query))
        .map((file) => normalizeCloudFileMetadata(file, provider));
    },
    async openFile(fileId) {
      const file = files.get(String(fileId));
      if (!file) throw notFound(fileId);
      return {
        metadata: normalizeCloudFileMetadata(file, provider),
        content: file.content,
      };
    },
    async saveFile(fileId, params = {}) {
      const file = files.get(String(fileId));
      if (!file) throw notFound(fileId);
      if (params.expectedRevisionId && params.expectedRevisionId !== file.revisionId) {
        throw new CloudConnectorError(
          cloudConnectorErrorCodes.conflict,
          "The cloud file changed before Slip could save it.",
          { current: normalizeCloudFileMetadata(file, provider) },
        );
      }

      const nextFile = {
        ...file,
        content: params.content || "",
        modifiedTime: new Date().toISOString(),
        revisionId: incrementRevision(file.revisionId),
      };
      nextFile.size = byteSize(nextFile.content);
      files.set(file.id, nextFile);
      return normalizeCloudFileMetadata(nextFile, provider);
    },
    async createFile(params = {}) {
      if (!params.name) {
        throw new TypeError("createFile requires a name.");
      }
      const id = String(nextId++);
      const file = createMemoryFile({
        id,
        name: params.name,
        mimeType: params.mimeType,
        content: params.content || "",
        path: params.path || "",
      }, provider);
      files.set(id, file);
      return normalizeCloudFileMetadata(file, provider);
    },
  };
}

function createMemoryFile(file, provider) {
  const content = file.content || "";
  return {
    ...normalizeCloudFileMetadata({
      ...file,
      revisionId: file.revisionId || "1",
      size: file.size ?? byteSize(content),
    }, provider),
    content,
  };
}

function incrementRevision(revisionId) {
  const number = Number(revisionId);
  return Number.isFinite(number) ? String(number + 1) : `${revisionId || "rev"}-next`;
}

function notImplemented(providerLabel, operation) {
  return new CloudConnectorError(
    cloudConnectorErrorCodes.notImplemented,
    `${providerLabel} ${operation} is not implemented yet.`,
    { operation },
  );
}

function notFound(fileId) {
  return new CloudConnectorError(
    cloudConnectorErrorCodes.notFound,
    "Cloud file was not found.",
    { fileId: String(fileId) },
  );
}

function byteSize(value) {
  return new TextEncoder().encode(value).byteLength;
}
