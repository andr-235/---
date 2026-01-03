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

function createEmptyLegalForm() {
  return { legalMarkId: "", articleText: "", comment: "" };
}

function buildLegalFormFromArtifact(artifact) {
  if (!artifact) {
    return createEmptyLegalForm();
  }
  return {
    legalMarkId: artifact.legalMarkId ? String(artifact.legalMarkId) : "",
    articleText: artifact.articleText || "",
    comment: artifact.legalComment || "",
  };
}

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
  artifacts: [],
  selectedArtifactId: null,
  selectedArtifact: null,
  notes: [],
  legalMarks: [],
  legalMarkSearch: "",
  legalForm: createEmptyLegalForm(),
  legalFeedback: null,
  legalFormSaving: false,
  artifactFilters: {
    type: "all",
    search: "",
    sort: "capturedAt:desc",
  },
  caseFilters: {
    search: "",
    status: "all",
    assignee: "",
  },
  caseSort: {
    sortBy: "createdAt",
    sortDir: "desc",
  },
});

const elements = {
  appRoot: document.querySelector(".app"),
  sidebar: document.querySelector(".sidebar"),
  caseList: document.getElementById("caseList"),
  caseEmpty: document.getElementById("caseEmpty"),
  caseSummary: document.getElementById("caseSummary"),
  caseDetails: document.getElementById("caseDetails"),
  refreshCases: document.getElementById("refreshCases"),
  createCase: document.getElementById("createCase"),
  clearSelection: document.getElementById("clearSelection"),
  toggleSidebar: document.getElementById("toggleSidebar"),
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
    cases: document.getElementById("view-cases"),
    case: document.getElementById("view-case"),
  },
  // Список дел (новый экран)
  caseForm: document.getElementById("caseForm"),
  caseFormTitle: document.getElementById("caseFormTitle"),
  caseFormDescription: document.getElementById("caseFormDescription"),
  caseFormAssigned: document.getElementById("caseFormAssigned"),
  caseFormStatus: document.getElementById("caseFormStatus"),
  caseFormSubmit: document.getElementById("caseFormSubmit"),
  caseFormReset: document.getElementById("caseFormReset"),
  caseSearch: document.getElementById("caseSearch"),
  caseStatusFilter: document.getElementById("caseStatusFilter"),
  caseAssigneeFilter: document.getElementById("caseAssigneeFilter"),
  caseTableBody: document.getElementById("caseTableBody"),
  caseTableEmpty: document.getElementById("caseTableEmpty"),
  // Артефакты
  artifactTypeFilter: document.getElementById("artifactTypeFilter"),
  artifactSearch: document.getElementById("artifactSearch"),
  artifactSort: document.getElementById("artifactSort"),
  artifactTableBody: document.getElementById("artifactTableBody"),
  artifactTableEmpty: document.getElementById("artifactTableEmpty"),
  artifactPreview: document.getElementById("artifactPreview"),
  notePanel: document.getElementById("notePanel"),
  noteBody: document.getElementById("noteBody"),
};

const navButtons = new Map();
let lastUrl = "https://vk.com";
let artifactFeedbackTimer = null;
let browserNoticeTimer = null;
let legalSearchValue = "";
const legalCardRefs = {
  artifactId: null,
  searchInput: null,
  select: null,
  searchHint: null,
  articleInput: null,
  commentInput: null,
  submit: null,
  feedback: null,
};
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

