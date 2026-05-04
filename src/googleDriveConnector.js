import {
  CloudConnectorError,
  cloudConnectorErrorCodes,
  normalizeCloudFileMetadata,
  requireCloudSession,
} from "./cloudConnectors.js";

const driveApiBase = "https://www.googleapis.com/drive/v3/files";
const driveUploadBase = "https://www.googleapis.com/upload/drive/v3/files";
const driveMetadataFields = "id,name,mimeType,modifiedTime,headRevisionId,version,size,parents,webViewLink";
const markdownMimeType = "text/markdown";
const projectPackageMimeType = "application/zip";

export function createGoogleDriveConnector(session, options = {}) {
  const activeSession = requireCloudSession(session);
  if (activeSession.provider !== "google") {
    throw new CloudConnectorError(
      cloudConnectorErrorCodes.unsupportedProvider,
      "Google Drive connector requires a Google cloud session.",
      { provider: activeSession.provider },
    );
  }

  const fetchImpl = options.fetchImpl || fetch;

  return {
    provider: "google",
    label: "Google Drive",
    async listFiles(params = {}) {
      const url = driveUrl(driveApiBase, {
        fields: `nextPageToken,files(${driveMetadataFields})`,
        orderBy: params.orderBy || "modifiedTime desc",
        pageSize: String(params.pageSize || 50),
        q: buildDriveListQuery(params.query),
        spaces: "drive",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      const payload = await requestJson(fetchImpl, activeSession, url);
      return (payload.files || []).map(mapDriveFileMetadata);
    },
    async openFile(fileId) {
      const metadata = await getMetadata(fetchImpl, activeSession, fileId);
      const mediaUrl = driveUrl(`${driveApiBase}/${encodeURIComponent(fileId)}`, {
        alt: "media",
        supportsAllDrives: "true",
      });
      if (metadata.mimeType === projectPackageMimeType) {
        return {
          metadata: mapDriveFileMetadata(metadata),
          content: "",
          blob: await requestBlob(fetchImpl, activeSession, mediaUrl),
        };
      }
      const content = await requestText(fetchImpl, activeSession, mediaUrl);
      return {
        metadata: mapDriveFileMetadata(metadata),
        content,
        blob: null,
      };
    },
    async saveFile(fileId, params = {}) {
      const metadata = await getMetadata(fetchImpl, activeSession, fileId);
      const current = mapDriveFileMetadata(metadata);
      if (params.expectedRevisionId && params.expectedRevisionId !== current.revisionId) {
        throw new CloudConnectorError(
          cloudConnectorErrorCodes.conflict,
          "The Google Drive file changed before Slip could save it.",
          { current },
        );
      }

      const url = driveUrl(`${driveUploadBase}/${encodeURIComponent(fileId)}`, {
        uploadType: "media",
        fields: driveMetadataFields,
        supportsAllDrives: "true",
      });
      const saved = await requestJson(fetchImpl, activeSession, url, {
        method: "PATCH",
        headers: { "Content-Type": params.mimeType || metadata.mimeType || markdownMimeType },
        body: params.content ?? "",
      });
      return mapDriveFileMetadata(saved);
    },
    async createFile(params = {}) {
      if (!params.name) {
        throw new TypeError("createFile requires a name.");
      }
      const metadata = {
        name: params.name,
        mimeType: params.mimeType || inferGoogleDriveMimeType(params.name),
      };
      if (params.parentId) {
        metadata.parents = [params.parentId];
      }
      const url = driveUrl(driveUploadBase, {
        uploadType: "multipart",
        fields: driveMetadataFields,
        supportsAllDrives: "true",
      });
      const created = await requestJson(fetchImpl, activeSession, url, {
        method: "POST",
        body: createMultipartBody(metadata, params.content ?? "", metadata.mimeType),
      });
      return mapDriveFileMetadata(created);
    },
  };
}

export function mapDriveFileMetadata(file) {
  return normalizeCloudFileMetadata({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    revisionId: file.headRevisionId || file.version || "",
    size: file.size,
    path: (file.parents || []).join("/"),
  }, "google");
}

export function buildDriveListQuery(query = "") {
  const filters = [
    "trashed=false",
    "mimeType!='application/vnd.google-apps.folder'",
    "(name contains '.md' or name contains '.markdown' or name contains '.zip')",
  ];
  const cleanedQuery = query.trim();
  if (cleanedQuery) {
    filters.push(`name contains '${escapeDriveQueryValue(cleanedQuery)}'`);
  }
  return filters.join(" and ");
}

export function inferGoogleDriveMimeType(name) {
  return name.toLowerCase().endsWith(".zip") ? projectPackageMimeType : markdownMimeType;
}

async function getMetadata(fetchImpl, session, fileId) {
  return requestJson(fetchImpl, session, driveUrl(`${driveApiBase}/${encodeURIComponent(fileId)}`, {
    fields: driveMetadataFields,
    supportsAllDrives: "true",
  }));
}

async function requestJson(fetchImpl, session, url, options = {}) {
  const response = await driveFetch(fetchImpl, session, url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw driveError(response, payload);
  }
  return payload;
}

async function requestText(fetchImpl, session, url, options = {}) {
  const response = await driveFetch(fetchImpl, session, url, options);
  const body = await response.text();
  if (!response.ok) {
    throw driveError(response, parseMaybeJson(body));
  }
  return body;
}

async function requestBlob(fetchImpl, session, url, options = {}) {
  const response = await driveFetch(fetchImpl, session, url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw driveError(response, parseMaybeJson(body));
  }
  return response.blob();
}

async function driveFetch(fetchImpl, session, url, options = {}) {
  return fetchImpl(url, {
    ...options,
    headers: {
      Authorization: `${session.tokenType || "Bearer"} ${session.accessToken}`,
      ...(options.headers || {}),
    },
  });
}

function driveError(response, payload = {}) {
  const message = payload.error?.message || payload.error_description || response.statusText || "Google Drive request failed.";
  if (response.status === 401 || response.status === 403) {
    return new CloudConnectorError(cloudConnectorErrorCodes.unauthenticated, message, { status: response.status });
  }
  if (response.status === 404) {
    return new CloudConnectorError(cloudConnectorErrorCodes.notFound, message, { status: response.status });
  }
  if (response.status === 409 || response.status === 412) {
    return new CloudConnectorError(cloudConnectorErrorCodes.conflict, message, { status: response.status });
  }
  return new CloudConnectorError(cloudConnectorErrorCodes.network, message, { status: response.status });
}

function createMultipartBody(metadata, content, mimeType) {
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("media", new Blob([content], { type: mimeType }));
  return body;
}

function driveUrl(base, params = {}) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseMaybeJson(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return {};
  }
}
