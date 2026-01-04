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
const MAX_LEGAL_TEXT_LENGTH = 1000;
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

module.exports = {
  ARTIFACTS_DIR_NAME,
  CASE_DIR_PREFIX,
  REPORTS_DIR_NAME,
  AUTH_BLOCKED_HOSTS,
  DEFAULT_NEWS_URL,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_URL_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_META_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LEGAL_TEXT_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_MARKS,
  MAX_SCREENSHOT_BYTES,
  MAX_HTML_BYTES,
  MAX_TEXT_BYTES,
  ALLOWED_STATUSES,
  ALLOWED_ENCODINGS,
  STATUS_LABELS,
};
