"use strict";

(function () {
  const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const SANDBOXED_SCRIPTS = 0x80;

  const config = {
    addonID: "zotero-web@zhangxin.local",
    addonName: "Zotero Web",
    addonRef: "zotero_web",
    addonInstance: "ZoteroWeb",
    prefsPrefix: "extensions.zotero.zoteroWeb",
  };

  const ids = {
    css: "zotero-web-sidebar-css",
    toolbarContainer: "zotero-web-toolbar-container",
    toolbarButton: "zotero-web-toolbar-button",
    toolbarTranslateButton: "zotero-web-toolbar-translate-button",
    readerLogoButton: "zotero-web-reader-logo-button",
    readerTranslateButton: "zotero-web-reader-translate-button",
    readerLogoSection: "zotero-web-reader-logo-section",
    toolsMenuItem: "zotero-web-tools-menu-item",
    itemTranslateMenu: "zotero-web-item-translate-menu",
    itemTranslateMenuPopup: "zotero-web-item-translate-menu-popup",
    itemTranslateMetadata: "zotero-web-item-translate-metadata",
    itemTranslatePDF: "zotero-web-item-translate-pdf",
    itemTranslatePDFSummary: "zotero-web-item-translate-pdf-summary",
    modeWebButton: "zotero-web-mode-web-button",
    modeTranslateButton: "zotero-web-mode-translate-button",
    translationPane: "zotero-web-translation-pane",
    translationBrowser: "zotero-web-translation-browser",
    splitter: "zotero-web-sidebar-splitter",
    sidebar: "zotero-web-sidebar",
    brand: "zotero-web-brand",
    header: "zotero-web-sidebar-header",
    address: "zotero-web-address",
    status: "zotero-web-status",
    homeMenuButton: "zotero-web-home-menu-button",
    homeMenuPopup: "zotero-web-home-menu-popup",
    promptMenuButton: "zotero-web-prompt-menu-button",
    promptMenuPopup: "zotero-web-prompt-menu-popup",
    browserWrap: "zotero-web-browser-wrap",
    browser: "zotero-web-browser",
  };

  const DEFAULT_HOMEPAGES = [
    "https://chatgpt.com/",
    "https://chat.deepseek.com/",
  ];

  const sidebarState = new WeakMap();
  let readerToolbarRegistered = false;

  function getPref(key) {
    return Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true);
  }

  function setPref(key, value) {
    Zotero.Prefs.set(`${config.prefsPrefix}.${key}`, value, true);
  }

  function getLogoURL(size) {
    const filename = size ? `logo-${size}.png` : "logo.png";
    return `chrome://${config.addonRef}/content/icons/${filename}`;
  }

  function getTranslateIconURL() {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
      '<rect x="1" y="1" width="18" height="18" rx="4" fill="#2d8aa3"/>' +
      '<text x="10" y="14.3" font-family="Microsoft YaHei, PingFang SC, sans-serif" ' +
      'font-size="11.5" font-weight="700" text-anchor="middle" fill="#ffffff">译</text>' +
      "</svg>";
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function setIconButtonImage(button, size = 64) {
    const url = getLogoURL(size);
    button.setAttribute("image", url);
    button.style.listStyleImage = `url("${url}")`;
  }

  function getLogoDataURL() {
    return (
      "data:image/png;base64," +
      "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAsTAAALEwEAmpwYAAAHGmlUWHRYTUw6Y29tLmFkb2Jl" +
      "LnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4" +
      "bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4wLWMwMDAgNzkuMTcxYzI3ZiwgMjAyMi8w" +
      "OC8xNi0xODowMjo0MyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJk" +
      "Zi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6VEMyNjA9Imh0dHA6Ly93d3cudGMyNjAu" +
      "b3JnLmNuL25zL0FJR0MvMS4wLyIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0" +
      "cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3No" +
      "b3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8v" +
      "bnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIFRDMjYwOkFJR0M9InsmcXVvdDtMYWJlbCZxdW90Ozom" +
      "cXVvdDsxJnF1b3Q7LCZxdW90O0NvbnRlbnRQcm9kdWNlciZxdW90OzomcXVvdDtkb3ViYW8mcXVvdDssJnF1b3Q7UHJvZHVjZUlE" +
      "JnF1b3Q7OiZxdW90OzRhN2E2YmU2ZGNlMjQ1NTJiNmViZWZjZmYwNmNlNzkyJnF1b3Q7LCZxdW90O1Jlc2VydmVkQ29kZTEmcXVv" +
      "dDs6JnF1b3Q7JnF1b3Q7LCZxdW90O0NvbnRlbnRQcm9wYWdhdG9yJnF1b3Q7OiZxdW90OyZxdW90OywmcXVvdDtQcm9wYWdhdGVJ" +
      "RCZxdW90OzomcXVvdDsmcXVvdDssJnF1b3Q7UmVzZXJ2ZWRDb2RlMiZxdW90OzomcXVvdDsmcXVvdDt9IiB4bXA6Q3JlYXRlRGF0" +
      "ZT0iMjAyNi0xMC0yNFQxMjowMDowOSswODowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjYtMTAtMjRUMTI6MTA6MTErMDg6MDAiIHht" +
      "cDpNZXRhZGF0YURhdGU9IjIwMjYtMTAtMjRUMTI6MTA6MTErMDg6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6" +
      "Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjIzZjIyY2RkLWQ0MjUtYWI0MC05N2E3LTY3YjI0ZTNiYTYw" +
      "OCIgeG1wTU06RG9jdW1lbnRJRD0iYWRvYmU6ZG9jaWQ6cGhvdG9zaG9wOmFhZTQyMjgyLWE0NGEtZmM0ZC1hNjA3LTkzMmY5YTFk" +
      "NTNkOSIgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOjhlZTFmYWU3LWZlMjUtNTQ0ZS05NzgzLWZmOTlmNzE4MDU4" +
      "OCI+IDx4bXBNTTpIaXN0b3J5PiA8cmRmOlNlcT4gPHJkZjpsaSBzdEV2dDphY3Rpb249InNhdmVkIiBzdEV2dDppbnN0YW5jZUlE" +
      "PSJ4bXAuaWlkOjhlZTFmYWU3LWZlMjUtNTQ0ZS05NzgzLWZmOTlmNzE4MDU4OCIgc3RFdnQ6d2hlbj0iMjAyNi0xMC0yNFQxMjox" +
      "MDoxMSswODowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI0LjAgKFdpbmRvd3MpIiBzdEV2dDpjaGFu" +
      "Z2VkPSIvIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDoyM2YyMmNkZC1k" +
      "NDI1LWFiNDAtOTdhNy02N2IyNGUzYmE2MDgiIHN0RXZ0OndoZW49IjIwMjYtMTAtMjRUMTI6MTA6MTErMDg6MDAiIHN0RXZ0OnNv" +
      "ZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyNC4wIChXaW5kb3dzKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+" +
      "IDwveG1wTU06SGlzdG9yeT4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9" +
      "InIiPz7rrZiWAAAc60lEQVRoBXXBa7Cu91ke9uu67v/zvO+7zmuvrYMly7KkWD4JKzLCNgbGQBJIMi2QoTPOkKSHNJ20U6YzhUnS" +
      "TIcP6YTWpa0hhU5zYDiEtpPQjgPETiCQOJgAblLwCWzZEpalrdPeW/u09jq87/P87/vqEu23Tn8//shPfkxAxFCws8cwwHZVRGNE" +
      "TjMJiDaD7NVhRAsDAbhgiajee0SDQCrAqfcIVfl89tHW8Ce//kFL1ZG9m6xMDmIxyM5iQmISMkmUC2UpClkFgRLLJsKyyJy7gTaO" +
      "6D0FDdFA2CWFWjjTZUWUqzIZ7JXlEmF6GAaJBC/MVZaNrN6p4AWDRNmtNdsS5Aso2Omyk2UXJacBz1nVU0MziAKgzCrABdtqg8CC" +
      "syoUVFWlXRIhMJQGuptR0RYuEwWwUKIu2J7nGTYlZCUqhgabpF3ViwDIyoJI4g+xsgIyYZsgBBJOS65eEEESEFufN5TIsFGoaIEy" +
      "jYAQQLDm3qIVnM4s5zwNiyXBYm8x1GayDVtZyDSJclYV2RTMrMyKEEVBbRgUzQW+QbYVQcIApdYGlPEGA+hV1TsMwyCKIGkng0wS" +
      "LDuRsRikiBbztKFxofcJlKJZyJ6EEQAYDAajLbLnXLPUmlrapC1IbKLLiSIgOwn03iuraWwxKGTwAoCsJEAKYAwDIbtciKGZMIgL" +
      "ZMEKkUSagOk00kZARKVzmpGI1gqlkIahyqQUMWdWFZyAKg0XDNigTdAo59w3EqUgKRKAXQkKoBS9V4gMbeZNVWbOrjLMkBRz7+Wy" +
      "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" +
      "AAAASUVORK5CYII="
    );
  }

  function createXULElement(doc, tag) {
    if (typeof doc.createXULElement === "function") {
      return doc.createXULElement(tag);
    }
    return doc.createElementNS(XUL_NS, tag);
  }

  function createHTMLElement(doc, tag) {
    return doc.createElementNS(HTML_NS, tag);
  }

  function parsePositiveInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  function getSidebarWidth() {
    return parsePositiveInt(getPref("sidebarWidth"), 520, 320, 1200);
  }

  function parsePrompts() {
    const raw = getPref("prompts") || "[]";
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (prompt) =>
          prompt &&
          typeof prompt.title === "string" &&
          typeof prompt.body === "string",
      );
    } catch (e) {
      Zotero.debug(`[Zotero Web] Invalid prompts pref: ${e}`);
      return [];
    }
  }

  function savePrompts(prompts) {
    setPref("prompts", JSON.stringify(prompts));
  }

  function normalizeURL(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) {
      throw new Error("Please enter a URL.");
    }

    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      value = `https://${value}`;
    }

    const uri = Services.io.newURI(value);
    if (!["http", "https"].includes(uri.scheme)) {
      throw new Error("Only http and https URLs are supported.");
    }
    return uri.spec;
  }

  function getHomepageCandidates() {
    const urls = [];
    const seen = new Set();
    const addURL = (rawURL) => {
      try {
        const url = normalizeURL(rawURL);
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      } catch (e) {
        Zotero.debug(`[Zotero Web] Ignoring invalid homepage: ${e}`);
      }
    };

    const rawHomepages = getPref("homepages");
    if (rawHomepages) {
      try {
        const parsed = JSON.parse(rawHomepages);
        if (Array.isArray(parsed)) {
          parsed.forEach(addURL);
        }
      } catch (e) {
        Zotero.debug(`[Zotero Web] Invalid homepages pref: ${e}`);
      }
    }
    if (urls.length) {
      return urls;
    }

    addURL(getPref("homepage"));
    if (urls.length) {
      return urls;
    }

    DEFAULT_HOMEPAGES.forEach(addURL);
    return urls;
  }

  function getHomepageURL() {
    return getHomepageCandidates()[0] || normalizeURL(DEFAULT_HOMEPAGES[0]);
  }

  function getInitialURL(initialURL) {
    if (initialURL) {
      return normalizeURL(initialURL);
    }

    return getHomepageURL();
  }

  function showStatus(state, message) {
    state.status.setAttribute("value", message);
    state.status.hidden = false;
  }

  function clearStatus(state) {
    state.status.setAttribute("value", "");
    state.status.hidden = true;
  }

  function setButtonDisabled(button, disabled) {
    if (disabled) {
      button.setAttribute("disabled", "true");
    } else {
      button.removeAttribute("disabled");
    }
  }

  function updateNavigationState(state) {
    const browser = state.browser;
    try {
      const webNavigation = browser.webNavigation;
      setButtonDisabled(state.backButton, !webNavigation?.canGoBack);
      setButtonDisabled(state.forwardButton, !webNavigation?.canGoForward);
    } catch (e) {
      setButtonDisabled(state.backButton, true);
      setButtonDisabled(state.forwardButton, true);
    }
  }

  function saveSidebarWidth(state) {
    if (!state || state.sidebar.hidden) {
      return;
    }
    const width = Math.round(state.sidebar.getBoundingClientRect().width);
    if (width >= 320) {
      setPref("sidebarWidth", String(width));
    }
  }

  function loadURL(state, rawURL) {
    let url;
    try {
      url = normalizeURL(rawURL);
    } catch (e) {
      showStatus(state, e.message || String(e));
      return;
    }

    clearStatus(state);
    state.address.value = url;

    try {
      const browser = state.browser;
      if (browser.browsingContext) {
        browser.browsingContext.sandboxFlags &= ~SANDBOXED_SCRIPTS;
      }
      browser.loadURI(Services.io.newURI(url), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      state.hasLoadedURL = true;
      updateNavigationState(state);
    } catch (e) {
      showStatus(state, `Unable to load URL: ${e.message || e}`);
      Zotero.debug(`[Zotero Web] loadURL failed: ${e}`);
    }
  }

  function goHome(state) {
    loadURL(state, getHomepageURL());
  }

  function openExternal(state) {
    try {
      const url = state.browser.currentURI?.spec || state.address.value;
      const normalized = normalizeURL(url);
      Zotero.launchURL(normalized);
    } catch (e) {
      showStatus(state, e.message || String(e));
    }
  }

  function getPathBasename(path) {
    return String(path || "").split(/[\\/]/).pop() || "zotero.pdf";
  }

  function isPDFAttachment(item) {
    return Boolean(
      item?.isPDFAttachment?.() ||
        (item?.isFileAttachment?.() &&
          item.attachmentContentType === "application/pdf"),
    );
  }

  function uniqueItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = item?.id || item?.key;
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async function getAttachmentPath(attachment) {
    if (!isPDFAttachment(attachment)) {
      return null;
    }
    try {
      const path = await attachment.getFilePathAsync();
      if (!path) {
        return null;
      }
      const file = Zotero.File.pathToFile(path);
      return file?.exists?.() ? path : null;
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to get attachment path: ${e}`);
      return null;
    }
  }

  function getActiveReaderAttachment(win) {
    try {
      const tabID = win.Zotero_Tabs?.selectedID;
      const reader = tabID ? Zotero.Reader?.getByTabID?.(tabID) : null;
      if (!reader?.itemID) {
        return null;
      }
      const item = Zotero.Items.get(reader.itemID);
      return isPDFAttachment(item) ? item : null;
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to inspect active reader: ${e}`);
      return null;
    }
  }

  async function getFirstPDFForItem(item) {
    if (isPDFAttachment(item)) {
      return item;
    }

    if (!item?.isRegularItem?.()) {
      return null;
    }

    try {
      const attachmentIDs = item.getAttachments();
      const attachments = Zotero.Items.get(attachmentIDs).filter(Boolean);
      const pdf = attachments.find((attachment) => isPDFAttachment(attachment));
      if (pdf) {
        return pdf;
      }
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to inspect item attachments: ${e}`);
    }

    try {
      if (typeof item.getBestAttachments === "function") {
        const attachments = await item.getBestAttachments();
        return attachments.find((attachment) => isPDFAttachment(attachment)) || null;
      }
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to inspect best attachments: ${e}`);
    }

    return null;
  }

  async function findCurrentPDFAttachment(win) {
    const candidates = [];
    const readerAttachment = getActiveReaderAttachment(win);
    if (readerAttachment) {
      candidates.push(readerAttachment);
    }

    const pane = win.ZoteroPane || Zotero.getActiveZoteroPane?.();
    const selectedItems = pane?.getSelectedItems?.() || [];
    for (const item of selectedItems) {
      const pdf = await getFirstPDFForItem(item);
      if (pdf) {
        candidates.push(pdf);
      }
    }

    for (const attachment of uniqueItems(candidates)) {
      const path = await getAttachmentPath(attachment);
      if (path) {
        return { attachment, path };
      }
    }

    if (selectedItems.length) {
      throw new Error("当前条目没有可复制的本地 PDF 附件。");
    }
    throw new Error("请先打开一个 PDF 阅读页面，或在 Zotero 中选中包含 PDF 的条目。");
  }

  function createSupportsString(text) {
    const supportsString = Components.classes[
      "@mozilla.org/supports-string;1"
    ].createInstance(Components.interfaces.nsISupportsString);
    supportsString.data = text;
    return supportsString;
  }

  function copyFileToClipboard(path) {
    const file = Zotero.File.pathToFile(path);
    if (!file?.exists?.()) {
      throw new Error(`本地文件不存在：${path}`);
    }

    const transferable = Components.classes[
      "@mozilla.org/widget/transferable;1"
    ].createInstance(Components.interfaces.nsITransferable);
    transferable.init(null);
    transferable.addDataFlavor("application/x-moz-file");
    transferable.setTransferData("application/x-moz-file", file, 0);

    transferable.addDataFlavor("text/plain");
    transferable.setTransferData(
      "text/plain",
      createSupportsString(path),
      path.length * 2,
    );

    Services.clipboard.setData(
      transferable,
      null,
      Services.clipboard.kGlobalClipboard,
    );
  }

  async function copyCurrentPDF(state) {
    clearStatus(state);
    try {
      const pdf = await findCurrentPDFAttachment(state.win);
      copyFileToClipboard(pdf.path);
      const filename =
        pdf.attachment.attachmentFilename || getPathBasename(pdf.path);
      showStatus(state, `已复制 PDF 文件：${filename}`);
    } catch (e) {
      showStatus(state, e.message || String(e));
      Zotero.debug(`[Zotero Web] copyCurrentPDF failed: ${e}`);
    }
  }

  function copyText(text) {
    const str = String(text || "");
    const transferable = Components.classes[
      "@mozilla.org/widget/transferable;1"
    ].createInstance(Components.interfaces.nsITransferable);
    transferable.init(null);
    transferable.addDataFlavor("text/plain");

    transferable.setTransferData(
      "text/plain",
      createSupportsString(str),
      str.length * 2,
    );
    Services.clipboard.setData(
      transferable,
      null,
      Services.clipboard.kGlobalClipboard,
    );
  }

  function getPromptID(prompt, index) {
    return prompt.id || `prompt-${index}`;
  }

  function createPromptID() {
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function copyPromptByID(state, promptID) {
    const prompt = parsePrompts().find(
      (entry, index) => getPromptID(entry, index) === promptID,
    );
    if (!prompt?.body) {
      showStatus(state, "没有可复制的 Prompt 内容。");
      return;
    }
    copyText(prompt.body);
    showStatus(state, `已复制 Prompt：${prompt.title || "Untitled Prompt"}`);
    try {
      state.promptMenuPopup?.hidePopup?.();
    } catch (e) {
      // The popup may already have closed after the menu command.
    }
  }

  function refreshPromptList(state) {
    const doc = state.win.document;
    const prompts = parsePrompts();
    state.promptMenuPopup.textContent = "";
    state.promptMenuButton.setAttribute(
      "tooltiptext",
      prompts.length
        ? `选择并复制 Prompt（${prompts.length} 个）`
        : "暂无 Prompt",
    );

    if (!prompts.length) {
      const empty = createXULElement(doc, "menuitem");
      empty.setAttribute("label", "暂无 Prompt");
      empty.setAttribute("disabled", "true");
      empty.setAttribute("class", "zotero-web-prompt-menuitem");
      state.promptMenuPopup.appendChild(empty);
      return;
    }

    prompts.forEach((prompt, index) => {
      const menuItem = createXULElement(doc, "menuitem");
      menuItem.setAttribute("label", prompt.title || "Untitled Prompt");
      menuItem.setAttribute("crop", "end");
      menuItem.setAttribute(
        "tooltiptext",
        `复制 Prompt：${prompt.title || "Untitled Prompt"}`,
      );
      menuItem.setAttribute("class", "zotero-web-prompt-menuitem");
      menuItem.addEventListener("command", () => {
        copyPromptByID(state, getPromptID(prompt, index));
      });
      state.promptMenuPopup.appendChild(menuItem);
    });
  }

  function refreshAllPromptLists() {
    for (const mainWin of Zotero.getMainWindows?.() || []) {
      const state = sidebarState.get(mainWin);
      if (state?.promptMenuPopup) {
        refreshPromptList(state);
      }
    }
  }

  function getHomepageLabel(url) {
    try {
      return Services.io.newURI(url).host;
    } catch (e) {
      return url;
    }
  }

  function refreshHomepageMenu(state) {
    const doc = state.win.document;
    const homepages = getHomepageCandidates();
    state.homeMenuPopup.textContent = "";
    state.homeMenuButton.setAttribute(
      "tooltiptext",
      homepages.length > 1 ? "选择首页" : "打开首页",
    );

    homepages.forEach((url) => {
      const menuItem = createXULElement(doc, "menuitem");
      menuItem.setAttribute("label", getHomepageLabel(url));
      menuItem.setAttribute("tooltiptext", url);
      menuItem.setAttribute("class", "zotero-web-home-menuitem");
      menuItem.addEventListener("command", () => {
        loadURL(state, url);
      });
      state.homeMenuPopup.appendChild(menuItem);
    });
  }

  function refreshAllHomepageMenus() {
    for (const mainWin of Zotero.getMainWindows?.() || []) {
      const state = sidebarState.get(mainWin);
      if (state?.homeMenuPopup) {
        refreshHomepageMenu(state);
      }
    }
  }

  function createHomepageMenuButton(win) {
    const doc = win.document;
    const button = createXULElement(doc, "toolbarbutton");
    button.id = ids.homeMenuButton;
    button.setAttribute("label", "主页");
    button.setAttribute("type", "menu");
    button.setAttribute("tooltiptext", "选择首页");
    button.setAttribute(
      "class",
      "zotero-web-nav-button zotero-web-home-menu-button",
    );

    const popup = createXULElement(doc, "menupopup");
    popup.id = ids.homeMenuPopup;
    popup.setAttribute("class", "zotero-web-home-menu-popup");
    popup.addEventListener("popupshowing", () => {
      const state = sidebarState.get(win);
      if (state) {
        refreshHomepageMenu(state);
      }
    });

    button.appendChild(popup);

    return {
      homeMenuButton: button,
      homeMenuPopup: popup,
    };
  }

  function createPromptMenuButton(win) {
    const doc = win.document;
    const button = createXULElement(doc, "toolbarbutton");
    button.id = ids.promptMenuButton;
    button.setAttribute("label", "Prompt");
    button.setAttribute("type", "menu");
    button.setAttribute("tooltiptext", "选择并复制 Prompt");
    button.setAttribute(
      "class",
      "zotero-web-nav-button zotero-web-prompt-menu-button",
    );

    const popup = createXULElement(doc, "menupopup");
    popup.id = ids.promptMenuPopup;
    popup.setAttribute("class", "zotero-web-prompt-menu-popup");
    popup.addEventListener("popupshowing", () => {
      const state = sidebarState.get(win);
      if (state) {
        refreshPromptList(state);
      }
    });

    button.appendChild(popup);

    return {
      promptMenuButton: button,
      promptMenuPopup: popup,
    };
  }

  function bindButtonAction(button, action) {
    let commandFired = false;
    const resetCommandState = () => {
      commandFired = false;
    };
    const schedule = (callback) => {
      const eventWindow = button.ownerGlobal || button.ownerDocument?.defaultView;
      if (eventWindow?.setTimeout) {
        eventWindow.setTimeout(callback, 0);
      } else {
        callback();
      }
    };
    button.addEventListener("command", (event) => {
      commandFired = true;
      action(event);
      schedule(resetCommandState);
    });
    button.addEventListener("click", (event) => {
      if (event.button !== 0) {
        return;
      }
      schedule(() => {
        if (!commandFired) {
          action(event);
        }
      });
    });
  }

  function hideSidebar(win) {
    const state = sidebarState.get(win);
    if (!state) {
      return;
    }
    saveSidebarWidth(state);
    state.sidebar.hidden = true;
    state.sidebar.setAttribute("collapsed", "true");
    state.splitter.hidden = true;
  }

  function isSidebarVisible(win) {
    const state = sidebarState.get(win);
    return Boolean(state && state.sidebar.isConnected && !state.sidebar.hidden);
  }

  function showSidebar(win) {
    const state = ensureSidebar(win);
    state.sidebar.hidden = false;
    state.sidebar.removeAttribute("collapsed");
    state.splitter.hidden = false;
    state.sidebar.style.width = `${getSidebarWidth()}px`;
    refreshHomepageMenu(state);
    refreshPromptList(state);
    return state;
  }

  function toggleWebSidebar(win) {
    if (isSidebarVisible(win)) {
      hideSidebar(win);
      return;
    }
    openWebSidebar(win);
  }

  function openWebSidebar(win, initialURL) {
    const state = showSidebar(win);
    setSidebarMode(win, "web");
    if (initialURL || !state.hasLoadedURL) {
      const url = getInitialURL(initialURL);
      loadURL(state, url);
    } else {
      updateNavigationState(state);
    }
    try {
      state.address.focus();
      state.address.select();
    } catch (e) {
      // Focusing the address field is a convenience only.
    }
  }

  // ---------------------------------------------------------------- Translation

  const MAX_TRANSLATE_ITEMS = 30;
  const MAX_TRANSLATION_CHUNKS = 300;
  const readerSelectionCache = new Map();

  function getTranslationEngine() {
    if (
      typeof ZoteroWebTranslationEngine === "undefined" ||
      !ZoteroWebTranslationEngine
    ) {
      throw new Error("翻译引擎未加载，请重启 Zotero 后重试。");
    }
    return ZoteroWebTranslationEngine;
  }

  function getTranslationDisplayConfig() {
    try {
      const engine = getTranslationEngine();
      const config = engine.getConfig();
      return {
        targetLabel: config.targetLabel,
        engineLabel: engine.ENGINES[config.engine] || "智能选择",
      };
    } catch (e) {
      return { targetLabel: "简体中文", engineLabel: "智能选择" };
    }
  }

  function setSidebarMode(win, mode) {
    const state = sidebarState.get(win) || showSidebar(win);
    const isTranslation = mode === "translation";
    state.mode = isTranslation ? "translation" : "web";
    state.header.hidden = isTranslation;
    state.browserWrap.hidden = isTranslation;
    state.translationPane.hidden = !isTranslation;
    if (isTranslation) {
      state.status.hidden = true;
      waitForTranslationUI(state).catch((e) => {
        Zotero.debug(`[Zotero Web] Unable to load translation panel: ${e}`);
        setTranslationLoadingState(
          state,
          `翻译面板加载失败：${e.message || e}`,
        );
      });
    } else {
      state.status.hidden = !state.status.getAttribute("value");
    }
    state.modeWebButton?.classList?.toggle(
      "zotero-web-mode-button-active",
      !isTranslation,
    );
    state.modeTranslateButton?.classList?.toggle(
      "zotero-web-mode-button-active",
      isTranslation,
    );
    return state;
  }

  function openTranslationPanel(win) {
    showSidebar(win);
    return setSidebarMode(win, "translation");
  }

  function setTranslationLoadingState(state, message) {
    const label = state.translationLoadingLabel;
    if (!label) return;
    label.textContent = message || "";
    label.hidden = !message;
  }

  function ensureTranslationBrowser(state) {
    if (state.translationBrowser?.isConnected) {
      return state.translationBrowser;
    }
    const doc = state.win.document;
    let loadingLabel = state.translationPane.querySelector(
      ".zotero-web-translation-loading",
    );
    if (!loadingLabel) {
      loadingLabel = createXULElement(doc, "description");
      loadingLabel.className = "zotero-web-translation-loading";
      loadingLabel.style.padding = "16px";
      loadingLabel.style.color = "#5b6b74";
      loadingLabel.textContent = "正在加载翻译面板…";
      state.translationPane.appendChild(loadingLabel);
    }
    state.translationLoadingLabel = loadingLabel;

    const browser = createXULElement(doc, "browser");
    browser.id = ids.translationBrowser;
    browser.setAttribute("type", "chrome");
    browser.setAttribute("remote", "false");
    browser.setAttribute("maychangeremoteness", "false");
    browser.setAttribute("flex", "1");
    browser.setAttribute("disableglobalhistory", "true");
    browser.style.minWidth = "0";
    browser.style.minHeight = "0";
    state.translationPane.appendChild(browser);
    state.translationBrowser = browser;
    state.translationUI = null;
    state.translationReadyPromise = null;

    const translationURL =
      `chrome://${config.addonRef}/content/translation.xhtml`;
    Services.tm.dispatchToMainThread(() => {
      try {
        if (browser.browsingContext) {
          browser.browsingContext.sandboxFlags &= ~SANDBOXED_SCRIPTS;
        }
        browser.loadURI(Services.io.newURI(translationURL), {
          triggeringPrincipal:
            Services.scriptSecurityManager.getSystemPrincipal(),
        });
      } catch (e) {
        Zotero.debug(`[Zotero Web] Unable to load translation panel: ${e}`);
        setTranslationLoadingState(
          state,
          `翻译面板加载失败：${e.message || e}`,
        );
      }
    });
    return browser;
  }

  function configureTranslationUI(state, ui) {
    if (!ui) return;
    state.translationUI = ui;
    setTranslationLoadingState(state, "");
    try {
      ui.setBridge((action, payload) => {
        handleTranslationUIAction(state, action, payload).catch((e) => {
          Zotero.debug(`[Zotero Web] Translation bridge action failed: ${e}`);
          try {
            ui.failJob(e.message || String(e));
          } catch (error) {
            // The panel may have been torn down.
          }
        });
      });
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to install translation bridge: ${e}`);
    }
    try {
      ui.setConfiguration(getTranslationDisplayConfig());
    } catch (e) {
      // Configuration display is optional.
    }
  }

  function waitForTranslationUI(state) {
    ensureTranslationBrowser(state);
    try {
      const existing =
        state.translationBrowser?.contentWindow?.ZoteroWebTranslationUI;
      if (existing) {
        configureTranslationUI(state, existing);
        return Promise.resolve(existing);
      }
    } catch (e) {
      // The browser is not ready yet.
    }
    if (state.translationReadyPromise) {
      return state.translationReadyPromise;
    }
    const win = state.win;
    state.translationReadyPromise = new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        let ui = null;
        try {
          ui =
            state.translationBrowser?.contentWindow?.ZoteroWebTranslationUI ||
            null;
        } catch (e) {
          ui = null;
        }
        if (ui) {
          configureTranslationUI(state, ui);
          resolve(ui);
          return;
        }
        attempts += 1;
        if (attempts > 150) {
          state.translationReadyPromise = null;
          reject(new Error("翻译面板加载超时，请重启 Zotero 后重试。"));
          return;
        }
        win.setTimeout(check, 100);
      };
      check();
    });
    return state.translationReadyPromise;
  }

  function getTranslationSelectedItems(win) {
    try {
      const pane = win.ZoteroPane || Zotero.getActiveZoteroPane?.();
      return pane?.getSelectedItems?.() || [];
    } catch (e) {
      return [];
    }
  }

  function normalizeTranslationItems(items) {
    const result = [];
    const seen = new Set();
    for (const item of items || []) {
      if (!item) continue;
      let target = item;
      if (item.isAttachment?.() && item.parentID) {
        try {
          const parent = Zotero.Items.get(item.parentID);
          if (parent?.isRegularItem?.()) {
            target = parent;
          }
        } catch (e) {
          // Keep the attachment if the parent cannot be loaded.
        }
      }
      if (target.isNote?.() || target.isAnnotation?.()) {
        continue;
      }
      if (!target.isRegularItem?.() && !isPDFAttachment(target)) {
        continue;
      }
      const key = target.id || target.key;
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(target);
      if (result.length >= MAX_TRANSLATE_ITEMS) {
        break;
      }
    }
    return result;
  }

  function getTranslationItemTitle(item) {
    try {
      return item?.getField?.("title") || item?.getDisplayTitle?.() || "";
    } catch (e) {
      return "";
    }
  }

  function buildTranslationMetadata(item) {
    const readField = (field) => {
      try {
        return item?.getField?.(field) || "";
      } catch (e) {
        return "";
      }
    };
    const title = getTranslationItemTitle(item);
    const abstract = readField("abstractNote");
    let creators = "";
    try {
      creators = (item?.getCreators?.() || [])
        .map(
          (creator) =>
            [creator.firstName, creator.lastName]
              .filter(Boolean)
              .join(" ") ||
            creator.name ||
            "",
        )
        .filter(Boolean)
        .join(", ");
    } catch (e) {
      creators = "";
    }
    const date = readField("date");
    const yearMatch = String(date).match(/(1[6-9]\d{2}|20\d{2})/);
    const publication =
      readField("publicationTitle") ||
      readField("proceedingsTitle") ||
      readField("bookTitle") ||
      readField("conferenceName");
    return {
      title,
      abstract,
      creators,
      year: yearMatch ? yearMatch[0] : date,
      publication,
      doi: readField("DOI"),
      itemID: item?.id || null,
      libraryID: item?.libraryID || null,
    };
  }

  function itemHasLocalPDF(item) {
    try {
      if (isPDFAttachment(item)) {
        return true;
      }
      if (!item?.isRegularItem?.()) {
        return false;
      }
      const attachmentIDs = item.getAttachments?.() || [];
      return Zotero.Items.get(attachmentIDs).some((attachment) =>
        isPDFAttachment(attachment),
      );
    } catch (e) {
      // When attachment data is not loaded, keep the PDF actions available;
      // the async resolver has getBestAttachments() as a fallback.
      return true;
    }
  }

  async function findPDFForTranslation(win, items, preferReader) {
    const candidates = [];
    if (preferReader) {
      const readerAttachment = getActiveReaderAttachment(win);
      if (readerAttachment) {
        candidates.push(readerAttachment);
      }
    }
    for (const item of items || []) {
      const pdf = await getFirstPDFForItem(item);
      if (pdf) {
        candidates.push(pdf);
      }
    }
    if (!preferReader) {
      const readerAttachment = getActiveReaderAttachment(win);
      if (readerAttachment) {
        candidates.push(readerAttachment);
      }
    }
    for (const attachment of uniqueItems(candidates)) {
      const path = await getAttachmentPath(attachment);
      if (path) {
        return attachment;
      }
    }
    return null;
  }

  function beginTranslationJob(state, ui, options) {
    if (state.translationJob) {
      state.translationJob.cancelled = true;
      state.translationJob = null;
    }
    const job = {
      cancelled: false,
      state,
      ui,
      kind: options.kind,
    };
    state.translationJob = job;
    state.translationResult = null;
    ui.beginJob(options);
    return job;
  }

  function isJobActive(state, job) {
    return state.translationJob === job && !job.cancelled;
  }

  function endTranslationJob(state, job) {
    if (state.translationJob === job) {
      state.translationJob = null;
    }
  }

  function cancelTranslationJob(state) {
    const job = state.translationJob;
    if (!job) {
      try {
        state.translationUI?.toast?.("当前没有正在运行的翻译任务。");
      } catch (e) {
        // ignore
      }
      return;
    }
    job.cancelled = true;
    state.translationJob = null;
    let partial = null;
    try {
      partial = job.getPartialResult?.() || null;
    } catch (e) {
      partial = null;
    }
    if (partial) {
      state.translationResult = partial;
    }
    try {
      job.ui.failJob("已停止当前翻译任务，已保留已生成的部分内容。");
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to stop translation job: ${e}`);
    }
  }

  function truncateLabel(text, maxLength) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value.length > maxLength
      ? `${value.slice(0, maxLength - 1)}…`
      : value;
  }

  function translationDelay(ms) {
    return new Promise((resolve) => {
      const win = Zotero.getMainWindow?.();
      if (win?.setTimeout) {
        win.setTimeout(resolve, ms);
      } else {
        resolve();
      }
    });
  }

  function reportTranslationFailure(state, ui, message) {
    if (state.translationJob) {
      ui.toast?.(message);
    } else {
      ui.failJob?.(message);
    }
  }

  async function showTranslationError(state, message) {
    let ui = state.translationUI;
    if (!ui) {
      try {
        ui = await waitForTranslationUI(state);
      } catch (e) {
        ui = null;
      }
    }
    if (!ui) {
      showStatus(state, message);
      return;
    }
    reportTranslationFailure(state, ui, message);
  }

  async function startMetadataTranslation(win, itemsInput) {
    const state = openTranslationPanel(win);
    let ui;
    try {
      ui = await waitForTranslationUI(state);
    } catch (e) {
      setTranslationLoadingState(
        state,
        `翻译面板加载失败：${e.message || e}`,
      );
      showStatus(state, e.message || String(e));
      return;
    }

    const rawItems = itemsInput?.length
      ? itemsInput
      : getTranslationSelectedItems(win);
    const items = normalizeTranslationItems(rawItems);
    if (!items.length) {
      reportTranslationFailure(
        state,
        ui,
        "请先在 Zotero 中选中至少一条文献。",
      );
      return;
    }

    const engine = getTranslationEngine();
    const config = engine.getConfig();
    let translator;
    try {
      translator = engine.createTranslator(config);
    } catch (e) {
      reportTranslationFailure(state, ui, e.message || String(e));
      return;
    }

    const jobTitle =
      items.length === 1
        ? getTranslationItemTitle(items[0]) || "题录翻译"
        : `翻译题录（${items.length} 条）`;
    const job = beginTranslationJob(state, ui, {
      kind: "metadata",
      total: items.length,
      title: jobTitle,
      engine: translator.label,
      targetLabel: config.targetLabel,
      status: `正在翻译 ${items.length} 条题录…`,
    });
    if (rawItems.length > MAX_TRANSLATE_ITEMS) {
      ui.setNotice(
        `一次最多翻译 ${MAX_TRANSLATE_ITEMS} 条题录，已处理前 ${items.length} 条。`,
      );
    }

    const results = [];
    let errorCount = 0;
    job.getPartialResult = () => ({
      kind: "metadata",
      title: jobTitle,
      items: results.slice(),
      engineLabel: translator.label,
      targetLabel: config.targetLabel,
    });
    try {
      for (let index = 0; index < items.length; index += 1) {
        if (!isJobActive(state, job)) return;
        const metadata = buildTranslationMetadata(items[index]);
        ui.setStatus(
          `正在翻译 ${index + 1}/${items.length}：${truncateLabel(metadata.title || "未命名文献", 32)}`,
        );
        ui.setProgress(index, items.length);
        try {
          const translated = await engine.translateMetadata(
            metadata,
            translator,
            config,
          );
          if (!isJobActive(state, job)) return;
          const result = { ...metadata, ...translated };
          results.push(result);
          ui.appendMetadataItem(result);
        } catch (e) {
          if (!isJobActive(state, job)) return;
          errorCount += 1;
          const result = { ...metadata, error: e.message || String(e) };
          results.push(result);
          ui.appendMetadataItem(result);
        }
        if (!isJobActive(state, job)) return;
        ui.setProgress(index + 1, items.length);
      }

      state.translationResult = {
        kind: "metadata",
        title: jobTitle,
        items: results,
        engineLabel: translator.label,
        targetLabel: config.targetLabel,
      };
      if (errorCount && errorCount === results.length) {
        ui.failJob("全部题录翻译失败，请检查翻译引擎设置后重试。");
        return;
      }
      if (errorCount) {
        ui.setNotice(
          `${errorCount} 条题录翻译失败，请查看对应卡片中的错误信息。`,
          true,
        );
      }
      ui.setProgress(items.length, items.length);
      ui.finishJob("题录翻译完成");
    } catch (e) {
      if (!isJobActive(state, job)) return;
      state.translationResult = {
        kind: "metadata",
        title: jobTitle,
        items: results,
        engineLabel: translator.label,
        targetLabel: config.targetLabel,
        error: e.message || String(e),
      };
      ui.failJob(e.message || String(e));
    } finally {
      if (job.cancelled && !state.translationJob && !state.translationResult) {
        state.translationResult = {
          kind: "metadata",
          title: jobTitle,
          items: results,
          engineLabel: translator.label,
          targetLabel: config.targetLabel,
        };
      }
      endTranslationJob(state, job);
    }
  }

  function readWindowSelection(windowLike) {
    try {
      const selection = windowLike?.getSelection?.();
      const text = selection ? String(selection.toString() || "") : "";
      return text.trim();
    } catch (e) {
      return "";
    }
  }

  function getActiveReader(win) {
    try {
      const tabID = win?.Zotero_Tabs?.selectedID;
      return tabID ? Zotero.Reader?.getByTabID?.(tabID) || null : null;
    } catch (e) {
      return null;
    }
  }

  function collectReaderDocuments(readerWindow) {
    const docs = [];
    const walk = (w, depth) => {
      if (!w || depth > 3) return;
      let doc = null;
      try {
        doc = w.document;
      } catch (e) {
        return;
      }
      if (doc && !docs.includes(doc)) {
        docs.push(doc);
      }
      let frames = null;
      try {
        frames = doc.querySelectorAll("iframe");
      } catch (e) {
        frames = null;
      }
      if (!frames) return;
      for (const frame of frames) {
        try {
          if (frame.contentWindow) {
            walk(frame.contentWindow, depth + 1);
          }
        } catch (e) {
          // ignore cross-origin or not-ready frames
        }
      }
    };
    walk(readerWindow, 0);
    return docs;
  }

  function trackReaderSelection(reader, attempt = 0) {
    if (!reader?.itemID) return;
    let docs = [];
    try {
      docs = collectReaderDocuments(reader._iframeWindow);
    } catch (e) {
      docs = [];
    }
    const capture = (doc) => {
      try {
        const text = String(doc.getSelection?.()?.toString?.() || "").trim();
        if (text) {
          readerSelectionCache.set(String(reader.itemID), {
            text,
            at: Date.now(),
          });
        }
      } catch (e) {
        // Selection access can fail while the viewer is reloading.
      }
    };
    for (const doc of docs) {
      if (doc.__zoteroWebSelectionTracked) {
        continue;
      }
      try {
        doc.__zoteroWebSelectionTracked = true;
        doc.addEventListener("selectionchange", () => capture(doc));
        doc.addEventListener("mouseup", () => capture(doc), true);
        doc.addEventListener("keyup", () => capture(doc), true);
      } catch (e) {
        // ignore
      }
    }
    for (const doc of docs) {
      capture(doc);
    }
    const win = Zotero.getMainWindow?.();
    if (!reader.__zoteroWebSelectionTracking) {
      reader.__zoteroWebSelectionTracking = true;
      if (win?.setTimeout) {
        win.setTimeout(() => trackReaderSelection(reader, 1), 500);
      }
    } else if (attempt > 0 && attempt < 30) {
      if (win?.setTimeout) {
        win.setTimeout(
          () => trackReaderSelection(reader, attempt + 1),
          500,
        );
      }
    }
  }

  function getCurrentReaderSelectionText(win) {
    const reader = getActiveReader(win);
    if (!reader) return "";
    trackReaderSelection(reader);
    let docs = [];
    try {
      docs = collectReaderDocuments(reader._iframeWindow);
    } catch (e) {
      docs = [];
    }
    for (const doc of docs) {
      const text = readWindowSelection(doc.defaultView || doc);
      if (text) return text;
    }
    return "";
  }

  function getStoredReaderSelection(win) {
    const reader = getActiveReader(win);
    if (!reader?.itemID) return null;
    const entry = readerSelectionCache.get(String(reader.itemID));
    if (!entry) return null;
    if (Date.now() - entry.at > 30 * 60 * 1000) {
      readerSelectionCache.delete(String(reader.itemID));
      return null;
    }
    return entry;
  }

  function getWebSidebarSelectionText(state) {
    return state ? readWindowSelection(state.browser?.contentWindow) : "";
  }

  function captureWebSelection(state) {
    if (!state) return;
    const text = getWebSidebarSelectionText(state);
    if (text) {
      state.lastWebSelection = text;
      state.lastWebSelectionAt = Date.now();
    }
  }

  function getSelectedTextForTranslation(win, pageText) {
    const pageSelection = String(pageText || "").trim();
    if (pageSelection) {
      return { text: pageSelection, source: "translation-panel" };
    }
    const currentReaderSelection = getCurrentReaderSelectionText(win);
    if (currentReaderSelection) {
      return { text: currentReaderSelection, source: "reader" };
    }
    const state = sidebarState.get(win);
    const currentWebSelection = getWebSidebarSelectionText(state);
    if (currentWebSelection) {
      return { text: currentWebSelection, source: "web-sidebar" };
    }
    const storedReaderSelection = getStoredReaderSelection(win);
    const lastWebSelection = state?.lastWebSelection || "";
    if (storedReaderSelection && lastWebSelection) {
      return (state?.lastWebSelectionAt || 0) > storedReaderSelection.at
        ? { text: lastWebSelection, source: "web-sidebar" }
        : {
            text: storedReaderSelection.text,
            source: "reader-cached-selection",
          };
    }
    if (storedReaderSelection) {
      return {
        text: storedReaderSelection.text,
        source: "reader-cached-selection",
      };
    }
    if (lastWebSelection) {
      return { text: lastWebSelection, source: "web-sidebar" };
    }
    const windowSelection = readWindowSelection(win);
    if (windowSelection) {
      return { text: windowSelection, source: "main-window" };
    }
    return { text: "", source: "" };
  }

  async function startSelectionTranslation(win, pageText) {
    const state = openTranslationPanel(win);
    let ui;
    try {
      ui = await waitForTranslationUI(state);
    } catch (e) {
      setTranslationLoadingState(
        state,
        `翻译面板加载失败：${e.message || e}`,
      );
      showStatus(state, e.message || String(e));
      return;
    }

    const selection = getSelectedTextForTranslation(win, pageText);
    if (!selection.text) {
      reportTranslationFailure(
        state,
        ui,
        "请先用鼠标选中要翻译的文字（支持 PDF 阅读器、网页侧边栏或翻译面板）。",
      );
      return;
    }

    const engine = getTranslationEngine();
    const config = engine.getConfig();
    let translator;
    try {
      translator = engine.createTranslator(config);
    } catch (e) {
      reportTranslationFailure(state, ui, e.message || String(e));
      return;
    }

    const sourceText = selection.text;
    const chunks = engine.chunkText(sourceText, translator.chunkSize);
    if (!chunks.length) {
      reportTranslationFailure(state, ui, "选中文字没有可翻译的内容。");
      return;
    }
    const jobTitle = "选中文本翻译";
    const job = beginTranslationJob(state, ui, {
      kind: "selection",
      total: chunks.length,
      title: jobTitle,
      engine: translator.label,
      targetLabel: config.targetLabel,
      sourceText,
      status: "正在翻译选中文字…",
    });
    const outputs = [];
    job.getPartialResult = () => ({
      kind: "selection",
      title: jobTitle,
      sourceText,
      translatedText: outputs.join("\n\n"),
      engineLabel: translator.label,
      targetLabel: config.targetLabel,
    });

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        if (!isJobActive(state, job)) return;
        ui.setStatus(
          `正在翻译选中文字（${index + 1}/${chunks.length}）…`,
        );
        const translated = await translator.translate(chunks[index]);
        if (!isJobActive(state, job)) return;
        if (translated) {
          outputs.push(translated);
          ui.appendTranslation(translated);
        }
        ui.setProgress(index + 1, chunks.length);
        if (!translator.isLLM && index < chunks.length - 1) {
          await translationDelay(150);
        }
      }
      if (!isJobActive(state, job)) return;
      const translatedText = outputs.join("\n\n");
      if (!translatedText.trim()) {
        throw new Error("翻译结果为空，请检查翻译引擎设置。");
      }
      state.translationResult = {
        kind: "selection",
        title: jobTitle,
        sourceText,
        translatedText,
        engineLabel: translator.label,
        targetLabel: config.targetLabel,
      };
      ui.finishJob("选中文字翻译完成");
    } catch (e) {
      if (job.cancelled || !isJobActive(state, job)) {
        if (
          job.cancelled &&
          !state.translationJob &&
          !state.translationResult
        ) {
          state.translationResult = job.getPartialResult();
        }
        return;
      }
      state.translationResult = {
        ...job.getPartialResult(),
        error: e.message || String(e),
      };
      ui.failJob(e.message || String(e));
    } finally {
      endTranslationJob(state, job);
    }
  }

  // ------------------------------------------------------------- PDF cache

  let translationCacheData = null;

  function getTranslationCacheFile() {
    const dir = Zotero.File.pathToFile(Zotero.DataDirectory.dir);
    const file = dir.clone();
    file.append("zotero-web-translations.json");
    return file;
  }

  function getTranslationCacheKey(attachment) {
    if (!attachment?.key) return "";
    return `${attachment.libraryID || 0}-${attachment.key}`;
  }

  async function loadTranslationCache() {
    if (translationCacheData) {
      return translationCacheData;
    }
    const empty = { version: 1, entries: {} };
    try {
      const file = getTranslationCacheFile();
      if (!file.exists()) {
        translationCacheData = empty;
        return translationCacheData;
      }
      const raw = await Zotero.File.getContentsAsync(file.path, "UTF-8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.entries && typeof parsed.entries === "object") {
        translationCacheData = { version: 1, entries: parsed.entries };
      } else {
        translationCacheData = empty;
      }
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to read translation cache: ${e}`);
      translationCacheData = empty;
    }
    return translationCacheData;
  }

  async function getCachedPdfTranslation(attachment) {
    const key = getTranslationCacheKey(attachment);
    if (!key) return null;
    const cache = await loadTranslationCache();
    return cache.entries[key] || null;
  }

  async function saveCachedPdfTranslation(attachment, result) {
    if (!attachment?.key || !result?.translatedText) return;
    const key = getTranslationCacheKey(attachment);
    if (!key) return;
    const cache = await loadTranslationCache();
    cache.entries[key] = {
      attachmentID: attachment.id,
      attachmentKey: attachment.key,
      parentItemID: result.parentItemID || null,
      itemID: result.itemID || null,
      libraryID: result.libraryID || attachment.libraryID || null,
      title: result.title || "",
      translatedText: result.translatedText,
      summary: result.summary || "",
      sourceText: result.sourceText || "",
      truncated: Boolean(result.truncated),
      targetLabel: result.targetLabel || "",
      engineLabel: result.engineLabel || "",
      savedAt: Date.now(),
    };
    const entries = Object.entries(cache.entries)
      .sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0))
      .slice(0, 20);
    const pruned = {};
    for (const [entryKey, entry] of entries) {
      pruned[entryKey] = entry;
    }
    cache.entries = pruned;
    translationCacheData = cache;
    try {
      const file = getTranslationCacheFile();
      await Zotero.File.putContentsAsync(
        file.path,
        JSON.stringify(cache),
        "UTF-8",
      );
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to write translation cache: ${e}`);
    }
  }

  async function displayCachedPdfTranslation(state, entry, attachment, ui) {
    if (!entry || state.translationJob) return false;
    state.translationResult = {
      ...entry,
      kind: "pdf",
      attachmentID: attachment.id,
      attachmentKey: attachment.key,
      libraryID: entry.libraryID || attachment.libraryID || null,
      parentItemID: entry.parentItemID || attachment.parentID || null,
      fromCache: true,
    };
    ui.beginJob({
      kind: "pdf",
      summarize: Boolean(entry.summary),
      title: entry.title || "PDF 全文翻译",
      engine: `${entry.engineLabel || "翻译引擎"}（缓存）`,
      targetLabel: entry.targetLabel || "",
      status: "已加载本地缓存",
      total: 1,
    });
    if (entry.translatedText) {
      ui.appendTranslation(entry.translatedText);
    }
    if (entry.summary) {
      ui.setSummary(entry.summary);
    }
    ui.setProgress(1, 1);
    ui.setNotice(
      "已加载本地缓存，未重新翻译。再次点击当前 PDF 的翻译按钮会重新翻译并覆盖缓存。",
    );
    ui.finishJob("已加载本地缓存");
    return true;
  }

  async function summarizeCachedPdfTranslation(state, entry, attachment, ui) {
    if (!entry?.translatedText) return false;
    const base = {
      ...entry,
      kind: "pdf",
      attachmentID: attachment.id,
      attachmentKey: attachment.key,
      libraryID: entry.libraryID || attachment.libraryID || null,
      parentItemID: entry.parentItemID || attachment.parentID || null,
      fromCache: true,
    };

    if (entry.summary) {
      state.translationResult = base;
      ui.beginJob({
        kind: "pdf",
        summarize: true,
        title: entry.title || "PDF 全文翻译",
        engine: `${entry.engineLabel || "翻译引擎"}（缓存）`,
        targetLabel: entry.targetLabel || "",
        status: "已加载本地缓存",
        total: 1,
      });
      ui.appendTranslation(entry.translatedText);
      ui.setSummary(entry.summary);
      ui.setProgress(1, 1);
      ui.setNotice("已加载缓存中的译文和总结，未重新翻译。");
      ui.finishJob("已加载本地缓存");
      return true;
    }

    const engine = getTranslationEngine();
    const config = engine.getConfig();
    let translator;
    try {
      translator = engine.createTranslator(config);
    } catch (e) {
      const localSummary = engine.extractiveSummary(entry.translatedText);
      if (!localSummary) {
        reportTranslationFailure(state, ui, e.message || String(e));
        return false;
      }
      state.translationResult = {
        ...base,
        summary: localSummary,
        summaryEngineLabel: "本地抽取式摘要",
        summarizedAt: Date.now(),
      };
      ui.beginJob({
        kind: "pdf",
        summarize: true,
        title: entry.title || "PDF 全文翻译",
        engine: "本地抽取式摘要（缓存译文）",
        targetLabel: entry.targetLabel || config.targetLabel,
        status: "已基于缓存译文生成总结",
        total: 1,
      });
      ui.appendTranslation(entry.translatedText);
      ui.setSummary(localSummary);
      ui.setProgress(1, 1);
      ui.setNotice(
        "当前翻译引擎不可用，已使用本地抽取式摘要；未重新翻译。",
      );
      ui.finishJob("已基于缓存译文生成总结");
      try {
        await saveCachedPdfTranslation(attachment, state.translationResult);
      } catch (error) {
        Zotero.debug(`[Zotero Web] Unable to save summary cache: ${error}`);
      }
      return true;
    }

    const job = beginTranslationJob(state, ui, {
      kind: "pdf",
      summarize: true,
      title: entry.title || "PDF 全文翻译",
      engine: `${entry.engineLabel || "翻译引擎"}（缓存译文）`,
      targetLabel: entry.targetLabel || config.targetLabel,
      status: "正在基于缓存译文生成总结…",
      total: 1,
    });
    ui.appendTranslation(entry.translatedText);
    state.translationResult = base;
    job.getPartialResult = () => ({ ...base });

    try {
      const summary = await translator.summarize({
        points: [],
        metadata: { title: entry.title || "" },
        text: entry.translatedText,
      });
      if (!isJobActive(state, job)) return false;
      const updated = {
        ...base,
        summary,
        summaryEngineLabel: translator.label,
        summarizedAt: Date.now(),
      };
      state.translationResult = updated;
      ui.setSummary(summary);
      ui.setProgress(1, 1);
      ui.setNotice(
        "已使用本地缓存的译文生成总结，未重新翻译。",
      );
      ui.finishJob("已基于缓存译文生成总结");
      try {
        await saveCachedPdfTranslation(attachment, updated);
      } catch (error) {
        Zotero.debug(`[Zotero Web] Unable to save summary cache: ${error}`);
      }
      return true;
    } catch (e) {
      if (!isJobActive(state, job)) return false;
      state.translationResult = {
        ...base,
        error: e.message || String(e),
      };
      ui.failJob(e.message || String(e));
      return false;
    } finally {
      endTranslationJob(state, job);
    }
  }

  async function startPDFTranslationWithCache(win, attachment, options = {}) {
    if (!attachment) {
      await startPDFTranslation(win, null, options);
      return;
    }
    const state = openTranslationPanel(win);
    let ui;
    try {
      ui = await waitForTranslationUI(state);
    } catch (e) {
      setTranslationLoadingState(
        state,
        `翻译面板加载失败：${e.message || e}`,
      );
      showStatus(state, e.message || String(e));
      if (options.cleanupAttachment) {
        try {
          await options.cleanupAttachment();
        } catch (error) {
          // ignore cleanup errors
        }
      }
      return;
    }

    if (state.translationJob) {
      await startPDFTranslation(win, attachment, options);
      return;
    }

    if (options.summarize) {
      const cached = await getCachedPdfTranslation(attachment);
      if (state.translationJob) return;
      if (cached?.translatedText) {
        await summarizeCachedPdfTranslation(
          state,
          cached,
          attachment,
          ui,
        );
        return;
      }
    }

    const existing = state.translationResult;
    const samePdf =
      existing?.kind === "pdf" &&
      String(existing.attachmentID) === String(attachment.id);
    if (!samePdf) {
      const entry = await getCachedPdfTranslation(attachment);
      if (state.translationJob) return;
      if (entry) {
        await displayCachedPdfTranslation(state, entry, attachment, ui);
        return;
      }
    }
    await startPDFTranslation(win, attachment, options);
  }

  function openTranslationMode(win) {
    const state = sidebarState.get(win) || showSidebar(win);
    captureWebSelection(state);
    setSidebarMode(win, "translation");
    return state;
  }

  async function startPDFTranslation(win, attachment, options = {}) {
    const summarize = Boolean(options.summarize);
    const state = openTranslationPanel(win);
    let ui;
    try {
      ui = await waitForTranslationUI(state);
    } catch (e) {
      setTranslationLoadingState(
        state,
        `翻译面板加载失败：${e.message || e}`,
      );
      showStatus(state, e.message || String(e));
      if (options.cleanupAttachment) {
        try {
          await options.cleanupAttachment();
        } catch (error) {
          // ignore cleanup errors
        }
      }
      return;
    }

    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp || !options.cleanupAttachment) return;
      cleanedUp = true;
      try {
        await options.cleanupAttachment();
      } catch (e) {
        Zotero.debug(`[Zotero Web] Unable to remove temporary PDF: ${e}`);
      }
    };

    if (!attachment) {
      await cleanup();
      reportTranslationFailure(state, ui, "没有可翻译的 PDF 附件。");
      return;
    }

    const engine = getTranslationEngine();
    const config = engine.getConfig();
    let translator;
    try {
      translator = engine.createTranslator(config);
    } catch (e) {
      await cleanup();
      reportTranslationFailure(state, ui, e.message || String(e));
      return;
    }

    let sourceItem = null;
    try {
      if (attachment.parentID) {
        sourceItem = Zotero.Items.get(attachment.parentID);
      }
    } catch (e) {
      sourceItem = null;
    }

    const metadata = buildTranslationMetadata(sourceItem || attachment);
    const title =
      metadata.title ||
      getTranslationItemTitle(attachment) ||
      "PDF 全文翻译";
    const job = beginTranslationJob(state, ui, {
      kind: "pdf",
      summarize,
      title,
      engine: translator.label,
      targetLabel: config.targetLabel,
      status: "正在提取 PDF 全文…",
    });

    const resultBase = {
      kind: "pdf",
      title,
      metadata,
      attachmentID: attachment.id,
      parentItemID: sourceItem?.id || attachment.parentID || null,
      itemID: (sourceItem || attachment).id,
      libraryID: (sourceItem || attachment).libraryID || null,
      targetLabel: config.targetLabel,
    };

    let extraction = null;
    let translatedText = "";
    let summary = "";
    const points = [];
    let noticeText = "";
    const addNotice = (message) => {
      if (!message) return;
      noticeText = noticeText ? `${noticeText} ${message}` : message;
      ui.setNotice(noticeText);
    };
    job.getPartialResult = () => ({
      ...resultBase,
      engineLabel: translator.label,
      translatedText,
      summary,
      sourceText: extraction?.text || "",
      truncated: Boolean(extraction?.truncated),
    });

    try {
      extraction = await engine.extractPDFText(attachment, config.maxChars);
      await cleanup();
      if (!isJobActive(state, job)) return;

      if (!extraction.text.trim()) {
        const detail = extraction.error
          ? `提取器错误：${extraction.error}`
          : "若为扫描版 PDF，请先进行 OCR，或使用“复制全文到网页 AI”上传原 PDF。";
        throw new Error(`未能从该 PDF 提取到文字。${detail}`);
      }
      if (extraction.pageLimited) {
        addNotice(
          `PDF 页数较多，已仅提取前 ${extraction.maxPages} 页；可提高设置中的“全文最大字符数”以获取更多内容。`,
        );
      }
      if (extraction.truncated) {
        addNotice(
          `全文过长，已按设置截断到 ${config.maxChars.toLocaleString()} 字符；可在插件设置中调整“全文最大字符数”。`,
        );
      }
      if (!translator.isLLM) {
        addNotice(
          summarize
            ? "当前使用免费机器翻译，总结为本地抽取式；在插件设置中配置 AI 大模型可获得更高质量的翻译与结构化总结。"
            : "当前使用免费机器翻译；在插件设置中配置 AI 大模型可获得更高质量的全文翻译。",
        );
      }

      const allChunks = engine.chunkText(
        extraction.text,
        translator.chunkSize,
      );
      const chunks = allChunks.slice(0, MAX_TRANSLATION_CHUNKS);
      if (!chunks.length) {
        throw new Error("PDF 没有可翻译的正文。");
      }
      if (allChunks.length > chunks.length) {
        addNotice(
          `为控制耗时与费用，仅处理前 ${chunks.length} 段，其余内容未翻译。`,
        );
      }

      ui.setStatus(`正在翻译全文（共 ${chunks.length} 段）…`);
      ui.setProgress(0, chunks.length);

      for (let index = 0; index < chunks.length; index += 1) {
        if (!isJobActive(state, job)) return;
        ui.setStatus(
          `正在翻译第 ${index + 1}/${chunks.length} 段…`,
        );
        let translated = "";
        if (summarize && translator.isLLM) {
          const part = await translator.translateAndGist(chunks[index]);
          translated = part.translated;
          if (part.points?.length) {
            points.push(...part.points);
          }
        } else {
          translated = await translator.translate(chunks[index]);
        }
        if (!isJobActive(state, job)) return;
        if (translated) {
          translatedText += `${translatedText ? "\n\n" : ""}${translated}`;
          ui.appendTranslation(translated);
        }
        ui.setProgress(index + 1, chunks.length);
        if (!translator.isLLM && index < chunks.length - 1) {
          await translationDelay(150);
        }
      }

      if (!translatedText.trim()) {
        throw new Error("翻译结果为空，请检查翻译引擎设置或换成 AI 大模型重试。");
      }

      if (summarize) {
        ui.setStatus("正在生成结构化总结…");
        ui.setProgress(chunks.length, chunks.length);
        summary = await translator.summarize({
          points,
          metadata,
          text: translatedText,
        });
        if (!isJobActive(state, job)) return;
        if (String(summary || "").trim()) {
          ui.setSummary(summary);
        } else {
          addNotice("未能生成总结，已保留全文翻译。");
        }
      }

      state.translationResult = {
        ...resultBase,
        engineLabel: translator.label,
        translatedText,
        summary,
        sourceText: extraction.text,
        truncated: Boolean(extraction.truncated),
      };
      if (!options.cleanupAttachment) {
        try {
          await saveCachedPdfTranslation(
            attachment,
            state.translationResult,
          );
        } catch (e) {
          Zotero.debug(`[Zotero Web] Unable to cache translation: ${e}`);
        }
      }
      ui.setProgress(chunks.length, chunks.length);
      ui.finishJob(
        summarize ? "全文翻译与总结完成" : "全文翻译完成",
      );
    } catch (e) {
      if (job.cancelled || !isJobActive(state, job)) {
        if (job.cancelled && !state.translationJob && !state.translationResult) {
          state.translationResult = {
            ...resultBase,
            engineLabel: translator.label,
            translatedText,
            summary,
            sourceText: extraction?.text || "",
            truncated: Boolean(extraction?.truncated),
            error: e.message || String(e),
          };
        }
        return;
      }
      state.translationResult = {
        ...resultBase,
        engineLabel: translator.label,
        translatedText,
        summary,
        sourceText: extraction?.text || "",
        truncated: Boolean(extraction?.truncated),
        error: e.message || String(e),
      };
      ui.failJob(e.message || String(e));
    } finally {
      if (
        job.cancelled &&
        !state.translationJob &&
        !state.translationResult
      ) {
        state.translationResult = {
          ...resultBase,
          engineLabel: translator.label,
          translatedText,
          summary,
          sourceText: extraction?.text || "",
          truncated: Boolean(extraction?.truncated),
        };
      }
      await cleanup();
      endTranslationJob(state, job);
    }
  }

  async function startPDFTranslationFromSelection(win, summarize) {
    const state = openTranslationPanel(win);
    try {
      const items = getTranslationSelectedItems(win);
      const pdf = await findPDFForTranslation(win, items, true);
      if (!pdf) {
        await showTranslationError(
          state,
          "未找到可翻译的 PDF。请选中含本地 PDF 的文献，或在阅读器中打开 PDF。",
        );
        return;
      }
      await startPDFTranslationWithCache(win, pdf, { summarize });
    } catch (e) {
      await showTranslationError(state, e.message || String(e));
    }
  }

  async function startTranslateMenuAction(win, kind) {
    try {
      if (kind === "metadata") {
        await startMetadataTranslation(win, getTranslationSelectedItems(win));
        return;
      }
      const state = openTranslationPanel(win);
      const pdf = await findPDFForTranslation(
        win,
        getTranslationSelectedItems(win),
        false,
      );
      if (!pdf) {
        await showTranslationError(state, "选中条目没有本地 PDF 附件。");
        return;
      }
      await startPDFTranslationWithCache(win, pdf, {
        summarize: kind === "pdf-summary",
      });
    } catch (e) {
      const state = sidebarState.get(win) || openTranslationPanel(win);
      await showTranslationError(state, e.message || String(e));
    }
  }

  function copyTranslationResult(state) {
    const result = state.translationResult;
    let text = "";
    if (result?.kind === "metadata") {
      text = (result.items || [])
        .map((item) => {
          if (item.error && !item.translatedTitle && !item.translatedAbstract) {
            return "";
          }
          const parts = [];
          if (item.translatedTitle) {
            parts.push(`【标题】${item.translatedTitle}`);
          }
          if (item.translatedAbstract) {
            parts.push(`【摘要】${item.translatedAbstract}`);
          }
          if (!parts.length && item.title) {
            parts.push(`【标题】${item.title}`);
          }
          return parts.join("\n");
        })
        .filter(Boolean)
        .join("\n\n---\n\n");
    } else {
      text = result?.translatedText || "";
    }
    if (!text.trim()) {
      state.translationUI?.toast?.("没有可复制的译文。");
      return;
    }
    copyText(text);
    state.translationUI?.toast?.("已复制译文到剪贴板。");
  }

  function copySummaryResult(state) {
    const summary = state.translationResult?.summary || "";
    if (!summary.trim()) {
      state.translationUI?.toast?.("没有可复制的总结。");
      return;
    }
    copyText(summary);
    state.translationUI?.toast?.("已复制总结到剪贴板。");
  }

  function buildTranslationNoteHTML(result) {
    const escape = (text) => Zotero.Utilities.text2html(String(text || ""));
    const wrap = (text) =>
      `<div style="white-space: pre-wrap;">${escape(text)}</div>`;
    const parts = [`<h1>${escape(result.title || "翻译结果")}</h1>`];

    if (result.kind === "metadata") {
      for (const item of result.items || []) {
        const title = item.translatedTitle || item.title || "未命名文献";
        parts.push(`<h2>${escape(title)}</h2>`);
        if (item.translatedTitle && item.title) {
          parts.push(`<p><strong>原标题：</strong>${escape(item.title)}</p>`);
        }
        if (item.translatedAbstract) {
          parts.push("<h3>摘要译文</h3>", wrap(item.translatedAbstract));
        }
        if (item.abstract) {
          parts.push("<h3>摘要原文</h3>", wrap(item.abstract));
        }
        const info = [item.creators, item.year, item.publication, item.doi]
          .filter(Boolean)
          .join(" · ");
        if (info) {
          parts.push(`<p>${escape(info)}</p>`);
        }
        if (item.error) {
          parts.push(`<p><strong>错误：</strong>${escape(item.error)}</p>`);
        }
      }
    } else if (result.kind === "selection") {
      parts.push("<h2>原文</h2>", wrap(result.sourceText || ""));
      parts.push("<h2>译文</h2>", wrap(result.translatedText || ""));
    } else {
      if (result.summary) {
        parts.push("<h2>总结</h2>", wrap(result.summary));
      }
      parts.push("<h2>全文翻译</h2>", wrap(result.translatedText || ""));
    }

    parts.push(
      `<p><em>由 Zotero Web 生成 · ${escape(result.engineLabel || "")} · ${new Date().toLocaleString()}</em></p>`,
    );
    return parts.join("\n");
  }

  async function saveTranslationNote(state) {
    const result = state.translationResult;
    if (!result) {
      state.translationUI?.toast?.("没有可保存的翻译结果。");
      return;
    }
    let parentItem = null;
    try {
      if (result.parentItemID) {
        parentItem = Zotero.Items.get(result.parentItemID);
      } else if (result.itemID) {
        parentItem = Zotero.Items.get(result.itemID);
      }
    } catch (e) {
      parentItem = null;
    }

    const libraryID =
      parentItem?.libraryID ||
      result.libraryID ||
      Zotero.Libraries.userLibraryID;
    const note = new Zotero.Item("note");
    note.libraryID = libraryID;
    if (parentItem?.isRegularItem?.()) {
      note.parentItemID = parentItem.id;
    } else if (parentItem?.parentID) {
      note.parentItemID = parentItem.parentID;
    }
    note.setNote(buildTranslationNoteHTML(result));
    await note.saveTx();
    state.translationUI?.toast?.("已保存为 Zotero 笔记。");
  }

  async function sendTranslationToWebAI(state) {
    const result = state.translationResult;
    const sourceText = result?.sourceText || "";
    if (!sourceText.trim()) {
      state.translationUI?.toast?.("没有可发送的 PDF 全文。");
      return;
    }
    const target =
      result.targetLabel ||
      getTranslationDisplayConfig().targetLabel ||
      "简体中文";
    const prompt =
      `请阅读以下论文全文，并完成两件事：\n` +
      `1. 用${target}写一份结构化总结（研究问题、方法与数据、主要发现、贡献与创新、局限与启示）；\n` +
      `2. 将全文逐段翻译成${target}。\n\n` +
      `论文标题：${result.title || "未命名"}\n\n` +
      `===== 论文全文 =====\n${sourceText}`;
    copyText(prompt);
    setSidebarMode(state.win, "web");
    if (!state.hasLoadedURL) {
      loadURL(state, getHomepageURL());
    }
    showStatus(
      state,
      "已复制论文全文和提示词，请在当前网页 AI 中粘贴并发送。",
    );
  }

  async function handleTranslationDropItems(state, ids) {
    const items = (Array.isArray(ids) ? ids : [])
      .map((id) => Zotero.Items.get(id))
      .filter(Boolean);
    if (!items.length) {
      state.translationUI?.toast?.("没有识别到有效的文献条目。");
      return;
    }
    try {
      const pdf = await findPDFForTranslation(state.win, items, false);
      if (!pdf) {
        state.translationUI?.toast?.(
          "拖入的条目没有本地 PDF，已改为翻译题录。",
        );
        await startMetadataTranslation(state.win, items);
        return;
      }
      if (items.length > 1) {
        state.translationUI?.toast?.(
          "一次处理一个 PDF，已选择第一个可用附件。",
        );
      }
      await startPDFTranslation(state.win, pdf, { summarize: true });
    } catch (e) {
      await showTranslationError(state, e.message || String(e));
    }
  }

  async function handleTranslationDropFiles(state, files) {
    const candidates = Array.isArray(files) ? files : [];
    const fileInfo = candidates.find(
      (file) =>
        /\.pdf$/i.test(file?.name || "") ||
        file?.type === "application/pdf",
    );
    if (!fileInfo) {
      state.translationUI?.toast?.("请拖入 PDF 文件。");
      return;
    }
    if (!fileInfo.path) {
      state.translationUI?.toast?.(
        "无法读取拖入文件的路径，请从 Zotero 条目拖入或重试。",
      );
      return;
    }

    let file;
    try {
      file = Zotero.File.pathToFile(fileInfo.path);
    } catch (e) {
      file = null;
    }
    if (!file?.exists?.()) {
      state.translationUI?.toast?.("拖入的 PDF 文件不存在。");
      return;
    }

    let attachment;
    try {
      attachment = await Zotero.Attachments.importFromFile({
        file,
        libraryID: Zotero.Libraries.userLibraryID,
      });
    } catch (e) {
      state.translationUI?.toast?.(
        `临时导入 PDF 失败：${e.message || e}`,
      );
      return;
    }

    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        await attachment.eraseTx();
      } catch (e) {
        Zotero.debug(`[Zotero Web] Unable to remove temporary PDF: ${e}`);
      }
    };

    state.translationUI?.toast?.(
      "已临时导入 PDF 用于提取，处理完成后会自动移除。",
    );
    try {
      await startPDFTranslation(state.win, attachment, {
        summarize: true,
        cleanupAttachment: cleanup,
      });
    } finally {
      await cleanup();
    }
  }

  async function handleTranslationUIAction(state, action, payload = {}) {
    switch (action) {
      case "translate-selected-text":
        await startSelectionTranslation(state.win, payload?.text);
        break;
      case "translate-pdf":
        await startPDFTranslationFromSelection(state.win, false);
        break;
      case "translate-pdf-summary":
        await startPDFTranslationFromSelection(state.win, true);
        break;
      case "cancel":
        cancelTranslationJob(state);
        break;
      case "copy-translation":
        copyTranslationResult(state);
        break;
      case "copy-summary":
        copySummaryResult(state);
        break;
      case "save-note":
        try {
          await saveTranslationNote(state);
        } catch (e) {
          state.translationUI?.toast?.(
            `保存笔记失败：${e.message || e}`,
          );
        }
        break;
      case "open-web-ai":
        await sendTranslationToWebAI(state);
        break;
      case "drop-items":
        await handleTranslationDropItems(state, payload?.ids);
        break;
      case "drop-files":
        await handleTranslationDropFiles(state, payload?.files);
        break;
      default:
        Zotero.debug(`[Zotero Web] Unknown translation action: ${action}`);
    }
  }

  function registerItemTranslateMenu(win) {
    const doc = win.document;
    doc.getElementById(ids.itemTranslateMenu)?.remove();

    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (!itemMenu) {
      Zotero.debug("[Zotero Web] Could not find item context menu");
      return;
    }

    const menu = createXULElement(doc, "menu");
    menu.id = ids.itemTranslateMenu;
    menu.setAttribute("label", "翻译");
    menu.setAttribute("class", "menu-iconic zotero-web-item-translate-menu");
    menu.setAttribute("image", getTranslateIconURL());

    const popup = createXULElement(doc, "menupopup");
    popup.id = ids.itemTranslateMenuPopup;

    const createItem = (id, label, kind) => {
      const menuItem = createXULElement(doc, "menuitem");
      menuItem.id = id;
      menuItem.setAttribute("label", label);
      bindButtonAction(menuItem, () => {
        startTranslateMenuAction(win, kind).catch((e) => {
          Zotero.debug(`[Zotero Web] Translation menu action failed: ${e}`);
        });
      });
      return menuItem;
    };

    const metadataItem = createItem(
      ids.itemTranslateMetadata,
      "翻译题录（标题和摘要）",
      "metadata",
    );
    const pdfItem = createItem(
      ids.itemTranslatePDF,
      "翻译 PDF 全文",
      "pdf",
    );
    const summaryItem = createItem(
      ids.itemTranslatePDFSummary,
      "翻译并总结 PDF 全文",
      "pdf-summary",
    );

    popup.append(metadataItem, pdfItem, summaryItem);
    popup.addEventListener("popupshowing", () => {
      const items = getTranslationSelectedItems(win);
      const hasItems = items.length > 0;
      const hasPDF = items.some(itemHasLocalPDF);
      metadataItem.disabled = !hasItems;
      pdfItem.disabled = !hasPDF;
      summaryItem.disabled = !hasPDF;
    });

    menu.appendChild(popup);
    itemMenu.appendChild(menu);
  }

  function createNavButton(doc, label, tooltip, onClick) {
    const button = createXULElement(doc, "toolbarbutton");
    button.setAttribute("label", label);
    button.setAttribute("tooltiptext", tooltip);
    button.setAttribute("class", "zotero-web-nav-button");
    bindButtonAction(button, onClick);
    return button;
  }

  function makeProgressListener(win, state) {
    return {
      QueryInterface: ChromeUtils.generateQI([
        "nsIWebProgressListener",
        "nsISupportsWeakReference",
      ]),
      onStateChange() {
        updateNavigationState(state);
      },
      onProgressChange() {},
      onStatusChange() {},
      onSecurityChange() {},
      onContentBlockingEvent() {},
      onLocationChange(webProgress, request, location) {
        if (!location) {
          return;
        }
        const url = location.spec;
        state.address.value = url;
        updateNavigationState(state);
      },
    };
  }

  function ensureSidebar(win) {
    const existing = sidebarState.get(win);
    if (existing && existing.sidebar.isConnected) {
      return existing;
    }

    const doc = win.document;
    ensureStylesheet(doc);

    const insertionParent =
      doc.getElementById("zotero-context-pane")?.parentNode ||
      doc.getElementById("tabs-deck")?.parentNode;
    if (!insertionParent) {
      throw new Error("Unable to find Zotero main content area.");
    }

    doc.getElementById(ids.splitter)?.remove();
    doc.getElementById(ids.sidebar)?.remove();

    const splitter = createXULElement(doc, "splitter");
    splitter.id = ids.splitter;
    splitter.setAttribute("resizebefore", "closest");
    splitter.setAttribute("resizeafter", "closest");
    splitter.setAttribute("collapse", "after");
    splitter.setAttribute("orient", "horizontal");
    splitter.hidden = true;
    splitter.appendChild(createXULElement(doc, "grippy"));

    const sidebar = createXULElement(doc, "vbox");
    sidebar.id = ids.sidebar;
    sidebar.setAttribute("width", String(getSidebarWidth()));
    sidebar.setAttribute("minwidth", "320");
    sidebar.setAttribute("flex", "0");
    sidebar.hidden = true;
    sidebar.setAttribute("collapsed", "true");
    sidebar.style.width = `${getSidebarWidth()}px`;

    const brand = createXULElement(doc, "hbox");
    brand.id = ids.brand;
    brand.setAttribute("align", "center");

    const brandLogo = createXULElement(doc, "image");
    brandLogo.setAttribute("src", getLogoURL(96));
    brandLogo.setAttribute("class", "zotero-web-brand-logo");
    brandLogo.setAttribute("width", "40");
    brandLogo.setAttribute("height", "40");

    const brandText = createXULElement(doc, "vbox");
    brandText.setAttribute("flex", "1");
    const brandTitle = createXULElement(doc, "label");
    brandTitle.setAttribute("value", "Zotero Web");
    brandTitle.setAttribute("class", "zotero-web-brand-title");
    const brandSubtitle = createXULElement(doc, "label");
    brandSubtitle.setAttribute("value", "Web + Prompt + 翻译");
    brandSubtitle.setAttribute("class", "zotero-web-brand-subtitle");
    brandText.append(brandTitle, brandSubtitle);

    const modeSwitch = createXULElement(doc, "hbox");
    modeSwitch.setAttribute("class", "zotero-web-mode-switch");
    modeSwitch.setAttribute("align", "center");

    const webModeButton = createXULElement(doc, "toolbarbutton");
    webModeButton.id = ids.modeWebButton;
    webModeButton.setAttribute("label", "网页");
    webModeButton.setAttribute(
      "class",
      "zotero-web-mode-button zotero-web-mode-button-active",
    );
    webModeButton.setAttribute("tooltiptext", "显示网页侧边栏");
    bindButtonAction(webModeButton, () => setSidebarMode(win, "web"));

    const translateModeButton = createXULElement(doc, "toolbarbutton");
    translateModeButton.id = ids.modeTranslateButton;
    translateModeButton.setAttribute("label", "翻译");
    translateModeButton.setAttribute(
      "class",
      "zotero-web-mode-button",
    );
    translateModeButton.setAttribute(
      "tooltiptext",
      "显示翻译结果面板，可拖入文献或 PDF",
    );
    bindButtonAction(translateModeButton, () => openTranslationMode(win));

    modeSwitch.append(webModeButton, translateModeButton);
    brand.append(brandLogo, brandText, modeSwitch);

    const header = createXULElement(doc, "hbox");
    header.id = ids.header;
    header.setAttribute("align", "center");

    const backButton = createNavButton(doc, "后退", "Go back", () => {
      const state = sidebarState.get(win);
      try {
        state.browser.goBack();
      } catch (e) {
        updateNavigationState(state);
      }
    });
    const forwardButton = createNavButton(doc, "前进", "Go forward", () => {
      const state = sidebarState.get(win);
      try {
        state.browser.goForward();
      } catch (e) {
        updateNavigationState(state);
      }
    });
    const reloadButton = createNavButton(doc, "刷新", "Reload", () => {
      const state = sidebarState.get(win);
      try {
        state.browser.reload();
      } catch (e) {
        loadURL(state, state.address.value);
      }
    });
    const homeParts = createHomepageMenuButton(win);
    const promptParts = createPromptMenuButton(win);

    const address = createHTMLElement(doc, "input");
    address.id = ids.address;
    address.setAttribute("type", "url");
    address.setAttribute("spellcheck", "false");
    address.setAttribute("placeholder", DEFAULT_HOMEPAGES[0]);
    address.style.width = "100%";
    address.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        loadURL(sidebarState.get(win), address.value);
      }
    });

    const addressBox = createXULElement(doc, "hbox");
    addressBox.setAttribute("flex", "1");
    addressBox.setAttribute("align", "center");
    addressBox.style.minWidth = "120px";
    addressBox.appendChild(address);

    const closeButton = createNavButton(doc, "隐藏", "隐藏侧边栏并保留当前网页", () => {
      hideSidebar(win);
    });

    header.append(
      backButton,
      forwardButton,
      reloadButton,
      homeParts.homeMenuButton,
      promptParts.promptMenuButton,
      addressBox,
      closeButton,
    );

    const status = createXULElement(doc, "label");
    status.id = ids.status;
    status.hidden = true;

    const browserWrap = createXULElement(doc, "vbox");
    browserWrap.id = ids.browserWrap;
    browserWrap.setAttribute("flex", "1");

    const browser = createXULElement(doc, "browser");
    browser.id = ids.browser;
    browser.setAttribute("type", "content");
    browser.setAttribute("remote", "false");
    browser.setAttribute("disableglobalhistory", "true");
    browser.setAttribute("maychangeremoteness", "true");
    browser.setAttribute("flex", "1");
    browser.setAttribute("messagemanagergroup", "zoteroWebSidebar");

    const translationPane = createXULElement(doc, "vbox");
    translationPane.id = ids.translationPane;
    translationPane.setAttribute("flex", "1");
    translationPane.hidden = true;
    translationPane.style.minWidth = "0";
    translationPane.style.minHeight = "0";

    browserWrap.appendChild(browser);
    sidebar.append(brand, header, status, browserWrap, translationPane);

    const contextPane = doc.getElementById("zotero-context-pane");
    if (contextPane?.nextSibling) {
      insertionParent.insertBefore(splitter, contextPane.nextSibling);
      insertionParent.insertBefore(sidebar, splitter.nextSibling);
    } else {
      insertionParent.append(splitter, sidebar);
    }

    const state = {
      win,
      splitter,
      sidebar,
      brand,
      header,
      backButton,
      forwardButton,
      reloadButton,
      homeMenuButton: homeParts.homeMenuButton,
      homeMenuPopup: homeParts.homeMenuPopup,
      address,
      closeButton,
      status,
      promptMenuButton: promptParts.promptMenuButton,
      promptMenuPopup: promptParts.promptMenuPopup,
      modeWebButton: webModeButton,
      modeTranslateButton: translateModeButton,
      translationPane,
      translationBrowser: null,
      translationUI: null,
      translationReadyPromise: null,
      translationMessageHandler: null,
      translationJob: null,
      translationResult: null,
      lastWebSelection: "",
      lastWebSelectionAt: 0,
      mode: "web",
      browserWrap,
      browser,
      hasLoadedURL: false,
      progressListener: null,
      handleMouseUp: null,
    };

    state.progressListener = makeProgressListener(win, state);
    try {
      browser.addProgressListener(
        state.progressListener,
        Components.interfaces.nsIWebProgress.NOTIFY_LOCATION |
          Components.interfaces.nsIWebProgress.NOTIFY_STATE_NETWORK,
      );
    } catch (e) {
      Zotero.debug(`[Zotero Web] addProgressListener failed: ${e}`);
    }

    browser.addEventListener("pagetitlechanged", () => {
      const title = browser.contentTitle || browser.currentURI?.spec || config.addonName;
      header.setAttribute("tooltiptext", title);
    });

    state.handleMouseUp = () => saveSidebarWidth(state);
    win.addEventListener("mouseup", state.handleMouseUp, true);

    state.translationMessageHandler = (event) => {
      if (
        !state.translationBrowser ||
        event.source !== state.translationBrowser.contentWindow
      ) {
        return;
      }
      const data = event.data;
      if (!data || data.source !== "zotero-web-translation") {
        return;
      }
      handleTranslationUIAction(state, data.action, data.payload).catch((e) => {
        Zotero.debug(`[Zotero Web] Translation action failed: ${e}`);
        try {
          state.translationUI?.failJob?.(e.message || String(e));
        } catch (error) {
          // The translation panel may have been torn down.
        }
      });
    };
    win.addEventListener("message", state.translationMessageHandler);

    sidebarState.set(win, state);
    refreshHomepageMenu(state);
    refreshPromptList(state);
    updateNavigationState(state);
    return state;
  }

  function ensureStylesheet(doc) {
    if (doc.getElementById(ids.css)) {
      return;
    }
    const link = createHTMLElement(doc, "link");
    link.id = ids.css;
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", `chrome://${config.addonRef}/content/sidePanel.css`);

    const linkset = doc.querySelector("linkset");
    if (linkset) {
      linkset.appendChild(link);
    } else {
      doc.documentElement.prepend(link);
    }
  }

  function registerToolbarButton(win) {
    const doc = win.document;
    ensureStylesheet(doc);
    doc.getElementById(ids.toolbarContainer)?.remove();

    const toolbar = doc.getElementById("zotero-items-toolbar");
    if (!toolbar) {
      Zotero.debug("[Zotero Web] Could not find Zotero items toolbar");
      return;
    }

    const container = createXULElement(doc, "hbox");
    container.id = ids.toolbarContainer;
    container.setAttribute("align", "center");
    container.setAttribute("pack", "center");

    const button = createXULElement(doc, "toolbarbutton");
    button.id = ids.toolbarButton;
    button.setAttribute("label", "Zotero Web");
    setIconButtonImage(button, 64);
    button.setAttribute("tooltiptext", "打开/隐藏 Zotero Web 侧边栏");
    button.setAttribute("class", "zotero-tb-button zotero-web-toolbar-button");
    button.style.width = "28px";
    button.style.height = "28px";
    button.style.minWidth = "28px";
    button.style.minHeight = "28px";
    button.style.maxWidth = "28px";
    button.style.maxHeight = "28px";
    button.style.padding = "4px";
    button.style.boxSizing = "border-box";
    bindButtonAction(button, () => toggleWebSidebar(win));

    const translateButton = createXULElement(doc, "toolbarbutton");
    translateButton.id = ids.toolbarTranslateButton;
    translateButton.setAttribute("label", "翻译 PDF");
    const translateIcon = getTranslateIconURL();
    translateButton.setAttribute("image", translateIcon);
    translateButton.style.listStyleImage = `url("${translateIcon}")`;
    translateButton.setAttribute(
      "tooltiptext",
      "一键翻译并总结当前 PDF 全文",
    );
    translateButton.setAttribute(
      "class",
      "zotero-tb-button zotero-web-toolbar-button zotero-web-translate-toolbar-button",
    );
    translateButton.style.width = "28px";
    translateButton.style.height = "28px";
    translateButton.style.minWidth = "28px";
    translateButton.style.minHeight = "28px";
    translateButton.style.maxWidth = "28px";
    translateButton.style.maxHeight = "28px";
    translateButton.style.padding = "4px";
    translateButton.style.boxSizing = "border-box";
    bindButtonAction(translateButton, () => {
      startPDFTranslationFromSelection(win, true).catch((e) => {
        Zotero.debug(`[Zotero Web] Toolbar translation failed: ${e}`);
      });
    });

    container.appendChild(button);
    container.appendChild(translateButton);
    toolbar.appendChild(container);
  }

  function getReaderMainWindow(reader) {
    const win = reader?._window;
    if (win?.ZoteroPane || win?.document?.getElementById("zotero-items-toolbar")) {
      return win;
    }
    return Zotero.getMainWindow?.() || Zotero.getMainWindows?.()[0] || win;
  }

  function createReaderToolbarLogoButton(doc, reader) {
    const button = doc.createElement("button");
    button.id = ids.readerLogoButton;
    button.className = "toolbar-button zotero-web-reader-logo";
    button.type = "button";
    button.tabIndex = -1;
    button.title = "打开/隐藏 Zotero Web 侧边栏";
    button.style.width = "28px";
    button.style.height = "28px";
    button.style.minWidth = "28px";
    button.style.minHeight = "28px";
    button.style.maxWidth = "28px";
    button.style.maxHeight = "28px";
    button.style.padding = "4px";
    button.style.boxSizing = "border-box";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.overflow = "hidden";

    const image = doc.createElement("img");
    image.src = getLogoDataURL();
    image.alt = "";
    image.draggable = false;
    image.style.width = "18px";
    image.style.height = "18px";
    image.style.maxWidth = "18px";
    image.style.maxHeight = "18px";
    image.style.display = "block";
    image.style.objectFit = "contain";

    button.appendChild(image);
    button.addEventListener("click", (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      const mainWindow = getReaderMainWindow(reader);
      if (mainWindow) {
        toggleWebSidebar(mainWindow);
      }
    });

    return button;
  }

  function getReaderPDFAttachment(reader) {
    try {
      const item = Zotero.Items.get(reader?.itemID);
      return isPDFAttachment(item) ? item : null;
    } catch (e) {
      return null;
    }
  }

  function createReaderTranslateButton(doc, reader) {
    const button = doc.createElement("button");
    button.id = ids.readerTranslateButton;
    button.className = "toolbar-button zotero-web-reader-translate";
    button.type = "button";
    button.tabIndex = -1;
    button.title = "翻译并总结当前 PDF 全文";
    button.setAttribute("aria-label", "翻译并总结当前 PDF 全文");
    button.style.width = "28px";
    button.style.height = "28px";
    button.style.minWidth = "28px";
    button.style.minHeight = "28px";
    button.style.maxWidth = "28px";
    button.style.maxHeight = "28px";
    button.style.padding = "4px";
    button.style.boxSizing = "border-box";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.overflow = "hidden";
    button.style.border = "none";
    button.style.background = "transparent";
    button.style.cursor = "pointer";

    const image = doc.createElement("img");
    image.src = getTranslateIconURL();
    image.alt = "";
    image.draggable = false;
    image.style.width = "18px";
    image.style.height = "18px";
    image.style.maxWidth = "18px";
    image.style.maxHeight = "18px";
    image.style.display = "block";
    image.style.objectFit = "contain";

    button.appendChild(image);
    button.addEventListener("click", (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      const mainWindow = getReaderMainWindow(reader);
      if (!mainWindow) {
        return;
      }
      const attachment = getReaderPDFAttachment(reader);
      if (!attachment) {
        const state = openTranslationPanel(mainWindow);
        showTranslationError(
          state,
          "当前阅读器不是 PDF 附件，无法全文翻译。",
        ).catch(() => {});
        return;
      }
      startPDFTranslationWithCache(mainWindow, attachment, {
        summarize: true,
      }).catch((e) => {
        Zotero.debug(`[Zotero Web] Reader translation failed: ${e}`);
        const state = sidebarState.get(mainWindow);
        if (state) {
          showTranslationError(state, e.message || String(e)).catch(
            () => {},
          );
        }
      });
    });

    return button;
  }

  function createReaderToolbarSection(doc, reader) {
    const section = doc.createElement("div");
    section.id = ids.readerLogoSection;
    section.className = "section";
    section.appendChild(createReaderToolbarLogoButton(doc, reader));
    section.appendChild(createReaderTranslateButton(doc, reader));
    return section;
  }

  function handleReaderToolbarRender(event) {
    if (event.doc?.getElementById(ids.readerLogoSection)) {
      trackReaderSelection(event.reader);
      return;
    }
    event.append(createReaderToolbarSection(event.doc, event.reader));
    trackReaderSelection(event.reader);
  }

  function removeReaderToolbarButton(reader) {
    try {
      const doc = reader?._iframeWindow?.document;
      if (!doc) {
        return;
      }

      for (const section of Array.from(
        doc.querySelectorAll(`[id="${ids.readerLogoSection}"]`),
      )) {
        section.remove();
      }
      for (const button of Array.from(
        doc.querySelectorAll(`[id="${ids.readerLogoButton}"]`),
      )) {
        button.remove();
      }
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to remove reader toolbar button: ${e}`);
    }
  }

  function removeOpenReaderToolbarButtons() {
    for (const reader of Zotero.Reader?._readers || []) {
      removeReaderToolbarButton(reader);
    }
  }

  function injectReaderToolbarButton(reader) {
    try {
      const doc = reader?._iframeWindow?.document;
      const customSections = doc?.querySelector(".toolbar .custom-sections");
      if (
        !doc ||
        !customSections ||
        doc.getElementById(ids.readerLogoSection)
      ) {
        return;
      }
      customSections.appendChild(createReaderToolbarSection(doc, reader));
      trackReaderSelection(reader);
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to inject reader toolbar button: ${e}`);
    }
  }

  function injectOpenReaderToolbarButtons() {
    for (const reader of Zotero.Reader?._readers || []) {
      injectReaderToolbarButton(reader);
    }
  }

  function registerReaderToolbarButton() {
    if (readerToolbarRegistered || !Zotero.Reader?.registerEventListener) {
      return;
    }
    try {
      Zotero.Reader.registerEventListener(
        "renderToolbar",
        handleReaderToolbarRender,
        config.addonID,
      );
      readerToolbarRegistered = true;
      Services.tm.dispatchToMainThread(() => {
        try {
          injectOpenReaderToolbarButtons();
        } catch (e) {
          Zotero.debug(`[Zotero Web] Unable to inject open reader buttons: ${e}`);
        }
      });
    } catch (e) {
      readerToolbarRegistered = false;
      Zotero.debug(`[Zotero Web] Unable to register reader toolbar button: ${e}`);
    }
  }

  function unregisterReaderToolbarButton() {
    if (!readerToolbarRegistered) {
      return;
    }
    try {
      Zotero.Reader?._unregisterEventListenerByPluginID?.(config.addonID);
    } catch (e) {
      Zotero.debug(`[Zotero Web] Unable to unregister reader toolbar button: ${e}`);
    }
    removeOpenReaderToolbarButtons();
    readerToolbarRegistered = false;
  }

  function registerToolsMenu(win) {
    const doc = win.document;
    doc.getElementById(ids.toolsMenuItem)?.remove();

    const menuPopup = doc.getElementById("menu_ToolsPopup");
    if (!menuPopup) {
      Zotero.debug("[Zotero Web] Could not find Tools menu");
      return;
    }

    const menuItem = createXULElement(doc, "menuitem");
    menuItem.id = ids.toolsMenuItem;
    menuItem.setAttribute("label", "Open Zotero Web");
    bindButtonAction(menuItem, () => openWebSidebar(win));

    const firstSeparator = Array.from(menuPopup.children).find(
      (child) => child.localName === "menuseparator",
    );
    if (firstSeparator?.nextSibling) {
      menuPopup.insertBefore(menuItem, firstSeparator.nextSibling);
    } else {
      menuPopup.appendChild(menuItem);
    }
  }

  function unregisterFromWindow(win) {
    const doc = win.document;
    doc.getElementById(ids.toolbarContainer)?.remove();
    doc.getElementById(ids.toolsMenuItem)?.remove();
    doc.getElementById(ids.itemTranslateMenu)?.remove();
    doc.getElementById(ids.css)?.remove();

    const state = sidebarState.get(win);
    if (state) {
      saveSidebarWidth(state);
      if (state.translationJob) {
        state.translationJob.cancelled = true;
        state.translationJob = null;
      }
      if (state.translationMessageHandler) {
        win.removeEventListener("message", state.translationMessageHandler);
      }
      try {
        state.browser.removeProgressListener(state.progressListener);
      } catch (e) {
        // The browser may already have been torn down with the window.
      }
      if (state.handleMouseUp) {
        win.removeEventListener("mouseup", state.handleMouseUp, true);
      }
      state.splitter.remove();
      state.sidebar.remove();
      sidebarState.delete(win);
    } else {
      doc.getElementById(ids.splitter)?.remove();
      doc.getElementById(ids.sidebar)?.remove();
    }
  }

  async function registerPrefsPane() {
    await Zotero.PreferencePanes.register({
      pluginID: config.addonID,
      id: `${config.addonRef}-prefpane`,
      src: "content/preferences.xhtml",
      label: config.addonName,
      image: "content/icons/logo-64.png",
      scripts: ["content/preferences.js"],
    });
  }

  async function onStartup() {
    if (!Zotero[config.addonInstance]) {
      Zotero[config.addonInstance] = addon;
    }

    await Promise.all([Zotero.initializationPromise, Zotero.uiReadyPromise]);
    await registerPrefsPane();

    for (const win of Zotero.getMainWindows()) {
      await onMainWindowLoad(win);
    }

    registerReaderToolbarButton();
  }

  async function onMainWindowLoad(win) {
    registerToolbarButton(win);
    registerToolsMenu(win);
    registerItemTranslateMenu(win);
  }

  async function onMainWindowUnload(win) {
    unregisterFromWindow(win);
  }

  async function onShutdown() {
    unregisterReaderToolbarButton();

    for (const win of Zotero.getMainWindows()) {
      unregisterFromWindow(win);
    }
    delete Zotero[config.addonInstance];
  }

  const addon = {
    config,
    hooks: {
      onStartup,
      onShutdown,
      onMainWindowLoad,
      onMainWindowUnload,
    },
    api: {
      open: (initialURL) => openWebSidebar(Zotero.getMainWindow(), initialURL),
      close: () => hideSidebar(Zotero.getMainWindow()),
      toggle: () => toggleWebSidebar(Zotero.getMainWindow()),
      refreshHomepages: refreshAllHomepageMenus,
      refreshPrompts: refreshAllPromptLists,
      openTranslation: () => openTranslationPanel(Zotero.getMainWindow()),
      translateSelection: (items) =>
        startMetadataTranslation(Zotero.getMainWindow(), items),
      translatePDF: (attachment, options) =>
        startPDFTranslation(Zotero.getMainWindow(), attachment, options),
      testTranslation: (overrides) =>
        getTranslationEngine().testTranslation(overrides),
    },
  };

  Zotero[config.addonInstance] = addon;
})();
