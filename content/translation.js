"use strict";

(function () {
  const SOURCE = "zotero-web-translation";
  const HTML_NS = "http://www.w3.org/1999/xhtml";

  let bridge = null;
  let dom = {};
  let activeTab = "translation";
  let currentKind = "";
  let summarizeRequested = false;
  let busy = false;
  let userChangedTab = false;
  let has = { summary: false, translation: false, meta: false };
  let toastTimer = null;
  let dragDepth = 0;
  let lastPageSelection = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function show(element, visible = true) {
    if (element) {
      element.classList.toggle("hidden", !visible);
    }
  }

  function setText(element, text) {
    if (element) {
      element.textContent = text || "";
    }
  }

  function createElement(tag, className) {
    const element = document.createElementNS(HTML_NS, tag);
    if (className) {
      element.className = className;
    }
    return element;
  }

  function send(action, payload = {}) {
    if (typeof bridge === "function") {
      try {
        bridge(action, payload);
        return;
      } catch (e) {
        console.error("[Zotero Web] bridge failed", e);
        toast(`翻译操作失败：${e.message || e}`);
        return;
      }
    }
    try {
      const target =
        window.parent && window.parent !== window ? window.parent : null;
      if (target) {
        target.postMessage({ source: SOURCE, action, payload }, "*");
        return;
      }
    } catch (e) {
      console.error("[Zotero Web] postMessage failed", e);
    }
    toast("翻译面板尚未连接到 Zotero，请稍候或重新打开侧边栏。");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return character;
      }
    });
  }

  function inlineFormat(escaped) {
    return String(escaped)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  }

  function renderMarkdown(text) {
    const lines = escapeHtml(text).replace(/\r\n?/g, "\n").split("\n");
    let html = "";
    let listType = null;
    let paragraph = [];

    const flushParagraph = () => {
      if (paragraph.length) {
        html += `<p>${inlineFormat(paragraph.join("<br/>"))}</p>`;
        paragraph = [];
      }
    };
    const closeList = () => {
      if (listType) {
        html += `</${listType}>`;
        listType = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        closeList();
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(4, heading[1].length + 1);
        html += `<h${level}>${inlineFormat(heading[2])}</h${level}>`;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
        flushParagraph();
        closeList();
        html += "<hr/>";
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        html += `<blockquote>${inlineFormat(quote[1])}</blockquote>`;
        continue;
      }

      const unordered = line.match(/^[-*•]\s+(.*)$/);
      if (unordered) {
        flushParagraph();
        if (listType !== "ul") {
          closeList();
          html += "<ul>";
          listType = "ul";
        }
        html += `<li>${inlineFormat(unordered[1])}</li>`;
        continue;
      }

      const ordered = line.match(/^\d+[.)、]\s+(.*)$/);
      if (ordered) {
        flushParagraph();
        if (listType !== "ol") {
          closeList();
          html += "<ol>";
          listType = "ol";
        }
        html += `<li>${inlineFormat(ordered[1])}</li>`;
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    flushParagraph();
    closeList();
    return html;
  }

  function setNotice(message, isError = false) {
    if (!dom.notice) return;
    dom.notice.textContent = message || "";
    dom.notice.classList.toggle("error", Boolean(isError));
    show(dom.notice, Boolean(message));
  }

  function setStatus(message) {
    setText(dom.statusText, message || "");
  }

  function setProgress(done, total) {
    if (!dom.progressWrap) return;
    show(dom.progressWrap, true);
    const totalNumber = Number(total) || 0;
    const doneNumber = Number(done) || 0;
    let percent = 0;
    if (totalNumber > 0) {
      percent = Math.min(100, Math.max(0, (doneNumber / totalNumber) * 100));
      setText(dom.progressText, `${doneNumber}/${totalNumber}`);
    } else {
      percent = doneNumber > 0 ? 100 : 0;
      setText(dom.progressText, "");
    }
    dom.progressFill.style.width = `${percent}%`;
  }

  function toast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message || "";
    show(dom.toast, true);
    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
      show(dom.toast, false);
      toastTimer = null;
    }, 2200);
  }

  function setTab(tab) {
    activeTab = tab;
    const panels = {
      summary: dom.panelSummary,
      translation: dom.panelTranslation,
      meta: dom.panelMeta,
    };
    for (const [name, panel] of Object.entries(panels)) {
      show(panel, name === tab);
    }
    for (const button of dom.tabs?.querySelectorAll("[data-tab]") || []) {
      button.classList.toggle("active", button.dataset.tab === tab);
    }
  }

  function configureTabs(visibility) {
    const buttons = {
      summary: dom.tabSummary,
      translation: dom.tabTranslation,
      meta: dom.tabMeta,
    };
    let visibleCount = 0;
    for (const [name, button] of Object.entries(buttons)) {
      const visible = Boolean(visibility[name]);
      show(button, visible);
      if (visible) visibleCount += 1;
    }
    show(dom.tabs, visibleCount > 1);
  }

  function setBusy(value) {
    busy = Boolean(value);
    if (dom.cancelButton) {
      dom.cancelButton.disabled = false;
      show(dom.cancelButton, busy);
    }
    for (const button of [
      dom.selectionButton,
      dom.pdfButton,
      dom.pdfSummaryButton,
    ]) {
      if (button) {
        button.disabled = busy;
      }
    }
  }

  function clearPanels() {
    if (dom.panelSummary) dom.panelSummary.textContent = "";
    if (dom.panelTranslation) dom.panelTranslation.textContent = "";
    if (dom.panelMeta) dom.panelMeta.textContent = "";
  }

  function resetUI() {
    busy = false;
    currentKind = "";
    summarizeRequested = false;
    userChangedTab = false;
    has = { summary: false, translation: false, meta: false };
    setBusy(false);
    clearPanels();
    clearDropOverlay();
    show(dom.dropzone, true);
    show(dom.result, false);
    show(dom.progressWrap, false);
    show(dom.actions, false);
    show(dom.cancelButton, false);
    show(dom.tabs, false);
    setNotice("");
    setText(dom.resultTitle, "");
    if (dom.resultMeta) dom.resultMeta.textContent = "";
    if (dom.progressFill) dom.progressFill.style.width = "0%";
    setText(dom.progressText, "");
    setStatus("就绪");
  }

  function setConfiguration(config = {}) {
    const target = config.targetLabel || "简体中文";
    const engine = config.engineLabel || "智能选择";
    setText(dom.engineLabel, `目标：${target} · 引擎：${engine}`);
  }

  function setEngineLabel(label) {
    if (!label) return;
    const current = dom.engineLabel?.textContent || "";
    const target = current.split("·")[0]?.trim() || "目标：简体中文";
    setText(dom.engineLabel, `${target} · 引擎：${label}`);
  }

  function appendSelectionSource(text) {
    const source = createElement("div", "selection-source");
    const label = createElement("div", "selection-source-label");
    label.textContent = "原文";
    const body = createElement("div", "selection-source-text");
    body.textContent = text;
    source.append(label, body);
    dom.panelTranslation.appendChild(source);
  }

  function beginJob(options = {}) {
    resetUI();
    currentKind =
      options.kind === "metadata"
        ? "metadata"
        : options.kind === "selection"
          ? "selection"
          : "pdf";
    summarizeRequested = Boolean(options.summarize);
    setBusy(true);
    show(dom.dropzone, false);
    show(dom.result, true);
    show(dom.progressWrap, true);
    show(dom.actions, false);
    setStatus(options.status || "准备中…");
    setProgress(0, options.total || 0);
    setNotice(options.notice || "");
    setText(dom.resultTitle, options.title || "翻译任务");
    if (dom.resultMeta) {
      dom.resultMeta.textContent = "";
      const chips = [];
      if (options.engine) chips.push(options.engine);
      if (options.targetLabel) chips.push(options.targetLabel);
      for (const chip of chips) {
        const span = createElement("span");
        span.textContent = chip;
        dom.resultMeta.appendChild(span);
      }
    }
    if (options.engine) {
      setEngineLabel(options.engine);
    }

    if (currentKind === "metadata") {
      configureTabs({ summary: false, translation: false, meta: true });
      setTab("meta");
      dom.panelMeta.appendChild(
        createPlaceholder("正在翻译题录，请稍候…"),
      );
    } else if (currentKind === "selection") {
      configureTabs({ summary: false, translation: true, meta: false });
      setTab("translation");
      if (options.sourceText) {
        appendSelectionSource(options.sourceText);
      }
      dom.panelTranslation.appendChild(
        createPlaceholder("正在翻译选中文字…"),
      );
    } else {
      configureTabs({
        summary: summarizeRequested,
        translation: true,
        meta: false,
      });
      setTab("translation");
      dom.panelTranslation.appendChild(
        createPlaceholder("正在提取并翻译 PDF 全文，译文会逐步显示在这里…"),
      );
      if (summarizeRequested) {
        dom.panelSummary.appendChild(
          createPlaceholder("全文翻译完成后将在这里生成结构化总结。"),
        );
      }
    }
  }

  function createPlaceholder(text) {
    const div = createElement("div", "placeholder-text");
    div.textContent = text;
    return div;
  }

  function clearPanelPlaceholder(panel) {
    const placeholder = panel?.querySelector(".placeholder-text");
    if (placeholder) {
      placeholder.remove();
    }
  }

  function appendMetadataItem(item = {}) {
    if (!dom.panelMeta) return;
    clearPanelPlaceholder(dom.panelMeta);
    has.meta = true;

    const card = createElement(
      "div",
      `meta-card${item.error ? " error-card" : ""}`,
    );
    const title = createElement("h3");
    title.textContent =
      item.translatedTitle || item.title || "未命名文献";
    card.appendChild(title);

    const addLabel = (text) => {
      const label = createElement("span", "meta-label");
      label.textContent = text;
      card.appendChild(label);
    };
    const addBlock = (text, className) => {
      const block = createElement("div", className);
      block.textContent = text;
      card.appendChild(block);
    };

    if (item.translatedTitle && item.title) {
      addLabel("原文标题");
      addBlock(item.title, "meta-original");
    }
    if (item.translatedAbstract) {
      addLabel("摘要译文");
      addBlock(item.translatedAbstract, "meta-translated");
      if (item.abstract) {
        addLabel("摘要原文");
        addBlock(item.abstract, "meta-original");
      }
    } else if (item.abstract) {
      addLabel("摘要原文");
      addBlock(item.abstract, "meta-original");
    }

    const infoParts = [
      item.creators,
      item.year,
      item.publication,
      item.doi ? `DOI: ${item.doi}` : "",
    ].filter(Boolean);
    if (infoParts.length) {
      const info = createElement("div", "meta-info");
      info.textContent = infoParts.join(" · ");
      card.appendChild(info);
    }

    if (item.error) {
      addLabel("错误");
      addBlock(item.error, "error-text");
    }

    dom.panelMeta.appendChild(card);
  }

  function appendTranslation(text) {
    const value = String(text || "");
    if (!value.trim()) return;
    clearPanelPlaceholder(dom.panelTranslation);
    let body = dom.panelTranslation.querySelector(".translation-body");
    if (!body) {
      body = createElement("div", "translation-body");
      dom.panelTranslation.appendChild(body);
    }
    const chunk = createElement("div", "translation-chunk");
    chunk.textContent = value.trim();
    body.appendChild(chunk);
    has.translation = true;
  }

  function setSummary(text) {
    const value = String(text || "").trim();
    has.summary = Boolean(value);
    if (dom.panelSummary) {
      dom.panelSummary.textContent = "";
      if (value) {
        const rendered = createElement("div", "rendered");
        rendered.innerHTML = renderMarkdown(value);
        dom.panelSummary.appendChild(rendered);
      } else {
        dom.panelSummary.appendChild(
          createPlaceholder("总结为空。请查看上方状态或错误信息。"),
        );
      }
    }
    if (value && !userChangedTab) {
      setTab("summary");
    }
  }

  function finishJob(message) {
    setBusy(false);
    setStatus(message || "完成");
    if (dom.progressWrap) {
      dom.progressText.textContent = "";
      dom.progressFill.style.width = "100%";
    }
    show(dom.actions, has.summary || has.translation || has.meta);
    show(dom.copySummaryButton, has.summary);
    show(
      dom.copyTranslationButton,
      has.translation || has.meta,
    );
    show(dom.saveNoteButton, has.translation || has.meta || has.summary);
    show(dom.webAIButton, currentKind === "pdf");
  }

  function failJob(message) {
    setBusy(false);
    setStatus("未完成");
    setNotice(message || "翻译失败。", true);
    if (
      currentKind === "pdf" &&
      summarizeRequested &&
      !has.summary &&
      dom.panelSummary
    ) {
      dom.panelSummary.textContent = "";
      dom.panelSummary.appendChild(
        createPlaceholder("总结未生成。请查看上方错误信息或已保留的部分译文。"),
      );
    }
    const hasContent = has.summary || has.translation || has.meta;
    show(dom.actions, hasContent);
    show(dom.copySummaryButton, has.summary);
    show(dom.copyTranslationButton, has.translation || has.meta);
    show(dom.saveNoteButton, hasContent);
    show(dom.webAIButton, currentKind === "pdf");
  }

  function isRelevantDrag(event) {
    const types = Array.from(event.dataTransfer?.types || []);
    return (
      types.includes("Files") ||
      types.includes("zotero/item") ||
      types.includes("zotero/collection")
    );
  }

  function clearDropOverlay() {
    dragDepth = 0;
    show(dom.dropOverlay, false);
  }

  function handleDragEnter(event) {
    if (!isRelevantDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth += 1;
    show(dom.dropOverlay, true);
  }

  function handleDragOver(event) {
    if (!isRelevantDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    show(dom.dropOverlay, true);
  }

  function handleDragLeave(event) {
    if (!isRelevantDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
      show(dom.dropOverlay, false);
    }
  }

  function handleDrop(event) {
    if (!isRelevantDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    clearDropOverlay();

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return;
    const types = Array.from(dataTransfer.types || []);
    if (types.includes("zotero/item")) {
      let ids = [];
      try {
        ids = String(dataTransfer.getData("zotero/item") || "")
          .split(/[\n,]/)
          .map((value) => parseInt(value.trim(), 10))
          .filter((value) => Number.isFinite(value) && value > 0);
      } catch (e) {
        // ignore
      }
      if (ids.length) {
        send("drop-items", { ids });
        return;
      }
      toast("没有读到拖入的文献条目。");
      return;
    }

    if (types.includes("zotero/collection")) {
      toast("暂不支持直接拖入分类，请拖入文献条目或 PDF 文件。");
      return;
    }

    const files = Array.from(dataTransfer.files || []);
    const payload = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      let path = "";
      let mozFullPath = "";
      try {
        const nsFile = dataTransfer.mozGetDataAt?.(
          "application/x-moz-file",
          index,
        );
        if (nsFile) {
          try {
            path =
              nsFile.QueryInterface(Components.interfaces.nsIFile)?.path || "";
          } catch (e) {
            path = nsFile.path || "";
          }
        }
      } catch (e) {
        path = "";
      }
      if (!path) {
        try {
          path = file.path || "";
        } catch (e) {
          path = "";
        }
      }
      try {
        mozFullPath = file.mozFullPath || "";
      } catch (e) {
        mozFullPath = "";
      }
      if (!path) {
        path = mozFullPath;
      }
      if (!path && /%[0-9A-F]{2}/i.test(mozFullPath)) {
        try {
          path = decodeURIComponent(mozFullPath);
        } catch (e) {
          path = "";
        }
      }
      payload.push({
        path,
        name: file.name || "",
        type: file.type || "",
        size: file.size || 0,
      });
    }
    if (payload.length) {
      send("drop-files", { files: payload });
      return;
    }
    toast("没有识别到可翻译的 PDF 或文献条目。");
  }

  function init() {
    dom = {
      engineLabel: byId("engine-label"),
      cancelButton: byId("btn-cancel"),
      selectionButton: byId("btn-selection"),
      pdfButton: byId("btn-pdf"),
      pdfSummaryButton: byId("btn-pdf-summary"),
      progressWrap: byId("progress-wrap"),
      statusText: byId("status-text"),
      progressText: byId("progress-text"),
      progressFill: byId("progress-fill"),
      notice: byId("notice"),
      dropzone: byId("dropzone"),
      result: byId("result"),
      resultTitle: byId("result-title"),
      resultMeta: byId("result-meta"),
      tabs: byId("tabs"),
      tabSummary: byId("tab-summary"),
      tabTranslation: byId("tab-translation"),
      tabMeta: byId("tab-meta"),
      panelSummary: byId("panel-summary"),
      panelTranslation: byId("panel-translation"),
      panelMeta: byId("panel-meta"),
      actions: byId("actions"),
      copySummaryButton: byId("btn-copy-summary"),
      copyTranslationButton: byId("btn-copy-translation"),
      saveNoteButton: byId("btn-save-note"),
      webAIButton: byId("btn-web-ai"),
      toast: byId("toast"),
      dropOverlay: byId("drop-overlay"),
    };

    dom.selectionButton?.addEventListener("click", () => {
      let text = "";
      try {
        text = String(window.getSelection?.()?.toString() || "").trim();
      } catch (e) {
        text = "";
      }
      if (!text) {
        text = lastPageSelection;
      }
      lastPageSelection = "";
      send("translate-selected-text", { text });
    });
    document.addEventListener("selectionchange", () => {
      try {
        const text = String(window.getSelection?.()?.toString() || "").trim();
        if (text) {
          lastPageSelection = text;
        }
      } catch (e) {
        // Selection tracking is best-effort.
      }
    });
    dom.pdfButton?.addEventListener("click", () => send("translate-pdf"));
    dom.pdfSummaryButton?.addEventListener("click", () =>
      send("translate-pdf-summary"),
    );
    dom.cancelButton?.addEventListener("click", () => send("cancel"));
    dom.copySummaryButton?.addEventListener("click", () =>
      send("copy-summary"),
    );
    dom.copyTranslationButton?.addEventListener("click", () =>
      send("copy-translation"),
    );
    dom.saveNoteButton?.addEventListener("click", () => send("save-note"));
    dom.webAIButton?.addEventListener("click", () => send("open-web-ai"));

    dom.tabs?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (!button || button.classList.contains("hidden")) return;
      userChangedTab = true;
      setTab(button.dataset.tab);
    });

    document.addEventListener("dragenter", handleDragEnter, true);
    document.addEventListener("dragover", handleDragOver, true);
    document.addEventListener("dragleave", handleDragLeave, true);
    document.addEventListener("drop", handleDrop, true);
    window.addEventListener("blur", clearDropOverlay);
    window.addEventListener("dragend", clearDropOverlay);

    resetUI();
    window.ZoteroWebTranslationUI = {
      setBridge(callback) {
        bridge = typeof callback === "function" ? callback : null;
      },
      setConfiguration,
      beginJob,
      setStatus,
      setProgress,
      appendMetadataItem,
      appendTranslation,
      setSummary,
      setNotice,
      finishJob,
      failJob,
      toast,
      reset: resetUI,
      isBusy() {
        return busy;
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
