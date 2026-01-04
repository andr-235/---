const { WebContentsView } = require("electron");
const {
  AUTH_BLOCKED_HOSTS,
  DEFAULT_NEWS_URL,
  MAX_URL_LENGTH,
} = require("../constants");
const { ok, fail } = require("../utils/ipc");
const { isPlainObject } = require("../utils/validation");

function createBrowserService() {
  let mainWindow = null;
  let browserView = null;
  let browserViewBounds = null;
  let browserTabVisible = true;
  let browserErrorActive = false;
  let lastSafeBrowserUrl = null;

  function normalizeBrowserUrl(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
      return null;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }
      return parsed.toString();
    } catch (error) {
      return null;
    }
  }

  function isAbortError(error) {
    if (!error) {
      return false;
    }
    if (error.code === "ERR_ABORTED") {
      return true;
    }
    if (error.errno === -3) {
      return true;
    }
    const message = typeof error.message === "string" ? error.message : "";
    return message.includes("ERR_ABORTED") || message.includes("(-3)");
  }

  function isBlockedAuthUrl(value) {
    try {
      const parsed = new URL(value);
      return AUTH_BLOCKED_HOSTS.has(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function resolveAuthFallbackUrl(value) {
    const candidates = [];
    try {
      const parsed = new URL(value);
      const continueParam = parsed.searchParams.get("continue");
      if (continueParam) {
        candidates.push(continueParam);
        try {
          candidates.push(decodeURIComponent(continueParam));
        } catch (error) {
          // ignore decode errors
        }
      }
    } catch (error) {
      // ignore parse errors
    }

    if (lastSafeBrowserUrl) {
      candidates.push(lastSafeBrowserUrl);
    }
    candidates.push(DEFAULT_NEWS_URL);

    for (const candidate of candidates) {
      const normalized = normalizeBrowserUrl(candidate);
      if (normalized && !isBlockedAuthUrl(normalized)) {
        return normalized;
      }
    }
    return DEFAULT_NEWS_URL;
  }

  function sendBrowserState(payload) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.send("browser:state", payload);
  }

  function notifyAuthBlocked() {
    sendBrowserState({
      notice: {
        message:
          "Вход в Google недоступен во встроенном браузере. Продолжаем без логина.",
      },
    });
  }

  function normalizeBrowserBounds(bounds) {
    if (!isPlainObject(bounds)) {
      return null;
    }
    const x = Number(bounds.x);
    const y = Number(bounds.y);
    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (![x, y, width, height].every(Number.isFinite)) {
      return null;
    }
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
      width: Math.max(0, Math.round(width)),
      height: Math.max(0, Math.round(height)),
    };
  }

  function updateBrowserViewVisibility() {
    if (!browserView) {
      return;
    }
    const shouldShow = browserTabVisible && !browserErrorActive;
    browserView.setVisible(shouldShow);
    if (shouldShow && browserViewBounds) {
      browserView.setBounds(browserViewBounds);
    }
  }

  function updateBrowserViewBounds(bounds) {
    if (!browserView || !bounds) {
      return;
    }
    browserViewBounds = bounds;
    browserView.setBounds(bounds);
  }

  function createBrowserView() {
    if (!mainWindow) {
      return;
    }
    browserView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: "persist:osint",
      },
    });

    browserView.setBackgroundColor("#ffffff");
    browserView.setBorderRadius(16);
    browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    browserView.setVisible(false);
    mainWindow.contentView.addChildView(browserView);

    const contents = browserView.webContents;
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    contents.setUserAgent(userAgent, "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");
    contents.setWindowOpenHandler(({ url }) => {
      const normalized = normalizeBrowserUrl(url);
      if (normalized && isBlockedAuthUrl(normalized)) {
        notifyAuthBlocked();
        return { action: "deny" };
      }
      if (normalized) {
        contents.loadURL(normalized).catch((error) => {
          console.error("[Browser] window open failed:", error);
        });
      }
      return { action: "deny" };
    });

    contents.on("did-start-loading", () => {
      browserErrorActive = false;
      updateBrowserViewVisibility();
      sendBrowserState({ status: "loading", clearError: true });
    });

    contents.on("did-stop-loading", () => {
      sendBrowserState({
        status: "ready",
        clearError: true,
        url: contents.getURL(),
      });
    });

    contents.on("did-navigate", (_event, url) => {
      if (url && !isBlockedAuthUrl(url)) {
        lastSafeBrowserUrl = url;
      }
      sendBrowserState({ url });
    });

    contents.on("did-navigate-in-page", (_event, url) => {
      if (url && !isBlockedAuthUrl(url)) {
        lastSafeBrowserUrl = url;
      }
      sendBrowserState({ url });
    });

    const handleBlockedAuth = (event, url) => {
      if (!isBlockedAuthUrl(url)) {
        return;
      }
      event.preventDefault();
      notifyAuthBlocked();
      const fallback = resolveAuthFallbackUrl(url);
      browserErrorActive = false;
      updateBrowserViewVisibility();
      contents.loadURL(fallback).catch((error) => {
        console.error("[Browser] auth fallback failed:", error);
      });
    };

    contents.on("will-navigate", handleBlockedAuth);
    contents.on("will-redirect", handleBlockedAuth);

    contents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) {
          return;
        }
        browserErrorActive = true;
        updateBrowserViewVisibility();
        const message = `${errorDescription || "Ошибка загрузки."} (${errorCode})`;
        sendBrowserState({
          status: "error",
          error: { message, code: errorCode },
          url: validatedURL,
        });
      }
    );

    contents.on("render-process-gone", (_event, details) => {
      browserErrorActive = true;
      updateBrowserViewVisibility();
      const message = `Процесс браузера завершился (${details.reason}).`;
      sendBrowserState({
        status: "error",
        error: { message, code: details.exitCode },
      });
    });
  }

  function attachWindow(window) {
    mainWindow = window;
    createBrowserView();
  }

  function destroy() {
    if (browserView) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.contentView.removeChildView(browserView);
        }
      } catch (error) {
        console.warn("[Browser] cleanup view failed:", error);
      }
      browserView.webContents.destroy();
      browserView = null;
    }
    browserViewBounds = null;
    mainWindow = null;
  }

  async function navigate(url) {
    const normalized = normalizeBrowserUrl(url);
    if (!normalized) {
      return fail("INVALID_ARGUMENT", "Некорректный URL.");
    }
    if (!browserView) {
      return fail("NOT_READY", "Браузер не готов.");
    }
    try {
      if (isBlockedAuthUrl(normalized)) {
        notifyAuthBlocked();
        const fallback = resolveAuthFallbackUrl(normalized);
        browserErrorActive = false;
        updateBrowserViewVisibility();
        await browserView.webContents.loadURL(fallback);
        return ok({ url: fallback, blocked: true });
      }
      browserErrorActive = false;
      updateBrowserViewVisibility();
      await browserView.webContents.loadURL(normalized);
      return ok({ url: normalized });
    } catch (error) {
      if (isAbortError(error)) {
        return ok({ url: normalized, aborted: true });
      }
      console.error("[Browser] loadURL failed:", error);
      browserErrorActive = true;
      updateBrowserViewVisibility();
      return fail("NAVIGATION_FAILED", "Не удалось загрузить страницу.");
    }
  }

  function setBounds(bounds) {
    const normalized = normalizeBrowserBounds(bounds);
    if (!normalized || !browserView) {
      return;
    }
    updateBrowserViewBounds(normalized);
  }

  function setVisible(visible) {
    browserTabVisible = Boolean(visible);
    updateBrowserViewVisibility();
  }

  function getWebContents() {
    if (!browserView) {
      return null;
    }
    return browserView.webContents;
  }

  return {
    attachWindow,
    destroy,
    navigate,
    setBounds,
    setVisible,
    getWebContents,
  };
}

module.exports = { createBrowserService };
