import { expect, test } from "@playwright/test";

test("shows cloud provider auth shell and configuration warnings", async ({ page }) => {
  await page.addInitScript(() => {
    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }) => ({
            requestAccessToken: () => callback({
              access_token: "gis-token",
              token_type: "Bearer",
              expires_in: 3600,
              scope: "https://www.googleapis.com/auth/drive.file",
            }),
          }),
        },
      },
    };
  });
  await page.goto("/");
  await expect(page.locator("#cloud-session-status")).toHaveText("Cloud: signed out");

  await page.locator("#cloud-menu-button").click();
  await expect(page.locator("#cloud-menu-options")).toBeVisible();
  await expect(page.locator("#cloud-menu-options")).toContainText("Google Drive");
  await expect(page.locator("#cloud-menu-options")).toContainText("OneDrive");
  await expect(page.locator("#cloud-open")).toBeDisabled();
  await expect(page.locator("#cloud-disconnect")).toBeDisabled();

  await page.locator("#cloud-google").click();
  await expect.poll(async () => {
    if (await page.locator("#cloud-auth-dialog").isVisible()) return "missing";
    return page.locator("#cloud-session-status").textContent();
  }).toMatch(/missing|Cloud: Google Drive/);
  if (await page.locator("#cloud-auth-dialog").isVisible()) {
    await expect(page.locator("#cloud-auth-dialog")).toContainText("Google Drive sign-in is not configured yet.");
    await expect(page.locator("#cloud-auth-dialog")).toContainText("VITE_GOOGLE_CLIENT_ID");
    await page.locator("#cloud-auth-ok").click();
    await expect(page.locator("#cloud-auth-dialog")).toBeHidden();
  } else {
    await expect(page.locator("#cloud-session-status")).toHaveText("Cloud: Google Drive");
  }

  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-microsoft").click();
  await expect(page.locator("#cloud-auth-dialog")).toBeVisible();
  await expect(page.locator("#cloud-auth-dialog")).toContainText("OneDrive sign-in is not configured yet.");
  await expect(page.locator("#cloud-auth-dialog")).toContainText("VITE_MICROSOFT_CLIENT_ID");
  await page.locator("#cloud-auth-close").click();
  await expect(page.locator("#cloud-auth-dialog")).toBeHidden();
});

test("opens a mocked Google Drive markdown file from the cloud picker", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "active-token",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3_600_000,
    }));
  });
  await page.route("https://www.googleapis.com/drive/v3/files**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media") {
      await route.fulfill({
        status: 200,
        contentType: "text/markdown",
        body: "---\ntitle: Cloud Deck\n---\n\n# From Cloud",
      });
      return;
    }
    if (url.searchParams.has("q")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          files: [{
            id: "cloud-file-1",
            name: "Cloud Deck.md",
            mimeType: "text/markdown",
            modifiedTime: "2026-05-02T10:00:00.000Z",
            headRevisionId: "rev-1",
            size: "38",
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "cloud-file-1",
        name: "Cloud Deck.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-05-02T10:00:00.000Z",
        headRevisionId: "rev-1",
        size: "38",
      }),
    });
  });
  await page.route("https://www.googleapis.com/upload/drive/v3/files**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "cloud-file-1",
        name: "Cloud Deck.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-05-02T10:05:00.000Z",
        headRevisionId: "rev-2",
        size: "38",
      }),
    });
  });

  await page.goto("/");
  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-open").click();

  await expect(page.locator("#cloud-open-dialog")).toBeVisible();
  await expect(page.locator("#cloud-file-list")).toContainText("Cloud Deck.md");
  await page.locator("#cloud-file-list .cloud-file-item").click();

  await expect(page.locator("#cloud-open-dialog")).toBeHidden();
  await expect(page.locator("#deck-title")).toHaveText("Cloud Deck");
  await page.locator("#cloud-menu-button").click();
  await expect(page.locator("#cloud-save")).toBeEnabled();
  await page.locator("#cloud-save").click();
  await expect(page.locator("#status")).toHaveText("Saved Cloud Deck.md to cloud.");
  await expect(page.locator("#cloud-session-status")).toContainText("Cloud Deck.md");
  await expect(page.evaluate(() => JSON.parse(window.localStorage.getItem("slip.cloudRecentFiles") || "[]")[0].name)).resolves.toBe("Cloud Deck.md");
});

