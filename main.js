const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { initDb, closeDb, getDb } = require("./db");

let mainWindow = null;

const ARTIFACTS_DIR_NAME = "artifacts";
const CASE_DIR_PREFIX = "case-";
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
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapArtifactRow(row, baseDir) {
  return {
    id: row.id,
    caseId: row.case_id,
    subjectId: row.subject_id,
    source: row.source,
    url: row.url,
    title: row.title,
    capturedAt: row.captured_at,
    screenshotPath: sanitizeStoredPath(baseDir, row.screenshot_path),
    htmlPath: sanitizeStoredPath(baseDir, row.html_path),
    textPath: sanitizeStoredPath(baseDir, row.text_path),
  };
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
      webviewTag: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setMenuBarVisibility(false);

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
    mainWindow = null;
  });
}

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle(
  "cases:get-all",
  wrapIpc("cases:get-all", async () => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, title, description, status, created_at, updated_at
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
          `INSERT INTO cases (title, description, status, created_at)
           VALUES (?, ?, ?, datetime('now'))`
        )
        .run(titleResult.value, descriptionResult.value, status);
      const row = db
        .prepare(
          `SELECT id, title, description, status, created_at, updated_at
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
          `SELECT id, case_id, subject_id, source, url, title, captured_at,
                  screenshot_path, html_path, text_path
           FROM artifacts
           WHERE case_id = ?
           ORDER BY captured_at DESC, id DESC`
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

      const row = db
        .prepare(
          `SELECT id, case_id, subject_id, source, url, title, captured_at,
                  screenshot_path, html_path, text_path
           FROM artifacts
           WHERE id = ?`
        )
        .get(result.lastInsertRowid);
      return ok(mapArtifactRow(row, baseDir));
    } catch (error) {
      console.error("[DB] saveArtifact failed:", error);
      await cleanupFiles(baseDir, createdFiles);
      return fail("DB_ERROR", "Не удалось сохранить артефакт.");
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
      const labelResult = validateRequiredString(
        mark.label,
        `marks[${index}].label`,
        MAX_LABEL_LENGTH
      );
      if (!labelResult.ok) {
        return fail("INVALID_ARGUMENT", labelResult.error);
      }
      const articleResult = validateOptionalString(
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

      const deleteStmt = db.prepare(
        `DELETE FROM legal_marks
         WHERE artifact_id IN (SELECT id FROM artifacts WHERE case_id = ?)`
      );
      const insertStmt = db.prepare(
        `INSERT INTO legal_marks (artifact_id, label, article_text, comment)
         VALUES (?, ?, ?, ?)`
      );

      const transaction = db.transaction(() => {
        deleteStmt.run(id);
        for (const mark of normalizedMarks) {
          insertStmt.run(
            mark.artifactId,
            mark.label,
            mark.articleText,
            mark.comment
          );
        }
      });
      transaction();

      return ok({ updated: normalizedMarks.length });
    } catch (error) {
      console.error("[DB] updateLegalMarks failed:", error);
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
