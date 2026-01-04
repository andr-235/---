const { getDb } = require("../../db");
const {
  MAX_MARKS,
  MAX_LABEL_LENGTH,
  MAX_LEGAL_TEXT_LENGTH,
  MAX_COMMENT_LENGTH,
} = require("../constants");
const { ok, fail } = require("../utils/ipc");
const {
  isPlainObject,
  parsePositiveInt,
  validateRequiredString,
  validateOptionalString,
} = require("../utils/validation");
const { getArtifactsBaseDir } = require("../utils/files");
const { mapArtifactRow } = require("../models/artifact-model");
const caseRepo = require("../../db/repositories/case-repo");
const artifactRepo = require("../../db/repositories/artifact-repo");
const legalRepo = require("../../db/repositories/legal-repo");

function listLegalMarks() {
  try {
    const db = getDb();
    const rows = legalRepo.listLegalMarks(db);
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
}

function setArtifactLegal(artifactId, payload) {
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

    const markRow = legalRepo.getLegalMarkById(db, legalMarkId);
    if (!markRow) {
      return fail(
        "INVALID_ARGUMENT",
        "Выбранная юридическая метка отсутствует в справочнике."
      );
    }

    legalRepo.upsertArtifactLegalMark(db, {
      artifactId: id,
      legalMarkId,
      articleText: articleResult.value,
      comment: commentResult.value,
    });

    const baseDir = getArtifactsBaseDir();
    const mappedRow = artifactRepo.selectArtifactRowWithLegal(db, id);
    return ok(mapArtifactRow(mappedRow, baseDir));
  } catch (error) {
    console.error("[DB] setArtifactLegal failed:", error);
    return fail("DB_ERROR", "Не удалось сохранить юридическую привязку.");
  }
}

function updateCaseLegalMarks(caseId, marks) {
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
    const caseExists = caseRepo.caseExists(db, id);
    if (!caseExists) {
      return fail("NOT_FOUND", "Дело не найдено.");
    }

    const artifactRows = artifactRepo.listArtifactIdsByCase(db, id);
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
        const exists = legalRepo.getLegalMarkById(db, mark.legalMarkId);
        if (!exists) {
          return fail(
            "INVALID_ARGUMENT",
            `marks[${normalizedMarks.indexOf(mark)}].legalMarkId не найден.`
          );
        }
      }
    }

    const transaction = db.transaction(() => {
      legalRepo.deleteLegalLinksForCase(db, id);
      for (const mark of normalizedMarks) {
        let legalMarkId = mark.legalMarkId;
        if (!legalMarkId && mark.label) {
          legalRepo.insertLegalMark(db, mark.label);
          const found = legalRepo.getLegalMarkByLabel(db, mark.label);
          legalMarkId = found ? found.id : null;
        }
        if (!legalMarkId) {
          throw new Error("LEGAL_MARK_NOT_FOUND");
        }
        legalRepo.upsertArtifactLegalMark(db, {
          artifactId: mark.artifactId,
          legalMarkId,
          articleText: mark.articleText,
          comment: mark.comment,
        });
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
}

module.exports = {
  listLegalMarks,
  setArtifactLegal,
  updateCaseLegalMarks,
};


