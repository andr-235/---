import { createEmptyLegalForm } from "./state.js";

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

export function getLegalFormValues(state) {
  const artifact = state.selectedArtifact;
  const useRefs =
    legalCardRefs.artifactId &&
    artifact &&
    legalCardRefs.artifactId === artifact.id;
  const markValue =
    useRefs && legalCardRefs.select
      ? legalCardRefs.select.value
      : state.legalForm.legalMarkId;
  const articleValue =
    useRefs && legalCardRefs.articleInput
      ? legalCardRefs.articleInput.value
      : state.legalForm.articleText;
  const commentValue =
    useRefs && legalCardRefs.commentInput
      ? legalCardRefs.commentInput.value
      : state.legalForm.comment;
  return { markValue, articleValue, commentValue };
}

export function renderLegalCard(state, onSubmit) {
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
  select.disabled = !marks.length || state.legalFormSaving || !artifact;
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
      !artifact || !marks.length || state.legalFormSaving || !select.value;
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

    if (!marks.length && legalForm.legalMarkId && artifact && artifact.legalMarkLabel) {
      const preserved = document.createElement("option");
      preserved.value = legalForm.legalMarkId;
      preserved.textContent = `${artifact.legalMarkLabel} (текущее)`;
      select.appendChild(preserved);
    }

    if (
      currentMark &&
      search &&
      !filteredMarks.some((mark) => String(mark.id) === String(currentValue))
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
    if (typeof onSubmit === "function") {
      onSubmit(submit);
    }
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
