const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const { initDb, closeDb } = require("../db");
const { createMainWindow } = require("./app");
const { registerIpcHandlers } = require("./controllers");
const { createBrowserService } = require("./services/browser-service");
const { createArtifactService } = require("./services/artifact-service");
const caseService = require("./services/case-service");
const legalService = require("./services/legal-service");
const settingsService = require("./services/settings-service");
const exportService = require("./services/export-service");

const browserService = createBrowserService();
const artifactService = createArtifactService({ browserService });

registerIpcHandlers({
  ipcMain,
  browserService,
  caseService,
  artifactService,
  legalService,
  settingsService,
  exportService,
});

app
  .whenReady()
  .then(() => {
    Menu.setApplicationMenu(null);
    initDb();
    createMainWindow({ browserService });
  })
  .catch((error) => {
    console.error("Не удалось инициализировать приложение:", error);
    app.exit(1);
  });

app.on("activate", () => {
  app.whenReady().then(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ browserService });
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


