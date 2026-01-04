const {
  safeJoin,
  sanitizeStoredPath,
  getStoredFileSize,
} = require("../utils/files");

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

module.exports = {
  mapArtifactRow,
  mapArtifactReportRow,
};
