const { app } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ARTIFACTS_DIR_NAME, REPORTS_DIR_NAME } = require("../constants");

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

module.exports = {
  getArtifactsBaseDir,
  getReportsBaseDir,
  safeJoin,
  sanitizeStoredPath,
  formatCaptureFolderName,
  writeArtifactFile,
  writeCaptureFile,
  cleanupFiles,
  getStoredFileSize,
};
