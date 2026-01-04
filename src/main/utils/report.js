const { STATUS_LABELS } = require("../constants");

function formatReportDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
}

function formatReportStatus(value) {
  if (!value) return "—";
  const normalized = String(value).trim().toLowerCase();
  return STATUS_LABELS[normalized] || String(value);
}

function formatReportBytes(value) {
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

function escapeHtml(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCaseReportHtml(caseItem, artifacts, generatedAt) {
  const titleValue = caseItem.title || `Дело #${caseItem.id}`;
  const assignedValue = caseItem.assignedTo
    ? escapeHtml(caseItem.assignedTo)
    : "—";
  const descriptionValue = caseItem.description
    ? escapeHtml(caseItem.description).replace(/\n/g, "<br>")
    : '<span class="muted">Нет описания.</span>';
  const createdAtValue = formatReportDateTime(caseItem.createdAt);
  const updatedAtValue = formatReportDateTime(caseItem.updatedAt);
  const statusLabel = formatReportStatus(caseItem.status);
  const generatedAtValue = formatReportDateTime(generatedAt);
  const legalCount = artifacts.filter(
    (item) => item.legalMarkLabel || item.articleText || item.legalComment
  ).length;

  const artifactItems = artifacts.length
    ? artifacts
        .map((artifact) => {
          const artifactTitle = escapeHtml(
            artifact.title || artifact.url || `Артефакт ${artifact.id}`
          );
          const sourceValue = escapeHtml(artifact.source || "—");
          const capturedValue = formatReportDateTime(artifact.capturedAt);
          const sizeValue = formatReportBytes(artifact.size);
          const urlValue = artifact.url ? escapeHtml(artifact.url) : "—";
          const hashValue = artifact.contentHash
            ? escapeHtml(artifact.contentHash)
            : "—";
          const files = [];
          if (artifact.screenshotPath) {
            files.push(`Скриншот: ${artifact.screenshotPath}`);
          }
          if (artifact.htmlPath) {
            files.push(`HTML: ${artifact.htmlPath}`);
          }
          if (artifact.textPath) {
            files.push(`Текст: ${artifact.textPath}`);
          }
          const filesValue = files.length
            ? files.map((item) => escapeHtml(item)).join("<br>")
            : "—";
          const legalLabel = artifact.legalMarkLabel
            ? escapeHtml(artifact.legalMarkLabel)
            : "—";
          const articleValue = artifact.articleText
            ? escapeHtml(artifact.articleText)
            : "—";
          const commentValue = artifact.legalComment
            ? escapeHtml(artifact.legalComment)
            : "—";

          return `
        <div class="artifact-item">
          <div class="artifact-title">${artifactTitle}</div>
          <div class="artifact-meta">ID: ${artifact.id} · Источник: ${sourceValue} · Дата: ${capturedValue} · Размер: ${sizeValue}</div>
          <div class="artifact-grid">
            <div class="artifact-label">URL</div>
            <div class="artifact-value break-all">${urlValue}</div>
            <div class="artifact-label">Файлы</div>
            <div class="artifact-value">${filesValue}</div>
            <div class="artifact-label">Хэш</div>
            <div class="artifact-value break-all">${hashValue}</div>
            <div class="artifact-label">Пометка</div>
            <div class="artifact-value">${legalLabel}</div>
            <div class="artifact-label">Статья</div>
            <div class="artifact-value">${articleValue}</div>
            <div class="artifact-label">Комментарий</div>
            <div class="artifact-value">${commentValue}</div>
          </div>
        </div>`;
        })
        .join("")
    : '<div class="empty">Артефакты не найдены.</div>';

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <title>Отчёт по делу №${caseItem.id}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #1f1a14;
        background: #ffffff;
      }
      .page { padding: 24px; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        border-bottom: 1px solid #e6dfd4;
        padding-bottom: 16px;
      }
      .report-title {
        font-size: 24px;
        font-weight: 700;
        margin: 0;
      }
      .report-meta {
        font-size: 12px;
        color: #6b6256;
        margin-top: 6px;
      }
      .status-chip {
        background: #e2efe8;
        color: #1f6b55;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .section {
        margin-top: 24px;
      }
      .section-title {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 10px 0;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: 160px 1fr;
        gap: 6px 16px;
        font-size: 13px;
      }
      .meta-label {
        font-size: 11px;
        color: #6b6256;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .meta-value {
        font-weight: 600;
      }
      .description {
        margin-top: 10px;
        font-size: 13px;
        color: #3d352d;
        line-height: 1.4;
      }
      .summary-row {
        font-size: 12px;
        color: #6b6256;
        margin-top: 8px;
      }
      .artifact-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 12px;
      }
      .artifact-item {
        border: 1px solid #e6dfd4;
        border-radius: 12px;
        padding: 12px 14px;
      }
      .artifact-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .artifact-meta {
        font-size: 11px;
        color: #6b6256;
        margin-bottom: 10px;
      }
      .artifact-grid {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 6px 12px;
        font-size: 12px;
      }
      .artifact-label {
        font-size: 11px;
        color: #6b6256;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .artifact-value {
        color: #1f1a14;
      }
      .break-all { word-break: break-all; }
      .muted { color: #6b6256; }
      .empty {
        font-size: 12px;
        color: #6b6256;
        border: 1px dashed #e6dfd4;
        border-radius: 10px;
        padding: 12px;
      }
      @page { margin: 18mm; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="header">
        <div>
          <h1 class="report-title">Отчёт по делу №${caseItem.id}</h1>
          <div class="report-meta">Сформирован: ${escapeHtml(generatedAtValue)}</div>
        </div>
        <div class="status-chip">${escapeHtml(statusLabel)}</div>
      </div>

      <div class="section">
        <h2 class="section-title">Сводка</h2>
        <div class="meta-grid">
          <div class="meta-label">Название</div>
          <div class="meta-value">${escapeHtml(titleValue)}</div>
          <div class="meta-label">Статус</div>
          <div class="meta-value">${escapeHtml(statusLabel)}</div>
          <div class="meta-label">Ответственный</div>
          <div class="meta-value">${assignedValue}</div>
          <div class="meta-label">Создано</div>
          <div class="meta-value">${escapeHtml(createdAtValue)}</div>
          <div class="meta-label">Обновлено</div>
          <div class="meta-value">${escapeHtml(updatedAtValue)}</div>
        </div>
        <div class="description">${descriptionValue}</div>
        <div class="summary-row">Артефактов: ${artifacts.length} · С пометкой: ${legalCount}</div>
      </div>

      <div class="section">
        <h2 class="section-title">Артефакты</h2>
        <div class="artifact-list">
          ${artifactItems}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

module.exports = {
  formatReportDateTime,
  formatReportStatus,
  formatReportBytes,
  escapeHtml,
  buildCaseReportHtml,
};
