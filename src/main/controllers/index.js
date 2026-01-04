const { registerAppHandlers } = require("./app-controller");
const { registerBrowserHandlers } = require("./browser-controller");
const { registerCaseHandlers } = require("./cases-controller");
const { registerArtifactHandlers } = require("./artifacts-controller");
const { registerLegalHandlers } = require("./legal-controller");
const { registerExportHandlers } = require("./export-controller");
const { registerSettingsHandlers } = require("./settings-controller");

function registerIpcHandlers({
  ipcMain,
  browserService,
  caseService,
  artifactService,
  legalService,
  settingsService,
  exportService,
}) {
  registerAppHandlers(ipcMain);
  registerBrowserHandlers(ipcMain, browserService);
  registerCaseHandlers(ipcMain, caseService, legalService);
  registerArtifactHandlers(ipcMain, artifactService, legalService);
  registerLegalHandlers(ipcMain, legalService);
  registerSettingsHandlers(ipcMain, settingsService);
  registerExportHandlers(ipcMain, exportService);
}

module.exports = { registerIpcHandlers };