test("marks dirty cloud edits and warns before starting a new deck", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "active-token",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3_600_000,
    }));
  });
  await mockGoogleDriveOpen(page, {
    id: "dirty-file-1",
    name: "Dirty Deck.md",
    content: "---\ntitle: Dirty Deck\n---\n\n# From Cloud",
    revisionId: "rev-1",
  });

  await page.goto("/");
  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-open").click();
  await page.locator("#cloud-file-list .cloud-file-item").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.keyboard.type("\n\nUnsaved local edit");

  await expect(page.locator("#cloud-session-status")).toContainText("Dirty Deck.md *");
  await page.locator("#new-deck").click();
  await expect(page.locator("#new-deck-dialog")).toBeVisible();
  await expect(page.locator("#new-deck-message")).toHaveText("This cloud file has unsaved changes. Continue and discard them?");
});

test("shows explicit cloud conflict resolution choices", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "active-token",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3_600_000,
    }));
  });
  let metadataReads = 0;
  await page.route("https://www.googleapis.com/drive/v3/files**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media") {
      await route.fulfill({
        status: 200,
        contentType: "text/markdown",
        body: "---\ntitle: Conflict Deck\n---\n\n# Remote",
      });
      return;
    }
    if (url.searchParams.has("q")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          files: [googleDriveFile({
            id: "conflict-file-1",
            name: "Conflict Deck.md",
            revisionId: "rev-1",
          })],
        }),
      });
      return;
    }
    metadataReads += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(googleDriveFile({
        id: "conflict-file-1",
        name: "Conflict Deck.md",
        revisionId: metadataReads > 1 ? "remote-rev" : "rev-1",
      })),
    });
  });
  await page.route("https://www.googleapis.com/upload/drive/v3/files**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(googleDriveFile({
        id: "conflict-file-1",
        name: "Conflict Deck.md",
        revisionId: "overwrite-rev",
      })),
    });
  });

  await page.goto("/");
  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-open").click();
  await page.locator("#cloud-file-list .cloud-file-item").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.keyboard.type("\n\nLocal conflicting edit");
  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-save").click();

  await expect(page.locator("#cloud-conflict-dialog")).toBeVisible();
  await expect(page.locator("#cloud-conflict-message")).toContainText("Conflict Deck.md changed in the cloud");
  await expect(page.locator("#cloud-conflict-reload")).toBeVisible();
  await expect(page.locator("#cloud-conflict-duplicate")).toBeVisible();
  await page.locator("#cloud-conflict-overwrite").click();

  await expect(page.locator("#cloud-conflict-dialog")).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Overwrote Conflict Deck.md in cloud.");
  await expect(page.locator("#cloud-session-status")).not.toContainText("*");
});

test("buffers failed cloud saves and retries when online", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "active-token",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3_600_000,
    }));
  });
  await mockGoogleDriveOpen(page, {
    id: "offline-file-1",
    name: "Offline Deck.md",
    content: "---\ntitle: Offline Deck\n---\n\n# From Cloud",
    revisionId: "rev-1",
  });
  let uploadAttempts = 0;
  await page.route("https://www.googleapis.com/upload/drive/v3/files**", async (route) => {
    uploadAttempts += 1;
    if (uploadAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "temporary outage" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(googleDriveFile({
        id: "offline-file-1",
        name: "Offline Deck.md",
        revisionId: "rev-2",
      })),
    });
  });

  await page.goto("/");
  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-open").click();
  await page.locator("#cloud-file-list .cloud-file-item").click();
  await page.locator(".cm-content").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.keyboard.type("\n\nOffline edit");
  await page.locator("#cloud-menu-button").click();
  await page.locator("#cloud-save").click();

  await expect(page.locator("#status")).toHaveText("Network unavailable. Saved Offline Deck.md locally and will retry when online.");
  await expect(page.locator("#cloud-session-status")).toContainText("pending");
  await expect(page.evaluate(() => JSON.parse(window.localStorage.getItem("slip.cloudPendingWrite") || "null").file.name)).resolves.toBe("Offline Deck.md");

  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page.locator("#status")).toHaveText("Pending cloud save synced: Offline Deck.md.");
  await expect(page.locator("#cloud-session-status")).toContainText("synced");
  await expect(page.evaluate(() => window.localStorage.getItem("slip.cloudPendingWrite"))).resolves.toBeNull();
});

