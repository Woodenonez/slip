export function createCloudAuthProviders(env = {}) {
  return {
    google: {
      label: "Google Drive",
      clientId: env.VITE_GOOGLE_CLIENT_ID || "",
      authMode: "gis-token",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      envKey: "VITE_GOOGLE_CLIENT_ID",
    },
    microsoft: {
      label: "OneDrive",
      clientId: env.VITE_MICROSOFT_CLIENT_ID || "",
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: ["Files.ReadWrite"],
      envKey: "VITE_MICROSOFT_CLIENT_ID",
    },
  };
}

export const cloudAuthPendingKey = "slip.cloudAuthPending";
export const cloudAuthSessionKey = "slip.cloudAuthSession";
const googleIdentityServicesUrl = "https://accounts.google.com/gsi/client";

export async function startCloudAuth(providerId, providers, options = {}) {
  const provider = providers[providerId];
  if (!provider) return;
  if (!provider.clientId) {
    options.onConfigurationMissing?.(provider);
    return;
  }

  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const authState = randomBase64Url(32);
  sessionStorage.setItem(cloudAuthPendingKey, JSON.stringify({
    provider: providerId,
    state: authState,
    codeVerifier: verifier,
    redirectUri: window.location.origin + window.location.pathname,
    createdAt: Date.now(),
  }));

  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", window.location.origin + window.location.pathname);
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", authState);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  window.location.assign(url.toString());
}

export async function startGoogleTokenAuth(provider, options = {}) {
  if (!provider?.clientId) {
    options.onConfigurationMissing?.(provider);
    return { status: "error", reason: "missing_client" };
  }

  const googleAccounts = options.googleAccounts || await loadGoogleIdentityServices(options.windowRef || window);
  if (!googleAccounts?.oauth2?.initTokenClient) {
    const error = new Error("Google Identity Services did not load.");
    options.onError?.(error);
    return { status: "error", reason: "gis_unavailable", detail: error.message };
  }

  return new Promise((resolve) => {
    const tokenClient = googleAccounts.oauth2.initTokenClient({
      client_id: provider.clientId,
      scope: provider.scopes.join(" "),
      callback: (response) => {
        if (response?.error) {
          const detail = response.error_description || response.error;
          options.onError?.(new Error(detail));
          resolve({ status: "error", reason: "provider_error", detail });
          return;
        }

        const session = createSessionFromTokenResponse("google", provider, response, options);
        const storage = options.storage || sessionStorage;
        storage.setItem(cloudAuthSessionKey, JSON.stringify(session));
        storage.removeItem(cloudAuthPendingKey);
        options.onAuthenticated?.(session);
        resolve({ status: "authenticated", session });
      },
    });
    tokenClient.requestAccessToken({ prompt: options.prompt ?? "" });
  });
}

export async function completeCloudAuthFromUrl(currentUrl, providers, options = {}) {
  const url = new URL(currentUrl);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (!code && !error) return { status: "idle" };
  if (error) {
    return {
      status: "error",
      reason: "provider_error",
      detail: url.searchParams.get("error_description") || error,
    };
  }

  const storage = options.storage || sessionStorage;
  const pending = readPendingAuth(storage);
  if (!pending) return { status: "error", reason: "missing_pending" };
  if (!returnedState || returnedState !== pending.state) {
    storage.removeItem(cloudAuthPendingKey);
    return { status: "error", reason: "invalid_state" };
  }

  const provider = providers[pending.provider];
  if (!provider) {
    storage.removeItem(cloudAuthPendingKey);
    return { status: "error", reason: "unknown_provider" };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: provider.clientId,
    code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.codeVerifier,
  });

  const response = await (options.fetchImpl || fetch)(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: "error",
      reason: "token_exchange_failed",
      detail: payload.error_description || payload.error || response.statusText,
    };
  }

  const obtainedAt = options.now?.() || Date.now();
  const session = {
    provider: pending.provider,
    providerLabel: provider.label,
    accessToken: payload.access_token || "",
    refreshToken: payload.refresh_token || "",
    tokenType: payload.token_type || "Bearer",
    scopes: payload.scope || provider.scopes.join(" "),
    expiresAt: obtainedAt + Number(payload.expires_in || 3600) * 1000,
    obtainedAt,
  };
  storage.setItem(cloudAuthSessionKey, JSON.stringify(session));
  storage.removeItem(cloudAuthPendingKey);
  return { status: "authenticated", session };
}

export function readCloudAuthSession(storage = sessionStorage, now = Date.now()) {
  const sessionState = readCloudAuthSessionState(storage, now);
  return sessionState.status === "authenticated" ? sessionState.session : null;
}

export function readCloudAuthSessionState(storage = sessionStorage, now = Date.now()) {
  try {
    const session = JSON.parse(storage.getItem(cloudAuthSessionKey) || "null");
    if (!session?.accessToken || !session.provider) {
      return { status: "missing", session: null };
    }
    if (Number(session.expiresAt) <= now) {
      return { status: "expired", session };
    }
    return { status: "authenticated", session };
  } catch (_error) {
    return { status: "missing", session: null };
  }
}

export function clearCloudAuthSession(storage = sessionStorage) {
  storage.removeItem(cloudAuthSessionKey);
  storage.removeItem(cloudAuthPendingKey);
}

export function revokeCloudAuthSession(session, options = {}) {
  if (!session?.accessToken || session.provider !== "google") return false;
  const googleAccounts = options.googleAccounts || options.windowRef?.google?.accounts || globalThis.google?.accounts;
  const revoke = googleAccounts?.oauth2?.revoke;
  if (typeof revoke !== "function") return false;
  try {
    revoke(session.accessToken, options.onRevoked || (() => {}));
    return true;
  } catch (_error) {
    return false;
  }
}

export function createSessionFromTokenResponse(providerId, provider, response, options = {}) {
  const obtainedAt = options.now?.() || Date.now();
  return {
    provider: providerId,
    providerLabel: provider.label,
    accessToken: response.access_token || "",
    refreshToken: "",
    tokenType: response.token_type || "Bearer",
    scopes: response.scope || provider.scopes.join(" "),
    expiresAt: obtainedAt + Number(response.expires_in || 3600) * 1000,
    obtainedAt,
  };
}

function loadGoogleIdentityServices(windowRef) {
  if (windowRef.google?.accounts?.oauth2) {
    return Promise.resolve(windowRef.google.accounts);
  }
  return new Promise((resolve, reject) => {
    const existing = windowRef.document.querySelector(`script[src="${googleIdentityServicesUrl}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(windowRef.google?.accounts), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Google Identity Services.")), { once: true });
      return;
    }
    const script = windowRef.document.createElement("script");
    script.src = googleIdentityServicesUrl;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(windowRef.google?.accounts);
    script.onerror = () => reject(new Error("Could not load Google Identity Services."));
    windowRef.document.head.appendChild(script);
  });
}

function readPendingAuth(storage) {
  try {
    const pending = JSON.parse(storage.getItem(cloudAuthPendingKey) || "null");
    if (!pending?.provider || !pending.state || !pending.codeVerifier || !pending.redirectUri) return null;
    return pending;
  } catch (_error) {
    return null;
  }
}

function randomBase64Url(byteCount) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlFromBytes(new Uint8Array(digest));
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
