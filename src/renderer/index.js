import {
  quickLinks,
  DEFAULT_URL,
  FEEDBACK_TIMEOUTS,
  MAX_ARTICLE_TEXT_LENGTH,
} from "./constants.js";
import { elements } from "./elements.js";
import {
  store,
  createEmptyLegalForm,
  buildLegalFormFromArtifact,
  createEmptySettingsForm,
  buildSettingsFormFromItem,
  getEmptyCaseSelectionState,
  getEmptyArtifactState,
  updateCaseFilters,
  updateArtifactFilters,
  updateSettingsSearch,
} from "./state.js";
import {
  normalizeId,
  createRafScheduler,
  createValueScheduler,
  createTimedFeedback,
  createTimedNotice,
  formatUrlForDisplay,
} from "./utils.js";
import {
  renderCaseList,
  renderCaseTable,
  renderCaseSummary,
  renderCaseDetails,
  renderArtifactTable,
  renderArtifactPreview,
  renderNotes,
  renderSettingsList,
  renderSettingsEditor,
} from "./renderers.js";
import { getLegalFormValues } from "./legal-card.js";

const navButtons = new Map();
let lastUrl = DEFAULT_URL;
let reportExporting = false;

const ARTICLE_TEXT_REGEX = /^Статья\s+\d+(?:\.\d+)*\s+[^,\n;]+$/iu;

function validateArticleTextInput(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return { ok: false, message: "Поле article_text обязательно для заполнения." };
  }
  if (text.length > MAX_ARTICLE_TEXT_LENGTH) {
    return {
      ok: false,
      message: `article_text превышает ${MAX_ARTICLE_TEXT_LENGTH} символов.`,
    };
  }
  const parts = text
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    return { ok: false, message: "Поле article_text обязательно для заполнения." };
  }
  const invalid = parts.find((part) => !ARTICLE_TEXT_REGEX.test(part));
  if (invalid) {
    return {
      ok: false,
      message:
        'Неверный формат article_text. Пример: "Статья 12.3 КоАП РФ, Статья 34 УК РФ".',
    };
  }
  return { ok: true, value: text };
}

const artifactFeedback = createTimedFeedback(
  elements.artifactFeedback,
  FEEDBACK_TIMEOUTS.artifact
);
const reportFeedback = createTimedFeedback(
  elements.reportFeedback,
  FEEDBACK_TIMEOUTS.report
);
const settingsFeedback = createTimedFeedback(
  elements.settingsFeedback,
  FEEDBACK_TIMEOUTS.settings
);
const browserNotice = createTimedNotice(
  elements.browserNotice,
  elements.browserNoticeText,
  FEEDBACK_TIMEOUTS.browserNotice
);

function resetCaseSelection() {
  store.setState(getEmptyCaseSelectionState());
}

function applyCaseSelection(caseId, caseItem) {
  store.setState({
    selectedCaseId: caseId ?? null,
    selectedCase: caseItem ?? null,
    selectedArtifactId: null,
    selectedArtifact: null,
    notes: [],
    legalForm: createEmptyLegalForm(),
    legalFeedback: null,
    legalFormSaving: false,
  });
  if (caseId) {
    loadArtifacts(caseId);
  }
}

function setSelectedCaseId(caseId) {
  const normalizedId = normalizeId(caseId);
  if (!normalizedId) {
    resetCaseSelection();
    return;
  }
  const foundCase =
    store.getState().cases.find((item) => item.id === normalizedId) || null;
  applyCaseSelection(normalizedId, foundCase);
}

function setSelectedCase(caseItem) {
  if (!caseItem) {
    resetCaseSelection();
    return;
  }
  applyCaseSelection(caseItem.id, caseItem);
}

