const quickLinks = [
  { id: "vk", label: "ВК", url: "https://vk.com" },
  { id: "ok", label: "Одноклассники", url: "https://ok.ru" },
  { id: "telegram", label: "Telegram", url: "https://web.telegram.org" },
  { id: "whatsapp", label: "WhatsApp", url: "https://web.whatsapp.com" },
  { id: "max", label: "Max", url: "https://web.max.ru/" },
  {
    id: "news",
    label: "Новости",
    url: "https://news.google.com/topstories?hl=ru&gl=RU&ceid=RU:ru",
  },
];

const statusLabels = {
  open: "Открыто",
  closed: "Закрыто",
  paused: "Пауза",
  archived: "Архив",
};

function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(partial) {
    state = { ...state, ...partial };
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}

const store = createStore({
  cases: [],
  selectedCaseId: null,
  selectedCase: null,
});

const elements = {
  caseList: document.getElementById("caseList"),
  caseEmpty: document.getElementById("caseEmpty"),
  caseSummary: document.getElementById("caseSummary"),
  caseDetails: document.getElementById("caseDetails"),
  refreshCases: document.getElementById("refreshCases"),
  createCase: document.getElementById("createCase"),
  clearSelection: document.getElementById("clearSelection"),
  quickNav: document.getElementById("quickNav"),
  browserView: document.getElementById("browserView"),
  browserStatus: document.getElementById("browserStatus"),
  currentUrl: document.getElementById("currentUrl"),
  browserError: document.getElementById("browserError"),
  browserErrorMessage: document.getElementById("browserErrorMessage"),
  retryLoad: document.getElementById("retryLoad"),
  captureArtifact: document.getElementById("captureArtifact"),
  artifactFeedback: document.getElementById("artifactFeedback"),
  browserNotice: document.getElementById("browserNotice"),
  browserNoticeText: document.getElementById("browserNoticeText"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  views: {
    browser: document.getElementById("view-browser"),
    case: document.getElementById("view-case"),
  },
};

const navButtons = new Map();
let lastUrl = "https://vk.com";
let artifactFeedbackTimer = null;
let browserNoticeTimer = null;
const MAX_URL_DISPLAY_LENGTH = 140;

function formatDate(value) {
  if (!value) return "Неизвестно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Неизвестно";
  return date.toISOString().slice(0, 10);
}

function formatStatus(value) {
  if (!value) return "Неизвестно";
  const normalized = String(value).trim().toLowerCase();
  return statusLabels[normalized] || "Неизвестно";
}

function setSelectedCaseId(caseId) {
  const normalizedId = Number.isInteger(caseId) && caseId > 0 ? caseId : null;
  const state = store.getState();
  if (!normalizedId) {
    store.setState({ selectedCaseId: null, selectedCase: null });
    return;
  }
  const foundCase =
    state.cases.find((item) => item.id === normalizedId) || null;
  store.setState({ selectedCaseId: normalizedId, selectedCase: foundCase });
}

function setSelectedCase(caseItem) {
  if (!caseItem) {
    store.setState({ selectedCaseId: null, selectedCase: null });
    return;
  }
  store.setState({ selectedCaseId: caseItem.id, selectedCase: caseItem });
}

function renderCaseList(state) {
  elements.caseList.innerHTML = "";
  if (!state.cases.length) {
    elements.caseEmpty.hidden = false;
    return;
  }
  elements.caseEmpty.hidden = true;

  state.cases.forEach((caseItem) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "case-card";
    if (caseItem.id === state.selectedCaseId) {
      button.classList.add("is-active");
    }

    const title = document.createElement("div");
    title.className = "case-title";
    title.textContent = caseItem.title || `Дело ${caseItem.id}`;

    const meta = document.createElement("div");
    meta.className = "case-meta";

    const date = document.createElement("span");
    date.textContent = formatDate(caseItem.createdAt);

    const status = document.createElement("span");
    status.className = "status-tag";
    status.textContent = formatStatus(caseItem.status);

    meta.append(date, status);
    button.append(title, meta);

    button.addEventListener("click", () => {
      setSelectedCase(caseItem);
    });

    elements.caseList.appendChild(button);
  });
}

function renderCaseSummary(state) {
  if (state.selectedCase) {
    elements.caseSummary.textContent = `Дело ${state.selectedCase.id} - ${state.selectedCase.title}`;
    return;
  }
  if (state.selectedCaseId) {
    elements.caseSummary.textContent = `Дело ${state.selectedCaseId} - не найдено`;
    return;
  }
  elements.caseSummary.textContent = "Не выбрано";
}

