"use strict";

/**
 * Translation engine for Zotero Web.
 *
 * Supports:
 * - Microsoft Edge free translator (no key)
 * - Google Translate free endpoint (no key)
 * - Any OpenAI-compatible chat completions API (DeepSeek, OpenAI, Ollama, ...)
 */
var ZoteroWebTranslationEngine = (function () {
  const PREF_PREFIX = "extensions.zotero.zoteroWeb";

  const TARGETS = {
    "zh-CN": { label: "简体中文", ms: "zh-Hans", google: "zh-CN" },
    "zh-TW": { label: "繁體中文", ms: "zh-Hant", google: "zh-TW" },
    en: { label: "English", ms: "en", google: "en" },
    ja: { label: "日本語", ms: "ja", google: "ja" },
    ko: { label: "한국어", ms: "ko", google: "ko" },
  };

  const ENGINES = {
    auto: "智能选择",
    microsoft: "微软 Bing 翻译（免费）",
    google: "Google 翻译（免费）",
    llm: "AI 大模型",
  };

  const BING_TRANSLATOR_URL = "https://www.bing.com/translator";
  const BING_TRANSLATE_PATH = "/ttranslatev3";
  const BING_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0";
  const GOOGLE_TRANSLATE_URL =
    "https://translate.googleapis.com/translate_a/single";

  const DEFAULT_TARGET = "zh-CN";
  const DEFAULT_ENGINE = "auto";
  const DEFAULT_MAX_CHARS = 120000;

  function getPref(key, fallback) {
    try {
      const value = Zotero.Prefs.get(`${PREF_PREFIX}.${key}`, true);
      return value === undefined || value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function normalizeTarget(value) {
    return Object.prototype.hasOwnProperty.call(TARGETS, value)
      ? value
      : DEFAULT_TARGET;
  }

  function normalizeEngine(value) {
    return Object.prototype.hasOwnProperty.call(ENGINES, value)
      ? value
      : DEFAULT_ENGINE;
  }

  function getConfig(overrides = {}) {
    const target = normalizeTarget(
      overrides.target ??
        overrides.translationTarget ??
        getPref("translationTarget", DEFAULT_TARGET),
    );
    const engine = normalizeEngine(
      overrides.engine ??
        overrides.translationEngine ??
        getPref("translationEngine", DEFAULT_ENGINE),
    );
    const maxChars = Math.max(
      4000,
      parseInt(
        overrides.maxChars ??
          overrides.fullTextMaxChars ??
          getPref("fullTextMaxChars", DEFAULT_MAX_CHARS),
        10,
      ) || DEFAULT_MAX_CHARS,
    );
    return {
      target,
      targetLabel: TARGETS[target].label,
      engine,
      engineLabel: ENGINES[engine],
      llmBaseURL: String(
        overrides.llmBaseURL ?? getPref("llmBaseURL", ""),
      ).trim(),
      llmApiKey: String(overrides.llmApiKey ?? getPref("llmApiKey", "")).trim(),
      llmModel: String(overrides.llmModel ?? getPref("llmModel", "")).trim(),
      maxChars,
    };
  }

  function isLocalEndpoint(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(
      String(url || "").trim(),
    );
  }

  function hasLLMConfig(config) {
    return Boolean(
      config.llmBaseURL &&
        config.llmModel &&
        (config.llmApiKey || isLocalEndpoint(config.llmBaseURL)),
    );
  }

  function delay(ms) {
    return new Promise((resolve) => {
      const win = Zotero.getMainWindow?.();
      if (win?.setTimeout) {
        win.setTimeout(resolve, ms);
      } else {
        resolve();
      }
    });
  }

  function responseText(xhr) {
    try {
      if (typeof xhr?.responseText === "string") {
        return xhr.responseText;
      }
      if (typeof xhr?.response === "string") {
        return xhr.response;
      }
    } catch (e) {
      // ignore
    }
    return "";
  }

  function buildHTTPError(source) {
    const xhr =
      source?.xmlhttp ||
      source?.xmlHttpRequest ||
      (source && typeof source.status === "number" ? source : null);
    const status = xhr?.status || source?.status || 0;
    const body = responseText(xhr) || source?.responseText || "";
    let detail = "";
    if (body) {
      try {
        const parsed = JSON.parse(body);
        detail =
          parsed?.error?.message ||
          parsed?.error ||
          parsed?.message ||
          parsed?.detail ||
          "";
        if (detail && typeof detail !== "string") {
          detail = JSON.stringify(detail);
        }
      } catch (e) {
        detail = String(body).slice(0, 300);
      }
    }
    if (!detail) {
      detail = source?.message || "网络请求失败";
    }
    const error = new Error(
      status ? `HTTP ${status}：${detail}` : String(detail),
    );
    error.status = status;
    error.responseText = body;
    return error;
  }

  async function request(method, url, options = {}) {
    const attempts = options.attempts || 2;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const xhr = await Zotero.HTTP.request(method, url, {
          body: options.body,
          headers: options.headers,
          responseType: "text",
          timeout: options.timeout || 60000,
          // Handle all statuses ourselves and avoid Zotero's built-in
          // 429/5xx retry loop, which can wait for a Retry-After value.
          successCodes: false,
          errorDelayMax: 0,
        });
        const status = xhr?.status || 0;
        if (status === 0) {
          throw buildHTTPError(xhr);
        }
        if (status >= 400) {
          const error = buildHTTPError(xhr);
          if ((status === 429 || status >= 500) && attempt < attempts) {
            await delay(1000 * attempt);
            continue;
          }
          throw error;
        }
        return xhr;
      } catch (e) {
        lastError = e;
        const status = e?.status || e?.xmlHttpRequest?.status || 0;
        const retriable = status === 0 || status === 429 || status >= 500;
        if (!retriable || attempt >= attempts) {
          break;
        }
        await delay(1000 * attempt);
      }
    }
    if (lastError?.status !== undefined) {
      throw lastError;
    }
    throw buildHTTPError(lastError);
  }

  // ---------------------------------------------------------------- Bing (free)

  let bingAuth = null;
  let bingSfx = 0;

  function parseBingAuth(html, pageURL) {
    const igMatch = String(html || "").match(/IG\s*:\s*"([^"]+)"/i);
    const iidMatch = String(html || "").match(/data-iid\s*=\s*"([^"]+)"/i);
    const paramsMatch = String(html || "").match(
      /params_AbusePreventionHelper\s*=\s*\[([^\]]*)\]/i,
    );
    if (!igMatch || !paramsMatch) {
      throw new Error(
        "Bing 翻译页面缺少鉴权参数，可能页面结构已变化。请改用 AI 大模型或稍后重试。",
      );
    }
    let params;
    try {
      params = JSON.parse(`[${paramsMatch[1]}]`);
    } catch (e) {
      throw new Error("Bing 翻译鉴权参数解析失败。");
    }
    const key = params?.[0];
    const token = params?.[1];
    if (!key || !token) {
      throw new Error("Bing 翻译鉴权参数无效。");
    }
    let origin = "https://www.bing.com";
    try {
      const uri = Services.io.newURI(pageURL || BING_TRANSLATOR_URL);
      origin = uri.prePath || origin;
    } catch (e) {
      // keep the default origin
    }
    return {
      ig: igMatch[1],
      iid: iidMatch?.[1] || "translator.5023",
      key: String(key),
      token: String(token),
      origin,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
  }

  async function getBingAuth(forceRefresh = false) {
    if (!forceRefresh && bingAuth && Date.now() < bingAuth.expiresAt) {
      return bingAuth;
    }
    bingAuth = null;
    const xhr = await request("GET", BING_TRANSLATOR_URL, {
      headers: {
        "User-Agent": BING_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      timeout: 30000,
    });
    const pageURL = xhr?.responseURL || BING_TRANSLATOR_URL;
    bingAuth = parseBingAuth(responseText(xhr), pageURL);
    return bingAuth;
  }

  async function bingTranslatePiece(text, auth, target) {
    const url =
      `${auth.origin}${BING_TRANSLATE_PATH}?isVertical=1` +
      `&IG=${encodeURIComponent(auth.ig)}` +
      `&IID=${encodeURIComponent(auth.iid)}` +
      `&SFX=${bingSfx++}`;
    const body =
      `fromLang=auto-detect&to=${encodeURIComponent(target)}` +
      `&text=${encodeURIComponent(text)}` +
      `&token=${encodeURIComponent(auth.token)}` +
      `&key=${encodeURIComponent(auth.key)}`;
    let xhr;
    try {
      xhr = await request("POST", url, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": BING_USER_AGENT,
          Referer: `${auth.origin}/translator`,
          Origin: auth.origin,
          Accept: "*/*",
        },
        body,
        timeout: 45000,
      });
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        const error = new Error("Bing 翻译鉴权已过期。");
        error.authExpired = true;
        throw error;
      }
      throw e;
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText(xhr));
    } catch (e) {
      throw new Error("Bing 翻译返回格式异常。");
    }
    if (parsed && !Array.isArray(parsed) && parsed.statusCode) {
      if (parsed.statusCode === 205) {
        const error = new Error("Bing 翻译鉴权已过期。");
        error.authExpired = true;
        throw error;
      }
      throw new Error(
        `Bing 翻译返回错误 ${parsed.statusCode}：${parsed.errorMessage || ""}`,
      );
    }
    const translated = parsed?.[0]?.translations?.[0]?.text;
    if (typeof translated !== "string") {
      throw new Error("Bing 翻译返回格式异常。");
    }
    return translated;
  }

  async function bingTranslate(text, config) {
    const target = TARGETS[config.target] || TARGETS[DEFAULT_TARGET];
    const pieces = splitForLimit(text, 900);
    let auth = await getBingAuth();
    const outputs = [];
    for (let index = 0; index < pieces.length; index += 1) {
      try {
        outputs.push(
          await bingTranslatePiece(pieces[index], auth, target.ms),
        );
      } catch (e) {
        if (e.authExpired) {
          auth = await getBingAuth(true);
          outputs.push(
            await bingTranslatePiece(pieces[index], auth, target.ms),
          );
        } else if (e.status === 429) {
          await delay(3000);
          outputs.push(
            await bingTranslatePiece(pieces[index], auth, target.ms),
          );
        } else {
          throw e;
        }
      }
      if (index < pieces.length - 1) {
        await delay(120);
      }
    }
    return outputs.join("\n");
  }

  // ------------------------------------------------------------------- Google

  function splitForLimit(text, maxLen) {
    const value = String(text || "");
    if (value.length <= maxLen) {
      return [value];
    }
    const parts = [];
    let remaining = value;
    while (remaining.length > maxLen) {
      let cut = maxLen;
      const window = remaining.slice(0, maxLen);
      const candidates = [
        window.lastIndexOf("。"),
        window.lastIndexOf("！"),
        window.lastIndexOf("？"),
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf("\n"),
        window.lastIndexOf(" "),
      ].filter((index) => index > maxLen * 0.45);
      if (candidates.length) {
        cut = Math.max(...candidates) + 1;
      }
      parts.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) {
      parts.push(remaining);
    }
    return parts.filter(Boolean);
  }

  async function googleTranslatePiece(text, target) {
    const url =
      `${GOOGLE_TRANSLATE_URL}?client=gtx&sl=auto&tl=${encodeURIComponent(target.google)}` +
      `&dt=t&ie=UTF-8&oe=UTF-8&q=${encodeURIComponent(text)}`;
    try {
      const xhr = await request("GET", url, { timeout: 20000 });
      let parsed;
      try {
        parsed = JSON.parse(responseText(xhr));
      } catch (e) {
        throw new Error("Google 翻译返回格式异常。");
      }
      const segments = parsed?.[0];
      if (!Array.isArray(segments)) {
        throw new Error("Google 翻译返回格式异常。");
      }
      return segments
        .map((segment) => (Array.isArray(segment) ? segment[0] || "" : ""))
        .join("");
    } catch (e) {
      if ((e.status === 400 || e.status === 414) && text.length > 120) {
        const mid = Math.floor(text.length / 2);
        const left = await googleTranslatePiece(text.slice(0, mid), target);
        const right = await googleTranslatePiece(text.slice(mid), target);
        return `${left}\n${right}`;
      }
      throw e;
    }
  }

  async function googleTranslate(text, config) {
    const target = TARGETS[config.target] || TARGETS[DEFAULT_TARGET];
    const cjk = /[㐀-鿿]/.test(text);
    const pieces = splitForLimit(text, cjk ? 600 : 1400);
    const translatedPieces = [];
    for (const piece of pieces) {
      translatedPieces.push(await googleTranslatePiece(piece, target));
    }
    return translatedPieces.join("\n");
  }

  // ---------------------------------------------------------------------- LLM

  function normalizeLLMEndpoint(rawURL) {
    let base = String(rawURL || "").trim();
    if (!base) {
      throw new Error("请先在设置中填写大模型 API 地址。");
    }
    if (
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i.test(base)
    ) {
      base = `http://${base}`;
    } else if (!/^[a-z][a-z0-9+.-]*:/i.test(base)) {
      base = `https://${base}`;
    }
    let uri;
    try {
      uri = Services.io.newURI(base);
    } catch (e) {
      throw new Error(`大模型 API 地址无效：${base}`);
    }
    if (!["http", "https"].includes(uri.scheme)) {
      throw new Error("大模型 API 地址只支持 http/https。");
    }
    base = base.replace(/\/+$/, "");
    if (/\/chat\/completions$/i.test(base)) {
      return base;
    }
    if (uri.host === "api.openai.com" && /^\/?$/.test(uri.path || "/")) {
      return `${base}/v1/chat/completions`;
    }
    if (/\/v\d+$/i.test(base)) {
      return `${base}/chat/completions`;
    }
    return `${base}/chat/completions`;
  }

  async function llmChat(config, messages, maxTokens = 4096, timeout = 120000) {
    if (!config.llmBaseURL) {
      throw new Error("请先在设置中填写大模型 API 地址。");
    }
    if (!config.llmModel) {
      throw new Error("请先在设置中填写模型名称。");
    }
    const endpoint = normalizeLLMEndpoint(config.llmBaseURL);
    const headers = { "Content-Type": "application/json" };
    if (config.llmApiKey) {
      headers.Authorization = `Bearer ${config.llmApiKey}`;
    }
    const body = JSON.stringify({
      model: config.llmModel,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      stream: false,
    });
    const xhr = await request("POST", endpoint, {
      headers,
      body,
      timeout,
      attempts: 2,
    });
    let parsed;
    try {
      parsed = JSON.parse(responseText(xhr));
    } catch (e) {
      throw new Error("大模型返回内容不是有效 JSON。");
    }
    if (parsed?.error) {
      const message =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error.message || JSON.stringify(parsed.error);
      throw new Error(`大模型接口错误：${message}`);
    }
    const choice = parsed?.choices?.[0];
    if (
      choice?.finish_reason === "length" ||
      choice?.finish_reason === "max_tokens"
    ) {
      throw new Error(
        "大模型输出被截断（达到输出上限），请减小分块或换用输出上限更大的模型。",
      );
    }
    let content = choice?.message?.content;
    if (Array.isArray(content)) {
      content = content.map((part) => part?.text || "").join("");
    }
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("大模型没有返回内容。");
    }
    return content.trim();
  }

  function stripCodeFence(text) {
    return String(text || "")
      .replace(/```[a-z0-9_-]*\s*\n?/gi, "")
      .replace(/```/g, "");
  }

  function cleanLLMTranslation(raw) {
    let output = stripCodeFence(raw);
    const tagged = output.match(/<translation>([\s\S]*?)<\/translation>/i);
    if (tagged) {
      output = tagged[1];
    }
    output = output
      .replace(/<\/?source>/gi, "")
      .replace(/<\/?translation>/gi, "")
      .replace(
        /^\s*(以下是|下面是)?\s*(中文|英文|日文|韩文)?\s*译文\s*[:：]\s*/i,
        "",
      );
    return output.trim();
  }

  async function llmTranslate(config, text) {
    const raw = await llmChat(
      config,
      [
        {
          role: "system",
          content:
            "你是专业的学术文献翻译引擎。你只输出译文，不添加解释、前言、后记或 Markdown 代码块。",
        },
        {
          role: "user",
          content:
            `请将 <source> 与 </source> 之间的学术文本翻译成${config.targetLabel}。\n` +
            "要求：忠实准确；保留段落结构、公式、引用编号、专有名词和数字；不省略内容；只输出译文。\n\n" +
            `<source>\n${text}\n</source>`,
        },
      ],
      4096,
      120000,
    );
    return cleanLLMTranslation(raw);
  }

  async function llmTranslateAndGist(config, text) {
    const raw = await llmChat(
      config,
      [
        {
          role: "system",
          content:
            "你是专业的学术文献翻译与精读助手。你只输出规定格式的内容，不添加额外说明。",
        },
        {
          role: "user",
          content:
            `请完成两项任务：\n` +
            `1. 将 <source> 与 </source> 之间的学术文本翻译成${config.targetLabel}，忠实准确，保留段落结构、公式与引用编号。\n` +
            "2. 用 2-5 条要点概括本段的核心信息（研究内容、方法、数据、结论等），不要编造。\n\n" +
            "严格按以下格式输出：\n" +
            "<translation>\n译文\n</translation>\n" +
            "<points>\n- 要点1\n- 要点2\n</points>\n\n" +
            `<source>\n${text}\n</source>`,
        },
      ],
      4096,
      120000,
    );
    const translationMatch = raw.match(
      /<translation>([\s\S]*?)<\/translation>/i,
    );
    const pointsMatch = raw.match(/<points>([\s\S]*?)<\/points>/i);
    let translated = translationMatch?.[1];
    if (!translated) {
      translated = raw
        .replace(/<points>[\s\S]*?<\/points>/gi, "")
        .replace(/<\/?translation>/gi, "")
        .replace(/<\/?source>/gi, "");
    }
    const points = (pointsMatch?.[1] || "")
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^\s*[-*•·]+\s*/, "")
          .replace(/^\s*\d+[.)、]\s*/, "")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 8);
    return { translated: cleanLLMTranslation(translated), points };
  }

  function buildMetadataText(metadata) {
    const lines = [];
    if (metadata.title) lines.push(`标题：${metadata.title}`);
    if (metadata.creators) lines.push(`作者：${metadata.creators}`);
    if (metadata.year) lines.push(`年份：${metadata.year}`);
    if (metadata.publication) lines.push(`来源：${metadata.publication}`);
    if (metadata.doi) lines.push(`DOI：${metadata.doi}`);
    if (metadata.abstract) {
      lines.push(`摘要：${metadata.abstract.slice(0, 6000)}`);
    }
    return lines.join("\n");
  }

  async function llmSummarize(config, points, metadata, fallbackText) {
    const metadataText = buildMetadataText(metadata || {});
    const pointsText = (points || [])
      .slice(0, 80)
      .map((point) => `- ${String(point || "").slice(0, 400)}`)
      .join("\n");
    const fallback = String(fallbackText || "").slice(0, 16000);
    const userContent =
      "论文题录：\n" +
      (metadataText || "（无题录信息）") +
      "\n\n" +
      (pointsText
        ? `全文分段要点：\n${pointsText}`
        : `全文内容（可能已截断）：\n<source>\n${fallback}\n</source>`) +
      "\n\n请基于以上信息，用" +
      config.targetLabel +
      "写一份结构化总结，使用 Markdown，包含以下小节：\n" +
      "## 一句话结论\n## 研究问题\n## 方法与数据\n## 主要发现\n## 贡献与创新\n## 局限与启示\n" +
      "要求：准确、具体、基于原文，不得编造数据；总字数控制在 500-900 字。";
    return llmChat(
      config,
      [
        {
          role: "system",
          content: "你是严谨的学术研究助手，擅长阅读论文并输出结构化摘要。",
        },
        { role: "user", content: userContent },
      ],
      2048,
      120000,
    );
  }

  function tagContent(text, tag) {
    const match = String(text || "").match(
      new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"),
    );
    return match ? stripCodeFence(match[1]).trim() : "";
  }

  async function translateMetadata(metadata, translator, config) {
    const title = String(metadata.title || "").trim();
    const abstract = String(metadata.abstract || "").trim();
    if (!title && !abstract) {
      return { translatedTitle: "", translatedAbstract: "" };
    }
    if (translator.isLLM) {
      const raw = await llmChat(
        config,
        [
          {
            role: "system",
            content: "你是专业的学术文献翻译助手，只翻译标题和摘要，不解释。",
          },
          {
            role: "user",
            content:
              `请将下列文献的标题与摘要翻译成${config.targetLabel}，保持学术表达。\n` +
              "严格按以下格式输出：\n<title>标题译文</title>\n<abstract>摘要译文</abstract>\n\n" +
              (title ? `标题：${title}\n` : "") +
              (abstract ? `摘要：${abstract.slice(0, 6000)}\n` : ""),
          },
        ],
        4096,
        120000,
      );
      let translatedTitle = tagContent(raw, "title");
      let translatedAbstract = tagContent(raw, "abstract");
      if (!translatedTitle && !translatedAbstract) {
        const cleaned = cleanLLMTranslation(raw);
        const titleMatch = cleaned.match(
          /(?:^|\n)\s*(?:#{1,6}\s*)?(?:标题|Title)\s*[:：]\s*([\s\S]*?)(?=\n\s*(?:#{1,6}\s*)?(?:摘要|Abstract)\s*[:：]|$)/i,
        );
        const abstractMatch = cleaned.match(
          /(?:^|\n)\s*(?:#{1,6}\s*)?(?:摘要|Abstract)\s*[:：]\s*([\s\S]*)$/i,
        );
        if (titleMatch?.[1]?.trim()) {
          translatedTitle = titleMatch[1].trim();
        }
        if (abstractMatch?.[1]?.trim()) {
          translatedAbstract = abstractMatch[1].trim();
        }
        if (!translatedTitle && !translatedAbstract) {
          if (title && !abstract) {
            translatedTitle = cleaned;
          } else if (abstract && !title) {
            translatedAbstract = cleaned;
          }
        }
      }
      if (title && !translatedTitle) {
        throw new Error(
          "大模型没有返回标题译文，请检查模型输出格式或更换模型后重试。",
        );
      }
      if (abstract && !translatedAbstract) {
        throw new Error(
          "大模型没有返回摘要译文，可能因输出上限被截断，请重试或更换模型。",
        );
      }
      return { translatedTitle, translatedAbstract };
    }
    const translatedTitle = title ? await translator.translate(title) : "";
    const translatedAbstract = abstract
      ? await translator.translate(abstract)
      : "";
    return { translatedTitle, translatedAbstract };
  }

  // ------------------------------------------------------------ Local summary

  function extractiveSummary(text) {
    const normalized = normalizeExtractedText(text);
    if (!normalized) {
      return "";
    }
    const sentences =
      normalized.match(/[^.!?。！？]+[.!?。！？]+["'”’)]?|[^.!?。！？]+$/g) ||
      [];
    const cleanSentences = sentences
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter(
        (sentence) =>
          sentence.length >= 30 &&
          sentence.length <= 320 &&
          !/^(references|bibliography|acknowledg|参考文献|致谢)\b/i.test(
            sentence,
          ),
      );

    const stopwords = new Set(
      (
        "the a an and or of to in for on with as by at from is are was were be been " +
        "this that these those we our it its their they them using used based can " +
        "also which such more than between into not have has had do does did"
      ).split(" "),
    );
    const frequencies = new Map();
    const addTerm = (term) => {
      if (!term) return;
      frequencies.set(term, (frequencies.get(term) || 0) + 1);
    };
    for (const word of normalized.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []) {
      if (!stopwords.has(word)) addTerm(word);
    }
    const cjkText = normalized.match(/[一-鿿]+/g) || [];
    for (const run of cjkText) {
      for (let index = 0; index < run.length - 1; index += 1) {
        addTerm(run.slice(index, index + 2));
      }
    }

    const scored = cleanSentences.map((sentence, index) => {
      let score = 0;
      for (const word of sentence.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []) {
        if (!stopwords.has(word)) score += frequencies.get(word) || 0;
      }
      for (const run of sentence.match(/[一-鿿]+/g) || []) {
        for (let i = 0; i < run.length - 1; i += 1) {
          score += frequencies.get(run.slice(i, i + 2)) || 0;
        }
      }
      if (
        /\b(result|conclusion|finding|method|approach|we propose|this paper)\b/i.test(
          sentence,
        ) ||
        /(结果表明|结论|方法|提出|本文)/.test(sentence)
      ) {
        score *= 1.35;
      }
      return {
        sentence,
        index,
        score: score / Math.sqrt(sentence.length + 1),
      };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .sort((a, b) => a.index - b.index);
    if (!top.length) {
      return "";
    }
    const bullets = top.map((entry) => `- ${entry.sentence}`).join("\n");
    return (
      "## 本地抽取式摘要\n\n" +
      "> 未使用大模型；以下为基于全文词频的抽取式要点。在插件设置中配置 AI 大模型可获得更高质量的结构化总结。\n\n" +
      bullets
    );
  }

  // ----------------------------------------------------------- Chunking / PDF

  function normalizeExtractedText(raw) {
    return String(raw || "")
      .replace(/\r\n?/g, "\n")
      .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")
      .replace(/\f/g, "\n\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function splitLongParagraph(paragraph, maxChars) {
    if (paragraph.length <= maxChars) {
      return [paragraph];
    }
    const pieces = [];
    let remaining = paragraph.trim();
    while (remaining.length > maxChars) {
      let cut = maxChars;
      const window = remaining.slice(0, maxChars);
      const candidates = [
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf("。"),
        window.lastIndexOf("！"),
        window.lastIndexOf("？"),
        window.lastIndexOf("; "),
        window.lastIndexOf("\n"),
        window.lastIndexOf(" "),
      ].filter((index) => index > maxChars * 0.45);
      if (candidates.length) {
        cut = Math.max(...candidates) + 1;
      }
      pieces.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) {
      pieces.push(remaining);
    }
    return pieces.filter(Boolean);
  }

  function chunkText(text, maxChars = 4000) {
    const normalized = normalizeExtractedText(text);
    if (!normalized) {
      return [];
    }
    const limit = Math.max(800, parseInt(maxChars, 10) || 4000);
    const paragraphs = normalized.split(/\n{2,}/);
    const chunks = [];
    let current = "";
    const flush = () => {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = "";
    };

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;
      if (trimmed.length > limit) {
        flush();
        const pieces = splitLongParagraph(trimmed, limit);
        for (let index = 0; index < pieces.length; index += 1) {
          if (index === pieces.length - 1) {
            current = pieces[index];
          } else {
            chunks.push(pieces[index]);
          }
        }
        continue;
      }
      const next = current ? `${current}\n\n${trimmed}` : trimmed;
      if (next.length > limit) {
        flush();
        current = trimmed;
      } else {
        current = next;
      }
    }
    flush();
    return chunks;
  }

  async function extractPDFText(attachment, maxChars) {
    if (!attachment?.id) {
      throw new Error("没有可读取的 PDF 附件。");
    }
    let raw = "";
    let source = "";
    let totalPages = 0;
    let extractedPages = 0;
    let extractionError = "";
    const limit = parseInt(maxChars, 10) || 0;
    const maxPages =
      limit > 0 ? Math.min(500, Math.max(5, Math.ceil(limit / 1200))) : null;

    try {
      if (Zotero.PDFWorker?.getFullText) {
        const result = await Zotero.PDFWorker.getFullText(
          attachment.id,
          maxPages,
          false,
        );
        raw = typeof result === "string" ? result : result?.text || "";
        totalPages = result?.totalPages || 0;
        extractedPages = result?.extractedPages || 0;
        source = "pdf-worker";
      }
    } catch (e) {
      extractionError = e?.message || String(e);
      Zotero.debug(`[Zotero Web] PDFWorker extraction failed: ${e}`);
    }

    if (!String(raw).trim()) {
      try {
        const cacheFile = Zotero.Fulltext?.getItemCacheFile?.(attachment);
        if (cacheFile?.exists?.()) {
          const cached = await Zotero.File.getContentsAsync(
            cacheFile.path,
            "UTF-8",
          );
          if (cached) {
            raw = cached;
            source = "fulltext-cache";
          }
        }
      } catch (e) {
        if (!extractionError) {
          extractionError = e?.message || String(e);
        }
        Zotero.debug(`[Zotero Web] Fulltext cache read failed: ${e}`);
      }
    }

    const text = normalizeExtractedText(raw);
    const originalLength = text.length;
    let truncated = false;
    let output = text;
    if (limit > 0 && output.length > limit) {
      output = output.slice(0, limit);
      truncated = true;
    }
    return {
      text: output,
      source,
      totalPages,
      extractedPages,
      maxPages,
      pageLimited: Boolean(
        maxPages && totalPages > maxPages && extractedPages && extractedPages <= maxPages,
      ),
      error: String(raw).trim() ? "" : extractionError,
      originalLength,
      length: output.length,
      truncated,
    };
  }

  // ---------------------------------------------------------------- Translator

  function providerLabel(provider, config) {
    if (provider === "llm") {
      return `AI 大模型（${config.llmModel || "未命名模型"}）`;
    }
    if (provider === "microsoft") {
      return "微软 Bing 翻译（免费）";
    }
    if (provider === "google") {
      return "Google 翻译（免费）";
    }
    return ENGINES[config.engine] || "翻译引擎";
  }

  function createTranslator(configInput) {
    const config = configInput || getConfig();
    const setting = normalizeEngine(config.engine);
    let provider;
    if (setting === "llm") {
      provider = "llm";
    } else if (setting === "auto") {
      provider = hasLLMConfig(config) ? "llm" : "microsoft";
    } else {
      provider = setting;
    }

    if (provider === "llm") {
      if (!config.llmBaseURL) {
        throw new Error("请先在插件设置中填写大模型 API 地址。");
      }
      if (!config.llmModel) {
        throw new Error("请先在插件设置中填写模型名称。");
      }
    }

    let canFallbackToGoogle = setting === "auto" && provider === "microsoft";
    let label =
      canFallbackToGoogle
        ? "免费翻译（自动）"
        : providerLabel(provider, config);

    async function translate(text) {
      const clean = String(text || "").trim();
      if (!clean) return "";
      if (provider === "llm") {
        return llmTranslate(config, clean);
      }
      if (provider === "microsoft") {
        try {
          return await bingTranslate(clean, config);
        } catch (e) {
          if (canFallbackToGoogle) {
            Zotero.debug(
              `[Zotero Web] Bing translation failed, falling back to Google: ${e}`,
            );
            provider = "google";
            canFallbackToGoogle = false;
            label = providerLabel("google", config);
            return googleTranslate(clean, config);
          }
          throw e;
        }
      }
      return googleTranslate(clean, config);
    }

    async function translateAndGist(text) {
      const clean = String(text || "").trim();
      if (!clean) {
        return { translated: "", points: [] };
      }
      if (provider === "llm") {
        return llmTranslateAndGist(config, clean);
      }
      return { translated: await translate(clean), points: [] };
    }

    async function summarize({ points = [], metadata = {}, text = "" } = {}) {
      if (provider === "llm") {
        try {
          return await llmSummarize(config, points, metadata, text);
        } catch (e) {
          Zotero.debug(
            `[Zotero Web] LLM summary failed, using extractive summary: ${e}`,
          );
          const local = extractiveSummary(text);
          if (local) {
            return `${local}\n\n> AI 总结失败：${e.message || e}`;
          }
          throw e;
        }
      }
      return extractiveSummary(text);
    }

    return {
      config,
      target: config.target,
      targetLabel: config.targetLabel,
      get label() {
        return label;
      },
      get isLLM() {
        return provider === "llm";
      },
      get chunkSize() {
        return provider === "llm" ? 2500 : 3500;
      },
      translate,
      translateAndGist,
      summarize,
    };
  }

  async function testTranslation(overrides = {}) {
    const config = getConfig(overrides);
    const translator = createTranslator(config);
    const text = await translator.translate(
      "This is a translation engine test. Academic papers are translated here.",
    );
    return {
      engine: translator.label,
      isLLM: translator.isLLM,
      targetLabel: config.targetLabel,
      text,
    };
  }

  return {
    TARGETS,
    ENGINES,
    getConfig,
    createTranslator,
    extractPDFText,
    chunkText,
    extractiveSummary,
    translateMetadata,
    testTranslation,
    normalizeExtractedText,
    normalizeLLMEndpoint,
    normalizeTarget,
    normalizeEngine,
    hasLLMConfig,
  };
})();