function setSelectedArtifactId(artifactId) {
  const id = normalizeId(artifactId);
  const state = store.getState();
  const found = id ? state.artifacts.find((item) => item.id === id) || null : null;
  store.setState({
    selectedArtifactId: found ? found.id : null,
    selectedArtifact: found,
    legalForm: buildLegalFormFromArtifact(found),
    legalFeedback: null,
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
  const fullUrl = url || "about:blank";
  elements.currentUrl.textContent = formatUrlForDisplay(fullUrl);
  elements.currentUrl.title = fullUrl;
  scheduleBrowserBoundsUpdate();
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
  browserNotice.show(message);
}

function hideBrowserNotice() {
  browserNotice.hide();
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
  artifactFeedback.clear();
}

function setArtifactFeedback(tone, message) {
  artifactFeedback.set(tone, message);
}

function clearReportFeedback() {
  reportFeedback.clear();
}

function setReportFeedback(tone, message) {
  reportFeedback.set(tone, message);
}

function getReportExportHandler() {
  if (!window.api) {
    return null;
  }
  if (window.api.export && typeof window.api.export.caseReport === "function") {
    return window.api.export.caseReport;
  }
  if (typeof window.api.exportCaseReport === "function") {
    return window.api.exportCaseReport;
  }
  return null;
}

function setLegalFeedback(tone, message) {
  store.setState({
    legalFeedback: tone && message ? { tone, message } : null,
  });
}

function clearSettingsFeedback() {
  settingsFeedback.clear();
}

function setSettingsFeedback(tone, message) {
  settingsFeedback.set(tone, message);
}

function updateReportAvailability(state) {
  if (!elements.exportReport) {
    return;
  }
  const hasCase = Boolean(state.selectedCaseId);
  const handler = getReportExportHandler();
  elements.exportReport.disabled = !hasCase || !handler || reportExporting;
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

const scheduleBrowserBoundsUpdate = createRafScheduler(updateBrowserBounds);

function setActiveView(viewKey) {
  elements.tabs.forEach((tab) => {
    const tabView = tab.dataset.view;
    if (tabView === viewKey) {
      tab.classList.add("is-active");
    } else {
      tab.classList.remove("is-active");
    }
  });
  Object.entries(elements.views).forEach(([key, view]) => {
    if (key === viewKey) {
      view.classList.add("view--active");
    } else {
      view.classList.remove("view--active");
    }
  });
  updateBrowserBounds();
}

function toggleSidebar() {
  if (!elements.appRoot || !elements.toggleSidebar) return;
  const willCollapse = !elements.appRoot.classList.contains(
    "is-sidebar-collapsed"
  );
  elements.appRoot.classList.toggle("is-sidebar-collapsed", willCollapse);
  if (elements.sidebar) {
    elements.sidebar.classList.toggle("is-collapsed", willCollapse);
  }
  elements.toggleSidebar.title = willCollapse
    ? "Развернуть панель"
    : "Свернуть панель";
  updateBrowserBounds();
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
    scheduleBrowserBoundsUpdate();
  });
  observer.observe(elements.browserView);
  window.addEventListener("resize", scheduleBrowserBoundsUpdate);
  window.addEventListener("scroll", scheduleBrowserBoundsUpdate, {
    passive: true,
  });
  scheduleBrowserBoundsUpdate();
}

function initTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const viewKey = tab.dataset.view;
      setActiveView(viewKey);
    });
  });
}

async function handleExportReport() {
  const handler = getReportExportHandler();
  if (!handler) {
    setReportFeedback("error", "IPC экспорта отчёта недоступен.");
    return;
  }
  const { selectedCaseId } = store.getState();
  if (!selectedCaseId) {
    setReportFeedback("warning", "Выберите дело для экспорта отчёта.");
    return;
  }
  if (reportExporting) {
    return;
  }

  const button = elements.exportReport;
  const initialLabel = button ? button.textContent : null;
  reportExporting = true;
  clearReportFeedback();
  updateReportAvailability(store.getState());
  if (button) {
    button.disabled = true;
    button.textContent = "Экспорт...";
  }

  try {
    const result = await handler(selectedCaseId, {});
    if (!result || !result.ok) {
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось экспортировать отчёт.";
      setReportFeedback("error", message);
      return;
    }
    const pdfPath = result.data && result.data.pdfPath;
    const htmlPath = result.data && result.data.htmlPath;
    const message = pdfPath
      ? `Отчёт сохранён: ${pdfPath}`
      : htmlPath
        ? `Отчёт сохранён: ${htmlPath}`
        : "Отчёт сформирован.";
    setReportFeedback("success", message);
  } catch (error) {
    console.error("Не удалось экспортировать отчёт:", error);
    setReportFeedback("error", "Не удалось экспортировать отчёт.");
  } finally {
    reportExporting = false;
    if (button) {
      button.textContent = initialLabel || "Экспорт отчёта";
      button.disabled = false;
    }
    updateReportAvailability(store.getState());
  }
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
    if (result.data && result.data.artifact) {
      const artifact = result.data.artifact;
      const state = store.getState();
      const artifacts = Array.isArray(state.artifacts)
        ? [artifact, ...state.artifacts]
        : [artifact];
      store.setState({
        artifacts,
        selectedArtifactId: artifact.id,
        selectedArtifact: artifact,
        legalForm: buildLegalFormFromArtifact(artifact),
        legalFeedback: null,
        legalFormSaving: false,
      });
    } else if (selectedCaseId) {
      loadArtifacts(selectedCaseId);
    }
  } catch (error) {
    console.error("Не удалось сохранить артефакт:", error);
    setArtifactFeedback("error", "Не удалось сохранить артефакт.");
  } finally {
    button.textContent = initialLabel;
    updateCaptureAvailability(store.getState());
  }
}