test("saves a local deck as a new Google Drive file", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "active-token",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3_600_000,
    }));
  });
  await page.route("https://www.googleapis.com/upload/drive/v3/files**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "created-file-1",
        name: "Saved Deck.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-05-02T11:00:00.000Z",
        headRevisionId: "created-rev",
        size: "64",
      }),
    });
  });

  await page.goto("/");
  await page.locator("#cloud-menu-button").click();
  await expect(page.locator("#cloud-save")).toBeDisabled();
  await page.locator("#cloud-save-as").click();

  await expect(page.locator("#cloud-save-dialog")).toBeVisible();
  await page.locator("#cloud-save-name").fill("Saved Deck.md");
  await page.locator("#cloud-save-confirm").click();

  await expect(page.locator("#cloud-save-dialog")).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Saved Saved Deck.md to cloud and set it as the current cloud file.");
  await page.locator("#cloud-menu-button").click();
  await expect(page.locator("#cloud-save")).toBeEnabled();
  await expect(page.locator("#cloud-session-status")).toContainText("Saved Deck.md");
});

async function mockGoogleDriveOpen(page, file) {
  await page.route("https://www.googleapis.com/drive/v3/files**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("alt") === "media") {
      await route.fulfill({
        status: 200,
        contentType: "text/markdown",
        body: file.content,
      });
      return;
    }
    if (url.searchParams.has("q")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: [googleDriveFile(file)] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(googleDriveFile(file)),
    });
  });
}

function googleDriveFile(file) {
  return {
    id: file.id,
    name: file.name,
    mimeType: "text/markdown",
    modifiedTime: "2026-05-03T10:00:00.000Z",
    headRevisionId: file.revisionId,
    size: "64",
  };
}

test("clears expired cloud sessions and prompts re-auth", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "expired-token",
      expiresAt: Date.now() - 1000,
    }));
  });

  await page.goto("/");

  await expect(page.locator("#cloud-session-status")).toHaveText("Cloud: signed out");
  await expect(page.locator("#cloud-auth-dialog")).toBeVisible();
  await expect(page.locator("#cloud-auth-dialog")).toContainText("Your Google Drive session expired.");
  await expect(page.evaluate(() => window.sessionStorage.getItem("slip.cloudAuthSession"))).resolves.toBeNull();
});

test("disconnects an active cloud session", async ({ page }) => {
  await page.addInitScript(() => {
    window.__revokedGoogleTokens = [];
    window.google = {
      accounts: {
        oauth2: {
          revoke: (token, callback) => {
            window.__revokedGoogleTokens.push(token);
            callback?.();
          },
        },
      },
    };
    window.sessionStorage.setItem("slip.cloudAuthSession", JSON.stringify({
      provider: "google",
      providerLabel: "Google Drive",
      accessToken: "active-token",
      expiresAt: Date.now() + 3_600_000,
    }));
    window.localStorage.setItem("slip.cloudPendingWrite", JSON.stringify({
      provider: "google",
      file: { provider: "google", id: "pending-file", name: "Pending.md" },
      payload: { name: "Pending.md", kind: "text", content: "# Pending" },
      documentHash: "pending-hash",
    }));
    window.localStorage.setItem("slip.cloudRecentFiles", JSON.stringify([
      { provider: "google", id: "recent-google", name: "Recent Google.md" },
      { provider: "microsoft", id: "recent-ms", name: "Recent OneDrive.md" },
    ]));
  });

  await page.goto("/");

  await expect(page.locator("#cloud-session-status")).toContainText("Cloud: Google Drive");
  await page.locator("#cloud-menu-button").click();
  await expect(page.locator("#cloud-disconnect")).toBeEnabled();
  await page.locator("#cloud-disconnect").click();
  await expect(page.locator("#cloud-session-status")).toHaveText("Cloud: signed out");
  await expect(page.locator("#status")).toHaveText("Disconnected from cloud.");
  await expect(page.evaluate(() => window.sessionStorage.getItem("slip.cloudAuthSession"))).resolves.toBeNull();
  await expect(page.evaluate(() => window.localStorage.getItem("slip.cloudPendingWrite"))).resolves.toBeNull();
  await expect(page.evaluate(() => window.__revokedGoogleTokens)).resolves.toEqual(["active-token"]);
  await expect(page.evaluate(() => JSON.parse(window.localStorage.getItem("slip.cloudRecentFiles") || "[]"))).resolves.toEqual([
    { provider: "microsoft", id: "recent-ms", name: "Recent OneDrive.md" },
  ]);
});
