import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  highlightSelectionMatches,
  searchKeymap,
} from "@codemirror/search";
import {
  clearCloudAuthSession,
  completeCloudAuthFromUrl,
  createCloudAuthProviders,
  readCloudAuthSession,
  readCloudAuthSessionState,
  revokeCloudAuthSession,
  startCloudAuth as beginCloudAuth,
  startGoogleTokenAuth,
} from "./src/cloudAuth.js";
import {
  aiPromptPreferenceDefaults,
  buildAiPrompt,
  normalizeAiPromptPreferences,
  normalizeAiResultContent,
  validateAiResult,
} from "./src/aiPrompts.js";
import { CloudConnectorError, cloudConnectorErrorCodes } from "./src/cloudConnectors.js";
import {
  createDeckParser,
  escapeHtml,
  extractCustomCss,
  extractTitle,
  hashString,
  newDeckMarkdown,
  normalizeSlideSize,
  renderMarkdown,
  sampleMarkdown,
  scopeCustomCss,
  slideSizes,
  unescapeHtml,
} from "./src/deck.js";
import { createGoogleDriveConnector } from "./src/googleDriveConnector.js";
import { createI18n, defaultLanguage, normalizeLanguage } from "./src/i18n.js";
import { createOneDriveConnector } from "./src/oneDriveConnector.js";
import { buildProjectPackageBlob, readProjectPackage } from "./src/projectPackage.js";

  const projectStorage = {
    dbName: "slip-project-vfs",
    dbVersion: 1,
    currentProjectId: "current",
    localSnapshotKey: "slip.project.document",
    documentStore: "documents",
    assetStore: "assets",
  };
  const cloudRecentFilesKey = "slip.cloudRecentFiles";
  const cloudPendingWriteKey = "slip.cloudPendingWrite";
  const shareStateKey = "slip.shareState";
  const aiPromptPreferencesKey = "slip.aiPromptPreferences";
  const sharedRouteId = readSharedRouteId();

  const initialProjectDocument = readLocalProjectSnapshot();
  const parseDeck = createDeckParser();
  const cloudAuthProviders = createCloudAuthProviders(import.meta.env || {});
  const i18n = createI18n(localStorage.getItem("slip.language") || navigator.language?.slice(0, 2) || defaultLanguage);
  const t = (key, params) => i18n.t(key, params);
  const supportedThemes = ["clean", "contrast", "paper", "custom"];
  const textCssBuilderProperties = [
    { value: "font-size", label: "cssSize" },
    { value: "color", label: "cssColor" },
    { value: "letter-spacing", label: "cssSpace" },
  ];
  const pageCssBuilderProperties = [
    { value: "background-color", label: "cssPageBackground" },
    { value: "padding-top", label: "cssMarginTop" },
    { value: "padding-bottom", label: "cssMarginBottom" },
    { value: "padding-left", label: "cssMarginLeft" },
    { value: "padding-right", label: "cssMarginRight" },
  ];

  const state = {
    markdown: initialProjectDocument?.markdown || localStorage.getItem("slip.markdown") || sampleMarkdown,
    deck: null,
    activeSlide: 0,
    showNotes: false,
    presentationOpen: false,
    presentationMode: "presenter",
    presentationStartedAt: 0,
    presentationTimer: 0,
    presentationWebUrl: "",
    autoSplitDraft: null,
    project: initialProjectDocument
      ? createProjectFromMarkdown(initialProjectDocument.markdown, [], initialProjectDocument.manifest)
      : createSingleFileProject(),
    db: null,
    storageReady: false,
    storageWarning: "",
    saveTimer: 0,
    previewKeys: new Map(),
    overflowSlides: new Set(),
    columnImageFitSlides: new Set(),
    assetSort: "name",
    assetVisibleLimit: 60,
    assetThumbnailCache: new Map(),
    ignorePreviewScrollUntil: 0,
    cloudSession: null,
    cloudFile: null,
    cloudSavedHash: "",
    cloudConflict: null,
    cloudSyncStatus: "local",
    pendingCloudWrite: readPendingCloudWrite(),
    cloudFiles: [],
    cloudRecentFiles: readRecentCloudFiles(),
    cloudLoading: false,
    cloudOpenError: "",
    share: readShareState(),
    shareLoading: false,
    sharedRouteId,
    sharedReadOnly: Boolean(sharedRouteId),
    aiPromptMode: "file-to-slip",
    aiPromptSource: "current",
    aiPromptPreferences: readAiPromptPreferences(),
    aiUndoMarkdown: "",
  };

  function createSingleFileProject() {
    return {
      mode: "single-file",
      manifest: null,
      assets: new Map(),
    };
  }

  function createProjectManifest(deck, assetRecords = []) {
    return {
      schema: "slip.project",
      version: 2,
      title: deck.meta.title,
      theme: deck.meta.theme,
      size: deck.meta.size,
      entry: "slides.md",
      assets: assetRecords.map((asset) => ({
        id: asset.id,
        path: asset.path,
        filename: asset.filename,
        mime: asset.mime,
        size: asset.size,
        hash: asset.hash,
      })),
    };
  }

  function openProjectDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }

      const request = indexedDB.open(projectStorage.dbName, projectStorage.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(projectStorage.documentStore)) {
          db.createObjectStore(projectStorage.documentStore, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(projectStorage.assetStore)) {
          const assets = db.createObjectStore(projectStorage.assetStore, { keyPath: "id" });
          assets.createIndex("projectId", "projectId", { unique: false });
          assets.createIndex("path", "path", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open project storage."));
      request.onblocked = () => reject(new Error("Project storage is blocked by another open Slip tab."));
    });
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function idbTransactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
    });
  }

  function normalizeProjectManifest(rawManifest, deck, assets) {
    const manifest = rawManifest && typeof rawManifest === "object" ? rawManifest : {};
    const normalizedAssets = assets.map((asset) => {
      const existing = Array.isArray(manifest.assets)
        ? manifest.assets.find((item) => item.path === asset.path || item.hash === asset.hash)
        : null;
      return {
        ...asset,
        id: existing?.id || asset.id,
      };
    });

    return {
      schema: "slip.project",
      version: Number(manifest.version) || 2,
      title: String(manifest.title || deck.meta.title || "Untitled deck"),
      theme: String(manifest.theme || deck.meta.theme || "clean"),
      size: normalizeSlideSize(manifest.size || deck.meta.size),
      entry: "slides.md",
      assets: normalizedAssets.map((asset) => ({
        id: asset.id,
        path: asset.path,
        filename: asset.filename,
        mime: asset.mime,
        size: asset.size,
        hash: asset.hash,
      })),
    };
  }

  const elements = {
    app: document.getElementById("app"),
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    outline: document.getElementById("outline-list"),
    status: document.getElementById("status"),
    deckTitle: document.getElementById("deck-title"),
    projectMode: document.getElementById("project-mode"),
    newDeck: document.getElementById("new-deck"),
    shareDeck: document.getElementById("share-deck"),
    languagePicker: document.getElementById("language-picker"),
    newDeckDialog: document.getElementById("new-deck-dialog"),
    newDeckMessage: document.getElementById("new-deck-message"),
    newDeckConfirm: document.getElementById("new-deck-confirm"),
    newDeckCancel: document.getElementById("new-deck-cancel"),
    embeddedExportDialog: document.getElementById("embedded-export-dialog"),
    embeddedExportMessage: document.getElementById("embedded-export-message"),
    embeddedExportClose: document.getElementById("embedded-export-close"),
    embeddedExportOk: document.getElementById("embedded-export-ok"),
    themePicker: document.getElementById("theme-picker"),
    sizePicker: document.getElementById("size-picker"),
    showNotes: document.getElementById("show-notes"),
    importMenuButton: document.getElementById("import-menu-button"),
    importMenuOptions: document.getElementById("import-menu-options"),
    importFile: document.getElementById("import-file"),
    importPackage: document.getElementById("import-package"),
    projectize: document.getElementById("projectize"),
    projectizeDialog: document.getElementById("projectize-dialog"),
    projectizeConfirm: document.getElementById("projectize-confirm"),
    projectizeCancel: document.getElementById("projectize-cancel"),
    exportMenuButton: document.getElementById("export-menu-button"),
    exportMenuOptions: document.getElementById("export-menu-options"),
    exportMd: document.getElementById("export-md"),
    exportSelfContainedMd: document.getElementById("export-self-contained-md"),
    exportProjectPackage: document.getElementById("export-project-package"),
    cloudMenuButton: document.getElementById("cloud-menu-button"),
    cloudMenuOptions: document.getElementById("cloud-menu-options"),
    cloudOpen: document.getElementById("cloud-open"),
    cloudSave: document.getElementById("cloud-save"),
    cloudSaveAs: document.getElementById("cloud-save-as"),
    cloudGoogle: document.getElementById("cloud-google"),
    cloudMicrosoft: document.getElementById("cloud-microsoft"),
    cloudDisconnect: document.getElementById("cloud-disconnect"),
    cloudSessionStatus: document.getElementById("cloud-session-status"),
    cloudAuthDialog: document.getElementById("cloud-auth-dialog"),
    cloudAuthMessage: document.getElementById("cloud-auth-message"),
    cloudAuthClose: document.getElementById("cloud-auth-close"),
    cloudAuthOk: document.getElementById("cloud-auth-ok"),
    cloudOpenDialog: document.getElementById("cloud-open-dialog"),
    cloudOpenSummary: document.getElementById("cloud-open-summary"),
    cloudSearch: document.getElementById("cloud-search"),
    cloudSearchButton: document.getElementById("cloud-search-button"),
    cloudRefreshButton: document.getElementById("cloud-refresh-button"),
    cloudRecentList: document.getElementById("cloud-recent-list"),
    cloudFileList: document.getElementById("cloud-file-list"),
    cloudOpenClose: document.getElementById("cloud-open-close"),
    cloudOpenCancel: document.getElementById("cloud-open-cancel"),
    cloudSaveDialog: document.getElementById("cloud-save-dialog"),
    cloudSaveSummary: document.getElementById("cloud-save-summary"),
    cloudSaveName: document.getElementById("cloud-save-name"),
    cloudSaveConfirm: document.getElementById("cloud-save-confirm"),
    cloudSaveCancel: document.getElementById("cloud-save-cancel"),
    cloudConflictDialog: document.getElementById("cloud-conflict-dialog"),
    cloudConflictMessage: document.getElementById("cloud-conflict-message"),
    cloudConflictReload: document.getElementById("cloud-conflict-reload"),
    cloudConflictDuplicate: document.getElementById("cloud-conflict-duplicate"),
    cloudConflictOverwrite: document.getElementById("cloud-conflict-overwrite"),
    cloudConflictCancel: document.getElementById("cloud-conflict-cancel"),
    shareDialog: document.getElementById("share-dialog"),
    shareClose: document.getElementById("share-close"),
    shareSummary: document.getElementById("share-summary"),
    shareTtl: document.getElementById("share-ttl"),
    shareUrl: document.getElementById("share-url"),
    shareCreate: document.getElementById("share-create"),
    shareCopy: document.getElementById("share-copy"),
    shareRevoke: document.getElementById("share-revoke"),
    shareCopyToEditor: document.getElementById("share-copy-to-editor"),
    aiTools: document.getElementById("ai-tools"),
    aiToolsMenuButton: document.getElementById("ai-tools-menu-button"),
    aiToolsMenuOptions: document.getElementById("ai-tools-menu-options"),
    aiToolsDialog: document.getElementById("ai-tools-dialog"),
    aiToolsClose: document.getElementById("ai-tools-close"),
    aiPromptMode: document.getElementById("ai-prompt-mode"),
    aiPromptSource: document.getElementById("ai-prompt-source"),
    aiAudience: document.getElementById("ai-audience"),
    aiDetail: document.getElementById("ai-detail"),
    aiSlideDensity: document.getElementById("ai-slide-density"),
    aiOutputLanguage: document.getElementById("ai-output-language"),
    aiCustomInstruction: document.getElementById("ai-custom-instruction"),
    aiResetPreferences: document.getElementById("ai-reset-preferences"),
    aiExternalContent: document.getElementById("ai-external-content"),
    aiGeneratedPrompt: document.getElementById("ai-generated-prompt"),
    aiGeneratePrompt: document.getElementById("ai-generate-prompt"),
    aiCopyPrompt: document.getElementById("ai-copy-prompt"),
    aiResult: document.getElementById("ai-result"),
    aiResultReview: document.getElementById("ai-result-review"),
    aiCurrentPreview: document.getElementById("ai-current-preview"),
    aiResultPreview: document.getElementById("ai-result-preview"),
    aiApplyResult: document.getElementById("ai-apply-result"),
    aiUndoApply: document.getElementById("ai-undo-apply"),
    autoSplit: document.getElementById("auto-split"),
    insertMenuButton: document.getElementById("insert-menu-button"),
    insertMenuOptions: document.getElementById("insert-menu-options"),
    insertColumns: document.getElementById("insert-columns"),
    insertBasicChart: document.getElementById("insert-basic-chart"),
    insertBlank: document.getElementById("insert-blank"),
    insertDivider: document.getElementById("insert-divider"),
    alignMenuButton: document.getElementById("align-menu-button"),
    alignMenuOptions: document.getElementById("align-menu-options"),
    alignLeft: document.getElementById("align-left"),
    alignCenter: document.getElementById("align-center"),
    alignRight: document.getElementById("align-right"),
    columnsDialog: document.getElementById("columns-dialog"),
    columnsSummary: document.getElementById("columns-summary"),
    columnsRatio: document.getElementById("columns-ratio"),
    columnsConfirm: document.getElementById("columns-confirm"),
    columnsCancel: document.getElementById("columns-cancel"),
    chartDialog: document.getElementById("chart-dialog"),
    chartCancel: document.getElementById("chart-cancel"),
    chartConfirm: document.getElementById("chart-confirm"),
    chartKind: document.getElementById("chart-kind"),
    chartDirectionField: document.getElementById("chart-direction-field"),
    chartDirection: document.getElementById("chart-direction"),
    chartUnitField: document.getElementById("chart-unit-field"),
    chartUnitLabel: document.getElementById("chart-unit-label"),
    chartUnit: document.getElementById("chart-unit"),
    customCssToggle: document.getElementById("custom-css-toggle"),
    customCssPanel: document.getElementById("custom-css-panel"),
    customCssEditor: document.getElementById("custom-css-editor"),
    customCssClear: document.getElementById("custom-css-clear"),
    customCssClose: document.getElementById("custom-css-close"),
    customCssStatus: document.getElementById("custom-css-status"),
    customCssTarget: document.getElementById("custom-css-target"),
    customCssProperty: document.getElementById("custom-css-property"),
    customCssValue: document.getElementById("custom-css-value"),
    customCssColor: document.getElementById("custom-css-color"),
    customCssAdd: document.getElementById("custom-css-add"),
    assetPanel: document.getElementById("asset-panel"),
    assetImport: document.getElementById("asset-import"),
    assetList: document.getElementById("asset-list"),
    assetSort: document.getElementById("asset-sort"),
    autoSplitDialog: document.getElementById("auto-split-dialog"),
    autoSplitSummary: document.getElementById("auto-split-summary"),
    autoSplitList: document.getElementById("auto-split-list"),
    autoSplitAccept: document.getElementById("auto-split-accept"),
    autoSplitCancel: document.getElementById("auto-split-cancel"),
    printPdf: document.getElementById("print-pdf"),
    presentMenuButton: document.getElementById("present-menu-button"),
    presentMenuOptions: document.getElementById("present-menu-options"),
    presentMirror: document.getElementById("present-mirror"),
    presentSpeaker: document.getElementById("present-speaker"),
    presentation: document.getElementById("presentation"),
    presentationSlide: document.getElementById("presentation-slide"),
    presentationNext: document.getElementById("presentation-next"),
    presentationCount: document.getElementById("presentation-count"),
    presentationTimer: document.getElementById("presentation-timer"),
    presentationNotes: document.getElementById("presentation-notes"),
    presentationWebPanel: document.getElementById("presentation-web-panel"),
    presentationWebFrame: document.getElementById("presentation-web-frame"),
    presentationWebOpen: document.getElementById("presentation-web-open"),
    presentationWebClose: document.getElementById("presentation-web-close"),
    exitPresent: document.getElementById("exit-present"),
  };

  let updateTimer = 0;
  const editorEditable = new Compartment();
  const editorView = new EditorView({
    parent: elements.editor,
    state: EditorState.create({
      doc: state.markdown,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown(),
        editorEditable.of(EditorView.editable.of(!state.sharedReadOnly)),
        keymap.of([
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((viewUpdate) => {
          if (!viewUpdate.docChanged) return;
          clearTimeout(updateTimer);
          updateTimer = window.setTimeout(update, 80);
        }),
      ],
    }),
  });

  function applyLanguage() {
    const language = normalizeLanguage(i18n.language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    elements.languagePicker.value = language;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          node.textContent = t(element.dataset.i18n);
        }
      });
      if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) {
        element.textContent = t(element.dataset.i18n);
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    });
    if (state.deck) render();
    updateCloudSessionStatus();
    renderCloudOpenDialog();
    renderShareDialog();
    renderAiPromptControls();
    renderCssBuilderProperties();
    if (elements.aiToolsDialog && !elements.aiToolsDialog.hidden && !elements.aiGeneratedPrompt.value) {
      clearAiGeneratedPrompt();
    }
    renderAiResultReview();
  }

  async function initializeCloudAuth() {
    const sessionState = readCloudAuthSessionState();
    state.cloudSession = sessionState.status === "authenticated" ? sessionState.session : null;
    if (sessionState.status === "expired") {
      clearCloudAuthSession();
      openCloudAuthDialog(t("cloudSessionExpired", { provider: sessionState.session.providerLabel || sessionState.session.provider }));
    }
    updateCloudSessionStatus();
    restorePendingCloudWriteForSession();
    const result = await completeCloudAuthFromUrl(window.location.href, cloudAuthProviders);
    if (result.status === "idle") return;
    cleanCloudAuthUrl();
    if (result.status === "authenticated") {
      state.cloudSession = result.session;
      restorePendingCloudWriteForSession();
      updateCloudSessionStatus();
      elements.status.textContent = t("cloudAuthComplete", { provider: result.session.providerLabel });
      elements.status.classList.remove("warning");
      return;
    }

    state.cloudSession = readCloudAuthSession();
    updateCloudSessionStatus();
    openCloudAuthDialog(t("cloudAuthFailed", { reason: cloudAuthFailureReason(result) }));
  }

  function updateCloudSessionStatus() {
    const session = state.cloudSession;
    const syncLabel = state.cloudFile ? cloudSyncStatusLabel() : "";
    const cloudFileLabel = state.cloudFile?.name
      ? `${session?.providerLabel || ""} · ${state.cloudFile.name}${hasUnsavedCloudChanges() ? " *" : ""}${syncLabel ? ` · ${syncLabel}` : ""}`
      : session?.providerLabel;
    elements.cloudSessionStatus.textContent = session
      ? t("cloudSignedIn", { provider: cloudFileLabel })
      : t("cloudSignedOut");
    elements.cloudSessionStatus.classList.toggle("is-authenticated", Boolean(session));
    elements.cloudOpen.disabled = !session;
    elements.cloudSave.disabled = !session || !state.cloudFile;
    elements.cloudSaveAs.disabled = !session;
    elements.cloudDisconnect.disabled = !session;
  }

  function cloudSyncStatusLabel() {
    if (state.cloudSyncStatus === "syncing") return t("cloudSyncSyncing");
    if (state.cloudSyncStatus === "pending") return t("cloudSyncPending");
    if (state.cloudSyncStatus === "conflict") return t("cloudSyncConflict");
    if (state.cloudSyncStatus === "synced") return t("cloudSyncSynced");
    return t("cloudSyncLocal");
  }

  function cloudDocumentHash() {
    const assetsKey = state.project.mode === "project"
      ? [...state.project.assets.values()]
        .map((asset) => `${asset.path}:${asset.hash}`)
        .sort()
        .join("|")
      : "";
    return hashString(`${state.project.mode}\n${getEditorValue()}\n${assetsKey}`);
  }

  function markCloudSaved(metadata = state.cloudFile) {
    state.cloudFile = metadata;
    state.cloudSavedHash = metadata ? cloudDocumentHash() : "";
    state.cloudSyncStatus = metadata ? "synced" : "local";
    clearPendingCloudWrite();
    updateCloudSessionStatus();
  }

  function clearCloudBinding() {
    state.cloudFile = null;
    state.cloudSavedHash = "";
    state.cloudConflict = null;
    state.cloudSyncStatus = "local";
    updateCloudSessionStatus();
  }

  function hasUnsavedCloudChanges() {
    return Boolean(state.cloudFile && state.cloudSavedHash && state.cloudSavedHash !== cloudDocumentHash());
  }

  function confirmDiscardUnsavedCloudChanges() {
    return !hasUnsavedCloudChanges() || window.confirm(t("discardUnsavedCloudChanges"));
  }

  function cloudAuthFailureReason(result) {
    if (result.reason === "provider_error") return t("cloudAuthProviderError", { detail: result.detail || "unknown error" });
    if (result.reason === "missing_pending") return t("cloudAuthMissingPending");
    if (result.reason === "invalid_state") return t("cloudAuthInvalidState");
    if (result.reason === "unknown_provider") return t("cloudAuthUnknownProvider");
    if (result.reason === "token_exchange_failed") return t("cloudAuthTokenFailed", { detail: result.detail || "unknown error" });
    return result.detail || result.reason || "unknown error";
  }

  function cleanCloudAuthUrl() {
    const url = new URL(window.location.href);
    ["code", "state", "error", "error_description", "scope"].forEach((key) => url.searchParams.delete(key));
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }

  function getEditorValue() {
    return editorView.state.doc.toString();
  }

  function setEditorValue(value) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: value },
    });
    update();
  }

  function setEditorValueWithoutUpdate(value) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: value },
    });
  }

  function flushEditorUpdate() {
    clearTimeout(updateTimer);
    updateTimer = 0;
    update();
  }

  function update() {
    const started = performance.now();
    state.markdown = getEditorValue();
    state.deck = parseDeck(state.markdown);
    if (!state.sharedReadOnly) {
      syncProjectFromDeck();
      localStorage.setItem("slip.markdown", state.markdown);
      scheduleProjectSave();
    }
    render();
    const elapsed = Math.round(performance.now() - started);
    const warnings = collectWarnings(state.deck);
    elements.status.textContent = warnings.length
      ? warnings[0]
      : t("renderedStatus", {
        count: state.deck.slides.length,
        slideWord: state.deck.slides.length === 1 ? t("slideWordSingular") : t("slideWordPlural"),
        elapsed,
      });
    elements.status.classList.toggle("warning", warnings.length > 0);
  }

  function collectWarnings(deck) {
    const warnings = [...deck.warnings];
    if (state.storageWarning) warnings.push(state.storageWarning);
    const unresolvedAssets = findUnresolvedAssetReferences(state.markdown);
    if (unresolvedAssets.length) {
      warnings.push(t("unresolvedAssetRefs", {
        plural: unresolvedAssets.length === 1 ? "" : "s",
        refs: formatAssetReferenceList(unresolvedAssets),
      }));
    }
    const largeDataImage = state.markdown.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
    if (largeDataImage && largeDataImage[1].length > 1_400_000) {
      warnings.push(t("largeEmbeddedImageWarning"));
    }
    return warnings;
  }

  function render() {
    const deck = state.deck;
    const isProjectMode = state.project.mode === "project";
    elements.deckTitle.textContent = deck.meta.title;
    elements.projectMode.textContent = isProjectMode ? t("project") : t("singleFile");
    elements.projectize.disabled = isProjectMode;
    elements.themePicker.value = supportedThemes.includes(deck.meta.theme) ? deck.meta.theme : "clean";
    elements.sizePicker.value = deck.meta.size;
    setSlideSizeVars(deck.meta.size);
    updatePrintSize(deck.meta.size);
    updatePresentationSizeClass(deck.meta.size);
    updateCustomCss(deck.customCss);
    elements.preview.classList.toggle("show-notes", state.showNotes);
    renderOutline(deck);
    renderPreview(deck);
    renderAssetPanel();
    updateCloudSessionStatus();
    updateSharedReadOnlyUi();
    if (state.presentationOpen) renderPresentation();
  }

  function renderOutline(deck) {
    elements.outline.innerHTML = "";
    deck.slides.forEach((slide, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `outline-item${index === state.activeSlide ? " active" : ""}${state.overflowSlides.has(slide.id) ? " has-overflow" : ""}`;
      button.dataset.slideId = slide.id;
      button.innerHTML = `<span class="outline-index">${index + 1}</span><span>${escapeHtml(slide.title)}</span>`;
      button.addEventListener("click", () => scrollToSlide(index));
      li.appendChild(button);
      elements.outline.appendChild(li);
    });
  }

  function renderPreview(deck) {
    const theme = supportedThemes.includes(deck.meta.theme) ? deck.meta.theme : "clean";
    const size = deck.meta.size;
    const assetRenderKey = projectAssetRenderKey();
    const nextKeys = new Map();
    const fragment = document.createDocumentFragment();

    deck.slides.forEach((slide, index) => {
      const key = `${theme}:${size}:${slide.hash}:${assetRenderKey}`;
      nextKeys.set(slide.id, key);

      let frame = elements.preview.querySelector(`[data-slide-id="${slide.id}"]`);
      if (!frame || state.previewKeys.get(slide.id) !== key) {
        frame = createSlideFrame(slide, index, theme, size);
      } else {
        updateSlideFrameMetadata(frame, slide, index);
      }
      fragment.appendChild(frame);
    });

    elements.preview.replaceChildren(fragment);
    state.previewKeys = nextKeys;
    scaleSlides();
    requestAnimationFrame(detectSlideOverflow);
  }

  function projectAssetRenderKey() {
    if (state.project.mode !== "project") return "single-file";
    return [...state.project.assets.values()]
      .map((asset) => `${asset.path}:${asset.hash}`)
      .sort()
      .join("|");
  }

  function createSlideFrame(slide, index, theme, size) {
    const frame = document.createElement("div");
    frame.className = "slide-frame";
    frame.id = `frame-${index}`;
    frame.dataset.slideId = slide.id;
    frame.dataset.slideIndex = String(index);
    frame.innerHTML = `<div class="slide-number">${escapeHtml(t("slideN", { number: index + 1 }))}</div>
      ${slideHtml(slide, theme, size)}
      <div class="overflow-badge" aria-hidden="true">${escapeHtml(t("mayClipPdf"))}</div>
      <div class="notes">${escapeHtml(slide.notes || t("noSpeakerNotes"))}</div>`;
    return frame;
  }

  function updateSlideFrameMetadata(frame, slide, index) {
    frame.id = `frame-${index}`;
    frame.dataset.slideIndex = String(index);
    const slideNumber = frame.querySelector(".slide-number");
    if (slideNumber) slideNumber.textContent = t("slideN", { number: index + 1 });
    const slideElement = frame.querySelector(".slide");
    if (slideElement) slideElement.setAttribute("aria-label", slide.title);
  }

  function slideHtml(slide, theme, size) {
    return `<section class="slide theme-${theme} size-${size}" aria-label="${escapeHtml(slide.title)}">
      <div class="slide-inner">${renderMarkdown(slide.content, {
        resolveAssetUrl: resolveProjectAssetUrl,
        renderMissingAsset: missingAssetPlaceholder,
      })}</div>
    </section>`;
  }

  function scaleSlides() {
    const size = slideSizes[state.deck?.meta.size] || slideSizes.widescreen;
    const frames = elements.preview.querySelectorAll(".slide-frame");
    const available = Math.max(320, elements.preview.clientWidth - 36);
    const scale = Math.min(1, available / size.width);
    frames.forEach((frame) => {
      const slide = frame.querySelector(".slide");
      slide.style.transform = `scale(${scale})`;
      slide.style.marginBottom = `${size.height * scale - size.height}px`;
    });
  }

  function setSlideSizeVars(sizeName) {
    const size = slideSizes[sizeName] || slideSizes.widescreen;
    document.documentElement.style.setProperty("--slide-width", `${size.width}px`);
    document.documentElement.style.setProperty("--slide-height", `${size.height}px`);
    document.documentElement.style.setProperty("--print-slide-width", size.printWidth);
    document.documentElement.style.setProperty("--print-slide-height", size.printHeight);
  }

  function updatePrintSize(sizeName) {
    const size = slideSizes[sizeName] || slideSizes.widescreen;
    let printStyle = document.getElementById("print-page-size");
    if (!printStyle) {
      printStyle = document.createElement("style");
      printStyle.id = "print-page-size";
      document.head.appendChild(printStyle);
    }
    printStyle.textContent = `@page { size: ${size.page}; margin: 0; }`;
  }

  function updateCustomCss(css) {
    let style = document.getElementById("custom-slide-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "custom-slide-css";
      document.head.appendChild(style);
    }
    style.textContent = scopeCustomCss(css);
    if (elements.customCssEditor.value !== css) {
      elements.customCssEditor.value = css;
    }
    elements.customCssStatus.classList.remove("warning");
    elements.customCssStatus.textContent = css ? t("customCssApplied") : t("customCssEmpty");
  }

  function detectSlideOverflow() {
    const nextOverflowSlides = new Set();
    const nextColumnImageFitSlides = new Set();
    const frames = elements.preview.querySelectorAll(":scope > .slide-frame");

    frames.forEach((frame) => {
      const slideInner = frame.querySelector(".slide-inner");
      if (!slideInner) return;
      const hasOverflow = slideInner.scrollHeight > slideInner.clientHeight + 1 || slideInner.scrollWidth > slideInner.clientWidth + 1;
      frame.classList.toggle("has-overflow", hasOverflow);
      if (hasOverflow) nextOverflowSlides.add(frame.dataset.slideId);
      frame.querySelectorAll(".slip-column img").forEach((image) => {
        if (image.naturalWidth > image.clientWidth + 1) nextColumnImageFitSlides.add(frame.dataset.slideId);
      });
    });

    state.overflowSlides = nextOverflowSlides;
    state.columnImageFitSlides = nextColumnImageFitSlides;
    markOutlineOverflow();
    updateOverflowStatus();
  }

  function markOutlineOverflow() {
    elements.outline.querySelectorAll(".outline-item").forEach((item) => {
      item.classList.toggle("has-overflow", state.overflowSlides.has(item.dataset.slideId));
    });
  }

  function updateOverflowStatus() {
    if (state.columnImageFitSlides.size) {
      const imageFitIndexes = state.deck.slides
        .map((slide, index) => state.columnImageFitSlides.has(slide.id) ? index + 1 : null)
        .filter(Boolean);
      elements.status.textContent = t("columnImageFitWarning", { slides: formatSlideList(imageFitIndexes) });
      elements.status.classList.add("warning");
      return;
    }
    if (!state.overflowSlides.size) return;
    const overflowIndexes = state.deck.slides
      .map((slide, index) => state.overflowSlides.has(slide.id) ? index + 1 : null)
      .filter(Boolean);

    if (overflowIndexes.length) {
      elements.status.textContent = t("mayClipStatus", { slides: formatSlideList(overflowIndexes) });
      elements.status.classList.add("warning");
    }
  }

  function formatSlideList(slideNumbers) {
    if (slideNumbers.length === 1) return t("slideListSingle", { number: slideNumbers[0] });
    if (slideNumbers.length <= 4) return t("slideListFew", { numbers: slideNumbers.join(", ") });
    return t("slideListMany", { numbers: slideNumbers.slice(0, 4).join(", "), count: slideNumbers.length - 4 });
  }

  function renderAssetPanel() {
    const isProjectMode = state.project.mode === "project";
    elements.assetPanel.classList.toggle("is-inactive", !isProjectMode);
    elements.assetImport.disabled = !isProjectMode;
    elements.assetSort.disabled = !isProjectMode;

    if (!isProjectMode) {
      elements.assetList.innerHTML = `<p class="asset-empty">${escapeHtml(t("assetPanelInactive"))}</p>`;
      return;
    }

    pruneAssetThumbnailCache();
    const usage = countAssetUsage(state.markdown);
    const duplicates = findDuplicateAssetHashes();
    const assets = sortAssets([...state.project.assets.values()], usage);

    if (!assets.length) {
      elements.assetList.innerHTML = `<p class="asset-empty">${escapeHtml(t("noProjectAssets"))}</p>`;
      return;
    }

    elements.assetList.innerHTML = "";
    const visibleAssets = assets.slice(0, state.assetVisibleLimit);
    visibleAssets.forEach((asset) => {
      const item = document.createElement("section");
      item.className = "asset-item";
      item.dataset.assetPath = asset.path;
      const useCount = usage.get(asset.path) || 0;
      item.innerHTML = `${assetThumbnailHtml(asset)}
        <div class="asset-details">
          <div class="asset-name" title="${escapeHtml(asset.filename)}">${escapeHtml(asset.filename)}</div>
          <div class="asset-path" title="${escapeHtml(asset.path)}">${escapeHtml(asset.path)}</div>
          <div class="asset-meta">${formatBytes(asset.size)} · ${escapeHtml(t("usedTimes", { count: useCount, plural: useCount === 1 ? "" : "s" }))}</div>
          ${duplicates.has(asset.hash) ? `<div class="asset-duplicate">${escapeHtml(t("duplicateContent"))}</div>` : ""}
          <div class="asset-item-actions">
            <button class="asset-icon-button" type="button" data-action="insert" aria-label="${escapeHtml(t("insert"))}" title="${escapeHtml(t("insert"))}">＋</button>
            <button class="asset-icon-button" type="button" data-action="rename" aria-label="${escapeHtml(t("rename"))}" title="${escapeHtml(t("rename"))}">✎</button>
            <button class="asset-icon-button asset-remove-button" type="button" data-action="remove" aria-label="${escapeHtml(t("remove"))}" title="${escapeHtml(t("remove"))}">×</button>
          </div>
          <div class="asset-insert-menu" hidden>
            <button type="button" data-action="insert-sized" data-width="25%">${escapeHtml(t("imageSizeSmall"))}</button>
            <button type="button" data-action="insert-sized" data-width="50%">${escapeHtml(t("imageSizeMedium"))}</button>
            <button type="button" data-action="insert-sized" data-width="100%">${escapeHtml(t("imageSizeFull"))}</button>
            <span class="asset-custom-insert">
              <input class="asset-custom-width" type="text" placeholder="${escapeHtml(t("imageCustomWidth"))}" autocomplete="off">
              <button type="button" data-action="insert-custom">${escapeHtml(t("add"))}</button>
            </span>
          </div>
        </div>`;
      elements.assetList.appendChild(item);
    });

    if (visibleAssets.length < assets.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "asset-show-more";
      button.dataset.action = "show-more-assets";
      button.textContent = t("showMoreAssets", { count: Math.min(60, assets.length - visibleAssets.length) });
      elements.assetList.appendChild(button);
    }
  }

  function resetAssetPanelPaging() {
    state.assetVisibleLimit = 60;
  }

  function pruneAssetThumbnailCache() {
    const validKeys = new Set([...state.project.assets.values()].map((asset) => `${asset.path}:${asset.hash}`));
    state.assetThumbnailCache.forEach((_value, key) => {
      if (!validKeys.has(key)) state.assetThumbnailCache.delete(key);
    });
  }

  function assetThumbnailHtml(asset) {
    if (!asset.mime.startsWith("image/")) {
      return `<div class="asset-thumb asset-thumb-file" aria-hidden="true">${escapeHtml(t("fileThumb"))}</div>`;
    }
    const cacheKey = `${asset.path}:${asset.hash}`;
    if (!state.assetThumbnailCache.has(cacheKey)) {
      state.assetThumbnailCache.set(cacheKey, asset.dataUrl);
    }
    return `<div class="asset-thumb">
      <img src="${escapeHtml(state.assetThumbnailCache.get(cacheKey))}" alt="" loading="lazy" decoding="async">
    </div>`;
  }

  function countAssetUsage(markdown) {
    const usage = new Map();
    extractMarkdownAssetReferences(markdown).forEach((path) => {
      usage.set(path, (usage.get(path) || 0) + 1);
    });
    return usage;
  }

  function extractMarkdownAssetReferences(markdown) {
    const references = [];
    const pattern = /!?\[[^\]]*]\(([^)]+)\)/g;
    let match = pattern.exec(markdown);
    while (match) {
      const path = normalizeAssetPath(unescapeHtml(match[1]));
      if (path.startsWith("assets/")) references.push(path);
      match = pattern.exec(markdown);
    }
    return references;
  }

  function findUnresolvedAssetReferences(markdown) {
    if (state.project.mode !== "project") return [];
    return [...new Set(extractMarkdownAssetReferences(markdown))]
      .filter((path) => !state.project.assets.has(path));
  }

  function formatAssetReferenceList(paths) {
    if (paths.length <= 3) return paths.join(", ");
    return t("andMore", { items: paths.slice(0, 3).join(", "), count: paths.length - 3 });
  }

  function rewriteAssetReferences(markdown, oldPath, newPath) {
    return markdown.replace(/(!?\[[^\]]*]\()([^)]+)(\))/g, (match, prefix, source, suffix) => {
      const normalizedSource = normalizeAssetPath(unescapeHtml(source));
      if (normalizedSource !== oldPath) return match;
      return `${prefix}${newPath}${suffix}`;
    });
  }

  function hasProjectAsset(path) {
    return state.project.mode === "project" && state.project.assets.has(normalizeAssetPath(path));
  }

  function isProjectAssetReference(path) {
    return normalizeAssetPath(path).startsWith("assets/");
  }

  function missingAssetPlaceholder(path) {
    return `<span class="missing-asset" role="img" aria-label="Missing asset">${escapeHtml(path)}</span>`;
  }

  function markdownAssetCount(markdown, path) {
    return extractMarkdownAssetReferences(markdown)
      .filter((reference) => reference === path)
      .length;
  }

  function updateMarkdownAfterAssetRename(oldPath, newPath) {
    const nextMarkdown = rewriteAssetReferences(getEditorValue(), oldPath, newPath);
    if (nextMarkdown !== getEditorValue()) {
      setEditorValue(nextMarkdown);
    } else {
      render();
      scheduleProjectSave();
    }
  }

  function findDuplicateAssetHashes() {
    const counts = new Map();
    state.project.assets.forEach((asset) => {
      counts.set(asset.hash, (counts.get(asset.hash) || 0) + 1);
    });
    return new Set([...counts.entries()].filter((entry) => entry[1] > 1).map((entry) => entry[0]));
  }

  function sortAssets(assets, usage) {
    return assets.sort((left, right) => {
      if (state.assetSort === "size") return right.size - left.size || left.filename.localeCompare(right.filename);
      if (state.assetSort === "usage") return (usage.get(right.path) || 0) - (usage.get(left.path) || 0) || left.filename.localeCompare(right.filename);
      return left.filename.localeCompare(right.filename);
    });
  }

  function formatBytes(bytes) {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
    return `${bytes} B`;
  }

  function scrollToSlide(index) {
    state.activeSlide = index;
    state.ignorePreviewScrollUntil = Date.now() + 300;
    document.getElementById(`frame-${index}`)?.scrollIntoView({ behavior: "auto", block: "start" });
    scrollEditorToSlide(index);
    renderOutline(state.deck);
  }

  function scrollEditorToSlide(index) {
    const ranges = markdownSlideRanges(getEditorValue());
    const range = ranges[index];
    if (!range) return;
    editorView.dispatch({
      selection: { anchor: range.start },
      effects: EditorView.scrollIntoView(range.start, { y: "start" }),
    });
    editorView.focus();
  }

  function markdownSlideRanges(markdown) {
    let bodyStart = markdownBodyStart(markdown);
    const body = markdown.slice(bodyStart);
    const styleMatch = body.match(/^\s*<style>([\s\S]*?)<\/style>\s*/i);
    if (styleMatch) bodyStart += styleMatch[0].length;

    const segments = [];
    const lines = markdown.slice(bodyStart).split("\n");
    let currentStart = bodyStart;
    let position = bodyStart;
    let inFence = false;

    lines.forEach((line, index) => {
      const lineStart = position;
      const hasNewline = index < lines.length - 1;
      const nextPosition = position + line.length + (hasNewline ? 1 : 0);
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (!inFence && /^---\s*$/.test(line)) {
        segments.push({ start: currentStart, end: lineStart });
        currentStart = nextPosition;
      }
      position = nextPosition;
    });
    segments.push({ start: currentStart, end: markdown.length });

    return segments
      .map((segment) => {
        const source = markdown.slice(segment.start, segment.end);
        const firstContent = source.search(/\S/);
        return {
          start: firstContent >= 0 ? segment.start + firstContent : segment.start,
          source,
        };
      })
      .filter((segment, index, all) => segment.source.trim() || all.length === 1 || index < all.length - 1);
  }

  function markdownBodyStart(markdown) {
    if (!markdown.startsWith("---\n")) return 0;
    const end = markdown.indexOf("\n---", 4);
    if (end === -1) return 0;
    const afterClosingFence = end + 4;
    return markdown[afterClosingFence] === "\n" ? afterClosingFence + 1 : afterClosingFence;
  }

  function exportMarkdown() {
    const blob = new Blob([state.markdown], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, `${slugify(state.deck.meta.title)}.md`);
  }

  function exportSelfContainedMarkdown() {
    if (state.project.mode !== "project") {
      exportMarkdown();
      return;
    }

    const result = inlineProjectAssetReferences(getEditorValue());
    if (result.unresolved.length) {
      openEmbeddedExportDialog(t("embeddedExportRefusedUnresolved", {
        plural: result.unresolved.length === 1 ? "" : "s",
        refs: formatAssetReferenceList(result.unresolved),
      }));
      return;
    }

    const sizeIssue = validateEmbeddedMarkdownSize(result.inlinedAssets);
    if (sizeIssue) {
      openEmbeddedExportDialog(sizeIssue);
      return;
    }

    downloadBlob(new Blob([result.markdown], { type: "text/markdown;charset=utf-8" }), `${slugify(state.deck.meta.title)}-self-contained.md`);
    elements.status.textContent = t("embeddedExported", {
      count: result.inlinedAssets.length,
      plural: result.inlinedAssets.length === 1 ? "" : "s",
    });
    elements.status.classList.remove("warning");
  }

  function openEmbeddedExportDialog(message) {
    elements.embeddedExportMessage.textContent = message;
    elements.embeddedExportDialog.hidden = false;
  }

  function closeEmbeddedExportDialog() {
    elements.embeddedExportDialog.hidden = true;
  }

  function openCloudAuthDialog(message) {
    elements.cloudAuthMessage.textContent = message;
    elements.cloudAuthDialog.hidden = false;
  }

  function closeCloudAuthDialog() {
    elements.cloudAuthDialog.hidden = true;
  }

  async function startCloudAuth(providerId) {
    closeToolbarMenus();
    if (providerId === "google") {
      const result = await startGoogleTokenAuth(cloudAuthProviders.google, {
        onConfigurationMissing: (provider) => openCloudAuthDialog(t("cloudMissingClient", {
          provider: provider.label,
          envKey: provider.envKey,
        })),
        onAuthenticated: (session) => {
          state.cloudSession = session;
          clearCloudBinding();
          elements.status.textContent = t("cloudAuthComplete", { provider: session.providerLabel });
          elements.status.classList.remove("warning");
        },
        onError: (error) => openCloudAuthDialog(t("cloudAuthFailed", { reason: error.message })),
      });
      if (result?.status === "authenticated") return;
      return;
    }
    await beginCloudAuth(providerId, cloudAuthProviders, {
      onConfigurationMissing: (provider) => openCloudAuthDialog(t("cloudMissingClient", {
        provider: provider.label,
        envKey: provider.envKey,
      })),
    });
  }

  async function openCloudPicker() {
    closeToolbarMenus();
    if (!state.cloudSession) {
      openCloudAuthDialog(t("cloudOpenRequiresAuth"));
      return;
    }
    state.cloudOpenError = "";
    elements.cloudSearch.value = "";
    elements.cloudOpenDialog.hidden = false;
    renderCloudOpenDialog();
    await refreshCloudFiles();
  }

  function closeCloudPicker() {
    elements.cloudOpenDialog.hidden = true;
  }

  async function refreshCloudFiles() {
    if (!state.cloudSession) return;
    state.cloudLoading = true;
    state.cloudOpenError = "";
    renderCloudOpenDialog();
    try {
      const connector = createActiveCloudConnector();
      state.cloudFiles = await connector.listFiles({ query: elements.cloudSearch.value });
    } catch (error) {
      state.cloudOpenError = cloudConnectorMessage(error);
      state.cloudFiles = [];
    } finally {
      state.cloudLoading = false;
      renderCloudOpenDialog();
    }
  }

  function renderCloudOpenDialog() {
    if (!elements.cloudOpenDialog || elements.cloudOpenDialog.hidden) return;
    const provider = state.cloudSession?.providerLabel || "";
    if (state.cloudLoading) {
      elements.cloudOpenSummary.textContent = t("cloudLoadingFiles", { provider });
    } else if (state.cloudOpenError) {
      elements.cloudOpenSummary.textContent = t("cloudOpenFailed", { message: state.cloudOpenError });
    } else {
      elements.cloudOpenSummary.textContent = state.cloudSession
        ? t("cloudOpenSummary", { provider })
        : t("cloudOpenRequiresAuth");
    }
    elements.cloudOpenSummary.classList.toggle("warning", Boolean(state.cloudOpenError));
    renderCloudFileList(elements.cloudFileList, state.cloudFiles, t("noCloudFiles"));
    const recent = state.cloudRecentFiles.filter((file) => file.provider === state.cloudSession?.provider);
    renderCloudFileList(elements.cloudRecentList, recent, t("noRecentCloudFiles"));
  }

  function renderCloudFileList(container, files, emptyMessage) {
    container.innerHTML = "";
    if (!files.length) {
      const empty = document.createElement("p");
      empty.className = "cloud-file-empty";
      empty.textContent = emptyMessage;
      container.appendChild(empty);
      return;
    }
    files.forEach((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cloud-file-item";
      button.dataset.fileId = file.id;
      button.innerHTML = `<span class="cloud-file-name">${escapeHtml(file.name)}</span>
        <span class="cloud-file-meta">${escapeHtml(formatCloudFileMeta(file))}</span>`;
      container.appendChild(button);
    });
  }

  function formatCloudFileMeta(file) {
    const parts = [file.provider === "google" ? t("googleDrive") : t("oneDrive")];
    if (file.size) parts.push(formatBytes(file.size));
    if (file.modifiedTime) parts.push(new Date(file.modifiedTime).toLocaleDateString());
    return parts.join(" · ");
  }

  async function openCloudFile(fileId) {
    if (!state.cloudSession) return;
    if (!confirmDiscardUnsavedCloudChanges()) return;
    state.cloudLoading = true;
    state.cloudOpenError = "";
    renderCloudOpenDialog();
    try {
      const connector = createActiveCloudConnector();
      const opened = await connector.openFile(fileId);
      await loadOpenedCloudFile(opened);
      markCloudSaved(opened.metadata);
      rememberRecentCloudFile(opened.metadata);
      closeCloudPicker();
      elements.status.textContent = t("cloudFileOpened", { name: opened.metadata.name });
      elements.status.classList.remove("warning");
    } catch (error) {
      state.cloudOpenError = cloudConnectorMessage(error);
      elements.status.textContent = t("cloudOpenFailed", { message: state.cloudOpenError });
      elements.status.classList.add("warning");
    } finally {
      state.cloudLoading = false;
      renderCloudOpenDialog();
    }
  }

  async function loadOpenedCloudFile(opened) {
    if (opened.metadata.name.toLowerCase().endsWith(".zip") || opened.metadata.mimeType === "application/zip") {
      const blob = opened.blob || new Blob([opened.content || ""], { type: "application/zip" });
      await importProjectPackageBlob(blob);
      return;
    }
    state.project = createSingleFileProject();
    clearCloudBinding();
    clearCurrentProjectStorage().catch((error) => {
      state.storageWarning = t("clearProjectFailed", { message: error.message });
    });
    setEditorValue(opened.content || "");
  }

  async function saveCloudFile() {
    closeToolbarMenus();
    if (!state.cloudSession) {
      openCloudAuthDialog(t("cloudSaveRequiresAuth"));
      return;
    }
    flushEditorUpdate();
    if (!state.cloudFile) {
      openCloudSaveDialog();
      return;
    }
    await writeCloudFile(state.cloudFile);
  }

  function openCloudSaveDialog() {
    closeToolbarMenus();
    if (!state.cloudSession) {
      openCloudAuthDialog(t("cloudSaveRequiresAuth"));
      return;
    }
    elements.cloudSaveSummary.textContent = t("cloudSaveAsSummary", {
      provider: state.cloudSession.providerLabel,
    });
    elements.cloudSaveSummary.classList.remove("warning");
    elements.cloudSaveName.value = defaultCloudSaveName();
    elements.cloudSaveDialog.hidden = false;
    elements.cloudSaveName.focus();
    elements.cloudSaveName.select();
  }

  function closeCloudSaveDialog() {
    elements.cloudSaveDialog.hidden = true;
  }

  async function confirmCloudSaveAs() {
    const name = normalizeCloudSaveName(elements.cloudSaveName.value);
    if (!name) {
      elements.cloudSaveSummary.textContent = t("cloudSaveNameRequired");
      elements.cloudSaveSummary.classList.add("warning");
      return;
    }
    flushEditorUpdate();
    closeCloudSaveDialog();
    await createCloudFile(name);
  }

  async function createCloudFile(name) {
    if (!state.cloudSession) return;
    try {
      const connector = createActiveCloudConnector();
      const payload = await createCloudSavePayload({ name });
      const metadata = await connector.createFile(payload);
      markCloudSaved(metadata);
      rememberRecentCloudFile(metadata);
      elements.status.textContent = t("cloudFileSavedAs", { name: metadata.name });
      elements.status.classList.remove("warning");
    } catch (error) {
      elements.status.textContent = t("cloudSaveFailed", { message: cloudConnectorMessage(error) });
      elements.status.classList.add("warning");
    }
  }

  async function writeCloudFile(metadata) {
    let payload = null;
    try {
      const connector = createActiveCloudConnector();
      payload = await createCloudSavePayload({ name: metadata.name, target: metadata });
      state.cloudSyncStatus = "syncing";
      updateCloudSessionStatus();
      const saved = await connector.saveFile(metadata.id, {
        ...payload,
        expectedRevisionId: metadata.revisionId,
      });
      markCloudSaved(saved);
      rememberRecentCloudFile(saved);
      elements.status.textContent = t("cloudFileSaved", { name: saved.name });
      elements.status.classList.remove("warning");
    } catch (error) {
      if (error instanceof CloudConnectorError && error.code === cloudConnectorErrorCodes.conflict) {
        openCloudConflictDialog(error.details.current || metadata);
        return;
      }
      if (payload && isRetryableCloudSaveError(error)) {
        await bufferPendingCloudWrite(metadata, payload, cloudDocumentHash());
        elements.status.textContent = t("cloudSaveBuffered", { name: metadata.name });
        elements.status.classList.add("warning");
        return;
      }
      state.cloudSyncStatus = hasUnsavedCloudChanges() ? "local" : "synced";
      updateCloudSessionStatus();
      elements.status.textContent = t("cloudSaveFailed", { message: cloudConnectorMessage(error) });
      elements.status.classList.add("warning");
    }
  }

  function openCloudConflictDialog(currentMetadata) {
    state.cloudConflict = {
      current: currentMetadata,
      local: state.cloudFile,
    };
    elements.cloudConflictMessage.textContent = t("cloudConflictMessage", {
      name: currentMetadata?.name || state.cloudFile?.name || t("cloudFile"),
    });
    elements.cloudConflictDialog.hidden = false;
    state.cloudSyncStatus = "conflict";
    updateCloudSessionStatus();
    elements.status.textContent = t("cloudConflictStatus");
    elements.status.classList.add("warning");
  }

  function closeCloudConflictDialog() {
    elements.cloudConflictDialog.hidden = true;
  }

  async function reloadCloudConflictRemote() {
    const current = state.cloudConflict?.current;
    if (!current || !state.cloudSession) return;
    closeCloudConflictDialog();
    try {
      const connector = createActiveCloudConnector();
      const opened = await connector.openFile(current.id);
      await loadOpenedCloudFile(opened);
      markCloudSaved(opened.metadata);
      rememberRecentCloudFile(opened.metadata);
      elements.status.textContent = t("cloudConflictReloaded", { name: opened.metadata.name });
      elements.status.classList.remove("warning");
    } catch (error) {
      elements.status.textContent = t("cloudOpenFailed", { message: cloudConnectorMessage(error) });
      elements.status.classList.add("warning");
    } finally {
      state.cloudConflict = null;
    }
  }

  async function duplicateCloudConflictLocal() {
    const local = state.cloudConflict?.local || state.cloudFile;
    if (!local) return;
    closeCloudConflictDialog();
    state.cloudConflict = null;
    await createCloudFile(duplicateCloudFilename(local.name));
  }

  async function overwriteCloudConflictRemote() {
    const current = state.cloudConflict?.current;
    if (!current || !state.cloudSession) return;
    closeCloudConflictDialog();
    try {
      const connector = createActiveCloudConnector();
      const payload = await createCloudSavePayload({ name: current.name, target: current });
      const saved = await connector.saveFile(current.id, payload);
      markCloudSaved(saved);
      rememberRecentCloudFile(saved);
      elements.status.textContent = t("cloudConflictOverwritten", { name: saved.name });
      elements.status.classList.remove("warning");
    } catch (error) {
      elements.status.textContent = t("cloudSaveFailed", { message: cloudConnectorMessage(error) });
      elements.status.classList.add("warning");
    } finally {
      state.cloudConflict = null;
    }
  }

  function duplicateCloudFilename(name) {
    const dot = name.lastIndexOf(".");
    if (dot > 0) return `${name.slice(0, dot)} local copy${name.slice(dot)}`;
    return `${name} local copy`;
  }

  async function bufferPendingCloudWrite(metadata, payload, documentHash) {
    const pending = {
      provider: state.cloudSession.provider,
      file: metadata,
      payload: await serializeCloudSavePayload(payload),
      expectedRevisionId: metadata.revisionId,
      documentHash,
      previousSavedHash: state.cloudSavedHash,
      createdAt: new Date().toISOString(),
    };
    state.pendingCloudWrite = pending;
    state.cloudSyncStatus = "pending";
    localStorage.setItem(cloudPendingWriteKey, JSON.stringify(pending));
    updateCloudSessionStatus();
  }

  async function serializeCloudSavePayload(payload) {
    if (payload.content instanceof Blob) {
      return {
        name: payload.name,
        mimeType: payload.mimeType,
        contentKind: "data-url",
        content: await readBlobAsDataUrl(payload.content),
      };
    }
    return {
      name: payload.name,
      mimeType: payload.mimeType,
      contentKind: "text",
      content: String(payload.content ?? ""),
    };
  }

  function deserializeCloudSavePayload(payload) {
    if (payload.contentKind === "data-url") {
      return {
        name: payload.name,
        mimeType: payload.mimeType,
        content: dataUrlToBlob(payload.content),
      };
    }
    return {
      name: payload.name,
      mimeType: payload.mimeType,
      content: payload.content || "",
    };
  }

  function readPendingCloudWrite() {
    try {
      const pending = JSON.parse(localStorage.getItem(cloudPendingWriteKey) || "null");
      if (!pending?.provider || !pending.file?.id || !pending.payload?.name) return null;
      return pending;
    } catch (_error) {
      return null;
    }
  }

  function clearPendingCloudWrite() {
    state.pendingCloudWrite = null;
    localStorage.removeItem(cloudPendingWriteKey);
  }

  function restorePendingCloudWriteForSession() {
    if (!state.cloudSession || !state.pendingCloudWrite) return;
    if (state.pendingCloudWrite.provider !== state.cloudSession.provider) return;
    if (!state.cloudFile) state.cloudFile = state.pendingCloudWrite.file;
    state.cloudSavedHash = state.pendingCloudWrite.previousSavedHash || "";
    state.cloudSyncStatus = "pending";
    updateCloudSessionStatus();
    if (navigator.onLine !== false) {
      retryPendingCloudWrite();
    }
  }

  async function retryPendingCloudWrite() {
    const pending = state.pendingCloudWrite;
    if (!pending || !state.cloudSession || pending.provider !== state.cloudSession.provider) return;
    if (pending.documentHash !== cloudDocumentHash()) {
      state.cloudSyncStatus = "pending";
      updateCloudSessionStatus();
      elements.status.textContent = t("cloudPendingStale");
      elements.status.classList.add("warning");
      return;
    }
    try {
      state.cloudSyncStatus = "syncing";
      updateCloudSessionStatus();
      const connector = createActiveCloudConnector();
      const saved = await connector.saveFile(pending.file.id, {
        ...deserializeCloudSavePayload(pending.payload),
        expectedRevisionId: pending.expectedRevisionId,
      });
      state.cloudFile = saved;
      state.cloudSavedHash = pending.documentHash;
      state.cloudSyncStatus = "synced";
      rememberRecentCloudFile(saved);
      clearPendingCloudWrite();
      updateCloudSessionStatus();
      elements.status.textContent = t("cloudPendingSynced", { name: saved.name });
      elements.status.classList.remove("warning");
    } catch (error) {
      if (error instanceof CloudConnectorError && error.code === cloudConnectorErrorCodes.conflict) {
        openCloudConflictDialog(error.details.current || pending.file);
        return;
      }
      state.cloudSyncStatus = "pending";
      updateCloudSessionStatus();
      elements.status.textContent = t("cloudPendingRetryFailed", { message: cloudConnectorMessage(error) });
      elements.status.classList.add("warning");
    }
  }

  function isRetryableCloudSaveError(error) {
    return navigator.onLine === false
      || !(error instanceof CloudConnectorError)
      || error.code === cloudConnectorErrorCodes.network;
  }

  function dataUrlToBlob(dataUrl) {
    const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) return new Blob([String(dataUrl)], { type: "application/octet-stream" });
    const mime = match[1] || "application/octet-stream";
    if (!match[2]) {
      return new Blob([decodeURIComponent(match[3])], { type: mime });
    }
    const binary = atob(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
  }

  async function createCloudSavePayload({ name, target = null }) {
    const saveAsPackage = shouldSaveAsProjectPackage(name, target);
    if (saveAsPackage) {
      syncProjectFromDeck();
      const blob = await buildProjectPackageBlob({
        markdown: getEditorValue(),
        manifest: state.project.manifest || createProjectManifest(state.deck, []),
        assets: [...state.project.assets.values()],
      });
      return {
        name: ensureExtension(name, ".zip"),
        content: blob,
        mimeType: "application/zip",
      };
    }
    return {
      name: ensureMarkdownExtension(name),
      content: getEditorValue(),
      mimeType: "text/markdown",
    };
  }

  function shouldSaveAsProjectPackage(name, target) {
    if (target) {
      return target.mimeType === "application/zip" || target.name.toLowerCase().endsWith(".zip");
    }
    return state.project.mode === "project" || name.toLowerCase().endsWith(".zip");
  }

  function defaultCloudSaveName() {
    if (state.cloudFile?.name) return state.cloudFile.name;
    const base = slugify(state.deck?.meta.title || "deck");
    return state.project.mode === "project" ? `${base}.zip` : `${base}.md`;
  }

  function normalizeCloudSaveName(name) {
    return sanitizeFilename(String(name || "").trim());
  }

  function ensureMarkdownExtension(name) {
    return /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
  }

  function ensureExtension(name, extension) {
    return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
  }

  function createActiveCloudConnector() {
    if (state.cloudSession?.provider === "google") return createGoogleDriveConnector(state.cloudSession);
    if (state.cloudSession?.provider === "microsoft") return createOneDriveConnector(state.cloudSession);
    throw new CloudConnectorError("unsupported_provider", t("cloudUnsupportedProvider"));
  }

  function cloudConnectorMessage(error) {
    if (error instanceof CloudConnectorError) return error.message;
    return error?.message || String(error);
  }

  function readRecentCloudFiles() {
    try {
      const files = JSON.parse(localStorage.getItem(cloudRecentFilesKey) || "[]");
      return Array.isArray(files) ? files : [];
    } catch (_error) {
      return [];
    }
  }

  function rememberRecentCloudFile(metadata) {
    state.cloudRecentFiles = [
      { ...metadata, openedAt: new Date().toISOString() },
      ...state.cloudRecentFiles.filter((file) => !(file.provider === metadata.provider && file.id === metadata.id)),
    ].slice(0, 8);
    localStorage.setItem(cloudRecentFilesKey, JSON.stringify(state.cloudRecentFiles));
  }

  function clearRecentCloudFiles(provider) {
    state.cloudRecentFiles = provider
      ? state.cloudRecentFiles.filter((file) => file.provider !== provider)
      : [];
    if (state.cloudRecentFiles.length) {
      localStorage.setItem(cloudRecentFilesKey, JSON.stringify(state.cloudRecentFiles));
    } else {
      localStorage.removeItem(cloudRecentFilesKey);
    }
  }

  function disconnectCloudSession() {
    closeToolbarMenus();
    if (!confirmDiscardUnsavedCloudChanges()) return;
    const session = state.cloudSession;
    revokeCloudAuthSession(session);
    clearCloudAuthSession();
    state.cloudSession = null;
    clearCloudBinding();
    clearPendingCloudWrite();
    clearRecentCloudFiles(session?.provider);
    state.cloudFiles = [];
    elements.status.textContent = t("cloudDisconnected");
    elements.status.classList.remove("warning");
  }

  function readSharedRouteId() {
    const match = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function readShareState() {
    try {
      const share = JSON.parse(localStorage.getItem(shareStateKey) || "null");
      if (!share?.id || !share.url || !share.ownerToken) return null;
      return share;
    } catch (_error) {
      return null;
    }
  }

  function saveShareState(share) {
    state.share = share;
    if (share) {
      localStorage.setItem(shareStateKey, JSON.stringify(share));
    } else {
      localStorage.removeItem(shareStateKey);
    }
    renderShareDialog();
  }

  function readAiPromptPreferences() {
    try {
      return normalizeAiPromptPreferences(JSON.parse(localStorage.getItem(aiPromptPreferencesKey) || "null") || {});
    } catch (_error) {
      return normalizeAiPromptPreferences();
    }
  }

  function saveAiPromptPreferences(preferences) {
    state.aiPromptPreferences = normalizeAiPromptPreferences(preferences);
    localStorage.setItem(aiPromptPreferencesKey, JSON.stringify(state.aiPromptPreferences));
  }

  function openShareDialog() {
    closeToolbarMenus();
    elements.shareDialog.hidden = false;
    renderShareDialog();
  }

  function closeShareDialog() {
    elements.shareDialog.hidden = true;
  }

  function renderShareDialog() {
    if (!elements.shareDialog || elements.shareDialog.hidden) return;
    elements.shareCreate.disabled = state.shareLoading || state.sharedReadOnly;
    elements.shareCopy.disabled = state.shareLoading || !state.share?.url;
    elements.shareRevoke.disabled = state.shareLoading || !state.share?.id || !state.share?.ownerToken;
    elements.shareCopyToEditor.hidden = !state.sharedReadOnly;
    elements.shareUrl.value = state.share?.url || "";
    if (state.sharedReadOnly) {
      elements.shareSummary.textContent = t("shareReadOnlySummary");
    } else if (state.share?.url) {
      elements.shareSummary.textContent = t("shareCreatedSummary", {
        expiresAt: formatShareExpiration(state.share.expiresAt),
      });
    } else {
      elements.shareSummary.textContent = t("shareSummary");
    }
    elements.shareSummary.classList.remove("warning");
  }

  async function createShareLink() {
    if (state.sharedReadOnly) return;
    flushEditorUpdate();
    if (state.project.mode === "project" && state.project.assets.size) {
      setShareDialogWarning(t("shareProjectUnsupported"));
      return;
    }
    state.shareLoading = true;
    renderShareDialog();
    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttlId: elements.shareTtl.value,
          markdown: getEditorValue(),
          meta: {
            title: state.deck.meta.title,
            theme: state.deck.meta.theme,
            size: state.deck.meta.size,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || response.statusText);
      saveShareState(payload);
      elements.status.textContent = t("shareCreatedStatus");
      elements.status.classList.remove("warning");
    } catch (error) {
      setShareDialogWarning(t("shareCreateFailed", { message: error.message }));
    } finally {
      state.shareLoading = false;
      renderShareDialog();
    }
  }

  async function copyShareLink() {
    if (!state.share?.url) return;
    await navigator.clipboard.writeText(state.share.url);
    elements.status.textContent = t("shareCopiedStatus");
    elements.status.classList.remove("warning");
  }

  async function revokeShareLink() {
    if (!state.share?.id || !state.share?.ownerToken) return;
    state.shareLoading = true;
    renderShareDialog();
    try {
      const response = await fetch(`/api/share/${encodeURIComponent(state.share.id)}`, {
        method: "DELETE",
        headers: { "x-owner-token": state.share.ownerToken },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || response.statusText);
      saveShareState(null);
      elements.status.textContent = t("shareRevokedStatus");
      elements.status.classList.remove("warning");
    } catch (error) {
      setShareDialogWarning(t("shareRevokeFailed", { message: error.message }));
    } finally {
      state.shareLoading = false;
      renderShareDialog();
    }
  }

  async function initializeSharedRoute() {
    if (!state.sharedRouteId) return;
    setSharedReadOnly(true);
    try {
      const response = await fetch(`/api/share/${encodeURIComponent(state.sharedRouteId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || response.statusText);
      state.project = createSingleFileProject();
      setEditorValueWithoutUpdate(payload.payload?.markdown || "");
      update();
      elements.status.textContent = t("shareOpenedReadOnly", {
        expiresAt: formatShareExpiration(payload.expiresAt),
      });
      elements.status.classList.remove("warning");
    } catch (error) {
      setEditorValueWithoutUpdate(sharedRouteErrorMarkdown(error.message));
      update();
      elements.status.textContent = t("shareOpenFailed", { message: error.message });
      elements.status.classList.add("warning");
    }
  }

  function sharedRouteErrorMarkdown(message) {
    const title = t("sharedDeckUnavailableTitle");
    return `---
title: ${title}
theme: clean
size: widescreen
---

# ${title}

${message}
`;
  }

  function copySharedDeckToEditor() {
    if (!state.sharedReadOnly) return;
    const markdown = getEditorValue();
    state.sharedRouteId = "";
    setSharedReadOnly(false);
    state.project = createSingleFileProject();
    clearCloudBinding();
    setEditorValue(markdown);
    window.history.replaceState({}, document.title, "/");
    closeShareDialog();
    elements.status.textContent = t("shareCopiedToEditorStatus");
    elements.status.classList.remove("warning");
  }

  function openAiToolsDialog() {
    closeToolbarMenus();
    elements.aiToolsDialog.hidden = false;
    renderAiPreferences();
    renderAiPromptControls();
    clearAiGeneratedPrompt();
    renderAiResultReview();
  }

  function closeAiToolsDialog() {
    elements.aiToolsDialog.hidden = true;
    closeToolbarMenus();
  }

  function getAiPromptContent() {
    if (state.aiPromptMode === "file-to-slip") return "";
    if (state.aiPromptSource === "pasted") return elements.aiExternalContent.value;
    if (state.aiPromptSource === "template") return "";
    return getEditorValue();
  }

  function renderAiPromptControls() {
    if (!elements.aiToolsDialog || elements.aiToolsDialog.hidden) return;
    if (![...elements.aiPromptSource.options].some((option) => option.value === state.aiPromptSource)) {
      state.aiPromptSource = "current";
    }
    const currentSourceOption = elements.aiPromptSource.querySelector('option[value="current"]');
    if (currentSourceOption) {
      currentSourceOption.hidden = state.aiPromptMode === "file-to-slip";
      currentSourceOption.disabled = state.aiPromptMode === "file-to-slip";
    }
    if (state.aiPromptMode === "file-to-slip") {
      state.aiPromptSource = "template";
    }
    elements.aiPromptMode.value = state.aiPromptMode;
    elements.aiPromptSource.value = state.aiPromptSource;
    elements.aiPromptSource.disabled = state.aiPromptMode === "file-to-slip";
    elements.aiExternalContent.disabled = state.aiPromptMode === "file-to-slip" || state.aiPromptSource !== "pasted";
    elements.aiExternalContent.placeholder = t(
      state.aiPromptMode === "file-to-slip"
        ? "externalContentFileToSlipDisabled"
        : state.aiPromptSource === "pasted" ? "externalContentPlaceholder" : "externalContentDisabled",
    );
  }

  function generateAiPrompt() {
    renderAiPromptControls();
    elements.aiGeneratedPrompt.value = buildAiPrompt({
      mode: state.aiPromptMode,
      source: state.aiPromptSource,
      content: getAiPromptContent(),
      preferences: state.aiPromptPreferences,
    });
    elements.status.textContent = t("aiPromptGenerated");
    elements.status.classList.remove("warning");
  }

  function clearAiGeneratedPrompt() {
    elements.aiGeneratedPrompt.value = "";
    elements.aiGeneratedPrompt.placeholder = t("generatedPromptPlaceholder");
  }

  function markAiPromptStale() {
    if (!elements.aiToolsDialog || elements.aiToolsDialog.hidden) return;
    clearAiGeneratedPrompt();
    renderAiResultReview();
  }

  function renderAiPreferences() {
    elements.aiAudience.value = state.aiPromptPreferences.audience;
    elements.aiDetail.value = state.aiPromptPreferences.detail;
    elements.aiSlideDensity.value = state.aiPromptPreferences.slideDensity;
    elements.aiOutputLanguage.value = state.aiPromptPreferences.outputLanguage;
    elements.aiCustomInstruction.value = state.aiPromptPreferences.customInstruction;
  }

  function updateAiPreferences() {
    saveAiPromptPreferences({
      audience: elements.aiAudience.value,
      detail: elements.aiDetail.value,
      slideDensity: elements.aiSlideDensity.value,
      outputLanguage: elements.aiOutputLanguage.value,
      customInstruction: elements.aiCustomInstruction.value,
    });
    markAiPromptStale();
  }

  function resetAiPreferences() {
    saveAiPromptPreferences(aiPromptPreferenceDefaults);
    renderAiPreferences();
    markAiPromptStale();
    elements.status.textContent = t("aiPreferencesReset");
    elements.status.classList.remove("warning");
  }

  async function copyAiPrompt() {
    if (!elements.aiGeneratedPrompt.value.trim()) {
      elements.status.textContent = t("generatePromptFirst");
      elements.status.classList.add("warning");
      return;
    }
    await navigator.clipboard.writeText(elements.aiGeneratedPrompt.value);
    elements.status.textContent = t("aiPromptCopied");
    elements.status.classList.remove("warning");
  }

  function renderAiResultReview() {
    if (!elements.aiToolsDialog || elements.aiToolsDialog.hidden) return;
    const normalizedResult = normalizeAiResultContent(elements.aiResult.value);
    const validation = validateAiResult({
      mode: state.aiPromptMode,
      content: normalizedResult,
    });
    const messages = [
      ...validation.errors.map((code) => t(aiResultErrorKey(code))),
      ...validation.warnings.map((code) => t(aiResultWarningKey(code))),
    ];
    elements.aiApplyResult.disabled = !validation.valid;
    elements.aiUndoApply.disabled = !state.aiUndoMarkdown;
    elements.aiCurrentPreview.value = getEditorValue();
    elements.aiResultPreview.value = normalizedResult;
    elements.aiResultReview.textContent = messages.length
      ? messages.join(" ")
      : t("aiResultReady");
    elements.aiResultReview.classList.toggle("warning", messages.length > 0);
  }

  function aiResultErrorKey(code) {
    if (code === "chatty-prefix") return "aiResultChatty";
    return "aiResultEmpty";
  }

  function aiResultWarningKey(code) {
    if (code === "missing-slide-separators") return "aiResultMissingSeparators";
    if (code === "unsupported-directive") return "aiResultUnsupportedDirective";
    if (code === "unsafe-markup") return "aiResultUnsafeMarkup";
    if (code === "report-has-slide-separators") return "aiResultReportSeparators";
    if (code === "report-has-speaker-notes") return "aiResultReportNotes";
    return "aiResultReviewWarning";
  }

  function applyAiResult() {
    const result = normalizeAiResultContent(elements.aiResult.value);
    const validation = validateAiResult({
      mode: state.aiPromptMode,
      content: result,
    });
    renderAiResultReview();
    if (!validation.valid) {
      elements.status.textContent = t("aiResultApplyBlocked");
      elements.status.classList.add("warning");
      return;
    }
    if (state.sharedReadOnly) {
      state.sharedRouteId = "";
      setSharedReadOnly(false);
      window.history.replaceState({}, document.title, "/");
    }
    state.aiUndoMarkdown = getEditorValue();
    state.project = createSingleFileProject();
    clearCloudBinding();
    setEditorValue(result);
    elements.status.textContent = t("aiResultApplied");
    elements.status.classList.toggle("warning", validation.warnings.length > 0);
    closeAiToolsDialog();
  }

  function undoAiApply() {
    if (!state.aiUndoMarkdown) return;
    const previous = state.aiUndoMarkdown;
    state.aiUndoMarkdown = "";
    state.project = createSingleFileProject();
    clearCloudBinding();
    setEditorValue(previous);
    elements.status.textContent = t("aiApplyUndone");
    elements.status.classList.remove("warning");
    renderAiResultReview();
  }

  function setSharedReadOnly(readOnly) {
    state.sharedReadOnly = readOnly;
    editorView.dispatch({
      effects: editorEditable.reconfigure(EditorView.editable.of(!readOnly)),
    });
    updateSharedReadOnlyUi();
  }

  function updateSharedReadOnlyUi() {
    elements.app.classList.toggle("is-shared-readonly", state.sharedReadOnly);
    elements.importMenuButton.disabled = state.sharedReadOnly;
    elements.importFile.disabled = state.sharedReadOnly;
    elements.importPackage.disabled = state.sharedReadOnly;
    elements.projectize.disabled = state.sharedReadOnly || state.project.mode === "project";
    elements.insertMenuButton.disabled = state.sharedReadOnly;
    elements.insertColumns.disabled = state.sharedReadOnly;
    elements.insertBasicChart.disabled = state.sharedReadOnly;
    elements.insertBlank.disabled = state.sharedReadOnly;
    elements.insertDivider.disabled = state.sharedReadOnly;
    elements.alignMenuButton.disabled = state.sharedReadOnly;
    elements.alignLeft.disabled = state.sharedReadOnly;
    elements.alignCenter.disabled = state.sharedReadOnly;
    elements.alignRight.disabled = state.sharedReadOnly;
    elements.autoSplit.disabled = state.sharedReadOnly;
    elements.customCssToggle.disabled = state.sharedReadOnly;
    elements.cloudMenuButton.disabled = state.sharedReadOnly;
    elements.themePicker.disabled = state.sharedReadOnly;
    elements.sizePicker.disabled = state.sharedReadOnly;
  }

  function setShareDialogWarning(message) {
    elements.shareSummary.textContent = message;
    elements.shareSummary.classList.add("warning");
    elements.status.textContent = message;
    elements.status.classList.add("warning");
  }

  function formatShareExpiration(expiresAt) {
    return new Date(expiresAt).toLocaleString();
  }

  function validateEmbeddedMarkdownSize(assetPaths) {
    const maxSingleImageBytes = 350 * 1024;
    const maxTotalImageBytes = 1.5 * 1024 * 1024;
    const imageAssets = assetPaths
      .map((path) => state.project.assets.get(path))
      .filter((asset) => asset && asset.mime.startsWith("image/"));
    const oversized = imageAssets.find((asset) => asset.size > maxSingleImageBytes);
    if (oversized) {
      return t("embeddedExportRefusedSingle", { path: oversized.path, size: formatBytes(oversized.size) });
    }

    const total = imageAssets.reduce((sum, asset) => sum + asset.size, 0);
    if (total > maxTotalImageBytes) {
      return t("embeddedExportRefusedTotal", { size: formatBytes(total) });
    }
    return "";
  }

  function inlineProjectAssetReferences(markdown) {
    const inlinedAssets = new Set();
    const unresolved = new Set();
    const nextMarkdown = markdown.replace(/(!?\[[^\]]*]\()([^)]+)(\))/g, (match, prefix, source, suffix) => {
      const normalizedSource = normalizeAssetPath(unescapeHtml(source));
      if (!normalizedSource.startsWith("assets/")) return match;
      const asset = state.project.assets.get(normalizedSource);
      if (!asset) {
        unresolved.add(normalizedSource);
        return match;
      }
      inlinedAssets.add(normalizedSource);
      return `${prefix}${asset.dataUrl}${suffix}`;
    });

    return {
      markdown: nextMarkdown,
      inlinedAssets: [...inlinedAssets],
      unresolved: [...unresolved],
    };
  }

  async function exportProjectPackage() {
    if (state.project.mode !== "project") {
      elements.status.textContent = t("projectizeBeforePackage");
      elements.status.classList.add("warning");
      return;
    }

    try {
      syncProjectFromDeck();
      const blob = await buildProjectPackageBlob({
        markdown: getEditorValue(),
        manifest: state.project.manifest,
        assets: [...state.project.assets.values()],
      });
      downloadBlob(blob, `${slugify(state.deck.meta.title)}.zip`);
      elements.status.textContent = t("packageExported", {
        count: state.project.assets.size,
        plural: state.project.assets.size === 1 ? "" : "s",
      });
      elements.status.classList.remove("warning");
    } catch (error) {
      elements.status.textContent = t("packageExportFailed", { message: error.message });
      elements.status.classList.add("warning");
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function slugify(value) {
    return (value || "slides").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "slides";
  }

  function syncProjectFromDeck() {
    if (state.project.mode !== "project" || !state.deck) return;
    const assets = [...state.project.assets.values()];
    state.project.manifest = createProjectManifest(state.deck, assets);
  }

  function migrateCurrentDeckToProject() {
    state.project = createProjectFromMarkdown(getEditorValue());
    syncProjectFromDeck();
    elements.status.textContent = t("projectModeReady");
    elements.status.classList.remove("warning");
    render();
    scheduleProjectSave();
  }

  function openProjectizeDialog() {
    closeToolbarMenus();
    elements.projectizeDialog.hidden = false;
  }

  function closeProjectizeDialog() {
    elements.projectizeDialog.hidden = true;
  }

  function confirmProjectize() {
    closeProjectizeDialog();
    resetAssetPanelPaging();
    migrateCurrentDeckToProject();
  }

  function requestNewDeck() {
    closeToolbarMenus();
    if (hasUnsavedCloudChanges()) {
      elements.newDeckMessage.textContent = t("discardUnsavedCloudChanges");
      elements.newDeckDialog.hidden = false;
      return;
    }
    if (!hasUserContent()) {
      startNewDeck();
      return;
    }
    elements.newDeckMessage.textContent = newDeckWarningMessage();
    elements.newDeckDialog.hidden = false;
  }

  function hasUserContent() {
    return normalizeMarkdownForCompare(getEditorValue()) !== normalizeMarkdownForCompare(newDeckMarkdown);
  }

  function normalizeMarkdownForCompare(markdown) {
    return markdown.replace(/\r\n?/g, "\n").trim();
  }

  function newDeckWarningMessage() {
    const parts = [t("newDeckDiscard")];
    if (state.project.mode !== "project") {
      parts.push(t("notSavedAsProject"));
    }
    return parts.join(" ");
  }

  function closeNewDeckDialog() {
    elements.newDeckDialog.hidden = true;
  }

  function confirmNewDeck() {
    closeNewDeckDialog();
    startNewDeck();
  }

  function startNewDeck() {
    state.project = createSingleFileProject();
    clearCloudBinding();
    state.storageWarning = "";
    state.activeSlide = 0;
    state.overflowSlides = new Set();
    state.previewKeys = new Map();
    state.assetThumbnailCache = new Map();
    resetAssetPanelPaging();
    clearCurrentProjectStorage().catch((error) => {
      state.storageWarning = t("clearProjectFailed", { message: error.message });
    });
    setEditorValue(newDeckMarkdown);
    elements.status.textContent = t("newDeckStarted");
    elements.status.classList.remove("warning");
  }

  function createProjectFromMarkdown(markdown, assetRecords = [], manifest = null) {
    const deck = parseDeck(markdown);
    const normalizedManifest = normalizeProjectManifest(manifest, deck, assetRecords);
    const assets = new Map();
    assetRecords.forEach((asset) => {
      const manifestAsset = normalizedManifest.assets.find((item) => item.path === asset.path);
      assets.set(asset.path, {
        ...asset,
        id: manifestAsset?.id || asset.id,
      });
    });
    return {
      mode: "project",
      manifest: normalizedManifest,
      assets,
    };
  }

  async function initializeProjectStorage() {
    try {
      state.db = await openProjectDatabase();
      state.storageReady = true;
      await restoreCurrentProject();
    } catch (error) {
      state.storageWarning = t("storageUnavailable", { message: error.message });
      state.storageReady = false;
    } finally {
      update();
    }
  }

  async function restoreCurrentProject() {
    const document = await readCurrentProjectDocument();
    if (!document) return;

    if (typeof document.markdown !== "string" || !document.manifest) {
      state.storageWarning = t("storedProjectInvalid", { message: "invalid document" });
      return;
    }

    const storedAssets = await readStoredAssets(document.assetIds || []);
    const assetRecords = storedAssets.records.map((asset) => ({
      id: asset.id,
      path: asset.path,
      filename: asset.filename,
      mime: asset.mime,
      size: asset.size,
      hash: asset.hash,
      dataUrl: asset.dataUrl,
      lastModified: asset.lastModified || 0,
    }));

    state.project = createProjectFromMarkdown(document.markdown, assetRecords, document.manifest);
    setEditorValueWithoutUpdate(document.markdown);
    if (storedAssets.missing.length) {
      state.storageWarning = t("missingAssetRecords", {
        count: storedAssets.missing.length,
        plural: storedAssets.missing.length === 1 ? "" : "s",
      });
    } else {
      state.storageWarning = "";
    }
  }

  async function readCurrentProjectDocument() {
    const transaction = state.db.transaction(projectStorage.documentStore, "readonly");
    const store = transaction.objectStore(projectStorage.documentStore);
    const document = await idbRequest(store.get(projectStorage.currentProjectId));
    if (document) return document;
    return readLocalProjectSnapshot();
  }

  function readLocalProjectSnapshot() {
    try {
      const snapshot = localStorage.getItem(projectStorage.localSnapshotKey);
      if (!snapshot) return null;
      const document = JSON.parse(snapshot);
      return document?.id === projectStorage.currentProjectId ? document : null;
    } catch (_error) {
      return null;
    }
  }

  async function readStoredAssets(assetIds) {
    const transaction = state.db.transaction(projectStorage.assetStore, "readonly");
    const store = transaction.objectStore(projectStorage.assetStore);
    const records = [];
    const missing = [];

    for (const assetId of assetIds) {
      const asset = await idbRequest(store.get(assetId));
      if (asset) {
        records.push(asset);
      } else {
        missing.push(assetId);
      }
    }

    return { records, missing };
  }

  function scheduleProjectSave() {
    if (!state.storageReady || state.project.mode !== "project" || !state.deck) return;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      state.saveTimer = 0;
      saveCurrentProject().catch((error) => {
        state.storageWarning = t("saveProjectFailed", { message: error.message });
        render();
      });
    }, 250);
  }

  async function saveCurrentProject() {
    const assets = [...state.project.assets.values()];
    const assetIds = assets.map((asset) => asset.id);
    const documentRecord = {
      id: projectStorage.currentProjectId,
      manifest: state.project.manifest,
      markdown: state.markdown,
      assetIds,
      updatedAt: new Date().toISOString(),
    };
    const transaction = state.db.transaction([projectStorage.documentStore, projectStorage.assetStore], "readwrite");
    const documents = transaction.objectStore(projectStorage.documentStore);
    const assetStore = transaction.objectStore(projectStorage.assetStore);

    documents.put(documentRecord);
    localStorage.setItem(projectStorage.localSnapshotKey, JSON.stringify(documentRecord));

    assets.forEach((asset) => {
      assetStore.put({
        ...asset,
        projectId: projectStorage.currentProjectId,
      });
    });

    await idbTransactionComplete(transaction);
    if (state.storageWarning.startsWith(t("saveProjectFailed", { message: "" }))) {
      state.storageWarning = "";
      render();
    }
  }

  async function clearCurrentProjectStorage() {
    localStorage.removeItem(projectStorage.localSnapshotKey);
    if (!state.storageReady) return;
    const transaction = state.db.transaction([projectStorage.documentStore, projectStorage.assetStore], "readwrite");
    transaction.objectStore(projectStorage.documentStore).delete(projectStorage.currentProjectId);
    const assetStore = transaction.objectStore(projectStorage.assetStore);
    const index = assetStore.index("projectId");
    const request = index.openCursor(IDBKeyRange.only(projectStorage.currentProjectId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    await idbTransactionComplete(transaction);
  }

  function resolveProjectAssetUrl(source) {
    if (state.project.mode !== "project") return source;
    if (/^(data:|https?:|blob:|#|mailto:)/i.test(source)) return source;
    const normalized = normalizeAssetPath(source);
    const asset = state.project.assets.get(normalized);
    if (asset) return asset.dataUrl;
    if (isProjectAssetReference(normalized)) return "";
    return source;
  }

  function normalizeAssetPath(path) {
    return path
      .replace(/^\.\/+/, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");
  }

  function removePageBackgroundCss(css) {
    return css
      .split("}")
      .map((rule) => rule.trim())
      .filter(Boolean)
      .map((rule) => {
        const parts = rule.split("{");
        if (parts.length < 2) return rule;
        const selectors = parts.shift().trim();
        let declarations = parts.join("{").trim();
        const hasPageSelector = selectors.split(",").some((selector) => selector.trim() === ":page");
        if (!hasPageSelector) return `${selectors} {\n${declarations}\n}`;
        declarations = declarations
          .split(";")
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .filter((declaration) => !/^background-color\s*:/i.test(declaration))
          .map((declaration) => `  ${declaration};`)
          .join("\n");
        return declarations ? `${selectors} {\n${declarations}\n}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function setTheme(theme) {
    if (["clean", "contrast", "paper"].includes(theme)) {
      const nextCss = removePageBackgroundCss(elements.customCssEditor.value);
      if (nextCss !== elements.customCssEditor.value.trim()) {
        clearTimeout(updateTimer);
        setCustomCss(nextCss);
      }
    }
    setFrontmatterValue("theme", theme);
  }

  function setSize(size) {
    setFrontmatterValue("size", size);
  }

  function setCustomCss(css) {
    const markdown = getEditorValue();
    const parts = splitFrontmatterBlock(markdown);
    const withoutCss = parts.body.replace(/^\s*<style>\n[\s\S]*?\n<\/style>\s*/i, "");
    const nextMarkdown = css.trim()
      ? `${parts.frontmatter}<style>\n${css.trim()}\n</style>\n\n${withoutCss.trimStart()}`
      : `${parts.frontmatter}${withoutCss.trimStart()}`;
    setEditorValue(nextMarkdown);
  }

  function renderCssBuilderProperties() {
    if (!elements.customCssProperty) return;
    const previous = elements.customCssProperty.value;
    const options = elements.customCssTarget.value === "page" ? pageCssBuilderProperties : textCssBuilderProperties;
    elements.customCssProperty.replaceChildren(...options.map((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = t(option.label);
      return item;
    }));
    elements.customCssProperty.value = options.some((option) => option.value === previous) ? previous : options[0].value;
    updateCssColorPickerState();
  }

  function isCssColorProperty(property) {
    return property === "color" || property === "background-color";
  }

  function normalizeHexColor(value) {
    const trimmed = value.trim();
    const shortHex = trimmed.match(/^#([0-9a-f]{3})$/i);
    if (shortHex) {
      return `#${shortHex[1].split("").map((part) => part + part).join("")}`.toLowerCase();
    }
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : "";
  }

  function updateCssColorPickerState() {
    const isColor = isCssColorProperty(elements.customCssProperty.value);
    elements.customCssColor.hidden = !isColor;
    elements.customCssColor.disabled = !isColor;
    if (!isColor) return;
    const hex = normalizeHexColor(elements.customCssValue.value);
    if (hex) elements.customCssColor.value = hex;
  }

  function chooseCssColor() {
    elements.customCssValue.value = elements.customCssColor.value;
    elements.customCssValue.focus();
  }

  function openCssColorPicker() {
    if (!isCssColorProperty(elements.customCssProperty.value)) return;
    try {
      if (typeof elements.customCssColor.showPicker === "function") {
        elements.customCssColor.showPicker();
        return;
      }
      elements.customCssColor.click();
    } catch {
      // Some browsers only allow opening the native picker from direct user activation.
    }
  }

  function normalizeCssBuilderValue(property, value) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (
      ["font-size", "letter-spacing", "padding-top", "padding-bottom", "padding-left", "padding-right"].includes(property)
      && /^-?\d+(\.\d+)?$/.test(trimmed)
    ) {
      return `${trimmed}px`;
    }
    return trimmed;
  }

  function createCssBuilderRule(target, property, value) {
    if (target === "page") {
      const selector = property === "background-color" ? ":page" : ":page-content";
      return `${selector} {\n  ${property}: ${value};\n}`;
    }
    return `${target} {\n  ${property}: ${value};\n}`;
  }

  function addCustomCssRule() {
    const selector = elements.customCssTarget.value;
    const property = elements.customCssProperty.value;
    const value = normalizeCssBuilderValue(property, elements.customCssValue.value);
    if (!value) {
      elements.customCssStatus.textContent = t("customCssValueRequired");
      elements.customCssStatus.classList.add("warning");
      elements.customCssValue.focus();
      return;
    }

    const rule = createCssBuilderRule(selector, property, value);
    const currentCss = elements.customCssEditor.value.trim();
    const nextCss = currentCss ? `${currentCss}\n\n${rule}` : rule;
    clearTimeout(updateTimer);
    elements.customCssEditor.value = nextCss;
    elements.customCssValue.value = "";
    elements.customCssStatus.classList.remove("warning");
    if (selector === "page" && state.deck.meta.theme !== "custom") {
      setTheme("custom");
    }
    setCustomCss(nextCss);
  }

  function clearCustomCssRules() {
    clearTimeout(updateTimer);
    elements.customCssValue.value = "";
    elements.customCssStatus.classList.remove("warning");
    setCustomCss("");
  }

  function splitFrontmatterBlock(markdown) {
    if (!markdown.startsWith("---\n")) return { frontmatter: "", body: markdown };
    const end = markdown.indexOf("\n---", 4);
    if (end === -1) return { frontmatter: "", body: markdown };
    return {
      frontmatter: `${markdown.slice(0, end + 4).trim()}\n\n`,
      body: markdown.slice(end + 4).replace(/^\n+/, ""),
    };
  }

  function setFrontmatterValue(key, value) {
    const markdown = getEditorValue();
    if (markdown.startsWith("---\n")) {
      const end = markdown.indexOf("\n---", 4);
      if (end !== -1) {
        const frontmatter = markdown.slice(4, end);
        const body = markdown.slice(end);
        const keyPattern = new RegExp(`^${key}:\\s*.*$`, "m");
        const nextFrontmatter = keyPattern.test(frontmatter)
          ? frontmatter.replace(keyPattern, `${key}: ${value}`)
          : `${frontmatter.trim()}\n${key}: ${value}\n`;
        setEditorValue(`---\n${nextFrontmatter.trim()}\n${body}`);
        return;
      }
    }
    setEditorValue(`---\n${key}: ${value}\n---\n\n${markdown}`);
  }

  function parseColumnRatio(value) {
    const match = value.trim().match(/^(\d+)\s*:\s*(\d+)$/);
    if (!match) return null;
    const left = Number(match[1]);
    const right = Number(match[2]);
    if (left <= 0 || right <= 0 || left + right !== 10) return null;
    return `${left}:${right}`;
  }

  function openColumnsDialog() {
    closeToolbarMenus();
    elements.columnsRatio.value = "5:5";
    elements.columnsSummary.textContent = t("columnsSummary");
    elements.columnsSummary.classList.remove("warning");
    elements.columnsDialog.hidden = false;
    elements.columnsRatio.focus();
    elements.columnsRatio.select();
  }

  function closeColumnsDialog() {
    elements.columnsDialog.hidden = true;
  }

  function insertColumnsBlock() {
    const ratio = parseColumnRatio(elements.columnsRatio.value);
    if (!ratio) {
      elements.columnsSummary.textContent = t("columnsRatioInvalid");
      elements.columnsSummary.classList.add("warning");
      elements.columnsRatio.focus();
      return;
    }
    insertAtCursor(`\n:::columns ${ratio}\n:::column\nLeft column content.\n\n:::column\nRight column content.\n:::end\n`);
    closeColumnsDialog();
  }

  function insertBlankBlock() {
    closeToolbarMenus();
    insertAtCursor("\n:::blank 24px\n:::\n");
  }

  function insertDividerBlock() {
    closeToolbarMenus();
    insertAtCursor("\n:::divider\n:::\n");
  }

  function insertAlignBlock(alignment) {
    closeToolbarMenus();
    const label = alignment === "center" ? "middle" : alignment;
    insertAtCursor(`\n:::align ${alignment}\n${label} aligned content.\n:::end\n`);
  }

  function openChartDialog() {
    closeToolbarMenus();
    elements.chartKind.value = "bar";
    elements.chartDirection.value = "horizontal";
    elements.chartUnit.value = "10";
    renderChartDialog();
    elements.chartDialog.hidden = false;
  }

  function closeChartDialog() {
    elements.chartDialog.hidden = true;
  }

  function renderChartDialog() {
    const kind = elements.chartKind.value;
    const isCustom = kind === "custom";
    const isProgress = kind === "progress";
    elements.chartDirectionField.hidden = isCustom || isProgress;
    elements.chartUnitField.hidden = isCustom;
    elements.chartUnitLabel.textContent = kind === "dot" ? t("valuePerPoint") : t("valuePerBar");
  }

  function insertBasicChartBlock() {
    const kind = elements.chartKind.value;
    if (kind === "custom") {
      insertAtCursor(`\n\`\`\`text\n 80 |              ●       ●\n 70 |              |       |\n 60 |          ●   |   ●   |\n 50 |          |   |   |   |\n 40 |      ●   |   |   |   |\n 30 |      |   |   |   |   |\n 20 |  ●   |   |   |   |   |\n    +----------------------------\n      Jan Feb Mar Apr May Jun\n\`\`\`\n`);
      closeChartDialog();
      return;
    }

    const unit = Math.max(1, Number(elements.chartUnit.value) || 10);
    const direction = elements.chartDirection.value;
    const type = kind === "progress"
      ? "progress-bar"
      : `${direction}-${kind === "dot" ? "point" : "bar"}`;
    const unitKey = kind === "dot" ? "value-per-point" : "value-per-bar";
    const caption = kind === "dot" ? "Dot Chart" : kind === "progress" ? "Progress" : "Bar Chart";
    insertAtCursor(`\n\`\`\`slip-chart\ntype: ${type}\n${unitKey}: ${unit}\ncaption: "${caption}"\ndata: {"A": 30, "B": 50}\n\`\`\`\n`);
    closeChartDialog();
  }

  function autoSplitMarkdown() {
    const markdown = getEditorValue();
    const draft = createAutoSplitDraft(markdown);
    if (draft.error) {
      elements.status.textContent = t(draft.error);
      elements.status.classList.add("warning");
      return;
    }
    state.autoSplitDraft = draft;
    renderAutoSplitDialog(draft);
  }

  function createAutoSplitDraft(markdown) {
    const parsed = parseDeck(markdown);
    if (parsed.slides.length > 1) {
      return { error: "autoSplitSkippedSeparators" };
    }

    const parts = splitFrontmatterBlock(markdown);
    const customCss = extractCustomCss(parts.body);
    const sections = splitMarkdownSections(customCss.body.trim());
    if (sections.length <= 1) {
      return { error: "autoSplitNeedsHeadings" };
    }

    const slides = sections.flatMap((section) => splitOversizedSection(section));
    const styleBlock = customCss.css ? `<style>\n${customCss.css}\n</style>\n\n` : "";
    const nextMarkdown = `${parts.frontmatter}${styleBlock}${slides.join("\n\n---\n\n")}`;
    return {
      markdown: nextMarkdown,
      slides: slides.map((slide, index) => ({
        index,
        title: extractTitle(slide) || `Slide ${index + 1}`,
        lineCount: slide.split("\n").filter((line) => line.trim()).length,
      })),
    };
  }

  function splitMarkdownSections(markdown) {
    const sections = [];
    let current = [];
    markdown.split("\n").forEach((line) => {
      if (/^#{1,2}\s+/.test(line) && current.some((item) => item.trim())) {
        sections.push(current.join("\n").trim());
        current = [line];
      } else {
        current.push(line);
      }
    });
    if (current.some((line) => line.trim())) sections.push(current.join("\n").trim());
    return sections.filter(Boolean);
  }

  function splitOversizedSection(section) {
    const maxContentLines = 12;
    const lines = section.split("\n");
    const heading = lines[0]?.match(/^(#{1,2})\s+(.+)$/);
    const contentLines = heading ? lines.slice(1) : lines;
    const contentCount = contentLines.filter((line) => line.trim()).length;
    if (contentCount <= maxContentLines) return [section];

    const chunks = [];
    let chunk = [];
    contentLines.forEach((line) => {
      if (chunk.filter((item) => item.trim()).length >= maxContentLines && !line.trim()) {
        chunks.push(chunk.join("\n").trim());
        chunk = [];
        return;
      }
      chunk.push(line);
      if (chunk.filter((item) => item.trim()).length >= maxContentLines + 3) {
        chunks.push(chunk.join("\n").trim());
        chunk = [];
      }
    });
    if (chunk.some((line) => line.trim())) chunks.push(chunk.join("\n").trim());

    if (!heading) return chunks;
    return chunks.map((chunkBody, index) => {
      const title = index === 0 ? heading[2] : `${heading[2]} (continued)`;
      return `${heading[1]} ${title}\n\n${chunkBody}`.trim();
    });
  }

  function renderAutoSplitDialog(draft) {
    elements.autoSplitSummary.textContent = t("autoSplitSummary", { count: draft.slides.length });
    elements.autoSplitList.innerHTML = "";
    draft.slides.forEach((slide) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="split-review-index">${slide.index + 1}</span>
        <span class="split-review-title">${escapeHtml(slide.title)}</span>
        <span class="split-review-meta">${escapeHtml(t("lineCount", { count: slide.lineCount }))}</span>`;
      elements.autoSplitList.appendChild(item);
    });
    elements.autoSplitDialog.hidden = false;
  }

  function acceptAutoSplit() {
    if (!state.autoSplitDraft) return;
    setEditorValue(state.autoSplitDraft.markdown);
    elements.status.textContent = t("autoSplitApplied", { count: state.autoSplitDraft.slides.length });
    elements.status.classList.remove("warning");
    closeAutoSplitDialog();
  }

  function closeAutoSplitDialog() {
    state.autoSplitDraft = null;
    elements.autoSplitDialog.hidden = true;
  }

  function openPresentation(mode) {
    state.presentationOpen = true;
    state.presentationMode = mode;
    state.presentationStartedAt = Date.now();
    elements.presentation.classList.toggle("presentation-mirror", mode === "mirror");
    elements.presentation.classList.toggle("presentation-presenter", mode === "presenter");
    updatePresentationSizeClass(state.deck.meta.size);
    elements.presentation.hidden = false;
    elements.app.setAttribute("aria-hidden", "true");
    startPresentationTimer();
    renderPresentation();
  }

  function updatePresentationSizeClass(size) {
    elements.presentation.classList.toggle("presentation-size-a4", size === "a4");
    elements.presentation.classList.toggle("presentation-size-widescreen", size !== "a4");
  }

  function closePresentation() {
    state.presentationOpen = false;
    stopPresentationTimer();
    closePresentationWebPanel();
    elements.presentation.hidden = true;
    elements.app.removeAttribute("aria-hidden");
  }

  function renderPresentation() {
    const deck = state.deck;
    const slide = deck.slides[state.activeSlide] || deck.slides[0];
    const nextSlide = deck.slides[state.activeSlide + 1];
    const theme = supportedThemes.includes(deck.meta.theme) ? deck.meta.theme : "clean";
    elements.presentationSlide.innerHTML = slideHtml(slide, theme, deck.meta.size);
    scalePresentationSlide();
    elements.presentationNext.innerHTML = nextSlide
      ? slideHtml(nextSlide, theme, deck.meta.size)
      : `<div class="presentation-end">${escapeHtml(t("endOfDeck"))}</div>`;
    elements.presentationCount.textContent = `${state.activeSlide + 1} / ${deck.slides.length}`;
    elements.presentationNotes.textContent = slide.notes || t("noSpeakerNotesSentence");
    updatePresentationTimer();
  }

  function scalePresentationSlide() {
    const size = slideSizes[state.deck?.meta.size] || slideSizes.widescreen;
    const slide = elements.presentationSlide.querySelector(".slide");
    if (!slide) return;
    const availableWidth = elements.presentationSlide.clientWidth;
    const availableHeight = elements.presentationSlide.clientHeight;
    const scale = Math.min(availableWidth / size.width, availableHeight / size.height);
    slide.style.transform = `scale(${scale})`;
  }

  function startPresentationTimer() {
    stopPresentationTimer();
    state.presentationTimer = window.setInterval(updatePresentationTimer, 1000);
  }

  function stopPresentationTimer() {
    if (state.presentationTimer) {
      window.clearInterval(state.presentationTimer);
      state.presentationTimer = 0;
    }
  }

  function updatePresentationTimer() {
    if (!state.presentationStartedAt) {
      elements.presentationTimer.textContent = "00:00";
      return;
    }
    const elapsed = Math.max(0, Math.floor((Date.now() - state.presentationStartedAt) / 1000));
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    elements.presentationTimer.textContent = `${minutes}:${seconds}`;
  }

  function getExternalWebUrl(rawHref) {
    try {
      const url = new URL(rawHref, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function openPresentationWebPanel(rawHref) {
    const url = getExternalWebUrl(rawHref);
    if (!url) return;
    state.presentationWebUrl = url;
    elements.presentationWebFrame.src = url;
    elements.presentationWebPanel.hidden = false;
  }

  function closePresentationWebPanel() {
    state.presentationWebUrl = "";
    elements.presentationWebFrame.removeAttribute("src");
    elements.presentationWebPanel.hidden = true;
  }

  function openPresentationWebInNewTab() {
    if (!state.presentationWebUrl) return;
    window.open(state.presentationWebUrl, "_blank", "noopener,noreferrer");
  }

  function handlePresentationLinkClick(event) {
    const link = event.target.closest("a[href]");
    if (!link || !elements.presentationSlide.contains(link)) return;
    const url = getExternalWebUrl(link.getAttribute("href"));
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    openPresentationWebPanel(url);
  }

  function movePresentation(delta) {
    if (!state.presentationOpen) return;
    state.activeSlide = Math.max(0, Math.min(state.deck.slides.length - 1, state.activeSlide + delta));
    renderPresentation();
    renderOutline(state.deck);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      if (!confirmDiscardUnsavedCloudChanges()) return;
      state.project = createSingleFileProject();
      clearCloudBinding();
      clearCurrentProjectStorage().catch((error) => {
        state.storageWarning = t("clearProjectFailed", { message: error.message });
      });
      setEditorValue(String(reader.result || ""));
    };
    reader.readAsText(file);
  }

  async function importProjectPackage(file) {
    if (!confirmDiscardUnsavedCloudChanges()) return;
    try {
      const projectPackage = await readProjectPackage(file);
      const assetRecords = await Promise.all(projectPackage.assetBlobs.map((asset) => (
        createAssetRecordFromBlob(asset.blob, asset.path, asset.metadata)
      )));

      state.project = createProjectFromMarkdown(projectPackage.markdown, assetRecords, projectPackage.manifest);
      clearCloudBinding();
      resetAssetPanelPaging();
      setEditorValue(projectPackage.markdown);
      elements.status.textContent = t("packageImported", {
        count: assetRecords.length,
        plural: assetRecords.length === 1 ? "" : "s",
      });
      elements.status.classList.remove("warning");
    } catch (error) {
      elements.status.textContent = t("packageImportFailed", { message: error.message });
      elements.status.classList.add("warning");
    }
  }

  async function importProjectPackageBlob(blob) {
    const projectPackage = await readProjectPackage(blob);
    const assetRecords = await Promise.all(projectPackage.assetBlobs.map((asset) => (
      createAssetRecordFromBlob(asset.blob, asset.path, asset.metadata)
    )));

    state.project = createProjectFromMarkdown(projectPackage.markdown, assetRecords, projectPackage.manifest);
    resetAssetPanelPaging();
    setEditorValue(projectPackage.markdown);
  }

  async function createAssetRecord(file, path) {
    const dataUrl = await readFileAsDataUrl(file);
    const hash = hashString(dataUrl);
    return {
      id: createAssetId(path, hash),
      path,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      hash,
      dataUrl,
      lastModified: file.lastModified || 0,
    };
  }

  async function createAssetRecordFromBlob(blob, path, metadata = {}) {
    const filename = path.split("/").pop() || metadata.filename || "asset";
    const mime = metadata.mime || blob.type || inferMimeType(filename);
    const dataUrl = await readBlobAsDataUrl(blob.type === mime ? blob : new Blob([blob], { type: mime }));
    const hash = hashString(dataUrl);
    return {
      id: metadata.id || createAssetId(path, hash),
      path,
      filename: metadata.filename || filename,
      mime,
      size: blob.size,
      hash,
      dataUrl,
      lastModified: 0,
    };
  }

  async function importAssetFiles(fileList) {
    if (state.project.mode !== "project") {
      elements.status.textContent = t("projectizeBeforeAssets");
      elements.status.classList.add("warning");
      return;
    }

    const files = [...fileList];
    if (!files.length) return;

    const records = await Promise.all(files.map(async (file) => {
      const path = uniqueAssetPath(file.name);
      return createAssetRecord(file, path);
    }));

    records.forEach((asset) => state.project.assets.set(asset.path, asset));
    resetAssetPanelPaging();
    syncProjectFromDeck();
    render();
    scheduleProjectSave();
    const duplicateCount = records.filter((asset) => [...state.project.assets.values()].some((item) => item.path !== asset.path && item.hash === asset.hash)).length;
    elements.status.textContent = t("assetsAdded", {
      count: records.length,
      plural: records.length === 1 ? "" : "s",
      duplicateText: duplicateCount ? t("duplicateFlagged", {
        count: duplicateCount,
        plural: duplicateCount === 1 ? "" : "s",
      }) : "",
    });
    elements.status.classList.toggle("warning", duplicateCount > 0);
  }

  function uniqueAssetPath(filename) {
    const safeName = sanitizeFilename(filename);
    const dot = safeName.lastIndexOf(".");
    const base = dot > 0 ? safeName.slice(0, dot) : safeName;
    const extension = dot > 0 ? safeName.slice(dot) : "";
    let candidate = `assets/${safeName}`;
    let index = 2;
    while (state.project.assets.has(candidate)) {
      candidate = `assets/${base}-${index}${extension}`;
      index += 1;
    }
    return candidate;
  }

  function sanitizeFilename(filename) {
    const fallback = "asset";
    const cleaned = filename
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return cleaned || fallback;
  }

  function handleAssetAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "show-more-assets") {
      state.assetVisibleLimit += 60;
      renderAssetPanel();
      return;
    }
    const item = button.closest(".asset-item");
    const asset = state.project.assets.get(item?.dataset.assetPath || "");
    if (!asset) return;

    if (button.dataset.action === "insert") toggleAssetInsertMenu(item);
    if (button.dataset.action === "insert-sized") insertAssetReference(asset, button.dataset.width || "");
    if (button.dataset.action === "insert-custom") {
      const width = normalizeImageWidth(item.querySelector(".asset-custom-width")?.value || "");
      if (width) insertAssetReference(asset, width);
    }
    if (button.dataset.action === "rename") startInlineAssetRename(asset, item);
    if (button.dataset.action === "remove") removeAsset(asset);
  }

  function handleAssetListKeydown(event) {
    if (event.key !== "Enter" || !event.target.classList.contains("asset-custom-width")) return;
    const item = event.target.closest(".asset-item");
    const asset = state.project.assets.get(item?.dataset.assetPath || "");
    const width = normalizeImageWidth(event.target.value || "");
    if (!asset || !width) return;
    event.preventDefault();
    insertAssetReference(asset, width);
  }

  function toggleAssetInsertMenu(item) {
    const menu = item?.querySelector(".asset-insert-menu");
    if (!menu) return;
    clearTimeout(updateTimer);
    elements.assetList.querySelectorAll(".asset-insert-menu").forEach((otherMenu) => {
      if (otherMenu !== menu) otherMenu.hidden = true;
    });
    menu.hidden = !menu.hidden;
    if (!menu.hidden) menu.querySelector(".asset-custom-width")?.focus();
  }

  function normalizeImageWidth(value) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
    if (/^\d+(\.\d+)?(px|%)$/i.test(trimmed)) return trimmed;
    return "";
  }

  function insertAssetReference(asset, width = "") {
    const sizeAttribute = width ? `{width=${width}}` : "";
    insertAtCursor(`\n![${asset.filename}](${asset.path})${sizeAttribute}\n`);
  }

  function startInlineAssetRename(asset, item) {
    const nameElement = item?.querySelector(".asset-name");
    if (!nameElement) return;
    clearTimeout(updateTimer);
    const input = document.createElement("input");
    input.className = "asset-name-input";
    input.type = "text";
    input.value = asset.filename;
    input.setAttribute("aria-label", t("rename"));
    nameElement.replaceChildren(input);
    input.focus();
    input.select();

    let completed = false;
    const finish = (shouldCommit) => {
      if (completed) return;
      completed = true;
      if (shouldCommit) {
        renameAsset(asset, input.value);
        return;
      }
      renderAssetPanel();
    };

    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
  }

  function renameAsset(asset, nextName) {
    if (!nextName.trim()) {
      renderAssetPanel();
      return;
    }
    if (sanitizeFilename(nextName) === asset.filename) {
      renderAssetPanel();
      return;
    }
    const nextPath = uniqueAssetPath(nextName);
    if (nextPath === asset.path) {
      renderAssetPanel();
      return;
    }

    const oldPath = asset.path;
    const usage = markdownAssetCount(state.markdown, oldPath);
    state.project.assets.delete(asset.path);
    state.project.assets.set(nextPath, {
      ...asset,
      path: nextPath,
      filename: nextPath.split("/").pop(),
      id: createAssetId(nextPath, asset.hash),
    });
    syncProjectFromDeck();
    updateMarkdownAfterAssetRename(oldPath, nextPath);
    elements.status.textContent = t("renamedAsset", {
      path: nextPath,
      referenceText: usage ? t("updatedReferences", {
        count: usage,
        plural: usage === 1 ? "" : "s",
      }) : "",
    });
    elements.status.classList.remove("warning");
  }

  function removeAsset(asset) {
    const usage = countAssetUsage(state.markdown).get(asset.path) || 0;
    if (usage > 0 && !window.confirm(t("removeReferencedAssetConfirm", {
      count: usage,
      plural: usage === 1 ? "" : "s",
    }))) {
      return;
    }
    state.project.assets.delete(asset.path);
    syncProjectFromDeck();
    render();
    scheduleProjectSave();
    elements.status.textContent = usage
      ? t("removedReferencedAsset", { filename: asset.filename, count: usage, plural: usage === 1 ? "" : "s" })
      : t("removedAsset", { filename: asset.filename });
    elements.status.classList.toggle("warning", usage > 0);
  }

  function createAssetId(path, hash) {
    return `asset-${hash}-${slugify(path.split("/").pop() || "file")}`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read packaged asset."));
      reader.readAsDataURL(blob);
    });
  }

  function inferMimeType(filename) {
    const extension = filename.toLowerCase().split(".").pop();
    if (extension === "svg") return "image/svg+xml";
    if (extension === "png") return "image/png";
    if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
    if (extension === "gif") return "image/gif";
    if (extension === "webp") return "image/webp";
    return "application/octet-stream";
  }

  function setMenuOpen(button, menu, open) {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function closeToolbarMenus() {
    setMenuOpen(elements.importMenuButton, elements.importMenuOptions, false);
    setMenuOpen(elements.exportMenuButton, elements.exportMenuOptions, false);
    setMenuOpen(elements.cloudMenuButton, elements.cloudMenuOptions, false);
    setMenuOpen(elements.insertMenuButton, elements.insertMenuOptions, false);
    setMenuOpen(elements.aiToolsMenuButton, elements.aiToolsMenuOptions, false);
    setMenuOpen(elements.presentMenuButton, elements.presentMenuOptions, false);
  }

  function toggleToolbarMenu(button, menu) {
    const shouldOpen = menu.hidden;
    closeToolbarMenus();
    setMenuOpen(button, menu, shouldOpen);
  }

  function insertAtCursor(text) {
    const selection = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
      scrollIntoView: true,
    });
    editorView.focus();
    clearTimeout(updateTimer);
    update();
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      insertAtCursor(`\n![${file.name}](${reader.result})\n`);
      if (file.size > 1_000_000) {
        elements.status.textContent = t("largeDroppedImage");
        elements.status.classList.add("warning");
      }
    };
    reader.readAsDataURL(file);
  }

  elements.editor.addEventListener("drop", handleDrop);
  elements.editor.addEventListener("dragover", (event) => event.preventDefault());
  elements.languagePicker.addEventListener("change", (event) => {
    i18n.setLanguage(event.target.value);
    applyLanguage();
  });
  elements.newDeck.addEventListener("click", requestNewDeck);
  elements.shareDeck.addEventListener("click", openShareDialog);
  elements.shareClose.addEventListener("click", closeShareDialog);
  elements.shareCreate.addEventListener("click", createShareLink);
  elements.shareCopy.addEventListener("click", copyShareLink);
  elements.shareRevoke.addEventListener("click", revokeShareLink);
  elements.shareCopyToEditor.addEventListener("click", copySharedDeckToEditor);
  elements.shareDialog.addEventListener("click", (event) => {
    if (event.target === elements.shareDialog) closeShareDialog();
  });
  elements.insertMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.insertMenuButton, elements.insertMenuOptions);
  });
  elements.insertColumns.addEventListener("click", openColumnsDialog);
  elements.insertBasicChart.addEventListener("click", openChartDialog);
  elements.insertBlank.addEventListener("click", insertBlankBlock);
  elements.insertDivider.addEventListener("click", insertDividerBlock);
  elements.alignMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.alignMenuButton, elements.alignMenuOptions);
  });
  [elements.alignLeft, elements.alignCenter, elements.alignRight].forEach((button) => {
    button.addEventListener("click", () => insertAlignBlock(button.dataset.align));
  });
  elements.aiToolsMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.aiToolsMenuButton, elements.aiToolsMenuOptions);
  });
  elements.aiTools.addEventListener("click", () => {
    closeToolbarMenus();
    openAiToolsDialog();
  });
  elements.aiToolsClose.addEventListener("click", closeAiToolsDialog);
  elements.aiPromptMode.addEventListener("change", (event) => {
    state.aiPromptMode = event.target.value;
    renderAiPromptControls();
    markAiPromptStale();
  });
  elements.aiPromptSource.addEventListener("change", (event) => {
    state.aiPromptSource = event.target.value;
    renderAiPromptControls();
    markAiPromptStale();
  });
  [
    elements.aiAudience,
    elements.aiDetail,
    elements.aiSlideDensity,
    elements.aiOutputLanguage,
  ].forEach((element) => element.addEventListener("change", updateAiPreferences));
  elements.aiCustomInstruction.addEventListener("input", updateAiPreferences);
  elements.aiResetPreferences.addEventListener("click", resetAiPreferences);
  elements.aiExternalContent.addEventListener("input", markAiPromptStale);
  elements.aiGeneratePrompt.addEventListener("click", generateAiPrompt);
  elements.aiCopyPrompt.addEventListener("click", copyAiPrompt);
  elements.aiResult.addEventListener("input", renderAiResultReview);
  elements.aiApplyResult.addEventListener("click", applyAiResult);
  elements.aiUndoApply.addEventListener("click", undoAiApply);
  elements.aiToolsDialog.addEventListener("click", (event) => {
    if (event.target === elements.aiToolsDialog) closeAiToolsDialog();
  });
  elements.newDeckConfirm.addEventListener("click", confirmNewDeck);
  elements.newDeckCancel.addEventListener("click", closeNewDeckDialog);
  elements.newDeckDialog.addEventListener("click", (event) => {
    if (event.target === elements.newDeckDialog) closeNewDeckDialog();
  });
  elements.columnsConfirm.addEventListener("click", insertColumnsBlock);
  elements.columnsCancel.addEventListener("click", closeColumnsDialog);
  elements.columnsRatio.addEventListener("keydown", (event) => {
    if (event.key === "Enter") insertColumnsBlock();
  });
  elements.columnsDialog.addEventListener("click", (event) => {
    if (event.target === elements.columnsDialog) closeColumnsDialog();
  });
  elements.chartKind.addEventListener("change", renderChartDialog);
  elements.chartConfirm.addEventListener("click", insertBasicChartBlock);
  elements.chartCancel.addEventListener("click", closeChartDialog);
  elements.chartDialog.addEventListener("click", (event) => {
    if (event.target === elements.chartDialog) closeChartDialog();
  });
  elements.importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importFile(file);
    event.target.value = "";
    closeToolbarMenus();
  });
  elements.importPackage.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) importProjectPackage(file);
    event.target.value = "";
    closeToolbarMenus();
  });
  elements.assetImport.addEventListener("change", (event) => {
    if (event.target.files.length) importAssetFiles(event.target.files);
    event.target.value = "";
  });
  elements.assetList.addEventListener("click", handleAssetAction);
  elements.assetList.addEventListener("keydown", handleAssetListKeydown);
  elements.assetSort.addEventListener("change", (event) => {
    state.assetSort = event.target.value;
    resetAssetPanelPaging();
    renderAssetPanel();
  });
  elements.importMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.importMenuButton, elements.importMenuOptions);
  });
  elements.projectize.addEventListener("click", openProjectizeDialog);
  elements.projectizeConfirm.addEventListener("click", confirmProjectize);
  elements.projectizeCancel.addEventListener("click", closeProjectizeDialog);
  elements.projectizeDialog.addEventListener("click", (event) => {
    if (event.target === elements.projectizeDialog) closeProjectizeDialog();
  });
  elements.embeddedExportClose.addEventListener("click", closeEmbeddedExportDialog);
  elements.embeddedExportOk.addEventListener("click", closeEmbeddedExportDialog);
  elements.embeddedExportDialog.addEventListener("click", (event) => {
    if (event.target === elements.embeddedExportDialog) closeEmbeddedExportDialog();
  });
  elements.exportMd.addEventListener("click", () => {
    exportMarkdown();
    closeToolbarMenus();
  });
  elements.exportSelfContainedMd.addEventListener("click", () => {
    exportSelfContainedMarkdown();
    closeToolbarMenus();
  });
  elements.exportProjectPackage.addEventListener("click", () => {
    exportProjectPackage();
    closeToolbarMenus();
  });
  elements.exportMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.exportMenuButton, elements.exportMenuOptions);
  });
  elements.cloudMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.cloudMenuButton, elements.cloudMenuOptions);
  });
  elements.cloudOpen.addEventListener("click", openCloudPicker);
  elements.cloudSave.addEventListener("click", saveCloudFile);
  elements.cloudSaveAs.addEventListener("click", openCloudSaveDialog);
  elements.cloudGoogle.addEventListener("click", () => {
    startCloudAuth("google");
  });
  elements.cloudMicrosoft.addEventListener("click", () => {
    startCloudAuth("microsoft");
  });
  elements.cloudDisconnect.addEventListener("click", disconnectCloudSession);
  elements.cloudAuthClose.addEventListener("click", closeCloudAuthDialog);
  elements.cloudAuthOk.addEventListener("click", closeCloudAuthDialog);
  elements.cloudAuthDialog.addEventListener("click", (event) => {
    if (event.target === elements.cloudAuthDialog) closeCloudAuthDialog();
  });
  elements.cloudOpenClose.addEventListener("click", closeCloudPicker);
  elements.cloudOpenCancel.addEventListener("click", closeCloudPicker);
  elements.cloudRefreshButton.addEventListener("click", refreshCloudFiles);
  elements.cloudSearchButton.addEventListener("click", refreshCloudFiles);
  elements.cloudSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") refreshCloudFiles();
  });
  elements.cloudOpenDialog.addEventListener("click", (event) => {
    if (event.target === elements.cloudOpenDialog) closeCloudPicker();
    const fileButton = event.target.closest(".cloud-file-item");
    if (fileButton) openCloudFile(fileButton.dataset.fileId);
  });
  elements.cloudSaveConfirm.addEventListener("click", confirmCloudSaveAs);
  elements.cloudSaveCancel.addEventListener("click", closeCloudSaveDialog);
  elements.cloudSaveName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") confirmCloudSaveAs();
  });
  elements.cloudSaveDialog.addEventListener("click", (event) => {
    if (event.target === elements.cloudSaveDialog) closeCloudSaveDialog();
  });
  elements.cloudConflictReload.addEventListener("click", reloadCloudConflictRemote);
  elements.cloudConflictDuplicate.addEventListener("click", duplicateCloudConflictLocal);
  elements.cloudConflictOverwrite.addEventListener("click", overwriteCloudConflictRemote);
  elements.cloudConflictCancel.addEventListener("click", closeCloudConflictDialog);
  elements.cloudConflictDialog.addEventListener("click", (event) => {
    if (event.target === elements.cloudConflictDialog) closeCloudConflictDialog();
  });
  elements.autoSplit.addEventListener("click", () => {
    closeToolbarMenus();
    autoSplitMarkdown();
  });
  elements.autoSplitAccept.addEventListener("click", acceptAutoSplit);
  elements.autoSplitCancel.addEventListener("click", closeAutoSplitDialog);
  elements.autoSplitDialog.addEventListener("click", (event) => {
    if (event.target === elements.autoSplitDialog) closeAutoSplitDialog();
  });
  elements.customCssToggle.addEventListener("click", () => {
    elements.customCssPanel.hidden = !elements.customCssPanel.hidden;
  });
  elements.customCssClose.addEventListener("click", () => {
    elements.customCssPanel.hidden = true;
  });
  elements.customCssClear.addEventListener("click", clearCustomCssRules);
  elements.customCssTarget.addEventListener("change", renderCssBuilderProperties);
  elements.customCssProperty.addEventListener("change", () => {
    updateCssColorPickerState();
    openCssColorPicker();
  });
  elements.customCssValue.addEventListener("focus", openCssColorPicker);
  elements.customCssValue.addEventListener("input", updateCssColorPickerState);
  elements.customCssColor.addEventListener("input", chooseCssColor);
  elements.customCssEditor.addEventListener("input", () => {
    clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => setCustomCss(elements.customCssEditor.value), 250);
  });
  elements.customCssAdd.addEventListener("click", addCustomCssRule);
  elements.customCssValue.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustomCssRule();
    }
  });
  elements.printPdf.addEventListener("click", () => {
    closeToolbarMenus();
    window.print();
  });
  elements.presentMenuButton.addEventListener("click", () => {
    toggleToolbarMenu(elements.presentMenuButton, elements.presentMenuOptions);
  });
  elements.presentMirror.addEventListener("click", () => {
    closeToolbarMenus();
    openPresentation("mirror");
  });
  elements.presentSpeaker.addEventListener("click", () => {
    closeToolbarMenus();
    openPresentation("presenter");
  });
  elements.exitPresent.addEventListener("click", closePresentation);
  elements.presentation.addEventListener("click", handlePresentationLinkClick);
  elements.presentationWebOpen.addEventListener("click", openPresentationWebInNewTab);
  elements.presentationWebClose.addEventListener("click", closePresentationWebPanel);
  elements.themePicker.addEventListener("change", (event) => setTheme(event.target.value));
  elements.sizePicker.addEventListener("change", (event) => setSize(event.target.value));
  elements.showNotes.addEventListener("change", (event) => {
    state.showNotes = event.target.checked;
    render();
  });
  elements.preview.addEventListener("scroll", () => {
    if (Date.now() < state.ignorePreviewScrollUntil) return;
    const frames = [...elements.preview.querySelectorAll(".slide-frame")];
    const top = elements.preview.getBoundingClientRect().top;
    const closest = frames
      .map((frame, index) => ({ index, distance: Math.abs(frame.getBoundingClientRect().top - top) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (closest && closest.index !== state.activeSlide) {
      state.activeSlide = closest.index;
      renderOutline(state.deck);
    }
  });
  window.addEventListener("resize", () => {
    scaleSlides();
    if (state.presentationOpen) scalePresentationSlide();
    requestAnimationFrame(detectSlideOverflow);
  });
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedCloudChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("online", retryPendingCloudWrite);
  window.addEventListener("click", (event) => {
    if (!event.target.closest(".toolbar-menu")) closeToolbarMenus();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !state.presentationOpen && !elements.newDeckDialog.hidden) closeNewDeckDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.columnsDialog.hidden) closeColumnsDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.chartDialog.hidden) closeChartDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.projectizeDialog.hidden) closeProjectizeDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.embeddedExportDialog.hidden) closeEmbeddedExportDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.shareDialog.hidden) closeShareDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.aiToolsDialog.hidden) closeAiToolsDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.cloudAuthDialog.hidden) closeCloudAuthDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.cloudOpenDialog.hidden) closeCloudPicker();
    if (event.key === "Escape" && !state.presentationOpen && !elements.cloudSaveDialog.hidden) closeCloudSaveDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.cloudConflictDialog.hidden) closeCloudConflictDialog();
    if (event.key === "Escape" && !state.presentationOpen && !elements.autoSplitDialog.hidden) closeAutoSplitDialog();
    if (event.key === "Escape" && state.presentationOpen && !elements.presentationWebPanel.hidden) {
      closePresentationWebPanel();
      return;
    }
    if (event.key === "Escape" && state.presentationOpen) closePresentation();
    if (event.key === "ArrowRight" || event.key === "PageDown") movePresentation(1);
    if (event.key === "ArrowLeft" || event.key === "PageUp") movePresentation(-1);
  });

  applyLanguage();
  renderCssBuilderProperties();
  initializeSharedRoute();
  initializeCloudAuth();
  if (!state.sharedReadOnly) initializeProjectStorage();
