const { getDb } = require("../../db");
const {
  ALLOWED_STATUSES,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
} = require("../constants");
const { ok, fail } = require("../utils/ipc");
const {
  isPlainObject,
  parsePositiveInt,
  validateRequiredString,
  validateOptionalString,
} = require("../utils/validation");
const { getArtifactsBaseDir } = require("../utils/files");
const { mapCaseRow } = require("../models/case-model");
const { mapArtifactRow } = require("../models/artifact-model");
const caseRepo = require("../../db/repositories/case-repo");
const artifactRepo = require("../../db/repositories/artifact-repo");

function listCases() {
  try {
    const db = getDb();
    const rows = caseRepo.listCases(db);
    return ok(rows.map(mapCaseRow));
  } catch (error) {
    console.error("[DB] getCases failed:", error);
    return fail("DB_ERROR", "Не удалось загрузить дела.");
  }
}

function createCase(caseData) {
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
    const row = caseRepo.createCase(db, {
      title: titleResult.value,
      description: descriptionResult.value,
      assignedTo: assignedResult.value,
      status,
    });
    return ok(mapCaseRow(row));
  } catch (error) {
    console.error("[DB] createCase failed:", error);
    return fail("DB_ERROR", "Не удалось создать дело.");
  }
}

function updateCase(caseId, data) {
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
    const exists = caseRepo.caseExists(db, id);
    if (!exists) {
      return fail("NOT_FOUND", "Дело не найдено.");
    }
    const row = caseRepo.updateCase(db, id, {
      title: titleResult.value,
      description: descriptionResult.value,
      assignedTo: assignedResult.value,
      status,
    });
    return ok(mapCaseRow(row));
  } catch (error) {
    console.error("[DB] updateCase failed:", error);
    return fail("DB_ERROR", "Не удалось обновить дело.");
  }
}

function deleteCase(caseId) {
  const id = parsePositiveInt(caseId);
  if (!id) {
    return fail(
      "INVALID_ARGUMENT",
      "caseId должен быть положительным целым числом."
    );
  }
  try {
    const db = getDb();
    const exists = caseRepo.caseExists(db, id);
    if (!exists) {
      return fail("NOT_FOUND", "Дело не найдено.");
    }
    caseRepo.deleteCase(db, id);
    return ok({ deleted: true });
  } catch (error) {
    console.error("[DB] deleteCase failed:", error);
    return fail("DB_ERROR", "Не удалось удалить дело.");
  }
}

function getCaseArtifacts(caseId) {
  const id = parsePositiveInt(caseId);
  if (!id) {
    return fail(
      "INVALID_ARGUMENT",
      "caseId должен быть положительным целым числом."
    );
  }
  try {
    const db = getDb();
    const exists = caseRepo.caseExists(db, id);
    if (!exists) {
      return fail("NOT_FOUND", "Дело не найдено.");
    }
    const baseDir = getArtifactsBaseDir();
    const rows = artifactRepo.listArtifactsByCase(db, id);
    return ok(rows.map((row) => mapArtifactRow(row, baseDir)));
  } catch (error) {
    console.error("[DB] getCaseArtifacts failed:", error);
    return fail("DB_ERROR", "Не удалось загрузить артефакты.");
  }
}

module.exports = {
  listCases,
  createCase,
  updateCase,
  deleteCase,
  getCaseArtifacts,
};


