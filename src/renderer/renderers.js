import { elements } from "./elements.js";
import {
  formatDate,
  formatStatus,
  formatBytes,
  createDetailRow,
  createActionButton,
  getArtifactTypeLabel,
  resolveArtifactType,
} from "./utils.js";
import { applyCaseFiltersAndSort, applyArtifactFilters } from "./filters.js";
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
