import { elements } from "./elements.js";
import {
  formatDate,
  formatDateTime,
  formatStatus,
  formatBytes,
  createDetailRow,
  createActionButton,
  getArtifactTypeLabel,
  resolveArtifactType,
} from "./utils.js";
import {
  applyCaseFiltersAndSort,
  applyArtifactFilters,
  applySettingsFilters,
} from "./filters.js";
import { renderLegalCard } from "./legal-card.js";

export function renderCaseList(state, handlers = {}) {
  elements.caseList.innerHTML = "";
  if (!state.cases.length) {
    elements.caseEmpty.hidden = false;
    return;
  }
  elements.caseEmpty.hidden = true;

  const fragment = document.createDocumentFragment();
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
      if (handlers.onSelectCase) {
        handlers.onSelectCase(caseItem);
      }
    });

    fragment.appendChild(button);
  });
  elements.caseList.appendChild(fragment);
}

export function renderCaseTable(state, handlers = {}) {
  const rows = applyCaseFiltersAndSort(state);
  elements.caseTableBody.innerHTML = "";
  if (!rows.length) {
    elements.caseTableEmpty.hidden = false;
    return;
  }
  elements.caseTableEmpty.hidden = true;
  const fragment = document.createDocumentFragment();
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
    assignedTd.textContent = item.assignedTo || "-";

    const actionsTd = document.createElement("td");
    actionsTd.className = "action-buttons";

    const viewBtn = createActionButton("Открыть", () => {
      if (handlers.onViewCase) {
        handlers.onViewCase(item);
      }
    });

    const editBtn = createActionButton("Редактировать", () => {
      if (handlers.onEditCase) {
        handlers.onEditCase(item);
      }
    });

    const deleteBtn = createActionButton("Удалить", () => {
      if (handlers.onDeleteCase) {
        handlers.onDeleteCase(item);
      }
    });

    actionsTd.append(viewBtn, editBtn, deleteBtn);
    tr.append(idTd, titleTd, statusTd, createdTd, assignedTd, actionsTd);
    fragment.appendChild(tr);
  });
  elements.caseTableBody.appendChild(fragment);
}

export function renderCaseSummary(state) {
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

export function renderCaseDetails(state) {
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
    value: state.selectedCase ? state.selectedCase.assignedTo || "-" : "-",
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

  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    fragment.appendChild(createDetailRow(row.label, row.value));
  });
  elements.caseDetails.appendChild(fragment);
}

export function renderArtifactTable(state, handlers = {}) {
  elements.artifactTableBody.innerHTML = "";
  const rows = applyArtifactFilters(state);
  if (rows.length && !rows.find((item) => item.id === state.selectedArtifactId)) {
    if (handlers.onSelectArtifact) {
      handlers.onSelectArtifact(rows[0].id);
    }
    return;
  }
  if (!rows.length) {
    elements.artifactTableEmpty.hidden = false;
    return;
  }
  elements.artifactTableEmpty.hidden = true;

  const fragment = document.createDocumentFragment();
  rows.forEach((item) => {
    const tr = document.createElement("tr");
    if (state.selectedArtifactId === item.id) {
      tr.classList.add("is-active");
    }

    const titleTd = document.createElement("td");
    titleTd.textContent = item.title || "Без названия";
    tr.dataset.id = item.id;
    tr.addEventListener("click", () => {
      if (handlers.onSelectArtifact) {
        handlers.onSelectArtifact(item.id);
      }
    });

    const typeTd = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = "tag";
    const type = resolveArtifactType(item);
    const typeLabel = getArtifactTypeLabel(type);
    tag.textContent = typeLabel;
    typeTd.appendChild(tag);

    const dateTd = document.createElement("td");
    dateTd.textContent = formatDate(item.capturedAt);

    const sizeTd = document.createElement("td");
    sizeTd.textContent = formatBytes(item.size);

    const urlTd = document.createElement("td");
    urlTd.className = "url-cell";
    urlTd.title = item.url || "";
    urlTd.textContent = item.url || "-";

    tr.append(titleTd, typeTd, dateTd, sizeTd, urlTd);
    fragment.appendChild(tr);
  });
  elements.artifactTableBody.appendChild(fragment);
}

export function renderArtifactPreview(state, onLegalSubmit) {
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
  meta.textContent = `${formatDate(artifact.capturedAt)} · ${resolveArtifactType(
    artifact
  )} · ${formatBytes(artifact.size)}`;

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
    placeholder.textContent =
      artifact.url || "Нет содержимого для предпросмотра.";
    content.appendChild(placeholder);
  }

  container.append(title, meta, content, renderLegalCard(state, onLegalSubmit));
}

export function renderNotes(state) {
  if (!elements.notePanel || !elements.noteBody) return;
  const notes = Array.isArray(state.notes) ? state.notes : [];
  if (!notes.length) {
    elements.notePanel.hidden = true;
    elements.noteBody.innerHTML = "";
    return;
  }
  elements.notePanel.hidden = false;
  elements.noteBody.innerHTML = "";
  const fragment = document.createDocumentFragment();
  notes.forEach((note) => {
    const label = formatDate(note.createdAt || note.date) || "Дата";
    const value = note.text || "";
    fragment.appendChild(createDetailRow(label, value));
  });
  elements.noteBody.appendChild(fragment);
}

