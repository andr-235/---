const quickLinks = [
  { id: "vk", label: "ВК", url: "https://vk.com" },
  { id: "ok", label: "Одноклассники", url: "https://ok.ru" },
  { id: "telegram", label: "Telegram", url: "https://web.telegram.org" },
  { id: "whatsapp", label: "WhatsApp", url: "https://web.whatsapp.com" },
  { id: "max", label: "Max", url: "https://max.com" },
  { id: "news", label: "Новости", url: "https://news.google.com" },
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
  clearSelection: document.getElementById("clearSelection"),
  quickNav: document.getElementById("quickNav"),
  browserView: document.getElementById("browserView"),
  browserStatus: document.getElementById("browserStatus"),
  currentUrl: document.getElementById("currentUrl"),
  browserError: document.getElementById("browserError"),
  browserErrorMessage: document.getElementById("browserErrorMessage"),
  retryLoad: document.getElementById("retryLoad"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  views: {
    browser: document.getElementById("view-browser"),
    case: document.getElementById("view-case"),
  },
};

const navButtons = new Map();
let lastUrl = "https://vk.com";

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

function setCurrentUrl(url) {
  elements.currentUrl.textContent = url || "about:blank";
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
  if (!elements.browserView) return;
  lastUrl = url;
  hideBrowserError();
  setStatus("Загрузка");
  setCurrentUrl(url);
  if (linkId) {
    setActiveQuickLink(linkId);
  }

  const result = elements.browserView.loadURL(url);
  if (result && typeof result.catch === "function") {
    result.catch(() => {
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

function initBrowserEvents() {
  if (!elements.browserView) return;
  elements.browserView.addEventListener("did-start-loading", () => {
    setStatus("Загрузка");
  });
  elements.browserView.addEventListener("did-stop-loading", () => {
    setStatus("Готово");
    hideBrowserError();
    const url = elements.browserView.getURL();
    lastUrl = url || lastUrl;
    setCurrentUrl(url);
    syncQuickLinkWithUrl(url);
  });
  elements.browserView.addEventListener("did-navigate", (event) => {
    lastUrl = event.url;
    setCurrentUrl(event.url);
    syncQuickLinkWithUrl(event.url);
  });
  elements.browserView.addEventListener("did-navigate-in-page", (event) => {
    lastUrl = event.url;
    setCurrentUrl(event.url);
    syncQuickLinkWithUrl(event.url);
  });
  const onFail = (event) => {
    if (event.errorCode === -3) {
      return;
    }
    const description = event.errorDescription || "Ошибка загрузки.";
    const message = `${description} (${event.errorCode})`;
    showBrowserError(message);
  };
  elements.browserView.addEventListener("did-fail-load", onFail);
  elements.browserView.addEventListener("did-fail-provisional-load", onFail);
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
    });
  });
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
  elements.clearSelection.addEventListener("click", () => {
    setSelectedCase(null);
  });
  elements.retryLoad.addEventListener("click", () => {
    if (lastUrl) {
      navigateTo(lastUrl);
    }
  });

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
});

initQuickNav();
initBrowserEvents();
initTabs();
bindEvents();
loadCases();