function renderCaseDetails(state) {
  elements.caseDetails.innerHTML = "";
  if (!state.selectedCase && !state.selectedCaseId) {
    const empty = document.createElement("div");
    empty.className = "placeholder";
    empty.textContent = "Выберите дело, чтобы увидеть детали.";
    elements.caseDetails.appendChild(empty);
    return;
  }

  const rows = [];
  rows.push({
    label: "ID дела",
    value: state.selectedCase ? state.selectedCase.id : state.selectedCaseId,
  });
  rows.push({
    label: "Название",
    value: state.selectedCase ? state.selectedCase.title : "Неизвестно",
  });
  rows.push({
    label: "Статус",
    value: state.selectedCase
      ? formatStatus(state.selectedCase.status)
      : "Неизвестно",
  });
  rows.push({
    label: "Создано",
    value: state.selectedCase
      ? formatDate(state.selectedCase.createdAt)
      : "Неизвестно",
  });
  rows.push({
    label: "Обновлено",
    value: state.selectedCase
      ? formatDate(state.selectedCase.updatedAt)
      : "Неизвестно",
  });

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "detail-row";

    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("span");
    value.textContent = row.value ?? "Неизвестно";

    item.append(label, value);
    elements.caseDetails.appendChild(item);
  });
}

function updateBrowserCaseState(state) {
  if (state.selectedCaseId) {
    elements.browserView.dataset.caseId = String(state.selectedCaseId);
  } else {
    delete elements.browserView.dataset.caseId;
  }
}

function setStatus(text) {
  elements.browserStatus.textContent = text;
}

