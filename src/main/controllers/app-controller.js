const { app } = require("electron");

function registerAppHandlers(ipcMain) {
  ipcMain.handle("app:get-version", () => app.getVersion());
}

module.exports = { registerAppHandlers };
