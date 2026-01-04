const { app, BrowserWindow, ipcMain, Menu, WebContentsView } =
  require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { initDb, closeDb, getDb } = require("./db");

let mainWindow = null;
let browserView = null;
let browserViewBounds = null;
let browserTabVisible = true;
let browserErrorActive = false;
let lastSafeBrowserUrl = null;

const ARTIFACTS_DIR_NAME = "screenshots";
const CASE_DIR_PREFIX = "case-";
const REPORTS_DIR_NAME = "reports";
const AUTH_BLOCKED_HOSTS = new Set(["accounts.google.com"]);
const DEFAULT_NEWS_URL =
  "https://news.google.com/topstories?hl=ru&gl=RU&ceid=RU:ru";
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_URL_LENGTH = 2048;
const MAX_SOURCE_LENGTH = 200;
const MAX_META_LENGTH = 20000;
const MAX_LABEL_LENGTH = 200;
const MAX_LEGAL_TEXT_LENGTH = 4000;
const MAX_COMMENT_LENGTH = 4000;
const MAX_MARKS = 500;
const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const ALLOWED_STATUSES = new Set(["open", "closed", "paused", "archived"]);
const ALLOWED_ENCODINGS = new Set(["utf8", "base64"]);
const STATUS_LABELS = {
  open: "Открыто",
  closed: "Закрыто",
  paused: "Пауза",
  archived: "Архив",
};

function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function wrapIpc(channel, handler) {
  return async (event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(`[IPC] ${channel} failed:`, error);
      return fail("INTERNAL_ERROR", "Неожиданная ошибка.");
    }
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function parsePositiveInt(value) {
  const number =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }
  return number;
}

function validateRequiredString(value, fieldName, maxLength) {
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} должно быть строкой.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldName} обязательно.` };
  }
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} превышает максимальную длину.`,
    };
  }
  return { ok: true, value: trimmed };
}

function validateOptionalString(value, fieldName, maxLength) {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldName} должно быть строкой.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} превышает максимальную длину.`,
    };
  }
  return { ok: true, value: trimmed };
}

function normalizeCapturedAt(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "capturedAt должно быть строкой." };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      error: "capturedAt должно быть корректной строкой даты.",
    };
  }
  return { ok: true, value: date.toISOString() };
}

function normalizeMetaJson(meta) {
  if (meta === undefined || meta === null) {
    return { ok: true, value: null };
  }
  if (typeof meta === "string") {
    const trimmed = meta.trim();
    if (!trimmed) {
      return { ok: true, value: null };
    }
    if (trimmed.length > MAX_META_LENGTH) {
      return { ok: false, error: "meta превышает допустимый размер." };
    }
    return { ok: true, value: trimmed };
  }
  if (!isPlainObject(meta)) {
    return { ok: false, error: "meta должно быть объектом или строкой." };
  }
  try {
    const json = JSON.stringify(meta);
    if (json.length > MAX_META_LENGTH) {
      return { ok: false, error: "meta превышает допустимый размер." };
    }
    return { ok: true, value: json };
  } catch (error) {
    return {
      ok: false,
      error: "meta должно быть сериализуемым в JSON.",
    };
  }
}

function normalizeFilePayload(file, defaultEncoding) {
  if (file === undefined || file === null) {
    return { ok: true, value: null };
  }
  if (typeof file === "string") {
    return { ok: true, value: { data: file, encoding: defaultEncoding } };
  }
  if (!isPlainObject(file) || typeof file.data !== "string") {
    return { ok: false, error: "Некорректные данные файла." };
  }
  const encoding = file.encoding || defaultEncoding;
  if (!ALLOWED_ENCODINGS.has(encoding)) {
    return { ok: false, error: "Некорректная кодировка файла." };
  }
  return { ok: true, value: { data: file.data, encoding } };
}

function getArtifactsBaseDir() {
  const baseDir = path.join(app.getPath("userData"), ARTIFACTS_DIR_NAME);
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

function getReportsBaseDir() {
  const baseDir = path.join(app.getPath("userData"), REPORTS_DIR_NAME);
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

function safeJoin(baseDir, ...segments) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, ...segments);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Недопустимый путь.");
  }
  return resolvedTarget;
}

function sanitizeStoredPath(baseDir, storedPath) {
  if (!storedPath || typeof storedPath !== "string") {
    return null;
  }
  const normalized = path.normalize(storedPath);
  const absolute = path.resolve(baseDir, normalized);
  const relative = path.relative(baseDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

function formatCaptureFolderName(isoString) {
  return isoString.replace(/[:.]/g, "-");
}

async function writeArtifactFile({
  baseDir,
  caseDir,
  type,
  payload,
  extension,
  maxBytes,
}) {
  const buffer =
    payload.encoding === "base64"
      ? Buffer.from(payload.data, "base64")
      : Buffer.from(payload.data, "utf8");

  if (buffer.length === 0) {
    throw new Error("Пустые данные файла.");
  }
  if (buffer.length > maxBytes) {
    throw new Error("Файл слишком большой.");
  }

  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const fileName = `${type}-${Date.now()}-${randomSuffix}.${extension}`;
  const absolutePath = safeJoin(caseDir, fileName);
  await fs.promises.writeFile(absolutePath, buffer);
  return path.relative(baseDir, absolutePath).split(path.sep).join("/");
}

async function writeCaptureFile({
  baseDir,
  captureDir,
  fileName,
  buffer,
  maxBytes,
}) {
  if (!buffer || buffer.length === 0) {
    throw new Error("Пустые данные файла.");
  }
  if (buffer.length > maxBytes) {
    throw new Error("Файл слишком большой.");
  }
  const absolutePath = path.join(captureDir, fileName);
  await fs.promises.writeFile(absolutePath, buffer);
  return path.relative(baseDir, absolutePath).split(path.sep).join("/");
}

async function cleanupFiles(baseDir, paths) {
  await Promise.all(
    paths.map(async (relativePath) => {
      try {
        const absolutePath = safeJoin(baseDir, relativePath);
        await fs.promises.unlink(absolutePath);
      } catch (error) {
        console.warn("[FS] очистка не удалась:", error);
      }
    })
  );
}

function mapCaseRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArtifactRow(row, baseDir) {
  const screenshotPath = sanitizeStoredPath(baseDir, row.screenshot_path);
  const htmlPath = sanitizeStoredPath(baseDir, row.html_path);
  const textPath = sanitizeStoredPath(baseDir, row.text_path);
  const size =
    getStoredFileSize(baseDir, screenshotPath) +
    getStoredFileSize(baseDir, htmlPath) +
    getStoredFileSize(baseDir, textPath);
  const toFileUrl = (relativePath) => {
    if (!relativePath) return null;
    const absolute = safeJoin(baseDir, relativePath);
    return `file://${absolute.replace(/\\/g, "/")}`;
  };
  return {
    id: row.id,
    caseId: row.case_id,
    subjectId: row.subject_id,
    source: row.source,
    url: row.url,
    title: row.title,
    capturedAt: row.captured_at,
    screenshotPath,
    htmlPath,
    textPath,
    size,
    screenshotFileUrl: toFileUrl(screenshotPath),
    htmlFileUrl: toFileUrl(htmlPath),
    textFileUrl: toFileUrl(textPath),
    legalMarkId:
      Number.isInteger(Number(row.legal_mark_id)) &&
      Number(row.legal_mark_id) > 0
        ? Number(row.legal_mark_id)
        : null,
    legalMarkLabel: row.legal_mark_label || null,
    articleText: row.article_text || null,
    legalComment: row.legal_comment || row.comment || null,
  };
}

