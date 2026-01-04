const { wrapIpc } = require("../utils/ipc");

function registerExportHandlers(ipcMain, exportService) {
  ipcMain.handle(
    "export:case-report",
    wrapIpc("export:case-report", async (caseId, options) =>
      exportService.exportCaseReport(caseId, options)
    )
  );
}

module.exports = { registerExportHandlers };