function formatBytes(value) {
  if (!value || Number.isNaN(value)) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function setSelectedCaseId(caseId) {
  const normalizedId = Number.isInteger(caseId) && caseId > 0 ? caseId : null;
  const state = store.getState();
  if (!normalizedId) {
    store.setState({
      selectedCaseId: null,
      selectedCase: null,
      artifacts: [],
      selectedArtifactId: null,
      selectedArtifact: null,
      notes: [],
      legalForm: createEmptyLegalForm(),
      legalFeedback: null,
      legalFormSaving: false,
    });
    return;
  }
  const foundCase =
    state.cases.find((item) => item.id === normalizedId) || null;
  store.setState({
    selectedCaseId: normalizedId,
    selectedCase: foundCase,
    selectedArtifactId: null,
    selectedArtifact: null,
    notes: [],
    legalForm: createEmptyLegalForm(),
    legalFeedback: null,
    legalFormSaving: false,
  });
  if (normalizedId) {
    loadArtifacts(normalizedId);
  }
}

function setSelectedCase(caseItem) {
  if (!caseItem) {
    store.setState({
      selectedCaseId: null,
      selectedCase: null,
      artifacts: [],
      selectedArtifactId: null,
      selectedArtifact: null,
      notes: [],
      legalForm: createEmptyLegalForm(),
      legalFeedback: null,
      legalFormSaving: false,
    });
    return;
  }
  store.setState({
    selectedCaseId: caseItem.id,
    selectedCase: caseItem,
    selectedArtifactId: null,
    selectedArtifact: null,
    notes: [],
    legalForm: createEmptyLegalForm(),
    legalFeedback: null,
    legalFormSaving: false,
  });
  if (caseItem && caseItem.id) {
    loadArtifacts(caseItem.id);
  }
}

function setSelectedArtifactId(artifactId) {
  const id = Number(artifactId);
  const state = store.getState();
  const found = state.artifacts.find((item) => item.id === id) || null;
  store.setState({
    selectedArtifactId: found ? found.id : null,
    selectedArtifact: found,
    legalForm: buildLegalFormFromArtifact(found),
    legalFeedback: null,
  });
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
      setActiveView("case");
    });

    elements.caseList.appendChild(button);
  });
}

function applyCaseFiltersAndSort(state) {
  const { cases, caseFilters, caseSort } = state;
  const search = (caseFilters.search || "").trim().toLowerCase();
  const status = (caseFilters.status || "all").toLowerCase();
  const assignee = (caseFilters.assignee || "").trim().toLowerCase();

  const filtered = cases.filter((item) => {
    const matchSearch =
      !search ||
      String(item.id).includes(search) ||
      (item.title || "").toLowerCase().includes(search);
    const matchStatus = status === "all" || item.status === status;
    const matchAssignee =
      !assignee ||
      (item.assignedTo || "").toLowerCase().includes(assignee);
    return matchSearch && matchStatus && matchAssignee;
  });

  const sorted = [...filtered].sort((a, b) => {
    const { sortBy, sortDir } = caseSort;
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "title" || sortBy === "assignedTo" || sortBy === "status") {
      const av = (a[sortBy] || "").toLowerCase();
      const bv = (b[sortBy] || "").toLowerCase();
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    }
    if (sortBy === "id") {
      return (a.id - b.id) * dir;
    }
    const av = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
    const bv = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
    return av === bv ? 0 : av > bv ? dir : -dir;
  });

  return sorted;
}