function selectArtifactRowWithLegal(db, artifactId) {
  return db
    .prepare(
      `SELECT a.id,
              a.case_id,
              a.subject_id,
              a.source,
              a.url,
              a.title,
              a.captured_at,
              a.screenshot_path,
              a.html_path,
              a.text_path,
              alm.legal_mark_id,
              alm.article_text,
              alm.comment AS legal_comment,
              lm.label AS legal_mark_label
       FROM artifacts AS a
       LEFT JOIN artifact_legal_marks AS alm ON alm.artifact_id = a.id
       LEFT JOIN legal_marks AS lm ON lm.id = alm.legal_mark_id
       WHERE a.id = ?`
    )
    .get(artifactId);
}

function getStoredFileSize(baseDir, relativePath) {
  if (!relativePath) return 0;
  try {
    const absolute = safeJoin(baseDir, relativePath);
    const stats = fs.statSync(absolute);
    if (stats.isFile()) {
      return stats.size;
    }
  } catch (error) {
    return 0;
  }
  return 0;
}

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

function mapArtifactReportRow(row, baseDir) {
  const screenshotPath = sanitizeStoredPath(baseDir, row.screenshot_path);
  const htmlPath = sanitizeStoredPath(baseDir, row.html_path);
  const textPath = sanitizeStoredPath(baseDir, row.text_path);
  const size =
    getStoredFileSize(baseDir, screenshotPath) +
    getStoredFileSize(baseDir, htmlPath) +
    getStoredFileSize(baseDir, textPath);
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.title,
    capturedAt: row.captured_at,
    screenshotPath,
    htmlPath,
    textPath,
    size,
    contentHash: row.content_hash,
    legalMarkLabel: row.legal_mark_label || null,
    articleText: row.article_text || null,
    legalComment: row.legal_comment || row.comment || null,
  };
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

function sendBrowserState(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("browser:state", payload);
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

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setMenuBarVisibility(false);
  createBrowserView();

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    mainWindow.loadURL(startUrl).catch((error) => {
      console.error("Не удалось загрузить URL:", error);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "index.html")).catch((error) => {
      console.error("Не удалось загрузить index.html:", error);
    });
  }

  mainWindow.on("closed", () => {
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
  });
}

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle(
  "browser:navigate",
  wrapIpc("browser:navigate", async (url) => {
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
  })
);

