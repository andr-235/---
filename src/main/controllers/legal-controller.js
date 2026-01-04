const { wrapIpc } = require("../utils/ipc");

function registerLegalHandlers(ipcMain, legalService) {
  ipcMain.handle(
    "legal-marks:list",
    wrapIpc("legal-marks:list", async () => legalService.listLegalMarks())
  );
}

module.exports = { registerLegalHandlers };