async function handleCreateCase(event) {
  if (event) {
    event.preventDefault();
  }
  if (!window.api || typeof window.api.createCase !== "function") {
    window.alert("IPC создания дел недоступен.");
    return;
  }
  const title = elements.caseFormTitle.value.trim();
  const description = elements.caseFormDescription.value.trim();
  const assignedTo = elements.caseFormAssigned.value.trim();
  const status = elements.caseFormStatus.value;

  if (!title) {
    window.alert("Название дела обязательно.");
    return;
  }

  const button = elements.caseFormSubmit;
  if (button && !button.disabled) {
    button.disabled = true;
    button.textContent = "Создание...";
  }

  try {
    const payload = {
      title,
      description: description || null,
      assignedTo: assignedTo || null,
      status,
    };
    const result = await window.api.createCase(payload);
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
    if (elements.caseForm) {
      elements.caseForm.reset();
    }
    setActiveView("case");
  } catch (error) {
    console.error("Не удалось создать дело:", error);
    window.alert("Не удалось создать дело.");
  } finally {
    if (button) {
      button.textContent = "Создать дело";
      button.disabled = false;
    }
  }
}

async function openEditCaseDialog(caseItem) {
  if (!caseItem || !window.api || typeof window.api.updateCase !== "function") {
    return;
  }
  const title = window.prompt("Название дела", caseItem.title || "");
  if (title === null || !title.trim()) {
    return;
  }
  const description = window.prompt("Описание", caseItem.description || "");
  if (description === null) {
    return;
  }
  const assignedTo = window.prompt(
    "Назначенный",
    caseItem.assignedTo || ""
  );
  if (assignedTo === null) {
    return;
  }
  const status = window.prompt(
    "Статус (open/paused/closed/archived)",
    caseItem.status || "open"
  );
  if (status === null) {
    return;
  }
  try {
    const result = await window.api.updateCase(caseItem.id, {
      title: title.trim(),
      description: description.trim(),
      assignedTo: assignedTo.trim(),
      status: status.trim(),
    });
    if (!result || !result.ok) {
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось обновить дело.";
      window.alert(message);
      return;
    }
    await loadCases();
    const updated =
      result.data &&
      store.getState().cases.find((item) => item.id === result.data.id);
    if (updated) {
      setSelectedCase(updated);
    }
  } catch (error) {
    console.error("Не удалось обновить дело:", error);
    window.alert("Не удалось обновить дело.");
  }
}