ipcMain.on("browser:set-bounds", (_event, bounds) => {
  const normalized = normalizeBrowserBounds(bounds);
  if (!normalized || !browserView) {
    return;
  }
  updateBrowserViewBounds(normalized);
});

ipcMain.on("browser:set-visible", (_event, visible) => {
  browserTabVisible = Boolean(visible);
  updateBrowserViewVisibility();
});

ipcMain.handle(
  "cases:get-all",
  wrapIpc("cases:get-all", async () => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, title, description, assigned_to, status, created_at, updated_at
           FROM cases
           ORDER BY created_at DESC, id DESC`
        )
        .all();
      return ok(rows.map(mapCaseRow));
    } catch (error) {
      console.error("[DB] getCases failed:", error);
      return fail("DB_ERROR", "Не удалось загрузить дела.");
    }
  })
);

ipcMain.handle(
  "legal-marks:list",
  wrapIpc("legal-marks:list", async () => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, label, description
           FROM legal_marks
           ORDER BY label ASC, id ASC`
        )
        .all();
      return ok(
        rows.map((row) => ({
          id: row.id,
          label: row.label,
          description: row.description || null,
        }))
      );
    } catch (error) {
      console.error("[DB] listLegalMarks failed:", error);
      return fail("DB_ERROR", "Не удалось загрузить список юридических меток.");
    }
  })
);

ipcMain.handle(
  "cases:create",
  wrapIpc("cases:create", async (caseData) => {
    if (!isPlainObject(caseData)) {
      return fail("INVALID_ARGUMENT", "caseData должно быть объектом.");
    }
    const titleResult = validateRequiredString(
      caseData.title,
      "title",
      MAX_TITLE_LENGTH
    );
    if (!titleResult.ok) {
      return fail("INVALID_ARGUMENT", titleResult.error);
    }
    const descriptionResult = validateOptionalString(
      caseData.description,
      "description",
      MAX_DESCRIPTION_LENGTH
    );
    if (!descriptionResult.ok) {
      return fail("INVALID_ARGUMENT", descriptionResult.error);
    }
    const assignedResult = validateOptionalString(
      caseData.assignedTo,
      "assignedTo",
      MAX_LABEL_LENGTH
    );
    if (!assignedResult.ok) {
      return fail("INVALID_ARGUMENT", assignedResult.error);
    }
    const statusValue =
      typeof caseData.status === "string" ? caseData.status.trim() : "";
    const status = statusValue || "open";
    if (!ALLOWED_STATUSES.has(status)) {
      return fail(
        "INVALID_ARGUMENT",
        `status должен быть одним из: ${Array.from(ALLOWED_STATUSES).join(", ")}.`
      );
    }

    try {
      const db = getDb();
      const result = db
        .prepare(
          `INSERT INTO cases (title, description, assigned_to, status, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`
        )
        .run(
          titleResult.value,
          descriptionResult.value,
          assignedResult.value,
          status
        );
      const row = db
        .prepare(
          `SELECT id, title, description, assigned_to, status, created_at, updated_at
           FROM cases
           WHERE id = ?`
        )
        .get(result.lastInsertRowid);
      return ok(mapCaseRow(row));
    } catch (error) {
      console.error("[DB] createCase failed:", error);
      return fail("DB_ERROR", "Не удалось создать дело.");
    }
  })
);

ipcMain.handle(
  "cases:get-artifacts",
  wrapIpc("cases:get-artifacts", async (caseId) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }
    try {
      const db = getDb();
      const exists = db
        .prepare("SELECT id FROM cases WHERE id = ?")
        .get(id);
      if (!exists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      const baseDir = getArtifactsBaseDir();
      const rows = db
        .prepare(
          `SELECT a.id,
                  a.case_id,
                  a.subject_id,
                  a.source,
                  a.url,
                  a.title,
                  a.captured_at,
                  a.screenshot_path,
                  a.html_path,
                  a.text_path,
                  alm.legal_mark_id,
                  alm.article_text,
                  alm.comment AS legal_comment,
                  lm.label AS legal_mark_label
           FROM artifacts AS a
           LEFT JOIN artifact_legal_marks AS alm ON alm.artifact_id = a.id
           LEFT JOIN legal_marks AS lm ON lm.id = alm.legal_mark_id
           WHERE a.case_id = ?
           ORDER BY a.captured_at DESC, a.id DESC`
        )
        .all(id);
      return ok(rows.map((row) => mapArtifactRow(row, baseDir)));
    } catch (error) {
      console.error("[DB] getCaseArtifacts failed:", error);
      return fail("DB_ERROR", "Не удалось загрузить артефакты.");
    }
  })
);

