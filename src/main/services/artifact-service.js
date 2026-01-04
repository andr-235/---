const crypto = require("crypto");
const fs = require("fs");
const { getDb } = require("../../db");
const {
  CASE_DIR_PREFIX,
  MAX_URL_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_SOURCE_LENGTH,
  MAX_SCREENSHOT_BYTES,
  MAX_HTML_BYTES,
  MAX_TEXT_BYTES,
} = require("../constants");
const { ok, fail } = require("../utils/ipc");
const {
  isPlainObject,
  parsePositiveInt,
  validateRequiredString,
  validateOptionalString,
  normalizeCapturedAt,
  normalizeMetaJson,
  normalizeFilePayload,
} = require("../utils/validation");
const {
  getArtifactsBaseDir,
  safeJoin,
  formatCaptureFolderName,
  writeArtifactFile,
  writeCaptureFile,
  cleanupFiles,
} = require("../utils/files");
const { mapArtifactRow } = require("../models/artifact-model");
const caseRepo = require("../../db/repositories/case-repo");
const artifactRepo = require("../../db/repositories/artifact-repo");

function createArtifactService({ browserService }) {
  async function saveArtifact(caseId, artifactData) {
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
    const screenshotResult = normalizeFilePayload(files.screenshot, "base64");
    if (!screenshotResult.ok) {
      return fail("INVALID_ARGUMENT", screenshotResult.error);
    }
    if (screenshotResult.value && screenshotResult.value.encoding !== "base64") {
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
      const caseExists = caseRepo.caseExists(db, id);
      if (!caseExists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      if (subjectId) {
        const subjectExists = db
          .prepare("SELECT id FROM subjects WHERE id = ? AND case_id = ?")
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
      const capturedAt = capturedAtResult.value || new Date().toISOString();
      const contentHash = crypto
        .createHash("sha256")
        .update(urlResult.value)
        .update(titleResult.value || "")
        .update(sourceResult.value || "")
        .update(capturedAt)
        .digest("hex");

      const artifactId = artifactRepo.insertArtifact(db, {
        caseId: id,
        subjectId,
        source: sourceResult.value,
        url: urlResult.value,
        title: titleResult.value,
        capturedAt,
        screenshotPath,
        htmlPath,
        textPath,
        contentHash,
        metaJson: metaResult.value,
      });

      const mappedRow = artifactRepo.selectArtifactRowWithLegal(db, artifactId);
      return ok(mapArtifactRow(mappedRow, baseDir));
    } catch (error) {
      console.error("[DB] saveArtifact failed:", error);
      await cleanupFiles(baseDir, createdFiles);
      return fail("DB_ERROR", "Не удалось сохранить артефакт.");
    }
  }

  async function captureArtifact(caseId, subjectId) {
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
      const caseExists = caseRepo.caseExists(db, id);
      if (!caseExists) {
        return fail("NOT_FOUND", "Дело не найдено.");
      }
      if (normalizedSubjectId) {
        const subjectExists = db
          .prepare("SELECT id FROM subjects WHERE id = ? AND case_id = ?")
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

    const contents = browserService ? browserService.getWebContents() : null;
    if (!contents) {
      return fail("NOT_READY", "Браузер недоступен.");
    }
    if (contents.isDestroyed()) {
      return fail("NOT_READY", "Браузер недоступен.");
    }
    if (contents.isCrashed && contents.isCrashed()) {
      return fail("NOT_READY", "Процесс браузера завершился.");
    }

    const rawUrl = typeof contents.getURL === "function" ? contents.getURL() : "";
    const urlResult = validateRequiredString(rawUrl, "url", MAX_URL_LENGTH);
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

      const artifactId = artifactRepo.insertArtifact(db, {
        caseId: id,
        subjectId: normalizedSubjectId,
        source,
        url: urlResult.value,
        title,
        capturedAt,
        screenshotPath,
        htmlPath,
        textPath,
        contentHash,
        metaJson: null,
      });

      const mappedRow = artifactRepo.selectArtifactRowWithLegal(db, artifactId);

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
  }

  return {
    saveArtifact,
    captureArtifact,
  };
}

module.exports = { createArtifactService };


