"use strict";

(function () {
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const prefsPrefix = "extensions.zotero.zoteroWeb";
  const DEFAULT_HOMEPAGES = [
    "https://chatgpt.com/",
    "https://chat.deepseek.com/",
  ];
  const DEFAULT_SIDEBAR_WIDTH = 520;
  const TRANSLATION_TARGETS = new Set([
    "zh-CN",
    "zh-TW",
    "en",
    "ja",
    "ko",
  ]);
  const TRANSLATION_ENGINES = new Set([
    "auto",
    "microsoft",
    "google",
    "llm",
  ]);
  const DEFAULT_TRANSLATION_TARGET = "zh-CN";
  const DEFAULT_TRANSLATION_ENGINE = "auto";
  const DEFAULT_FULL_TEXT_MAX_CHARS = 120000;
  const MIN_FULL_TEXT_MAX_CHARS = 4000;
  const MAX_FULL_TEXT_MAX_CHARS = 1000000;
  const LLM_PRESETS = {
    deepseek: {
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    },
    openai: {
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    },
    siliconflow: {
      baseURL: "https://api.siliconflow.cn/v1",
      model: "deepseek-ai/DeepSeek-V3",
    },
    ollama: {
      baseURL: "http://localhost:11434/v1",
      model: "qwen2.5:7b",
    },
    lmstudio: {
      baseURL: "http://localhost:1234/v1",
      model: "local-model",
    },
  };
  let boundDocument = null;
  let readyAttempts = 0;

  function getZotero() {
    if (typeof Zotero !== "undefined") {
      return Zotero;
    }
    const win = globalThis.window || globalThis;
    return win.Zotero || win.parent?.Zotero || win.opener?.Zotero;
  }

  function getServices() {
    if (typeof Services !== "undefined") {
      return Services;
    }
    const win = globalThis.window || globalThis;
    return win.Services || win.parent?.Services || win.opener?.Services;
  }

  function getPref(key) {
    return getZotero()?.Prefs?.get(`${prefsPrefix}.${key}`, true);
  }

  function setPref(key, value) {
    const zotero = getZotero();
    if (!zotero?.Prefs) {
      throw new Error("Zotero preferences are not available.");
    }
    zotero.Prefs.set(`${prefsPrefix}.${key}`, value, true);
  }

  function normalizeURL(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) {
      throw new Error("Please enter a URL.");
    }

    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      value = `https://${value}`;
    }

    const services = getServices();
    if (services?.io) {
      const uri = services.io.newURI(value);
      if (!["http", "https"].includes(uri.scheme)) {
        throw new Error("Only http and https URLs are supported.");
      }
      return uri.spec;
    }

    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Only http and https URLs are supported.");
    }
    return url.href;
  }

  function normalizeLLMBaseURL(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) {
      return "";
    }
    if (
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i.test(value)
    ) {
      value = `http://${value}`;
    }
    return normalizeURL(value);
  }

  function parseHomepageLines(rawValue) {
    const seen = new Set();
    const urls = [];
    for (const line of String(rawValue || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const url = normalizeURL(trimmed);
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
    if (!urls.length) {
      throw new Error("Please enter at least one homepage URL.");
    }
    return urls;
  }

  function parseHomepagesFromPref() {
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
        getZotero()?.debug?.(`[Zotero Web] Ignoring invalid homepage: ${e}`);
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
        getZotero()?.debug?.(`[Zotero Web] Invalid homepages pref: ${e}`);
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

  function getHomepagesText() {
    return parseHomepagesFromPref().join("\n");
  }

  function saveHomepages(urls) {
    setPref("homepages", JSON.stringify(urls));
    setPref("homepage", urls[0]);
    getZotero()?.ZoteroWeb?.api?.refreshHomepages?.();
  }

  function parsePositiveInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
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
      getZotero()?.debug?.(`[Zotero Web] Invalid prompts pref: ${e}`);
      return [];
    }
  }

  function savePrompts(prompts) {
    setPref("prompts", JSON.stringify(prompts));
    getZotero()?.ZoteroWeb?.api?.refreshPrompts?.();
  }

  function getPromptID(prompt, index) {
    return prompt.id || `prompt-${index}`;
  }

  function createPromptID() {
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createOption(doc, value, label) {
    const option = doc.createElementNS(HTML_NS, "option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function bindAction(button, action) {
    if (!button) {
      return;
    }

    let commandFired = false;
    const schedule = (callback) => {
      const win = button.ownerGlobal || button.ownerDocument?.defaultView;
      if (win?.setTimeout) {
        win.setTimeout(callback, 0);
      } else {
        callback();
      }
    };

    button.addEventListener("command", (event) => {
      event.preventDefault?.();
      commandFired = true;
      action(event);
      schedule(() => {
        commandFired = false;
      });
    });
    button.addEventListener("click", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault?.();
      schedule(() => {
        if (!commandFired) {
          action(event);
        }
      });
    });
  }

  function bindPreferences(doc = globalThis.document) {
    if (!doc || boundDocument === doc) {
      return;
    }

    const root = doc.getElementById("zotero-web-preferences-root");
    const homepageInput = doc.getElementById("zotero-web-homepage");
    const sidebarWidthInput = doc.getElementById("zotero-web-sidebar-width");
    const generalSaveButton = doc.getElementById("zotero-web-pref-general-save");
    const generalStatus = doc.getElementById("zotero-web-pref-general-status");
    const promptList = doc.getElementById("zotero-web-pref-prompt-list");
    const promptTitle = doc.getElementById("zotero-web-pref-prompt-title");
    const promptBody = doc.getElementById("zotero-web-pref-prompt-body");
    const promptNewButton = doc.getElementById("zotero-web-pref-prompt-new");
    const promptSaveButton = doc.getElementById("zotero-web-pref-prompt-save");
    const promptDeleteButton = doc.getElementById("zotero-web-pref-prompt-delete");
    const promptStatus = doc.getElementById("zotero-web-pref-prompt-status");
    const translationTargetSelect = doc.getElementById(
      "zotero-web-pref-translation-target",
    );
    const translationEngineSelect = doc.getElementById(
      "zotero-web-pref-translation-engine",
    );
    const llmPresetSelect = doc.getElementById("zotero-web-pref-llm-preset");
    const llmBaseInput = doc.getElementById("zotero-web-pref-llm-base");
    const llmKeyInput = doc.getElementById("zotero-web-pref-llm-key");
    const llmModelInput = doc.getElementById("zotero-web-pref-llm-model");
    const translationMaxInput = doc.getElementById(
      "zotero-web-pref-translation-max",
    );
    const translationTestButton = doc.getElementById(
      "zotero-web-pref-translation-test",
    );
    const translationSaveButton = doc.getElementById(
      "zotero-web-pref-translation-save",
    );
    const translationStatus = doc.getElementById(
      "zotero-web-pref-translation-status",
    );

    if (!root || !homepageInput) {
      return;
    }

    boundDocument = doc;

    function setElementStatus(element, message) {
      if (!element) {
        return;
      }
      element.textContent = message || "";
      element.setAttribute("value", message || "");
      element.hidden = !message;
    }

    function setPromptStatus(message) {
      setElementStatus(promptStatus, message);
    }

    function setGeneralStatus(message) {
      setElementStatus(generalStatus, message);
    }

    function setTranslationStatus(message) {
      setElementStatus(translationStatus, message);
    }

    function getSelectedPrompt() {
      const selectedID = promptList?.value || "";
      return parsePrompts().find(
        (prompt, index) => getPromptID(prompt, index) === selectedID,
      );
    }

    function refreshPromptList(selectedID) {
      if (!promptList || !promptTitle || !promptBody) {
        return;
      }

      const prompts = parsePrompts();
      promptList.textContent = "";

      prompts.forEach((prompt, index) => {
        promptList.appendChild(
          createOption(
            doc,
            getPromptID(prompt, index),
            prompt.title || "Untitled Prompt",
          ),
        );
      });

      promptList.value = selectedID || "";
      const selectedPrompt = getSelectedPrompt();
      promptTitle.value = selectedPrompt?.title || "";
      promptBody.value = selectedPrompt?.body || "";
      if (promptDeleteButton) {
        promptDeleteButton.disabled = !selectedPrompt;
      }
    }

    function clearEditor() {
      if (!promptList || !promptTitle || !promptBody) {
        return;
      }
      promptList.value = "";
      promptTitle.value = "";
      promptBody.value = "";
      setPromptStatus("");
      if (promptDeleteButton) {
        promptDeleteButton.disabled = true;
      }
      promptTitle.focus?.();
    }

    if (homepageInput) {
      homepageInput.value = getHomepagesText();
    }

    if (sidebarWidthInput) {
      sidebarWidthInput.value = String(
        parsePositiveInt(
          getPref("sidebarWidth"),
          DEFAULT_SIDEBAR_WIDTH,
          320,
          1200,
        ),
      );
    }

    function saveGeneralSettings(showMessage) {
      if (!homepageInput && !sidebarWidthInput) {
        return;
      }

      try {
        if (homepageInput) {
          const homepages = parseHomepageLines(homepageInput.value);
          saveHomepages(homepages);
          homepageInput.value = homepages.join("\n");
        }

        if (sidebarWidthInput) {
          const width = parsePositiveInt(
            sidebarWidthInput.value,
            DEFAULT_SIDEBAR_WIDTH,
            320,
            1200,
          );
          sidebarWidthInput.value = String(width);
          setPref("sidebarWidth", String(width));
        }

        setGeneralStatus(showMessage ? "已保存设置。" : "");
      } catch (e) {
        if (homepageInput) {
          homepageInput.value = getHomepagesText();
        }
        if (sidebarWidthInput) {
          sidebarWidthInput.value = String(
            parsePositiveInt(
              getPref("sidebarWidth"),
              DEFAULT_SIDEBAR_WIDTH,
              320,
              1200,
            ),
          );
        }
        setGeneralStatus(e.message || String(e));
        getZotero()?.debug?.(`[Zotero Web] Unable to save preferences: ${e}`);
      }
    }

    if (homepageInput) {
      const saveHomepage = () => {
        try {
          const homepages = parseHomepageLines(homepageInput.value);
          saveHomepages(homepages);
          homepageInput.value = homepages.join("\n");
          setGeneralStatus("已保存首页选项。");
        } catch (e) {
          homepageInput.value = getHomepagesText();
          setGeneralStatus(e.message || String(e));
        }
      };
      homepageInput.addEventListener("change", saveHomepage);
      homepageInput.addEventListener("blur", saveHomepage);
    }

    if (sidebarWidthInput) {
      sidebarWidthInput.value = String(
        parsePositiveInt(
          getPref("sidebarWidth"),
          DEFAULT_SIDEBAR_WIDTH,
          320,
          1200,
        ),
      );
      const saveSidebarWidth = () => {
        const width = parsePositiveInt(
          sidebarWidthInput.value,
          DEFAULT_SIDEBAR_WIDTH,
          320,
          1200,
        );
        sidebarWidthInput.value = String(width);
        setPref("sidebarWidth", String(width));
        setGeneralStatus("已保存侧边栏宽度。");
      };
      sidebarWidthInput.addEventListener("change", saveSidebarWidth);
      sidebarWidthInput.addEventListener("blur", saveSidebarWidth);
    }

    bindAction(generalSaveButton, () => saveGeneralSettings(true));

    if (translationTargetSelect) {
      const savedTarget = String(getPref("translationTarget") || "");
      translationTargetSelect.value = TRANSLATION_TARGETS.has(savedTarget)
        ? savedTarget
        : DEFAULT_TRANSLATION_TARGET;
    }

    if (translationEngineSelect) {
      const savedEngine = String(getPref("translationEngine") || "");
      translationEngineSelect.value = TRANSLATION_ENGINES.has(savedEngine)
        ? savedEngine
        : DEFAULT_TRANSLATION_ENGINE;
    }

    if (llmPresetSelect) {
      llmPresetSelect.value = "custom";
    }
    if (llmBaseInput) {
      llmBaseInput.value = String(getPref("llmBaseURL") || "");
    }
    if (llmKeyInput) {
      llmKeyInput.value = String(getPref("llmApiKey") || "");
    }
    if (llmModelInput) {
      llmModelInput.value = String(getPref("llmModel") || "");
    }
    if (translationMaxInput) {
      const savedMaxChars = Number.parseInt(getPref("fullTextMaxChars"), 10);
      translationMaxInput.value = String(
        Number.isFinite(savedMaxChars)
          ? savedMaxChars
          : DEFAULT_FULL_TEXT_MAX_CHARS,
      );
    }

    function saveTranslationSettings(showMessage) {
      try {
        const target = translationTargetSelect?.value || "";
        const engine = translationEngineSelect?.value || "";
        if (!TRANSLATION_TARGETS.has(target)) {
          throw new Error("请选择有效的翻译目标语言。");
        }
        if (!TRANSLATION_ENGINES.has(engine)) {
          throw new Error("请选择有效的翻译引擎。");
        }

        const maxChars = Number(translationMaxInput?.value);
        if (
          !Number.isInteger(maxChars) ||
          maxChars < MIN_FULL_TEXT_MAX_CHARS ||
          maxChars > MAX_FULL_TEXT_MAX_CHARS
        ) {
          throw new Error(
            `全文最大字符数必须是 ${MIN_FULL_TEXT_MAX_CHARS} 到 ${MAX_FULL_TEXT_MAX_CHARS} 之间的整数。`,
          );
        }

        const rawBaseURL = String(llmBaseInput?.value || "").trim();
        let baseURL = "";
        if (rawBaseURL) {
          try {
            baseURL = normalizeLLMBaseURL(rawBaseURL);
          } catch (e) {
            throw new Error(`大模型 API 地址无效：${e.message || e}`);
          }
        }

        const apiKey = String(llmKeyInput?.value || "").trim();
        const model = String(llmModelInput?.value || "").trim();
        if (engine === "llm" && (!baseURL || !model)) {
          throw new Error("选择 AI 大模型时，请填写 API 地址和模型名称。");
        }

        setPref("translationTarget", target);
        setPref("translationEngine", engine);
        setPref("llmBaseURL", baseURL);
        setPref("llmApiKey", apiKey);
        setPref("llmModel", model);
        setPref("fullTextMaxChars", String(maxChars));

        if (llmBaseInput) {
          llmBaseInput.value = baseURL;
        }
        if (llmKeyInput) {
          llmKeyInput.value = apiKey;
        }
        if (llmModelInput) {
          llmModelInput.value = model;
        }
        if (translationMaxInput) {
          translationMaxInput.value = String(maxChars);
        }
        if (showMessage) {
          setTranslationStatus("已保存翻译设置。");
        }
        return true;
      } catch (e) {
        setTranslationStatus(e.message || String(e));
        getZotero()?.debug?.(
          `[Zotero Web] Unable to save translation preferences: ${e}`,
        );
        return false;
      }
    }

    async function testTranslationConnection() {
      try {
        if (!saveTranslationSettings(false)) {
          return;
        }

        const api = getZotero()?.ZoteroWeb?.api;
        if (!api || typeof api.testTranslation !== "function") {
          setTranslationStatus("请先重启 Zotero 使插件加载完成。");
          return;
        }

        setTranslationStatus("测试中…");
        try {
          const result = await api.testTranslation();
          const engineLabel =
            result?.engine ||
            result?.provider ||
            translationEngineSelect?.value ||
            "翻译引擎";
          const translated =
            typeof result === "string"
              ? result
              : result?.text ?? result?.translation ?? result?.translated;
          setTranslationStatus(
            `测试成功 [${engineLabel}]：${
              String(translated || "").trim() || "（无译文）"
            }`,
          );
        } catch (e) {
          setTranslationStatus(`测试失败：${e?.message || String(e)}`);
          getZotero()?.debug?.(
            `[Zotero Web] Translation test failed: ${e}`,
          );
        }
      } catch (e) {
        setTranslationStatus(`测试失败：${e?.message || String(e)}`);
        getZotero()?.debug?.(
          `[Zotero Web] Translation test failed unexpectedly: ${e}`,
        );
      }
    }

    llmPresetSelect?.addEventListener("change", () => {
      const preset = LLM_PRESETS[llmPresetSelect.value];
      if (!preset) {
        return;
      }
      if (llmBaseInput) {
        llmBaseInput.value = preset.baseURL;
      }
      if (llmModelInput) {
        llmModelInput.value = preset.model;
      }
    });

    bindAction(translationSaveButton, () => {
      saveTranslationSettings(true);
    });

    bindAction(translationTestButton, () => {
      testTranslationConnection().catch((e) => {
        setTranslationStatus(`测试失败：${e?.message || String(e)}`);
        getZotero()?.debug?.(
          `[Zotero Web] Translation test failed unexpectedly: ${e}`,
        );
      });
    });

    promptList?.addEventListener("change", () => {
      const selectedPrompt = getSelectedPrompt();
      if (promptTitle) {
        promptTitle.value = selectedPrompt?.title || "";
      }
      if (promptBody) {
        promptBody.value = selectedPrompt?.body || "";
      }
      if (promptDeleteButton) {
        promptDeleteButton.disabled = !selectedPrompt;
      }
      setPromptStatus("");
    });

    bindAction(promptNewButton, clearEditor);

    bindAction(promptSaveButton, () => {
      if (!promptList || !promptTitle || !promptBody) {
        return;
      }

      const title = promptTitle.value.trim();
      const body = promptBody.value.trim();
      if (!title || !body) {
        setPromptStatus("请输入 Prompt 名称和内容。");
        return;
      }

      const selectedID = promptList.value;
      const prompts = parsePrompts();
      const selectedIndex = prompts.findIndex(
        (prompt, index) => getPromptID(prompt, index) === selectedID,
      );
      const now = Date.now();
      let savedID = selectedID;

      if (selectedIndex >= 0) {
        prompts[selectedIndex] = {
          ...prompts[selectedIndex],
          id: prompts[selectedIndex].id || selectedID || createPromptID(),
          title,
          body,
          updatedAt: now,
        };
        savedID = prompts[selectedIndex].id;
      } else {
        savedID = createPromptID();
        prompts.push({
          id: savedID,
          title,
          body,
          createdAt: now,
          updatedAt: now,
        });
      }

      savePrompts(prompts);
      refreshPromptList(savedID);
      setPromptStatus(`已保存 Prompt：${title}`);
    });

    bindAction(promptDeleteButton, () => {
      if (!promptList) {
        return;
      }

      const selectedPrompt = getSelectedPrompt();
      if (!selectedPrompt) {
        setPromptStatus("请先选择要删除的 Prompt。");
        return;
      }

      const selectedID = promptList.value;
      savePrompts(
        parsePrompts().filter(
          (prompt, index) => getPromptID(prompt, index) !== selectedID,
        ),
      );
      refreshPromptList("");
      setPromptStatus(`已删除 Prompt：${selectedPrompt.title}`);
    });

    refreshPromptList("");
  }

  function onReady() {
    try {
      bindPreferences(globalThis.document);
      if (!boundDocument && readyAttempts < 100) {
        readyAttempts += 1;
        globalThis.setTimeout?.(onReady, 100);
      }
    } catch (e) {
      getZotero()?.debug?.(`[Zotero Web] preferences.js failed: ${e}`);
      console.error("[Zotero Web] preferences.js failed", e);
      if (!boundDocument && readyAttempts < 100) {
        readyAttempts += 1;
        globalThis.setTimeout?.(onReady, 100);
      }
    }
  }

  globalThis.ZoteroWeb_Preferences = {
    init(event) {
      try {
        bindPreferences(
          event?.target?.ownerDocument ||
            event?.target?.document ||
            globalThis.document,
        );
      } catch (e) {
        getZotero()?.debug?.(`[Zotero Web] preferences init failed: ${e}`);
        console.error("[Zotero Web] preferences init failed", e);
      }
    },
  };

  if (globalThis.document?.readyState === "loading") {
    globalThis.document.addEventListener("DOMContentLoaded", onReady, {
      once: true,
    });
  } else {
    onReady();
  }
})();