async function handleDeleteCase(caseItem) {
  if (!caseItem || !window.api || typeof window.api.deleteCase !== "function") {
    return;
  }
  const confirmed = window.confirm(
    `Удалить дело ${caseItem.id}? Артефакты будут удалены.`
  );
  if (!confirmed) {
    return;
  }
  try {
    const result = await window.api.deleteCase(caseItem.id);
    if (!result || !result.ok) {
      window.alert("Не удалось удалить дело.");
      return;
    }
    const state = store.getState();
    const isActive = state.selectedCaseId === caseItem.id;
    await loadCases();
    if (isActive) {
      setSelectedCase(null);
      store.setState({ artifacts: [] });
    }
  } catch (error) {
    console.error("Не удалось удалить дело:", error);
    window.alert("Не удалось удалить дело.");
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

async function loadLegalMarks() {
  if (!window.api || typeof window.api.listLegalMarks !== "function") {
    store.setState({ legalMarks: [] });
    return;
  }
  try {
    const result = await window.api.listLegalMarks();
    if (!result || !result.ok) {
      store.setState({ legalMarks: [] });
      return;
    }
    const legalMarks = Array.isArray(result.data) ? result.data : [];
    store.setState({ legalMarks });
  } catch (error) {
    console.error("Не удалось загрузить юридические метки:", error);
    store.setState({ legalMarks: [] });
  }
}

async function loadArtifacts(caseId) {
  if (!window.api || typeof window.api.getCaseArtifacts !== "function") {
    store.setState({ artifacts: [] });
    return;
  }
  const id = normalizeId(caseId);
  if (!id) {
    store.setState(getEmptyArtifactState());
    return;
  }
  try {
    const result = await window.api.getCaseArtifacts(id);
    if (!result || !result.ok) {
      store.setState(getEmptyArtifactState());
      return;
    }
    const artifacts = Array.isArray(result.data) ? result.data : [];
    const currentSelectedId = store.getState().selectedArtifactId;
    const found =
      artifacts.find((item) => item.id === currentSelectedId) || artifacts[0];
    store.setState({
      artifacts,
      selectedArtifact: found || null,
      selectedArtifactId: found ? found.id : null,
      legalForm: buildLegalFormFromArtifact(found),
      legalFeedback: null,
      legalFormSaving: false,
    });
  } catch (error) {
    console.error("Не удалось загрузить артефакты:", error);
    store.setState(getEmptyArtifactState());
  }
}

async function handleLegalFormSubmit(button) {
  const state = store.getState();
  const artifact = state.selectedArtifact;
  if (!artifact) {
    setLegalFeedback("error", "Выберите артефакт для сохранения метки.");
    return;
  }
  if (!window.api || typeof window.api.setArtifactLegal !== "function") {
    setLegalFeedback("error", "IPC сохранения юридических меток недоступен.");
    return;
  }

  if (state.legalFormSaving) {
    return;
  }

  const { markValue, articleValue, commentValue } = getLegalFormValues(state);

  const markId = normalizeId(markValue);
  if (!markId) {
    setLegalFeedback("error", "Выберите метку нарушения из списка.");
    return;
  }
  const articleResult = validateArticleTextInput(articleValue);
  if (!articleResult.ok) {
    setLegalFeedback("error", articleResult.message);
    return;
  }
  const articleText = articleResult.value;
  const commentText = (commentValue || "").trim();

  const initialLabel = button ? button.textContent : null;
  if (button) {
    button.disabled = true;
    button.textContent = "Сохранение...";
  }
  const currentForm = state.legalForm || createEmptyLegalForm();
  store.setState({
    legalFormSaving: true,
    legalFeedback: null,
    legalForm: {
      ...currentForm,
      legalMarkId: String(markId),
      articleText,
      comment: commentText,
    },
  });

  try {
    const result = await window.api.setArtifactLegal(artifact.id, {
      legalMarkId: markId,
      articleText,
      comment: commentText || null,
    });
    if (!result || !result.ok) {
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось сохранить юридические данные.";
      setLegalFeedback("error", message);
      return;
    }
    const updatedArtifact = result.data && result.data.id ? result.data : artifact;
    const artifacts = Array.isArray(state.artifacts)
      ? state.artifacts.map((item) =>
          item.id === updatedArtifact.id ? updatedArtifact : item
        )
      : [updatedArtifact];
    const tone = commentText ? "success" : "warning";
    const message = commentText
      ? "Юридическая метка сохранена."
      : "Сохранено без комментария. Добавьте контекст при необходимости.";
    store.setState({
      artifacts,
      selectedArtifact: updatedArtifact,
      selectedArtifactId: updatedArtifact.id,
      legalForm: buildLegalFormFromArtifact(updatedArtifact),
      legalFeedback: { tone, message },
    });
  } catch (error) {
    console.error("Не удалось сохранить юридические данные:", error);
    setLegalFeedback("error", "Не удалось сохранить юридические данные.");
  } finally {
    store.setState({ legalFormSaving: false });
    if (button) {
      button.disabled = false;
      button.textContent = initialLabel;
    }
  }
}

function bindSidebarActions() {
  elements.refreshCases.addEventListener("click", () => {
    loadCases();
  });
  if (elements.createCase) {
    elements.createCase.addEventListener("click", () => {
      setActiveView("cases");
      if (elements.caseFormTitle) {
        elements.caseFormTitle.focus();
      }
    });
  }
  elements.clearSelection.addEventListener("click", () => {
    setSelectedCase(null);
  });
}

function bindBrowserActions() {
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
  if (elements.exportReport) {
    elements.exportReport.addEventListener("click", () => {
      handleExportReport();
    });
  }
}

function bindCaseFormActions() {
  if (elements.caseForm) {
    elements.caseForm.addEventListener("submit", handleCreateCase);
  }
  if (elements.caseFormReset) {
    elements.caseFormReset.addEventListener("click", () => {
      if (elements.caseForm) {
        elements.caseForm.reset();
      }
    });
  }
  if (elements.caseSearch) {
    const scheduleCaseSearch = createValueScheduler((value) => {
      updateCaseFilters({ search: value });
    });
    elements.caseSearch.addEventListener("input", (event) => {
      scheduleCaseSearch(event.target.value);
    });
  }
  if (elements.caseStatusFilter) {
    elements.caseStatusFilter.addEventListener("change", (event) => {
      updateCaseFilters({ status: event.target.value });
    });
  }
  if (elements.caseAssigneeFilter) {
    const scheduleCaseAssignee = createValueScheduler((value) => {
      updateCaseFilters({ assignee: value });
    });
    elements.caseAssigneeFilter.addEventListener("input", (event) => {
      scheduleCaseAssignee(event.target.value);
    });
  }
}

function bindCaseTableActions() {
  if (!elements.caseTableBody || !elements.caseTableBody.parentElement) {
    return;
  }
  const thead = elements.caseTableBody.parentElement.querySelector("thead");
  if (!thead) {
    return;
  }
  thead.addEventListener("click", (event) => {
    const th = event.target.closest("th");
    if (!th || !th.dataset.sort) return;
    const sortBy = th.dataset.sort;
    const current = store.getState().caseSort;
    const sortDir =
      current.sortBy === sortBy && current.sortDir === "asc" ? "desc" : "asc";
    store.setState({ caseSort: { sortBy, sortDir } });
  });
}

function bindArtifactFilters() {
  if (elements.artifactTypeFilter) {
    elements.artifactTypeFilter.addEventListener("change", (event) => {
      updateArtifactFilters({ type: event.target.value });
    });
  }
  if (elements.artifactSearch) {
    const scheduleArtifactSearch = createValueScheduler((value) => {
      updateArtifactFilters({ search: value });
    });
    elements.artifactSearch.addEventListener("input", (event) => {
      scheduleArtifactSearch(event.target.value);
    });
  }
  if (elements.artifactSort) {
    elements.artifactSort.addEventListener("change", (event) => {
      updateArtifactFilters({ sort: event.target.value });
    });
  }
}

function getSettingsApi() {
  return window.api && window.api.settings ? window.api.settings : null;
}

function applySettingsFormInput(patch) {
  const current = store.getState().settingsForm || createEmptySettingsForm();
  store.setState({ settingsForm: { ...current, ...patch } });
}

function setSelectedSetting(settingItem) {
  if (!settingItem) {
    store.setState({
      settingsSelectedId: null,
      settingsMode: "view",
      settingsForm: createEmptySettingsForm(),
      settingsOriginal: createEmptySettingsForm(),
      settingsHistory: [],
      settingsPending: false,
    });
    return;
  }
  const form = buildSettingsFormFromItem(settingItem);
  store.setState({
    settingsSelectedId: settingItem.id,
    settingsMode: "view",
    settingsForm: form,
    settingsOriginal: form,
    settingsHistory: [],
    settingsPending: false,
  });
  clearSettingsFeedback();
  loadSettingsHistory(settingItem.id);
}

function setSelectedSettingId(settingId) {
  const id = normalizeId(settingId);
  if (!id) {
    setSelectedSetting(null);
    return;
  }
  const found =
    store.getState().settingsItems.find((item) => item.id === id) || null;
  setSelectedSetting(found);
}

function startCreateSetting() {
  store.setState({
    settingsSelectedId: null,
    settingsMode: "create",
    settingsForm: createEmptySettingsForm(),
    settingsOriginal: createEmptySettingsForm(),
    settingsHistory: [],
    settingsPending: false,
  });
  clearSettingsFeedback();
}

function resetSettingsForm() {
  const state = store.getState();
  if (state.settingsMode === "create") {
    store.setState({
      settingsForm: createEmptySettingsForm(),
      settingsPending: false,
    });
  } else {
    store.setState({
      settingsForm: { ...state.settingsOriginal },
      settingsPending: false,
    });
  }
  clearSettingsFeedback();
}

async function loadSettings() {
  const api = getSettingsApi();
  if (!api || typeof api.list !== "function") {
    store.setState({
      settingsItems: [],
      settingsAccess: { canEdit: false, currentUser: null },
    });
    return;
  }
  store.setState({ settingsLoading: true });
  try {
    const result = await api.list();
    if (!result || !result.ok) {
      store.setState({ settingsItems: [], settingsLoading: false });
      setSettingsFeedback("error", "Не удалось загрузить настройки.");
      return;
    }
    const items = Array.isArray(result.data && result.data.items)
      ? result.data.items
      : [];
    const access =
      result.data && result.data.access
        ? result.data.access
        : { canEdit: false, currentUser: null };
    const state = store.getState();
    const selectedId = state.settingsSelectedId;
    const selectedExists = selectedId
      ? items.some((item) => item.id === selectedId)
      : false;
    const canEdit = Boolean(access && access.canEdit);
    let selectedItem = selectedExists
      ? items.find((item) => item.id === selectedId) || null
      : null;
    const patch = {
      settingsItems: items,
      settingsAccess: access,
      settingsLoading: false,
    };
    if (items.length === 0) {
      if (canEdit && state.settingsMode !== "create") {
        patch.settingsSelectedId = null;
        patch.settingsMode = "create";
        patch.settingsForm = createEmptySettingsForm();
        patch.settingsOriginal = createEmptySettingsForm();
        patch.settingsHistory = [];
        patch.settingsPending = false;
      } else if (!selectedExists && state.settingsMode !== "create") {
        patch.settingsSelectedId = null;
        patch.settingsForm = createEmptySettingsForm();
        patch.settingsOriginal = createEmptySettingsForm();
        patch.settingsHistory = [];
        patch.settingsPending = false;
      }
    } else if (!selectedExists && state.settingsMode !== "create") {
      const fallback = items[0];
      const nextForm = buildSettingsFormFromItem(fallback);
      patch.settingsSelectedId = fallback.id;
      patch.settingsForm = nextForm;
      patch.settingsOriginal = nextForm;
      patch.settingsHistory = [];
      patch.settingsPending = false;
      selectedItem = fallback;
    }
    if (
      selectedItem &&
      state.settingsMode === "view" &&
      !state.settingsSaving &&
      !state.settingsPending
    ) {
      const nextForm = buildSettingsFormFromItem(selectedItem);
      patch.settingsSelectedId = selectedItem.id;
      patch.settingsForm = nextForm;
      patch.settingsOriginal = nextForm;
    }
    store.setState(patch);
    const nextMode =
      typeof patch.settingsMode === "string" ? patch.settingsMode : state.settingsMode;
    const nextSelectedId =
      typeof patch.settingsSelectedId !== "undefined"
        ? patch.settingsSelectedId
        : selectedId;
    if (nextMode === "view" && nextSelectedId) {
      loadSettingsHistory(nextSelectedId);
    }
  } catch (error) {
    console.error("Не удалось загрузить настройки:", error);
    store.setState({ settingsLoading: false });
    setSettingsFeedback("error", "Не удалось загрузить настройки.");
  }
}

async function loadSettingsHistory(settingId) {
  const api = getSettingsApi();
  if (!api || typeof api.history !== "function") {
    store.setState({ settingsHistory: [] });
    return;
  }
  const id = normalizeId(settingId);
  if (!id) {
    store.setState({ settingsHistory: [] });
    return;
  }
  try {
    const result = await api.history(id, 20);
    if (!result || !result.ok) {
      store.setState({ settingsHistory: [] });
      return;
    }
    const history = Array.isArray(result.data) ? result.data : [];
    store.setState({ settingsHistory: history });
  } catch (error) {
    console.error("Не удалось загрузить историю настроек:", error);
    store.setState({ settingsHistory: [] });
    setSettingsFeedback("error", "Не удалось загрузить историю настроек.");
  }
}

async function handleSettingsSave(event) {
  if (event) {
    event.preventDefault();
  }
  const api = getSettingsApi();
  if (!api || typeof api.update !== "function" || typeof api.create !== "function") {
    setSettingsFeedback("error", "IPC настроек недоступен.");
    return;
  }
  const state = store.getState();
  if (!state.settingsAccess || !state.settingsAccess.canEdit) {
    setSettingsFeedback("error", "Недостаточно прав для изменения настроек.");
    return;
  }
  if (state.settingsSaving) {
    return;
  }

  const form = state.settingsForm || createEmptySettingsForm();
  const label = (form.label || "").trim();
  const articleResult = validateArticleTextInput(form.articleText);
  if (!articleResult.ok) {
    setSettingsFeedback("error", articleResult.message);
    return;
  }

  if (state.settingsMode === "create") {
    if (!label) {
      setSettingsFeedback("warning", "Название метки обязательно.");
      return;
    }
  } else if (!state.settingsSelectedId) {
    setSettingsFeedback("warning", "Выберите метку для редактирования.");
    return;
  }

  store.setState({ settingsSaving: true, settingsPending: false });
  clearSettingsFeedback();

  try {
    if (state.settingsMode === "create") {
      const result = await api.create({
        label,
        articleText: articleResult.value,
      });
      if (!result || !result.ok) {
        const message =
          result && result.error && result.error.message
            ? result.error.message
            : "Не удалось создать метку.";
        setSettingsFeedback("error", message);
        return;
      }
      if (result.data && result.data.pending) {
        store.setState({
          settingsPending: true,
          settingsForm: { ...form, label, articleText: articleResult.value },
        });
        const pendingPath = result.data.pendingPath;
        const pendingMessage = pendingPath
          ? `Изменения сохранены локально: ${pendingPath}`
          : "Изменения сохранены локально из-за ошибки базы данных.";
        setSettingsFeedback("warning", pendingMessage);
        return;
      }
      const item = result.data && result.data.item ? result.data.item : null;
      if (item) {
        const items = [...state.settingsItems, item].sort((a, b) =>
          (a.label || "").localeCompare(b.label || "")
        );
        const nextForm = buildSettingsFormFromItem(item);
        store.setState({
          settingsItems: items,
          settingsSelectedId: item.id,
          settingsMode: "view",
          settingsForm: nextForm,
          settingsOriginal: nextForm,
          settingsHistory: [],
          settingsPending: false,
        });
        loadSettingsHistory(item.id);
        loadLegalMarks();
      }
      setSettingsFeedback("success", "Метка создана.");
      return;
    }

    const expectedUpdatedAt = form.expectedUpdatedAt || null;
    const result = await api.update(state.settingsSelectedId, {
      articleText: articleResult.value,
      expectedUpdatedAt,
    });
    if (!result || !result.ok) {
      const code = result && result.error && result.error.code;
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось сохранить настройки.";
      setSettingsFeedback("error", message);
      if (code === "CONFLICT") {
        loadSettings();
      }
      return;
    }
    if (result.data && result.data.pending) {
      store.setState({
        settingsPending: true,
        settingsForm: { ...form, articleText: articleResult.value },
      });
      const pendingPath = result.data.pendingPath;
      const pendingMessage = pendingPath
        ? `Изменения сохранены локально: ${pendingPath}`
        : "Изменения сохранены локально из-за ошибки базы данных.";
      setSettingsFeedback("warning", pendingMessage);
      return;
    }
    const item = result.data && result.data.item ? result.data.item : null;
    if (item) {
      const items = state.settingsItems.map((entry) =>
        entry.id === item.id ? item : entry
      );
      const nextForm = buildSettingsFormFromItem(item);
      store.setState({
        settingsItems: items,
        settingsSelectedId: item.id,
        settingsMode: "view",
        settingsForm: nextForm,
        settingsOriginal: nextForm,
        settingsPending: false,
      });
      loadSettingsHistory(item.id);
    }
    setSettingsFeedback("success", "ARTICLE_TEXT сохранен.");
  } catch (error) {
    console.error("Не удалось сохранить настройки:", error);
    setSettingsFeedback("error", "Не удалось сохранить настройки.");
  } finally {
    store.setState({ settingsSaving: false });
  }
}

async function handleSettingsRollback(historyId) {
  const api = getSettingsApi();
  if (!api || typeof api.rollback !== "function") {
    setSettingsFeedback("error", "IPC отката недоступен.");
    return;
  }
  const state = store.getState();
  if (!state.settingsAccess || !state.settingsAccess.canEdit) {
    setSettingsFeedback("error", "Недостаточно прав для отката.");
    return;
  }
  if (!state.settingsSelectedId) {
    setSettingsFeedback("warning", "Выберите метку для отката.");
    return;
  }
  if (state.settingsSaving) {
    return;
  }

  store.setState({ settingsSaving: true, settingsPending: false });
  clearSettingsFeedback();
  try {
    const result = await api.rollback(state.settingsSelectedId, historyId, {
      expectedUpdatedAt: state.settingsOriginal.expectedUpdatedAt || null,
    });
    if (!result || !result.ok) {
      const code = result && result.error && result.error.code;
      const message =
        result && result.error && result.error.message
          ? result.error.message
          : "Не удалось откатить изменения.";
      setSettingsFeedback("error", message);
      if (code === "CONFLICT") {
        loadSettings();
      }
      return;
    }
    const item = result.data && result.data.item ? result.data.item : null;
    if (item) {
      const items = state.settingsItems.map((entry) =>
        entry.id === item.id ? item : entry
      );
      const nextForm = buildSettingsFormFromItem(item);
      store.setState({
        settingsItems: items,
        settingsSelectedId: item.id,
        settingsMode: "view",
        settingsForm: nextForm,
        settingsOriginal: nextForm,
        settingsPending: false,
      });
      loadSettingsHistory(item.id);
    }
    setSettingsFeedback("success", "Версия восстановлена.");
  } catch (error) {
    console.error("Не удалось откатить изменения:", error);
    setSettingsFeedback("error", "Не удалось откатить изменения.");
  } finally {
    store.setState({ settingsSaving: false });
  }
}

function bindSettingsActions() {
  if (elements.settingsSearch) {
    const scheduleSettingsSearch = createValueScheduler((value) => {
      updateSettingsSearch(value);
    });
    elements.settingsSearch.addEventListener("input", (event) => {
      scheduleSettingsSearch(event.target.value);
    });
  }
  if (elements.settingsLabel) {
    elements.settingsLabel.addEventListener("input", (event) => {
      applySettingsFormInput({ label: event.target.value });
    });
  }
  if (elements.settingsArticleText) {
    elements.settingsArticleText.addEventListener("input", (event) => {
      applySettingsFormInput({ articleText: event.target.value });
    });
  }
  if (elements.settingsForm) {
    elements.settingsForm.addEventListener("submit", handleSettingsSave);
  }
  if (elements.settingsReset) {
    elements.settingsReset.addEventListener("click", () => {
      resetSettingsForm();
    });
  }
  if (elements.settingsCreate) {
    elements.settingsCreate.addEventListener("click", () => {
      startCreateSetting();
    });
  }
}

function bindLayoutActions() {
  if (elements.toggleSidebar) {
    elements.toggleSidebar.addEventListener("click", () => {
      toggleSidebar();
    });
  }
}

function bindGlobalEvents() {
  window.addEventListener("osint:set-case-id", (event) => {
    const caseId = event.detail ? event.detail.caseId : null;
    setSelectedCaseId(caseId);
  });
}

function bindEvents() {
  bindSidebarActions();
  bindBrowserActions();
  bindCaseFormActions();
  bindCaseTableActions();
  bindArtifactFilters();
  bindSettingsActions();
  bindLayoutActions();
  bindGlobalEvents();
}

store.subscribe((state) => {
  renderCaseList(state, {
    onSelectCase: (caseItem) => {
      setSelectedCase(caseItem);
      setActiveView("case");
    },
  });
  renderCaseTable(state, {
    onViewCase: (caseItem) => {
      setSelectedCase(caseItem);
      setActiveView("case");
    },
    onEditCase: (caseItem) => {
      openEditCaseDialog(caseItem);
    },
    onDeleteCase: (caseItem) => {
      handleDeleteCase(caseItem);
    },
  });
  renderCaseSummary(state);
  renderCaseDetails(state);
  renderArtifactTable(state, {
    onSelectArtifact: (artifactId) => {
      setSelectedArtifactId(artifactId);
    },
  });
  renderArtifactPreview(state, handleLegalFormSubmit);
  renderNotes(state);
  renderSettingsList(state, {
    onSelectSetting: (settingId) => {
      setSelectedSettingId(settingId);
    },
  });
  renderSettingsEditor(state, {
    onRollback: (historyId) => {
      handleSettingsRollback(historyId);
    },
  });
  updateBrowserCaseState(state);
  updateReportAvailability(state);
  updateCaptureAvailability(state);
});

initQuickNav();
initBrowserBridge();
initBrowserViewport();
initTabs();
bindEvents();
loadLegalMarks();
loadCases();
loadSettings();
navigateTo(lastUrl, "vk");