function renderCaseTable(state) {
  const rows = applyCaseFiltersAndSort(state);
  elements.caseTableBody.innerHTML = "";
  if (!rows.length) {
    elements.caseTableEmpty.hidden = false;
    return;
  }
  elements.caseTableEmpty.hidden = true;
  rows.forEach((item) => {
    const tr = document.createElement("tr");

    const idTd = document.createElement("td");
    idTd.textContent = item.id;

    const titleTd = document.createElement("td");
    titleTd.textContent = item.title;

    const statusTd = document.createElement("td");
    const status = document.createElement("span");
    status.className = "status-tag";
    status.textContent = formatStatus(item.status);
    statusTd.appendChild(status);

    const createdTd = document.createElement("td");
    createdTd.textContent = formatDate(item.createdAt);

    const assignedTd = document.createElement("td");
    assignedTd.textContent = item.assignedTo || "—";

    const actionsTd = document.createElement("td");
    actionsTd.className = "action-buttons";

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "tiny-btn";
    viewBtn.textContent = "Открыть";
    viewBtn.addEventListener("click", () => {
      setSelectedCase(item);
      setActiveView("case");
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "tiny-btn";
    editBtn.textContent = "Редактировать";
    editBtn.addEventListener("click", () => {
      openEditCaseDialog(item);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "tiny-btn";
    deleteBtn.textContent = "Удалить";
    deleteBtn.addEventListener("click", () => {
      handleDeleteCase(item);
    });

    actionsTd.append(viewBtn, editBtn, deleteBtn);
    tr.append(idTd, titleTd, statusTd, createdTd, assignedTd, actionsTd);
    elements.caseTableBody.appendChild(tr);
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
    label: "Назначенный",
    value: state.selectedCase ? state.selectedCase.assignedTo || "—" : "—",
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
  if (state.selectedCase && state.selectedCase.description) {
    rows.push({
      label: "Описание",
      value: state.selectedCase.description,
    });
  }

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

function resolveArtifactType(artifact) {
  const source = (artifact.source || "").toLowerCase();
  if (source.includes("doc") || source.includes("pdf")) return "document";
  if (source.includes("evidence") || source.includes("proof"))
    return "evidence";
  if (source.includes("message") || source.includes("chat")) return "message";
  if (source.includes("html")) return "document";
  return "other";
}

function applyArtifactFilters(state) {
  const { artifacts, artifactFilters } = state;
  const search = (artifactFilters.search || "").trim().toLowerCase();
  const type = artifactFilters.type || "all";
  let filtered = artifacts.filter((item) => {
    const artifactType = resolveArtifactType(item);
    const matchesType = type === "all" || artifactType === type;
    const matchesSearch =
      !search ||
      (item.title || "").toLowerCase().includes(search) ||
      (item.url || "").toLowerCase().includes(search);
    return matchesType && matchesSearch;
  });

  const [sortBy, sortDir] = (artifactFilters.sort || "capturedAt:desc").split(
    ":"
  );
  const dir = sortDir === "asc" ? 1 : -1;
  filtered = filtered.sort((a, b) => {
    if (sortBy === "title" || sortBy === "source") {
      const av = (a[sortBy] || "").toLowerCase();
      const bv = (b[sortBy] || "").toLowerCase();
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    }
    const av = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
    const bv = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
    return av === bv ? 0 : av > bv ? dir : -dir;
  });

  return filtered;
}

function renderArtifactTable(state) {
  elements.artifactTableBody.innerHTML = "";
  const rows = applyArtifactFilters(state);
  if (rows.length && !rows.find((item) => item.id === state.selectedArtifactId)) {
    setSelectedArtifactId(rows[0].id);
    return;
  }
  if (!rows.length) {
    elements.artifactTableEmpty.hidden = false;
    return;
  }
  elements.artifactTableEmpty.hidden = true;

  rows.forEach((item) => {
    const tr = document.createElement("tr");
    if (state.selectedArtifactId === item.id) {
      tr.classList.add("is-active");
    }

    const titleTd = document.createElement("td");
    titleTd.textContent = item.title || "Без названия";
    tr.dataset.id = item.id;
    tr.addEventListener("click", () => {
      setSelectedArtifactId(item.id);
    });

    const typeTd = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "tag";
    const type = resolveArtifactType(item);
    const typeLabel =
      type === "document"
        ? "Документ"
        : type === "evidence"
          ? "Доказательство"
          : type === "message"
            ? "Сообщение"
            : "Прочее";
    tag.textContent = typeLabel;
    typeTd.appendChild(tag);

    const dateTd = document.createElement("td");
    dateTd.textContent = formatDate(item.capturedAt);

    const sizeTd = document.createElement("td");
    sizeTd.textContent = formatBytes(item.size);

    const urlTd = document.createElement("td");
    urlTd.className = "url-cell";
    urlTd.title = item.url || "";
    urlTd.textContent = item.url || "—";

    tr.append(titleTd, typeTd, dateTd, sizeTd, urlTd);
    elements.artifactTableBody.appendChild(tr);
  });
}

function renderLegalCard(state) {
  const artifact = state.selectedArtifact;
  const legalForm = state.legalForm || createEmptyLegalForm();
  const marks = Array.isArray(state.legalMarks) ? state.legalMarks : [];
  const sortedMarks = [...marks].sort((a, b) =>
    (a.label || "").localeCompare(b.label || "")
  );

  const card = document.createElement("div");
  card.className = "legal-card";

  const header = document.createElement("div");
  header.className = "legal-card__header";
  const title = document.createElement("div");
  title.className = "legal-card__title";
  title.textContent = "Юридическая фиксация";
  const subtitle = document.createElement("div");
  subtitle.className = "legal-card__subtitle";
  subtitle.textContent =
    "Выберите метку нарушения, укажите статью и комментарий.";
  header.append(title, subtitle);

  const feedback = document.createElement("div");
  feedback.className = "legal-card__feedback";
  if (state.legalFeedback && state.legalFeedback.message) {
    feedback.textContent = state.legalFeedback.message;
    feedback.dataset.tone = state.legalFeedback.tone || "info";
  } else {
    feedback.hidden = true;
  }

  const form = document.createElement("form");
  form.className = "legal-form";

  const searchField = document.createElement("label");
  searchField.className = "form-field";
  const searchLabel = document.createElement("span");
  searchLabel.className = "form-label";
  searchLabel.textContent = "Поиск по меткам";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "input";
  searchInput.placeholder = "Начните вводить название";
  searchInput.value = legalSearchValue;
  searchField.append(searchLabel, searchInput);

  const selectField = document.createElement("label");
  selectField.className = "form-field";
  const selectLabel = document.createElement("span");
  selectLabel.className = "form-label";
  selectLabel.textContent = "Метка нарушения *";
  const select = document.createElement("select");
  select.className = "input";
  select.required = true;
  select.disabled =
    !marks.length || state.legalFormSaving || !artifact;
  selectField.append(selectLabel, select);

  const searchHint = document.createElement("div");
  searchHint.className = "legal-card__hint";

  const articleField = document.createElement("label");
  articleField.className = "form-field";
  const articleLabel = document.createElement("span");
  articleLabel.className = "form-label";
  articleLabel.textContent = "article_text (обязательно)";
  const articleInput = document.createElement("textarea");
  articleInput.className = "input textarea";
  articleInput.rows = 3;
  articleInput.required = true;
  articleInput.placeholder = "Например, Статья 13.15 КоАП РФ...";
  articleInput.value = legalForm.articleText || "";
  articleInput.disabled = !artifact;
  articleField.append(articleLabel, articleInput);

  const commentField = document.createElement("label");
  commentField.className = "form-field";
  const commentLabel = document.createElement("span");
  commentLabel.className = "form-label";
  commentLabel.textContent = "Комментарий (необязательно)";
  const commentInput = document.createElement("textarea");
  commentInput.className = "input textarea";
  commentInput.rows = 3;
  commentInput.placeholder =
    "Кратко опишите контекст нарушения или источник информации.";
  commentInput.value = legalForm.comment || "";
  commentInput.disabled = !artifact;
  commentField.append(commentLabel, commentInput);

  const commentHint = document.createElement("div");
  commentHint.className = "legal-card__hint";
  commentHint.textContent =
    "Комментарий не обязателен, но помогает восстановить контекст.";

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-btn";
  submit.textContent = "Сохранить метку";
  actions.appendChild(submit);

  const refreshSubmitState = () => {
    submit.disabled =
      !artifact ||
      !marks.length ||
      state.legalFormSaving ||
      !select.value;
  };

  const refreshOptions = (value) => {
    const search = (value || "").trim().toLowerCase();
    const filteredMarks = search
      ? sortedMarks.filter((mark) =>
          (mark.label || "").toLowerCase().includes(search)
        )
      : sortedMarks;
    const currentValue = select.value || legalForm.legalMarkId || "";
    const currentMark = currentValue
      ? sortedMarks.find((mark) => String(mark.id) === String(currentValue))
      : null;

    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = marks.length
      ? "Выберите метку"
      : "В справочнике нет меток";
    select.appendChild(placeholder);

    if (
      !marks.length &&
      legalForm.legalMarkId &&
      artifact &&
      artifact.legalMarkLabel
    ) {
      const preserved = document.createElement("option");
      preserved.value = legalForm.legalMarkId;
      preserved.textContent = `${artifact.legalMarkLabel} (текущее)`;
      select.appendChild(preserved);
    }

    if (
      currentMark &&
      search &&
      !filteredMarks.some(
        (mark) => String(mark.id) === String(currentValue)
      )
    ) {
      const currentOption = document.createElement("option");
      currentOption.value = String(currentMark.id);
      currentOption.textContent = `${currentMark.label} (текущее)`;
      select.appendChild(currentOption);
    }

    const listToRender = filteredMarks.length ? filteredMarks : sortedMarks;
    listToRender.forEach((mark) => {
      const option = document.createElement("option");
      option.value = String(mark.id);
      option.textContent = mark.label;
      select.appendChild(option);
    });

    select.value = currentValue || "";
    if (marks.length > 0 && search && !filteredMarks.length) {
      searchHint.textContent =
        "Поиск не дал результатов. Снимите фильтр или измените запрос.";
      searchHint.hidden = false;
    } else if (!marks.length) {
      searchHint.textContent =
        "Добавьте юридические метки в базу, чтобы выбрать нарушение.";
      searchHint.hidden = false;
    } else {
      searchHint.hidden = true;
    }
    refreshSubmitState();
  };

  searchInput.addEventListener("input", (event) => {
    legalSearchValue = event.target.value;
    refreshOptions(legalSearchValue);
  });

  select.addEventListener("change", () => {
    refreshSubmitState();
  });

  refreshOptions(legalSearchValue);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLegalFormSubmit(submit);
  });

  form.append(
    searchField,
    selectField,
    searchHint,
    articleField,
    commentField,
    commentHint,
    actions
  );
  card.append(header, feedback, form);
  legalCardRefs.artifactId = artifact ? artifact.id : null;
  legalCardRefs.searchInput = searchInput;
  legalCardRefs.select = select;
  legalCardRefs.searchHint = searchHint;
  legalCardRefs.articleInput = articleInput;
  legalCardRefs.commentInput = commentInput;
  legalCardRefs.submit = submit;
  legalCardRefs.feedback = feedback;
  return card;
}

function renderArtifactPreview(state) {
  if (!elements.artifactPreview) return;
  const container = elements.artifactPreview;
  container.innerHTML = "";
  const artifact = state.selectedArtifact;
  if (!artifact) {
    const placeholder = document.createElement("div");
    placeholder.className = "preview-placeholder";
    placeholder.textContent = "Выберите артефакт для предпросмотра.";
    container.appendChild(placeholder);
    return;
  }

  const title = document.createElement("div");
  title.className = "preview-title";
  title.textContent = artifact.title || "Без названия";

  const meta = document.createElement("div");
  meta.className = "preview-meta";
  meta.textContent = `${formatDate(artifact.capturedAt)} · ${resolveArtifactType(artifact)} · ${formatBytes(artifact.size)}`;

  const content = document.createElement("div");
  content.className = "preview-content";

  if (artifact.screenshotFileUrl) {
    const img = document.createElement("img");
    img.alt = "Скриншот артефакта";
    img.src = artifact.screenshotFileUrl;
    content.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "preview-placeholder";
    placeholder.textContent = artifact.url || "Нет содержимого для предпросмотра.";
    content.appendChild(placeholder);
  }

  container.append(title, meta, content, renderLegalCard(state));
}

function renderNotes(state) {
  if (!elements.notePanel || !elements.noteBody) return;
  const notes = Array.isArray(state.notes) ? state.notes : [];
  if (!notes.length) {
    elements.notePanel.hidden = true;
    elements.noteBody.innerHTML = "";
    return;
  }
  elements.notePanel.hidden = false;
  elements.noteBody.innerHTML = "";
  notes.forEach((note) => {
    const item = document.createElement("div");
    item.className = "detail-row";
    const label = document.createElement("span");
    label.textContent = formatDate(note.createdAt || note.date) || "Дата";
    const value = document.createElement("span");
    value.textContent = note.text || "";
    item.append(label, value);
    elements.noteBody.appendChild(item);
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

function setLegalFeedback(tone, message) {
  store.setState({
    legalFeedback: tone && message ? { tone, message } : null,
  });
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
      const viewKey = tab.dataset.view;
      setActiveView(viewKey);
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
  const description = window.prompt(
    "Описание",
    caseItem.description || ""
  );
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
  if (
    !caseItem ||
    !window.api ||
    typeof window.api.deleteCase !== "function"
  ) {
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
  const id = Number(caseId);
  if (!Number.isInteger(id) || id <= 0) {
    store.setState({
      artifacts: [],
      selectedArtifact: null,
      selectedArtifactId: null,
      legalForm: createEmptyLegalForm(),
      legalFeedback: null,
      legalFormSaving: false,
    });
    return;
  }
  try {
    const result = await window.api.getCaseArtifacts(id);
    if (!result || !result.ok) {
      store.setState({
        artifacts: [],
        selectedArtifact: null,
        selectedArtifactId: null,
        legalForm: createEmptyLegalForm(),
        legalFeedback: null,
        legalFormSaving: false,
      });
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
    store.setState({
      artifacts: [],
      selectedArtifact: null,
      selectedArtifactId: null,
      legalForm: createEmptyLegalForm(),
      legalFeedback: null,
      legalFormSaving: false,
    });
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
    setLegalFeedback(
      "error",
      "IPC сохранения юридических меток недоступен."
    );
    return;
  }

  if (state.legalFormSaving) {
    return;
  }

  const useRefs =
    legalCardRefs.artifactId && legalCardRefs.artifactId === artifact.id;
  const markValue = useRefs && legalCardRefs.select
    ? legalCardRefs.select.value
    : state.legalForm.legalMarkId;
  const articleValue = useRefs && legalCardRefs.articleInput
    ? legalCardRefs.articleInput.value
    : state.legalForm.articleText;
  const commentValue = useRefs && legalCardRefs.commentInput
    ? legalCardRefs.commentInput.value
    : state.legalForm.comment;

  const markId = Number(markValue);
  if (!Number.isInteger(markId) || markId <= 0) {
    setLegalFeedback("error", "Выберите метку нарушения из списка.");
    return;
  }
  const articleText = (articleValue || "").trim();
  if (!articleText) {
    setLegalFeedback("error", "Поле article_text обязательно для заполнения.");
    return;
  }
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
    const updatedArtifact =
      result.data && result.data.id ? result.data : artifact;
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

function bindEvents() {
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
    elements.caseSearch.addEventListener("input", (event) => {
      store.setState({
        caseFilters: {
          ...store.getState().caseFilters,
          search: event.target.value,
        },
      });
    });
  }
  if (elements.caseStatusFilter) {
    elements.caseStatusFilter.addEventListener("change", (event) => {
      store.setState({
        caseFilters: {
          ...store.getState().caseFilters,
          status: event.target.value,
        },
      });
    });
  }
  if (elements.caseAssigneeFilter) {
    elements.caseAssigneeFilter.addEventListener("input", (event) => {
      store.setState({
        caseFilters: {
          ...store.getState().caseFilters,
          assignee: event.target.value,
        },
      });
    });
  }
  if (elements.caseTableBody && elements.caseTableBody.parentElement) {
    const thead = elements.caseTableBody.parentElement.querySelector("thead");
    if (thead) {
      thead.addEventListener("click", (event) => {
        const th = event.target.closest("th");
        if (!th || !th.dataset.sort) return;
        const sortBy = th.dataset.sort;
        const current = store.getState().caseSort;
        const sortDir =
          current.sortBy === sortBy && current.sortDir === "asc"
            ? "desc"
            : "asc";
        store.setState({ caseSort: { sortBy, sortDir } });
      });
    }
  }
  if (elements.artifactTypeFilter) {
    elements.artifactTypeFilter.addEventListener("change", (event) => {
      store.setState({
        artifactFilters: {
          ...store.getState().artifactFilters,
          type: event.target.value,
        },
      });
    });
  }
  if (elements.artifactSearch) {
    elements.artifactSearch.addEventListener("input", (event) => {
      store.setState({
        artifactFilters: {
          ...store.getState().artifactFilters,
          search: event.target.value,
        },
      });
    });
  }
  if (elements.artifactSort) {
    elements.artifactSort.addEventListener("change", (event) => {
      store.setState({
        artifactFilters: {
          ...store.getState().artifactFilters,
          sort: event.target.value,
        },
      });
    });
  }
  if (elements.toggleSidebar) {
    elements.toggleSidebar.addEventListener("click", () => {
      toggleSidebar();
    });
  }
  window.addEventListener("osint:set-case-id", (event) => {
    const caseId = event.detail ? Number(event.detail.caseId) : null;
    setSelectedCaseId(caseId);
  });
}

store.subscribe((state) => {
  renderCaseList(state);
  renderCaseTable(state);
  renderCaseSummary(state);
  renderCaseDetails(state);
  renderArtifactTable(state);
  renderArtifactPreview(state);
  renderNotes(state);
  updateBrowserCaseState(state);
  updateCaptureAvailability(state);
});

initQuickNav();
initBrowserBridge();
initBrowserViewport();
initTabs();
bindEvents();
loadLegalMarks();
loadCases();
navigateTo(lastUrl, "vk");