ipcMain.handle(
  "export:case-report",
  wrapIpc("export:case-report", async (caseId, options) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }
    if (options !== undefined && options !== null && !isPlainObject(options)) {
      return fail("INVALID_ARGUMENT", "options должны быть объектом.");
    }

    try {
      const db = getDb();
      const caseRow = db
        .prepare(
          `SELECT id, title, description, assigned_to, status, created_at, updated_at
           FROM cases
           WHERE id = ?`
        )
        .get(id);
      if (!caseRow) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }

      const baseDir = getArtifactsBaseDir();
      const artifacts = db
        .prepare(
          `SELECT a.id,
                  a.source,
                  a.url,
                  a.title,
                  a.captured_at,
                  a.screenshot_path,
                  a.html_path,
                  a.text_path,
                  a.content_hash,
                  alm.legal_mark_id,
                  alm.article_text,
                  alm.comment AS legal_comment,
                  lm.label AS legal_mark_label
           FROM artifacts AS a
           LEFT JOIN artifact_legal_marks AS alm ON alm.artifact_id = a.id
           LEFT JOIN legal_marks AS lm ON lm.id = alm.legal_mark_id
           WHERE a.case_id = ?
           ORDER BY a.captured_at DESC, a.id DESC`
        )
        .all(id)
        .map((row) => mapArtifactReportRow(row, baseDir));

      const caseItem = mapCaseRow(caseRow);
      const reportHtml = buildCaseReportHtml(
        caseItem,
        artifacts,
        new Date().toISOString()
      );

      const reportsBaseDir = getReportsBaseDir();
      const caseDir = safeJoin(reportsBaseDir, `${CASE_DIR_PREFIX}${id}`);
      await fs.promises.mkdir(caseDir, { recursive: true });

      const timestamp = formatCaptureFolderName(new Date().toISOString());
      const baseName = `case-report-${id}-${timestamp}`;
      const htmlPath = safeJoin(caseDir, `${baseName}.html`);
      const pdfPath = safeJoin(caseDir, `${baseName}.pdf`);

      await fs.promises.writeFile(htmlPath, reportHtml, "utf8");

      let reportWindow = null;
      try {
        reportWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        await reportWindow.loadFile(htmlPath);
        const pdfBuffer = await reportWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: "A4",
          marginsType: 1,
        });
        await fs.promises.writeFile(pdfPath, pdfBuffer);
      } finally {
        if (reportWindow && !reportWindow.isDestroyed()) {
          reportWindow.destroy();
        }
      }

      return ok({ pdfPath, htmlPath });
    } catch (error) {
      console.error("[Export] case report failed:", error);
      return fail("EXPORT_FAILED", "Не удалось сформировать отчёт.");
    }
  })
);

