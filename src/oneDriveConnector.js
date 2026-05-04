import {
  CloudConnectorError,
  cloudConnectorErrorCodes,
  normalizeCloudFileMetadata,
  requireCloudSession,
} from "./cloudConnectors.js";

const graphBase = "https://graph.microsoft.com/v1.0";
const driveItemSelect = "id,name,size,eTag,cTag,lastModifiedDateTime,parentReference,file,folder,@microsoft.graph.downloadUrl";
const markdownMimeType = "text/markdown";
const projectPackageMimeType = "application/zip";

export function createOneDriveConnector(session, options = {}) {
  const activeSession = requireCloudSession(session);
  if (activeSession.provider !== "microsoft") {
    throw new CloudConnectorError(
      cloudConnectorErrorCodes.unsupportedProvider,
      "OneDrive connector requires a Microsoft cloud session.",
      { provider: activeSession.provider },
    );
  }

  const fetchImpl = options.fetchImpl || fetch;

  return {
    provider: "microsoft",
    label: "OneDrive",
    async listFiles(params = {}) {
      const folderId = params.folderId || "root";
      const endpoint = folderId === "root"
        ? `${graphBase}/me/drive/root/children`
        : `${graphBase}/me/drive/items/${encodeURIComponent(folderId)}/children`;
      const url = graphUrl(endpoint, {
        $select: driveItemSelect,
        $top: String(params.pageSize || 50),
        $orderby: params.orderBy || "lastModifiedDateTime desc",
      });
      const payload = await requestJson(fetchImpl, activeSession, url);
      const query = params.query?.trim().toLowerCase() || "";
      return (payload.value || [])
        .filter((item) => isSlipFile(item) && (!query || item.name.toLowerCase().includes(query)))
        .map(mapOneDriveItemMetadata);
    },
    async openFile(fileId) {
      const item = await getItem(fetchImpl, activeSession, fileId);
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      if (!downloadUrl) {
        throw new CloudConnectorError(
          cloudConnectorErrorCodes.notFound,
          "OneDrive did not provide a download URL for this file.",
          { fileId },
        );
      }
      const response = await fetchImpl(downloadUrl);
      if (!response.ok) {
        throw graphError(response, {});
      }
      const blob = item.file?.mimeType === projectPackageMimeType && response.blob ? await response.blob() : null;
      const content = blob ? "" : await response.text();
      return {
        metadata: mapOneDriveItemMetadata(item),
        content,
        blob,
      };
    },
    async saveFile(fileId, params = {}) {
      const item = await getItem(fetchImpl, activeSession, fileId);
      const current = mapOneDriveItemMetadata(item);
      if (params.expectedRevisionId && params.expectedRevisionId !== current.revisionId) {
        throw new CloudConnectorError(
          cloudConnectorErrorCodes.conflict,
          "The OneDrive file changed before Slip could save it.",
          { current },
        );
      }
      const url = `${graphBase}/me/drive/items/${encodeURIComponent(fileId)}/content`;
      const saved = await requestJson(fetchImpl, activeSession, url, {
        method: "PUT",
        headers: { "Content-Type": params.mimeType || inferOneDriveMimeType(item.name) },
        body: params.content ?? "",
      });
      return mapOneDriveItemMetadata(saved);
    },
    async createFile(params = {}) {
      if (!params.name) {
        throw new TypeError("createFile requires a name.");
      }
      const parentId = params.parentId || "root";
      const encodedName = encodeOneDrivePathSegment(params.name);
      const endpoint = parentId === "root"
        ? `${graphBase}/me/drive/root:/${encodedName}:/content`
        : `${graphBase}/me/drive/items/${encodeURIComponent(parentId)}:/${encodedName}:/content`;
      const saved = await requestJson(fetchImpl, activeSession, endpoint, {
        method: "PUT",
        headers: { "Content-Type": params.mimeType || inferOneDriveMimeType(params.name) },
        body: params.content ?? "",
      });
      return mapOneDriveItemMetadata(saved);
    },
  };
}

export function mapOneDriveItemMetadata(item) {
  return normalizeCloudFileMetadata({
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType || inferOneDriveMimeType(item.name || ""),
    modifiedTime: item.lastModifiedDateTime,
    revisionId: item.eTag || item.cTag || "",
    size: item.size,
    path: item.parentReference?.path || "",
  }, "microsoft");
}

export function inferOneDriveMimeType(name) {
  return name.toLowerCase().endsWith(".zip") ? projectPackageMimeType : markdownMimeType;
}

export function isSlipFile(item) {
  if (!item?.file || !item.name) return false;
  const name = item.name.toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".zip");
}

async function getItem(fetchImpl, session, fileId) {
  return requestJson(fetchImpl, session, graphUrl(`${graphBase}/me/drive/items/${encodeURIComponent(fileId)}`, {
    $select: driveItemSelect,
  }));
}

async function requestJson(fetchImpl, session, url, options = {}) {
  const response = await graphFetch(fetchImpl, session, url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw graphError(response, payload);
  }
  return payload;
}

async function graphFetch(fetchImpl, session, url, options = {}) {
  return fetchImpl(url, {
    ...options,
    headers: {
      Authorization: `${session.tokenType || "Bearer"} ${session.accessToken}`,
      ...(options.headers || {}),
    },
  });
}

function graphError(response, payload = {}) {
  const message = payload.error?.message || payload.error_description || response.statusText || "Microsoft Graph request failed.";
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

function graphUrl(base, params = {}) {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function encodeOneDrivePathSegment(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}