function formatUrlForDisplay(url) {
  if (!url) return "about:blank";
  const text = String(url);
  if (text.length <= MAX_URL_DISPLAY_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_URL_DISPLAY_LENGTH - 3)}...`;
}

function setCurrentUrl(url) {
  const fullUrl = url || "about:blank";
  elements.currentUrl.textContent = formatUrlForDisplay(fullUrl);
  elements.currentUrl.title = fullUrl;
  window.requestAnimationFrame(() => {
    updateBrowserBounds();
  });
}

function showBrowserError(message) {
  elements.browserError.hidden = false;
  elements.browserErrorMessage.textContent = message;
  setStatus("Ошибка");
}

function hideBrowserError() {
  elements.browserError.hidden = true;
  elements.browserErrorMessage.textContent = "";
}

function showBrowserNotice(message) {
  if (!elements.browserNotice || !elements.browserNoticeText) {
    return;
  }
  if (browserNoticeTimer) {
    window.clearTimeout(browserNoticeTimer);
    browserNoticeTimer = null;
  }
  elements.browserNoticeText.textContent = message;
  elements.browserNotice.hidden = false;
  browserNoticeTimer = window.setTimeout(() => {
    hideBrowserNotice();
  }, 8000);
}

function hideBrowserNotice() {
  if (!elements.browserNotice || !elements.browserNoticeText) {
    return;
  }
  if (browserNoticeTimer) {
    window.clearTimeout(browserNoticeTimer);
    browserNoticeTimer = null;
  }
  elements.browserNoticeText.textContent = "";
  elements.browserNotice.hidden = true;
}

function getBrowserNoticeForUrl(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "accounts.google.com") {
      return "Вход в Google недоступен во встроенном браузере. Продолжаем без логина.";
    }
  } catch (error) {
    return null;
  }
  return null;
}

function clearArtifactFeedback() {
  if (!elements.artifactFeedback) {
    return;
  }
  if (artifactFeedbackTimer) {
    window.clearTimeout(artifactFeedbackTimer);
    artifactFeedbackTimer = null;
  }
  elements.artifactFeedback.hidden = true;
  elements.artifactFeedback.textContent = "";
  elements.artifactFeedback.removeAttribute("data-tone");
}

function setArtifactFeedback(tone, message) {
  if (!elements.artifactFeedback) {
    return;
  }
  if (artifactFeedbackTimer) {
    window.clearTimeout(artifactFeedbackTimer);
    artifactFeedbackTimer = null;
  }
  elements.artifactFeedback.textContent = message;
  elements.artifactFeedback.dataset.tone = tone;
  elements.artifactFeedback.hidden = false;
  artifactFeedbackTimer = window.setTimeout(() => {
    clearArtifactFeedback();
  }, 6000);
}

function updateCaptureAvailability(state) {
  if (!elements.captureArtifact) {
    return;
  }
  const hasCase = Boolean(state.selectedCaseId);
  const apiReady =
    window.api && typeof window.api.captureArtifact === "function";
  elements.captureArtifact.disabled = !hasCase || !apiReady;
}

function setActiveQuickLink(linkId) {
  navButtons.forEach((button, id) => {
    if (id === linkId) {
      button.classList.add("is-active");
    } else {
      button.classList.remove("is-active");
    }
  });
}

function syncQuickLinkWithUrl(url) {
  if (!url) {
    setActiveQuickLink(null);
    return;
  }
  const match = quickLinks.find((link) => url.startsWith(link.url));
  setActiveQuickLink(match ? match.id : null);
}

function navigateTo(url, linkId) {
  if (!window.api || typeof window.api.browserNavigate !== "function") {
    showBrowserError("Браузер недоступен.");
    return;
  }
  lastUrl = url;
  hideBrowserError();
  setStatus("Загрузка");
  setCurrentUrl(url);
  if (linkId) {
    setActiveQuickLink(linkId);
  }

  const result = window.api.browserNavigate(url);
  if (result && typeof result.then === "function") {
    result
      .then((response) => {
        if (!response || !response.ok) {
          const message =
            response && response.error && response.error.message
              ? response.error.message
              : `Не удалось перейти на ${url}`;
          showBrowserError(message);
        }
      })
      .catch(() => {
        showBrowserError(`Не удалось перейти на ${url}`);
      });
  }
}

function initQuickNav() {
  quickLinks.forEach((link) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-btn";
    button.textContent = link.label;
    button.addEventListener("click", () => {
      navigateTo(link.url, link.id);
    });
    navButtons.set(link.id, button);
    elements.quickNav.appendChild(button);
  });
  setActiveQuickLink("vk");
}

function isBrowserTabActive() {
  return elements.views.browser.classList.contains("view--active");
}

function updateBrowserBounds() {
  if (
    !elements.browserView ||
    !window.api ||
    typeof window.api.setBrowserBounds !== "function" ||
    typeof window.api.setBrowserVisible !== "function"
  ) {
    return;
  }

  const visible = isBrowserTabActive();
  window.api.setBrowserVisible(visible);
  if (!visible) {
    return;
  }

  const rect = elements.browserView.getBoundingClientRect();
  const x = rect.left + elements.browserView.clientLeft;
  const y = rect.top + elements.browserView.clientTop;
  const width = elements.browserView.clientWidth;
  const height = elements.browserView.clientHeight;

  window.api.setBrowserBounds({
    x,
    y,
    width,
    height,
  });
}

function initBrowserBridge() {
  if (!window.api || typeof window.api.onBrowserState !== "function") {
    showBrowserError("IPC браузера недоступен.");
    return;
  }

  window.api.onBrowserState((state) => {
    if (!state) {
      return;
    }
    if (state.status === "loading") {
      setStatus("Загрузка");
    } else if (state.status === "ready") {
      setStatus("Готово");
    } else if (state.status === "error") {
      setStatus("Ошибка");
    }

    if (state.clearError) {
      hideBrowserError();
    }

    if (state.error) {
      showBrowserError(state.error.message || "Ошибка загрузки.");
    }

    if (state.notice && state.notice.message) {
      showBrowserNotice(state.notice.message);
    }

    if (state.url !== undefined) {
      lastUrl = state.url || lastUrl;
      setCurrentUrl(state.url);
      syncQuickLinkWithUrl(state.url);
      const notice = getBrowserNoticeForUrl(state.url);
      if (notice) {
        showBrowserNotice(notice);
      }
    }
  });
}

function initBrowserViewport() {
  if (!elements.browserView) {
    return;
  }
  const observer = new ResizeObserver(() => {
    updateBrowserBounds();
  });
  observer.observe(elements.browserView);
  window.addEventListener("resize", updateBrowserBounds);
  window.addEventListener("scroll", updateBrowserBounds, { passive: true });
  updateBrowserBounds();
}

function initTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.tabs.forEach((other) => other.classList.remove("is-active"));
      tab.classList.add("is-active");
      const viewKey = tab.dataset.view;
      Object.entries(elements.views).forEach(([key, view]) => {
        if (key === viewKey) {
          view.classList.add("view--active");
        } else {
          view.classList.remove("view--active");
        }
      });
      updateBrowserBounds();
    });
  });
}

async function handleCaptureArtifact() {
  if (!window.api || typeof window.api.captureArtifact !== "function") {
    setArtifactFeedback("error", "IPC захвата артефактов недоступен.");
    return;
  }
  const { selectedCaseId } = store.getState();
  if (!selectedCaseId) {
    setArtifactFeedback("warning", "Выберите дело перед сохранением.");
    return;
  }

  const button = elements.captureArtifact;
  if (!button || button.disabled) {
    return;
  }

  const initialLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Сохранение...";
  clearArtifactFeedback();

  try {
    const result = await window.api.captureArtifact(selectedCaseId, null);
    if (!result || !result.ok) {
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось сохранить артефакт.";
      setArtifactFeedback("error", message);
      return;
    }
    const warnings = Array.isArray(result.data && result.data.warnings)
      ? result.data.warnings
      : [];
    if (warnings.length) {
      setArtifactFeedback(
        "warning",
        `Частично сохранено: ${warnings.join(" ")}`
      );
    } else {
      setArtifactFeedback("success", "Артефакт сохранён.");
    }
  } catch (error) {
    console.error("Не удалось сохранить артефакт:", error);
    setArtifactFeedback("error", "Не удалось сохранить артефакт.");
  } finally {
    button.textContent = initialLabel;
    updateCaptureAvailability(store.getState());
  }
}

async function handleCreateCase() {
  if (!window.api || typeof window.api.createCase !== "function") {
    window.alert("IPC создания дел недоступен.");
    return;
  }

  const titleInput = window.prompt("Название дела", "Новое дело");
  if (titleInput === null) {
    return;
  }
  const title = titleInput.trim();
  if (!title) {
    window.alert("Название дела обязательно.");
    return;
  }

  const button = elements.createCase;
  if (!button || button.disabled) {
    return;
  }
  const initialLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Создание...";

  try {
    const result = await window.api.createCase({ title });
    if (!result || !result.ok) {
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось создать дело.";
      window.alert(message);
      return;
    }
    const createdCase = result.data;
    store.setState({
      selectedCaseId: createdCase.id,
      selectedCase: createdCase,
    });
    await loadCases();
  } catch (error) {
    console.error("Не удалось создать дело:", error);
    window.alert("Не удалось создать дело.");
  } finally {
    button.textContent = initialLabel;
    button.disabled = false;
  }
}

async function loadCases() {
  if (!window.api || typeof window.api.getCases !== "function") {
    elements.caseEmpty.hidden = false;
    elements.caseEmpty.textContent = "IPC недоступен.";
    return;
  }
  try {
    const result = await window.api.getCases();
    if (!result || !result.ok) {
      elements.caseEmpty.hidden = false;
      elements.caseEmpty.textContent = "Не удалось загрузить дела.";
      return;
    }
    const cases = Array.isArray(result.data) ? result.data : [];
    const selectedId = store.getState().selectedCaseId;
    const selectedCase = selectedId
      ? cases.find((item) => item.id === selectedId) || null
      : null;
    store.setState({ cases, selectedCase });
  } catch (error) {
    console.error("Не удалось загрузить дела:", error);
    elements.caseEmpty.hidden = false;
    elements.caseEmpty.textContent = "Не удалось загрузить дела.";
  }
}

function bindEvents() {
  elements.refreshCases.addEventListener("click", () => {
    loadCases();
  });
  if (elements.createCase) {
    elements.createCase.addEventListener("click", () => {
      handleCreateCase();
    });
  }
  elements.clearSelection.addEventListener("click", () => {
    setSelectedCase(null);
  });
  elements.retryLoad.addEventListener("click", () => {
    if (lastUrl) {
      navigateTo(lastUrl);
    }
  });
  if (elements.captureArtifact) {
    elements.captureArtifact.addEventListener("click", () => {
      handleCaptureArtifact();
    });
  }
  window.addEventListener("osint:set-case-id", (event) => {
    const caseId = event.detail ? Number(event.detail.caseId) : null;
    setSelectedCaseId(caseId);
  });
}

store.subscribe((state) => {
  renderCaseList(state);
  renderCaseSummary(state);
  renderCaseDetails(state);
  updateBrowserCaseState(state);
  updateCaptureAvailability(state);
});

initQuickNav();
initBrowserBridge();
initBrowserViewport();
initTabs();
bindEvents();
loadCases();
navigateTo(lastUrl, "vk");
