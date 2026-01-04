const { wrapIpc } = require("../utils/ipc");

function registerCaseHandlers(ipcMain, caseService, legalService) {
  ipcMain.handle(
    "cases:get-all",
    wrapIpc("cases:get-all", async () => caseService.listCases())
  );

  ipcMain.handle(
    "cases:create",
    wrapIpc("cases:create", async (caseData) =>
      caseService.createCase(caseData)
    )
  );

  ipcMain.handle(
    "cases:update",
    wrapIpc("cases:update", async (caseId, data) =>
      caseService.updateCase(caseId, data)
    )
  );

  ipcMain.handle(
    "cases:delete",
    wrapIpc("cases:delete", async (caseId) => caseService.deleteCase(caseId))
  );

  ipcMain.handle(
    "cases:get-artifacts",
    wrapIpc("cases:get-artifacts", async (caseId) =>
      caseService.getCaseArtifacts(caseId)
    )
  );

  ipcMain.handle(
    "cases:update-legal-marks",
    wrapIpc("cases:update-legal-marks", async (caseId, marks) =>
      legalService.updateCaseLegalMarks(caseId, marks)
    )
  );
}

module.exports = { registerCaseHandlers };