ipcMain.handle(
  "cases:update",
  wrapIpc("cases:update", async (caseId, data) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }
    if (!isPlainObject(data)) {
      return fail("INVALID_ARGUMENT", "data должно быть объектом.");
    }
    const titleResult = validateRequiredString(
      data.title,
      "title",
      MAX_TITLE_LENGTH
    );
    if (!titleResult.ok) {
      return fail("INVALID_ARGUMENT", titleResult.error);
    }
    const descriptionResult = validateOptionalString(
      data.description,
      "description",
      MAX_DESCRIPTION_LENGTH
    );
    if (!descriptionResult.ok) {
      return fail("INVALID_ARGUMENT", descriptionResult.error);
    }
    const assignedResult = validateOptionalString(
      data.assignedTo,
      "assignedTo",
      MAX_LABEL_LENGTH
    );
    if (!assignedResult.ok) {
      return fail("INVALID_ARGUMENT", assignedResult.error);
    }
    const statusValue =
      typeof data.status === "string" ? data.status.trim() : "";
    const status = statusValue || "open";
    if (!ALLOWED_STATUSES.has(status)) {
      return fail(
        "INVALID_ARGUMENT",
        `status должен быть одним из: ${Array.from(ALLOWED_STATUSES).join(", ")}.`
      );
    }

    try {
      const db = getDb();
      const exists = db.prepare("SELECT id FROM cases WHERE id = ?").get(id);
      if (!exists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      db.prepare(
        `UPDATE cases
         SET title = ?, description = ?, assigned_to = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        titleResult.value,
        descriptionResult.value,
        assignedResult.value,
        status,
        id
      );
      const row = db
        .prepare(
          `SELECT id, title, description, assigned_to, status, created_at, updated_at
           FROM cases
           WHERE id = ?`
        )
        .get(id);
      return ok(mapCaseRow(row));
    } catch (error) {
      console.error("[DB] updateCase failed:", error);
      return fail("DB_ERROR", "Не удалось обновить дело.");
    }
  })
);

ipcMain.handle(
  "cases:delete",
  wrapIpc("cases:delete", async (caseId) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }
    try {
      const db = getDb();
      const exists = db.prepare("SELECT id FROM cases WHERE id = ?").get(id);
      if (!exists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      db.prepare("DELETE FROM cases WHERE id = ?").run(id);
      return ok({ deleted: true });
    } catch (error) {
      console.error("[DB] deleteCase failed:", error);
      return fail("DB_ERROR", "Не удалось удалить дело.");
    }
  })
);

ipcMain.handle(
  "artifacts:save",
  wrapIpc("artifacts:save", async (caseId, artifactData) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }
    if (!isPlainObject(artifactData)) {
      return fail("INVALID_ARGUMENT", "artifactData должно быть объектом.");
    }

    const urlResult = validateRequiredString(
      artifactData.url,
      "url",
      MAX_URL_LENGTH
    );
    if (!urlResult.ok) {
      return fail("INVALID_ARGUMENT", urlResult.error);
    }
    const titleResult = validateOptionalString(
      artifactData.title,
      "title",
      MAX_TITLE_LENGTH
    );
    if (!titleResult.ok) {
      return fail("INVALID_ARGUMENT", titleResult.error);
    }
    const sourceResult = validateOptionalString(
      artifactData.source,
      "source",
      MAX_SOURCE_LENGTH
    );
    if (!sourceResult.ok) {
      return fail("INVALID_ARGUMENT", sourceResult.error);
    }

    const capturedAtResult = normalizeCapturedAt(artifactData.capturedAt);
    if (!capturedAtResult.ok) {
      return fail("INVALID_ARGUMENT", capturedAtResult.error);
    }

    const metaResult = normalizeMetaJson(artifactData.meta);
    if (!metaResult.ok) {
      return fail("INVALID_ARGUMENT", metaResult.error);
    }

    let subjectId = null;
    if (artifactData.subjectId !== undefined && artifactData.subjectId !== null) {
      subjectId = parsePositiveInt(artifactData.subjectId);
      if (!subjectId) {
        return fail(
          "INVALID_ARGUMENT",
          "subjectId должен быть положительным целым числом."
        );
      }
    }

    const files = isPlainObject(artifactData.files) ? artifactData.files : {};
    const screenshotResult = normalizeFilePayload(
      files.screenshot,
      "base64"
    );
    if (!screenshotResult.ok) {
      return fail("INVALID_ARGUMENT", screenshotResult.error);
    }
    if (
      screenshotResult.value &&
      screenshotResult.value.encoding !== "base64"
    ) {
      return fail(
        "INVALID_ARGUMENT",
        "screenshot должен быть в кодировке base64."
      );
    }
    const htmlResult = normalizeFilePayload(files.html, "utf8");
    if (!htmlResult.ok) {
      return fail("INVALID_ARGUMENT", htmlResult.error);
    }
    const textResult = normalizeFilePayload(files.text, "utf8");
    if (!textResult.ok) {
      return fail("INVALID_ARGUMENT", textResult.error);
    }

    let db;
    try {
      db = getDb();
      const caseExists = db
        .prepare("SELECT id FROM cases WHERE id = ?")
        .get(id);
      if (!caseExists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      if (subjectId) {
        const subjectExists = db
          .prepare(
            "SELECT id FROM subjects WHERE id = ? AND case_id = ?"
          )
          .get(subjectId, id);
        if (!subjectExists) {
          return fail(
            "INVALID_ARGUMENT",
            "subjectId не относится к этому делу."
          );
        }
      }
    } catch (error) {
      console.error("[DB] validate case failed:", error);
      return fail("DB_ERROR", "Не удалось проверить данные дела.");
    }

    const baseDir = getArtifactsBaseDir();
    const caseDir = safeJoin(baseDir, `${CASE_DIR_PREFIX}${id}`);

    try {
      await fs.promises.mkdir(caseDir, { recursive: true });
    } catch (error) {
      console.error("[FS] mkdir failed:", error);
      return fail(
        "FILE_ERROR",
        "Не удалось подготовить хранилище артефактов."
      );
    }

    const createdFiles = [];
    let screenshotPath = null;
    let htmlPath = null;
    let textPath = null;

    try {
      if (screenshotResult.value) {
        screenshotPath = await writeArtifactFile({
          baseDir,
          caseDir,
          type: "screenshot",
          payload: screenshotResult.value,
          extension: "png",
          maxBytes: MAX_SCREENSHOT_BYTES,
        });
        createdFiles.push(screenshotPath);
      }
      if (htmlResult.value) {
        htmlPath = await writeArtifactFile({
          baseDir,
          caseDir,
          type: "page",
          payload: htmlResult.value,
          extension: "html",
          maxBytes: MAX_HTML_BYTES,
        });
        createdFiles.push(htmlPath);
      }
      if (textResult.value) {
        textPath = await writeArtifactFile({
          baseDir,
          caseDir,
          type: "text",
          payload: textResult.value,
          extension: "txt",
          maxBytes: MAX_TEXT_BYTES,
        });
        createdFiles.push(textPath);
      }
    } catch (error) {
      console.error("[FS] write failed:", error);
      await cleanupFiles(baseDir, createdFiles);
      return fail("FILE_ERROR", "Не удалось записать файлы артефактов.");
    }

    try {
      const capturedAt =
        capturedAtResult.value || new Date().toISOString();
      const contentHash = crypto
        .createHash("sha256")
        .update(urlResult.value)
        .update(titleResult.value || "")
        .update(sourceResult.value || "")
        .update(capturedAt)
        .digest("hex");

      const result = db
        .prepare(
          `INSERT INTO artifacts (
             case_id, subject_id, source, url, title, captured_at,
             screenshot_path, html_path, text_path, content_hash, meta_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          subjectId,
          sourceResult.value,
          urlResult.value,
          titleResult.value,
          capturedAt,
          screenshotPath,
          htmlPath,
          textPath,
          contentHash,
          metaResult.value
        );

      const mappedRow = selectArtifactRowWithLegal(
        db,
        result.lastInsertRowid
      );
      return ok(mapArtifactRow(mappedRow, baseDir));
    } catch (error) {
      console.error("[DB] saveArtifact failed:", error);
      await cleanupFiles(baseDir, createdFiles);
      return fail("DB_ERROR", "Не удалось сохранить артефакт.");
    }
  })
);