export function renderSettingsList(state, handlers = {}) {
  if (!elements.settingsTableBody) {
    return;
  }
  const rows = applySettingsFilters(state);
  elements.settingsTableBody.innerHTML = "";
  if (!rows.length) {
    if (elements.settingsTableEmpty) {
      elements.settingsTableEmpty.hidden = false;
    }
    return;
  }
  if (elements.settingsTableEmpty) {
    elements.settingsTableEmpty.hidden = true;
  }
  const fragment = document.createDocumentFragment();
  rows.forEach((item) => {
    const tr = document.createElement("tr");
    if (item.id === state.settingsSelectedId) {
      tr.classList.add("is-active");
    }

    const labelTd = document.createElement("td");
    labelTd.textContent = item.label || "-";

    const articleTd = document.createElement("td");
    const articleText = item.articleText || "";
    articleTd.textContent =
      articleText.length > 80 ? `${articleText.slice(0, 77)}...` : articleText;

    const updatedTd = document.createElement("td");
    updatedTd.textContent = formatDateTime(item.updatedAt || item.createdAt);

    const authorTd = document.createElement("td");
    authorTd.textContent = item.updatedBy || "-";

    tr.append(labelTd, articleTd, updatedTd, authorTd);
    tr.addEventListener("click", () => {
      if (handlers.onSelectSetting) {
        handlers.onSelectSetting(item.id);
      }
    });
    fragment.appendChild(tr);
  });
  elements.settingsTableBody.appendChild(fragment);
}

export function renderSettingsEditor(state, handlers = {}) {
  if (!elements.settingsForm || !elements.settingsArticleText) {
    return;
  }
  const form = state.settingsForm || {};
  const canEdit = Boolean(state.settingsAccess && state.settingsAccess.canEdit);
  const hasSelection = Boolean(state.settingsSelectedId);
  const isCreate = state.settingsMode === "create";

  const labelValue = form.label || "";
  if (elements.settingsLabel) {
    if (elements.settingsLabel.value !== labelValue) {
      elements.settingsLabel.value = labelValue;
    }
    elements.settingsLabel.disabled = !canEdit || !isCreate;
  }
  const articleValue = form.articleText || "";
  if (elements.settingsArticleText.value !== articleValue) {
    elements.settingsArticleText.value = articleValue;
  }
  elements.settingsArticleText.disabled = !canEdit || (!hasSelection && !isCreate);

  if (elements.settingsSave) {
    elements.settingsSave.disabled =
      !canEdit || state.settingsSaving || (!hasSelection && !isCreate);
  }
  if (elements.settingsReset) {
    elements.settingsReset.disabled =
      !canEdit || state.settingsSaving || (!hasSelection && !isCreate);
  }
  if (elements.settingsCreate) {
    elements.settingsCreate.disabled = !canEdit || state.settingsSaving;
  }

  if (elements.settingsMeta) {
    elements.settingsMeta.innerHTML = "";
    if (hasSelection) {
      const selected = state.settingsItems.find(
        (item) => item.id === state.settingsSelectedId
      );
      if (selected) {
        const fragment = document.createDocumentFragment();
        fragment.appendChild(
          createDetailRow(
            "Последнее изменение",
            formatDateTime(selected.updatedAt || selected.createdAt)
          )
        );
        fragment.appendChild(
          createDetailRow("Автор", selected.updatedBy || "-")
        );
        if (state.settingsPending) {
          fragment.appendChild(
            createDetailRow("Локальные изменения", "ожидают синхронизации")
          );
        }
        if (state.settingsAccess && state.settingsAccess.currentUser) {
          fragment.appendChild(
            createDetailRow("Текущий пользователь", state.settingsAccess.currentUser)
          );
        }
        elements.settingsMeta.appendChild(fragment);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "placeholder";
      empty.textContent = isCreate
        ? "Введите данные для новой метки."
        : "Выберите метку для редактирования.";
      elements.settingsMeta.appendChild(empty);
    }
  }

  if (elements.settingsHistory) {
    elements.settingsHistory.innerHTML = "";
    const history = Array.isArray(state.settingsHistory)
      ? state.settingsHistory
      : [];
    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "placeholder";
      empty.textContent = "История изменений пока пуста.";
      elements.settingsHistory.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      history.forEach((entry) => {
        const item = document.createElement("div");
        item.className = "settings-history__item";
        const info = document.createElement("div");
        info.className = "settings-history__info";
        info.textContent = `${formatDateTime(entry.updatedAt)} · ${entry.updatedBy || "-"}`;
        const text = document.createElement("div");
        text.className = "settings-history__text";
        text.textContent = entry.articleText || "";
        const actions = document.createElement("div");
        actions.className = "settings-history__actions";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tiny-btn";
        button.textContent = "Откатить";
        button.disabled = !canEdit || state.settingsSaving;
        button.addEventListener("click", () => {
          if (handlers.onRollback) {
            handlers.onRollback(entry.id);
          }
        });
        actions.appendChild(button);
        item.append(info, text, actions);
        fragment.appendChild(item);
      });
      elements.settingsHistory.appendChild(fragment);
    }
  }
}
