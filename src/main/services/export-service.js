const { BrowserWindow } = require("electron");
const fs = require("fs");
const { getDb } = require("../../db");
const { CASE_DIR_PREFIX } = require("../constants");
const { ok, fail } = require("../utils/ipc");
const { isPlainObject, parsePositiveInt } = require("../utils/validation");
const {
  getArtifactsBaseDir,
  getReportsBaseDir,
  safeJoin,
  formatCaptureFolderName,
} = require("../utils/files");
const { buildCaseReportHtml } = require("../utils/report");
const { mapCaseRow } = require("../models/case-model");
const { mapArtifactReportRow } = require("../models/artifact-model");
const caseRepo = require("../../db/repositories/case-repo");
const artifactRepo = require("../../db/repositories/artifact-repo");

async function exportCaseReport(caseId, options) {
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
    const caseRow = caseRepo.getCaseById(db, id);
    if (!caseRow) {
      return fail("NOT_FOUND", "Дело не найдено.");
    }

    const baseDir = getArtifactsBaseDir();
    const artifacts = artifactRepo
      .listArtifactsForReport(db, id)
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
}

module.exports = { exportCaseReport };