ipcMain.handle(
  "artifacts:capture",
  wrapIpc("artifacts:capture", async (caseId, subjectId) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }

    let normalizedSubjectId = null;
    if (subjectId !== undefined && subjectId !== null && subjectId !== "") {
      normalizedSubjectId = parsePositiveInt(subjectId);
      if (!normalizedSubjectId) {
        return fail(
          "INVALID_ARGUMENT",
          "subjectId должен быть положительным целым числом."
        );
      }
    }

    let db;
    try {
      db = getDb();
      const caseExists = db
        .prepare("SELECT id FROM cases WHERE id = ?")
        .get(id);
      if (!caseExists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      if (normalizedSubjectId) {
        const subjectExists = db
          .prepare(
            "SELECT id FROM subjects WHERE id = ? AND case_id = ?"
          )
          .get(normalizedSubjectId, id);
        if (!subjectExists) {
          return fail(
            "INVALID_ARGUMENT",
            "subjectId не относится к этому делу."
          );
        }
      }
    } catch (error) {
      console.error("[DB] validate case failed:", error);
      return fail("DB_ERROR", "Не удалось проверить данные дела.");
    }

    if (!browserView || !browserView.webContents) {
      return fail("NOT_READY", "Браузер недоступен.");
    }

    const contents = browserView.webContents;
    if (contents.isDestroyed()) {
      return fail("NOT_READY", "Браузер недоступен.");
    }
    if (contents.isCrashed && contents.isCrashed()) {
      return fail("NOT_READY", "Процесс браузера завершился.");
    }

    const rawUrl = typeof contents.getURL === "function" ? contents.getURL() : "";
    const urlResult = validateRequiredString(
      rawUrl,
      "url",
      MAX_URL_LENGTH
    );
    if (!urlResult.ok) {
      return fail("INVALID_STATE", "URL страницы недоступен.");
    }

    const warnings = [];
    let title = null;
    const rawTitle =
      typeof contents.getTitle === "function" ? contents.getTitle() : "";
    if (typeof rawTitle === "string") {
      const trimmed = rawTitle.trim();
      if (trimmed) {
        if (trimmed.length > MAX_TITLE_LENGTH) {
          warnings.push("Заголовок страницы был сокращён.");
          title = trimmed.slice(0, MAX_TITLE_LENGTH);
        } else {
          title = trimmed;
        }
      }
    }

    let source = null;
    try {
      const parsed = new URL(urlResult.value);
      if (parsed.hostname) {
        source = parsed.hostname;
        if (source.length > MAX_SOURCE_LENGTH) {
          warnings.push("Источник страницы был сокращён.");
          source = source.slice(0, MAX_SOURCE_LENGTH);
        }
      }
    } catch (error) {
      source = null;
    }

    const capturedAt = new Date().toISOString();
    const baseDir = getArtifactsBaseDir();
    const captureDir = safeJoin(
      baseDir,
      String(id),
      formatCaptureFolderName(capturedAt)
    );

    try {
      await fs.promises.mkdir(captureDir, { recursive: true });
    } catch (error) {
      console.error("[FS] mkdir failed:", error);
      return fail(
        "FILE_ERROR",
        "Не удалось подготовить хранилище артефактов."
      );
    }

    const createdFiles = [];
    let screenshotPath = null;
    let htmlPath = null;
    let textPath = null;

    try {
      const image = await contents.capturePage();
      const pngBuffer = image.toPNG();
      screenshotPath = await writeCaptureFile({
        baseDir,
        captureDir,
        fileName: "screenshot.png",
        buffer: pngBuffer,
        maxBytes: MAX_SCREENSHOT_BYTES,
      });
      createdFiles.push(screenshotPath);
    } catch (error) {
      console.error("[Capture] screenshot failed:", error);
      warnings.push("Не удалось сохранить скриншот.");
    }

    try {
      const html = await contents.executeJavaScript(
        "document.documentElement ? document.documentElement.outerHTML : ''",
        true
      );
      if (typeof html === "string" && html.trim()) {
        const buffer = Buffer.from(html, "utf8");
        if (buffer.length > MAX_HTML_BYTES) {
          warnings.push("HTML слишком большой, сохранение пропущено.");
        } else {
          htmlPath = await writeCaptureFile({
            baseDir,
            captureDir,
            fileName: "page.html",
            buffer,
            maxBytes: MAX_HTML_BYTES,
          });
          createdFiles.push(htmlPath);
        }
      } else {
        warnings.push("HTML страницы недоступен.");
      }
    } catch (error) {
      console.error("[Capture] html failed:", error);
      warnings.push("Не удалось извлечь HTML страницы.");
    }

    try {
      const text = await contents.executeJavaScript(
        "document.body ? document.body.innerText : ''",
        true
      );
      if (typeof text === "string" && text.trim()) {
        const buffer = Buffer.from(text, "utf8");
        if (buffer.length > MAX_TEXT_BYTES) {
          warnings.push("Текст страницы слишком большой, сохранение пропущено.");
        } else {
          textPath = await writeCaptureFile({
            baseDir,
            captureDir,
            fileName: "page.txt",
            buffer,
            maxBytes: MAX_TEXT_BYTES,
          });
          createdFiles.push(textPath);
        }
      } else {
        warnings.push("Текст страницы недоступен.");
      }
    } catch (error) {
      console.error("[Capture] text failed:", error);
      warnings.push("Не удалось извлечь текст страницы.");
    }

    if (!screenshotPath && !htmlPath && !textPath) {
      await cleanupFiles(baseDir, createdFiles);
      return fail("CAPTURE_FAILED", "Не удалось сохранить артефакт.");
    }

    try {
      const contentHash = crypto
        .createHash("sha256")
        .update(urlResult.value)
        .update(title || "")
        .update(source || "")
        .update(capturedAt)
        .digest("hex");

      const result = db
        .prepare(
          `INSERT INTO artifacts (
             case_id, subject_id, source, url, title, captured_at,
             screenshot_path, html_path, text_path, content_hash, meta_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          normalizedSubjectId,
          source,
          urlResult.value,
          title,
          capturedAt,
          screenshotPath,
          htmlPath,
          textPath,
          contentHash,
          null
        );

      const mappedRow = selectArtifactRowWithLegal(
        db,
        result.lastInsertRowid
      );

      return ok({
        artifact: mapArtifactRow(mappedRow, baseDir),
        warnings,
        partial: warnings.length > 0,
      });
    } catch (error) {
      console.error("[DB] captureArtifact failed:", error);
      await cleanupFiles(baseDir, createdFiles);
      return fail("DB_ERROR", "Не удалось сохранить артефакт.");
    }
  })
);

ipcMain.handle(
  "artifacts:set-legal",
  wrapIpc("artifacts:set-legal", async (artifactId, payload) => {
    const id = parsePositiveInt(artifactId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "artifactId должен быть положительным целым числом."
      );
    }
    if (!isPlainObject(payload)) {
      return fail("INVALID_ARGUMENT", "payload должно быть объектом.");
    }
    const legalMarkId = parsePositiveInt(payload.legalMarkId);
    if (!legalMarkId) {
      return fail(
        "INVALID_ARGUMENT",
        "legalMarkId обязателен и должен быть положительным целым числом."
      );
    }
    const articleResult = validateRequiredString(
      payload.articleText,
      "articleText",
      MAX_LEGAL_TEXT_LENGTH
    );
    if (!articleResult.ok) {
      return fail("INVALID_ARGUMENT", articleResult.error);
    }
    const commentResult = validateOptionalString(
      payload.comment,
      "comment",
      MAX_COMMENT_LENGTH
    );
    if (!commentResult.ok) {
      return fail("INVALID_ARGUMENT", commentResult.error);
    }

    try {
      const db = getDb();
      const artifactRow = db
        .prepare("SELECT id FROM artifacts WHERE id = ?")
        .get(id);
      if (!artifactRow) {
        return fail("NOT_FOUND", "Артефакт не найден.");
      }

      const markRow = db
        .prepare("SELECT id, label FROM legal_marks WHERE id = ?")
        .get(legalMarkId);
      if (!markRow) {
        return fail(
          "INVALID_ARGUMENT",
          "Выбранная юридическая метка отсутствует в справочнике."
        );
      }

      db.prepare(
        `INSERT INTO artifact_legal_marks (
           artifact_id, legal_mark_id, article_text, comment, created_at
         ) VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(artifact_id) DO UPDATE SET
           legal_mark_id = excluded.legal_mark_id,
           article_text = excluded.article_text,
           comment = excluded.comment,
           updated_at = datetime('now')`
      ).run(id, legalMarkId, articleResult.value, commentResult.value);

      const baseDir = getArtifactsBaseDir();
      const mappedRow = selectArtifactRowWithLegal(db, id);
      return ok(mapArtifactRow(mappedRow, baseDir));
    } catch (error) {
      console.error("[DB] setArtifactLegal failed:", error);
      return fail("DB_ERROR", "Не удалось сохранить юридическую привязку.");
    }
  })
);

ipcMain.handle(
  "cases:update-legal-marks",
  wrapIpc("cases:update-legal-marks", async (caseId, marks) => {
    const id = parsePositiveInt(caseId);
    if (!id) {
      return fail(
        "INVALID_ARGUMENT",
        "caseId должен быть положительным целым числом."
      );
    }
    if (!Array.isArray(marks)) {
      return fail("INVALID_ARGUMENT", "marks должен быть массивом.");
    }
    if (marks.length > MAX_MARKS) {
      return fail("INVALID_ARGUMENT", "Список меток слишком большой.");
    }

    const normalizedMarks = [];
    for (let index = 0; index < marks.length; index += 1) {
      const mark = marks[index];
      if (!isPlainObject(mark)) {
        return fail(
          "INVALID_ARGUMENT",
          `marks[${index}] должен быть объектом.`
        );
      }
      const artifactId = parsePositiveInt(mark.artifactId);
      if (!artifactId) {
        return fail(
          "INVALID_ARGUMENT",
          `marks[${index}].artifactId должен быть положительным целым числом.`
        );
      }
      const resolvedMarkId = parsePositiveInt(mark.legalMarkId);
      const labelResult = resolvedMarkId
        ? { ok: true, value: null }
        : validateRequiredString(
            mark.label,
            `marks[${index}].label`,
            MAX_LABEL_LENGTH
          );
      if (!labelResult.ok) {
        return fail("INVALID_ARGUMENT", labelResult.error);
      }
      const articleResult = validateRequiredString(
        mark.articleText,
        `marks[${index}].articleText`,
        MAX_LEGAL_TEXT_LENGTH
      );
      if (!articleResult.ok) {
        return fail("INVALID_ARGUMENT", articleResult.error);
      }
      const commentResult = validateOptionalString(
        mark.comment,
        `marks[${index}].comment`,
        MAX_COMMENT_LENGTH
      );
      if (!commentResult.ok) {
        return fail("INVALID_ARGUMENT", commentResult.error);
      }
      normalizedMarks.push({
        artifactId,
        legalMarkId: resolvedMarkId,
        label: labelResult.value,
        articleText: articleResult.value,
        comment: commentResult.value,
      });
    }

    try {
      const db = getDb();
      const caseExists = db
        .prepare("SELECT id FROM cases WHERE id = ?")
        .get(id);
      if (!caseExists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }

      const artifactRows = db
        .prepare("SELECT id FROM artifacts WHERE case_id = ?")
        .all(id);
      const artifactIds = new Set(artifactRows.map((row) => row.id));
      for (const mark of normalizedMarks) {
        if (!artifactIds.has(mark.artifactId)) {
          return fail(
            "INVALID_ARGUMENT",
            "marks содержат артефакты вне этого дела."
          );
        }
      }
      for (const mark of normalizedMarks) {
        if (mark.legalMarkId) {
          const exists = db
            .prepare("SELECT id FROM legal_marks WHERE id = ?")
            .get(mark.legalMarkId);
          if (!exists) {
            return fail(
              "INVALID_ARGUMENT",
              `marks[${normalizedMarks.indexOf(mark)}].legalMarkId не найден.`
            );
          }
        }
      }

      const deleteStmt = db.prepare(
        `DELETE FROM artifact_legal_marks
         WHERE artifact_id IN (SELECT id FROM artifacts WHERE case_id = ?)`
      );
      const insertMarkStmt = db.prepare(
        `INSERT OR IGNORE INTO legal_marks (label, created_at)
         VALUES (?, datetime('now'))`
      );
      const selectMarkByLabelStmt = db.prepare(
        "SELECT id FROM legal_marks WHERE label = ?"
      );
      const upsertLinkStmt = db.prepare(
        `INSERT INTO artifact_legal_marks (
           artifact_id, legal_mark_id, article_text, comment, created_at
         ) VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(artifact_id) DO UPDATE SET
           legal_mark_id = excluded.legal_mark_id,
           article_text = excluded.article_text,
           comment = excluded.comment,
           updated_at = datetime('now')`
      );

      const transaction = db.transaction(() => {
        deleteStmt.run(id);
        for (const mark of normalizedMarks) {
          let legalMarkId = mark.legalMarkId;
          if (!legalMarkId && mark.label) {
            insertMarkStmt.run(mark.label);
            const found = selectMarkByLabelStmt.get(mark.label);
            legalMarkId = found ? found.id : null;
          }
          if (!legalMarkId) {
            throw new Error("LEGAL_MARK_NOT_FOUND");
          }
          upsertLinkStmt.run(
            mark.artifactId,
            legalMarkId,
            mark.articleText,
            mark.comment
          );
        }
      });
      transaction();

      return ok({ updated: normalizedMarks.length });
    } catch (error) {
      console.error("[DB] updateLegalMarks failed:", error);
      if (error && error.message === "LEGAL_MARK_NOT_FOUND") {
        return fail(
          "INVALID_ARGUMENT",
          "Не удалось привязать метку: она отсутствует в справочнике."
        );
      }
      return fail("DB_ERROR", "Не удалось обновить правовые метки.");
    }
  })
);

app
  .whenReady()
  .then(() => {
    Menu.setApplicationMenu(null);
    initDb();
    createMainWindow();
  })
  .catch((error) => {
    console.error("Не удалось инициализировать приложение:", error);
    app.exit(1);
  });

app.on("activate", () => {
  app.whenReady().then(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeDb();
});
