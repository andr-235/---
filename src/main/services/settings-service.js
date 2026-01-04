const fs = require("fs");
const os = require("os");
const path = require("path");
const { app } = require("electron");
const { getDb } = require("../../db");
const { MAX_LABEL_LENGTH, MAX_LEGAL_TEXT_LENGTH } = require("../constants");
const { ok, fail } = require("../utils/ipc");
const {
  isPlainObject,
  parsePositiveInt,
  validateRequiredString,
  validateOptionalString,
  validateArticleText,
} = require("../utils/validation");
const legalRepo = require("../../db/repositories/legal-repo");

const RBAC_ENABLED = process.env.OSINT_RBAC === "1";

function resolveCurrentUser() {
  try {
    const user = os.userInfo();
    return user && user.username ? user.username : "unknown";
  } catch (error) {
    return "unknown";
  }
}

function resolveAdminUsers() {
  return (process.env.OSINT_ADMIN_USERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasAdminAccess() {
  if (!RBAC_ENABLED) {
    return true;
  }
  if (process.env.OSINT_ADMIN === "1") {
    return true;
  }
  const currentUser = resolveCurrentUser();
  const allowed = resolveAdminUsers();
  if (!allowed.length) {
    return true;
  }
  return allowed.includes(currentUser);
}

function getAccessContext() {
  return {
    currentUser: resolveCurrentUser(),
    canEdit: hasAdminAccess(),
  };
}

function getPendingSettingsPath() {
  return path.join(app.getPath("userData"), "pending-legal-settings.json");
}

function storePendingChange(change) {
  const pendingPath = getPendingSettingsPath();
  let payload = { updatedAt: new Date().toISOString(), changes: [] };
  if (fs.existsSync(pendingPath)) {
    try {
      const raw = fs.readFileSync(pendingPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.changes)) {
        payload = parsed;
      }
    } catch (error) {
      payload = { updatedAt: new Date().toISOString(), changes: [] };
    }
  }
  payload.updatedAt = new Date().toISOString();
  payload.changes.push(change);
  fs.writeFileSync(pendingPath, JSON.stringify(payload, null, 2), "utf8");
  return pendingPath;
}

function mapLegalSettingRow(row) {
  return {
    id: row.id,
    label: row.label,
    description: row.description || null,
    articleText: row.article_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

function assertAdminAccess() {
  if (!hasAdminAccess()) {
    return fail("FORBIDDEN", "Недостаточно прав для изменения настроек.");
  }
  return null;
}

function listLegalSettings() {
  try {
    const db = getDb();
    const rows = legalRepo.listLegalMarkSettings(db);
    return ok({
      access: getAccessContext(),
      items: rows.map(mapLegalSettingRow),
    });
  } catch (error) {
    console.error("[DB] listLegalSettings failed:", error);
    return fail("DB_ERROR", "Не удалось загрузить настройки меток.");
  }
}

function createLegalSetting(payload) {
  const accessError = assertAdminAccess();
  if (accessError) {
    return accessError;
  }
  if (!isPlainObject(payload)) {
    return fail("INVALID_ARGUMENT", "payload должно быть объектом.");
  }
  const labelResult = validateRequiredString(
    payload.label,
    "label",
    MAX_LABEL_LENGTH
  );
  if (!labelResult.ok) {
    return fail("INVALID_ARGUMENT", labelResult.error);
  }
  const articleResult = validateArticleText(
    payload.articleText,
    "articleText",
    MAX_LEGAL_TEXT_LENGTH
  );
  if (!articleResult.ok) {
    return fail("INVALID_ARGUMENT", articleResult.error);
  }
  const descriptionResult = validateOptionalString(
    payload.description,
    "description",
    MAX_LEGAL_TEXT_LENGTH
  );
  if (!descriptionResult.ok) {
    return fail("INVALID_ARGUMENT", descriptionResult.error);
  }

  const updatedBy = resolveCurrentUser();

  try {
    const db = getDb();
    const result = legalRepo.insertLegalMarkWithArticle(db, {
      label: labelResult.value,
      description: descriptionResult.value,
      articleText: articleResult.value,
      updatedBy,
    });
    const row = legalRepo.getLegalMarkSettingsById(db, result.lastInsertRowid);
    if (!row) {
      return fail("DB_ERROR", "Не удалось сохранить метку.");
    }
    return ok({ item: mapLegalSettingRow(row) });
  } catch (error) {
    console.error("[DB] createLegalSetting failed:", error);
    if (
      error &&
      typeof error.message === "string" &&
      error.message.includes("legal_marks.label")
    ) {
      return fail("DUPLICATE", "Метка с таким названием уже существует.");
    }
    const pendingPath = storePendingChange({
      type: "create",
      label: labelResult.value,
      description: descriptionResult.value,
      articleText: articleResult.value,
      updatedBy,
      savedAt: new Date().toISOString(),
    });
    return ok({
      pending: true,
      pendingPath,
      item: {
        label: labelResult.value,
        articleText: articleResult.value,
        updatedBy,
        updatedAt: null,
      },
    });
  }
}

function updateLegalSetting(legalMarkId, payload) {
  const accessError = assertAdminAccess();
  if (accessError) {
    return accessError;
  }
  const id = parsePositiveInt(legalMarkId);
  if (!id) {
    return fail("INVALID_ARGUMENT", "legalMarkId должен быть числом.");
  }
  if (!isPlainObject(payload)) {
    return fail("INVALID_ARGUMENT", "payload должно быть объектом.");
  }
  const articleResult = validateArticleText(
    payload.articleText,
    "articleText",
    MAX_LEGAL_TEXT_LENGTH
  );
  if (!articleResult.ok) {
    return fail("INVALID_ARGUMENT", articleResult.error);
  }
  const expectedUpdatedAt =
    typeof payload.expectedUpdatedAt === "string"
      ? payload.expectedUpdatedAt
      : null;

  try {
    const db = getDb();
    const updatedBy = resolveCurrentUser();
    let updatedRow = null;
    const transaction = db.transaction(() => {
      const current = legalRepo.getLegalMarkSettingsById(db, id);
      if (!current) {
        throw new Error("NOT_FOUND");
      }
      if (
        (current.updated_at || null) !== (expectedUpdatedAt || null)
      ) {
        throw new Error("CONFLICT");
      }
      legalRepo.insertLegalMarkHistory(db, {
        legalMarkId: id,
        articleText: current.article_text || "",
        updatedBy: current.updated_by,
        updatedAt: current.updated_at || current.created_at,
      });
      const result = legalRepo.updateLegalMarkArticle(db, {
        id,
        articleText: articleResult.value,
        updatedBy,
        expectedUpdatedAt,
      });
      if (!result.changes) {
        throw new Error("CONFLICT");
      }
      updatedRow = legalRepo.getLegalMarkSettingsById(db, id);
    });
    transaction();
    if (!updatedRow) {
      return fail("DB_ERROR", "Не удалось обновить метку.");
    }
    return ok({ item: mapLegalSettingRow(updatedRow) });
  } catch (error) {
    if (error && error.message === "NOT_FOUND") {
      return fail("NOT_FOUND", "Метка не найдена.");
    }
    if (error && error.message === "CONFLICT") {
      return fail(
        "CONFLICT",
        "Метка уже обновлена другим администратором. Обновите список."
      );
    }
    console.error("[DB] updateLegalSetting failed:", error);
    const pendingPath = storePendingChange({
      legalMarkId: id,
      articleText: articleResult.value,
      expectedUpdatedAt,
      updatedBy: resolveCurrentUser(),
      savedAt: new Date().toISOString(),
    });
    return ok({
      pending: true,
      pendingPath,
      item: {
        id,
        articleText: articleResult.value,
        updatedAt: expectedUpdatedAt,
        updatedBy: resolveCurrentUser(),
      },
    });
  }
}

function listLegalSettingHistory(legalMarkId, limit = 20) {
  const id = parsePositiveInt(legalMarkId);
  if (!id) {
    return fail("INVALID_ARGUMENT", "legalMarkId должен быть числом.");
  }
  try {
    const db = getDb();
    const rows = legalRepo.listLegalMarkHistory(db, id, limit);
    return ok(
      rows.map((row) => ({
        id: row.id,
        legalMarkId: row.legal_mark_id,
        articleText: row.article_text,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by || null,
      }))
    );
  } catch (error) {
    console.error("[DB] listLegalSettingHistory failed:", error);
    return fail("DB_ERROR", "Не удалось загрузить историю изменений.");
  }
}

function rollbackLegalSetting(legalMarkId, historyId, payload) {
  const accessError = assertAdminAccess();
  if (accessError) {
    return accessError;
  }
  const markId = parsePositiveInt(legalMarkId);
  if (!markId) {
    return fail("INVALID_ARGUMENT", "legalMarkId должен быть числом.");
  }
  const recordId = parsePositiveInt(historyId);
  if (!recordId) {
    return fail("INVALID_ARGUMENT", "historyId должен быть числом.");
  }
  const expectedUpdatedAt =
    payload && typeof payload.expectedUpdatedAt === "string"
      ? payload.expectedUpdatedAt
      : null;
  try {
    const db = getDb();
    const updatedBy = resolveCurrentUser();
    let updatedRow = null;
    const transaction = db.transaction(() => {
      const current = legalRepo.getLegalMarkSettingsById(db, markId);
      if (!current) {
        throw new Error("NOT_FOUND");
      }
      if (
        (current.updated_at || null) !== (expectedUpdatedAt || null)
      ) {
        throw new Error("CONFLICT");
      }
      const historyRow = legalRepo.getLegalMarkHistoryById(db, recordId);
      if (!historyRow || historyRow.legal_mark_id !== markId) {
        throw new Error("HISTORY_NOT_FOUND");
      }
      legalRepo.insertLegalMarkHistory(db, {
        legalMarkId: markId,
        articleText: current.article_text || "",
        updatedBy: current.updated_by,
        updatedAt: current.updated_at || current.created_at,
      });
      const result = legalRepo.updateLegalMarkArticle(db, {
        id: markId,
        articleText: historyRow.article_text,
        updatedBy,
        expectedUpdatedAt,
      });
      if (!result.changes) {
        throw new Error("CONFLICT");
      }
      updatedRow = legalRepo.getLegalMarkSettingsById(db, markId);
    });
    transaction();
    if (!updatedRow) {
      return fail("DB_ERROR", "Не удалось откатить изменения.");
    }
    return ok({ item: mapLegalSettingRow(updatedRow) });
  } catch (error) {
    if (error && error.message === "NOT_FOUND") {
      return fail("NOT_FOUND", "Метка не найдена.");
    }
    if (error && error.message === "HISTORY_NOT_FOUND") {
      return fail("NOT_FOUND", "Запись истории не найдена.");
    }
    if (error && error.message === "CONFLICT") {
      return fail(
        "CONFLICT",
        "Метка уже обновлена другим администратором. Обновите список."
      );
    }
    console.error("[DB] rollbackLegalSetting failed:", error);
    return fail("DB_ERROR", "Не удалось откатить изменения.");
  }
}

module.exports = {
  listLegalSettings,
  createLegalSetting,
  updateLegalSetting,
  listLegalSettingHistory,
  rollbackLegalSetting,
  getAccessContext,
};
