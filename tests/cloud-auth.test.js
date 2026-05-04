import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudAuthPendingKey,
  cloudAuthSessionKey,
  completeCloudAuthFromUrl,
  createSessionFromTokenResponse,
  createCloudAuthProviders,
  readCloudAuthSession,
  readCloudAuthSessionState,
  revokeCloudAuthSession,
  clearCloudAuthSession,
} from "../src/cloudAuth.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("configures cloud auth with minimal provider scopes", () => {
  const providers = createCloudAuthProviders({
    VITE_GOOGLE_CLIENT_ID: "google-client",
    VITE_MICROSOFT_CLIENT_ID: "microsoft-client",
  });

  assert.deepEqual(providers.google.scopes, ["https://www.googleapis.com/auth/drive.file"]);
  assert.deepEqual(providers.microsoft.scopes, ["Files.ReadWrite"]);
});

test("exchanges OAuth callback code and stores a cloud session", async () => {
  const storage = new MemoryStorage();
  storage.setItem(cloudAuthPendingKey, JSON.stringify({
    provider: "microsoft",
    state: "expected-state",
    codeVerifier: "verifier",
    redirectUri: "http://127.0.0.1:5173/",
    createdAt: 123,
  }));
  const providers = createCloudAuthProviders({ VITE_MICROSOFT_CLIENT_ID: "client-id" });
  let tokenRequest;

  const result = await completeCloudAuthFromUrl(
    "http://127.0.0.1:5173/?code=auth-code&state=expected-state",
    providers,
    {
      storage,
      now: () => 1_000,
      fetchImpl: async (url, options) => {
        tokenRequest = { url, options };
        return {
          ok: true,
          json: async () => ({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "drive.file",
          }),
        };
      },
    },
  );

  assert.equal(result.status, "authenticated");
  assert.equal(tokenRequest.url, "https://login.microsoftonline.com/common/oauth2/v2.0/token");
  const body = tokenRequest.options.body;
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_id"), "client-id");
  assert.equal(body.get("code"), "auth-code");
  assert.equal(body.get("code_verifier"), "verifier");
  assert.equal(storage.getItem(cloudAuthPendingKey), null);

  const session = readCloudAuthSession(storage, 2_000);
  assert.equal(session.provider, "microsoft");
  assert.equal(session.providerLabel, "OneDrive");
  assert.equal(session.accessToken, "access-token");
  assert.equal(session.refreshToken, "refresh-token");
  assert.equal(session.expiresAt, 3_601_000);
});

test("creates Google GIS token sessions without a client secret", () => {
  const providers = createCloudAuthProviders({ VITE_GOOGLE_CLIENT_ID: "client-id" });
  const session = createSessionFromTokenResponse("google", providers.google, {
    access_token: "gis-access-token",
    token_type: "Bearer",
    expires_in: 1800,
    scope: "https://www.googleapis.com/auth/drive.file",
  }, { now: () => 10_000 });

  assert.equal(session.provider, "google");
  assert.equal(session.providerLabel, "Google Drive");
  assert.equal(session.accessToken, "gis-access-token");
  assert.equal(session.refreshToken, "");
  assert.equal(session.expiresAt, 1_810_000);
});

test("rejects OAuth callbacks with mismatched state", async () => {
  const storage = new MemoryStorage();
  storage.setItem(cloudAuthPendingKey, JSON.stringify({
    provider: "google",
    state: "expected-state",
    codeVerifier: "verifier",
    redirectUri: "http://127.0.0.1:5173/",
    createdAt: 123,
  }));

  const result = await completeCloudAuthFromUrl(
    "http://127.0.0.1:5173/?code=auth-code&state=wrong-state",
    createCloudAuthProviders({ VITE_GOOGLE_CLIENT_ID: "client-id" }),
    { storage },
  );

  assert.equal(result.status, "error");
  assert.equal(result.reason, "invalid_state");
  assert.equal(storage.getItem(cloudAuthPendingKey), null);
});

test("ignores expired stored cloud sessions", () => {
  const storage = new MemoryStorage();
  storage.setItem(cloudAuthSessionKey, JSON.stringify({
    provider: "google",
    providerLabel: "Google Drive",
    accessToken: "access-token",
    expiresAt: 1_000,
  }));

  assert.equal(readCloudAuthSession(storage, 2_000), null);
  const state = readCloudAuthSessionState(storage, 2_000);
  assert.equal(state.status, "expired");
  assert.equal(state.session.provider, "google");
});

test("clears stored cloud session and pending auth on disconnect", () => {
  const storage = new MemoryStorage();
  storage.setItem(cloudAuthSessionKey, "session");
  storage.setItem(cloudAuthPendingKey, "pending");

  clearCloudAuthSession(storage);

  assert.equal(storage.getItem(cloudAuthSessionKey), null);
  assert.equal(storage.getItem(cloudAuthPendingKey), null);
});

test("revokes Google GIS tokens when the provider API is available", () => {
  let revokedToken = "";
  const result = revokeCloudAuthSession({
    provider: "google",
    accessToken: "active-token",
  }, {
    googleAccounts: {
      oauth2: {
        revoke: (token, callback) => {
          revokedToken = token;
          callback();
        },
      },
    },
  });

  assert.equal(result, true);
  assert.equal(revokedToken, "active-token");
});

test("does not attempt browser token revocation for non-Google providers", () => {
  const result = revokeCloudAuthSession({
    provider: "microsoft",
    accessToken: "active-token",
  }, {
    googleAccounts: {
      oauth2: {
        revoke: () => assert.fail("Microsoft sessions should not use Google revocation."),
      },
    },
  });

  assert.equal(result, false);
});
