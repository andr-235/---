const { wrapIpc } = require("../utils/ipc");

function registerSettingsHandlers(ipcMain, settingsService) {
  ipcMain.handle(
    "settings:list",
    wrapIpc("settings:list", async () => settingsService.listLegalSettings())
  );
  ipcMain.handle(
    "settings:create",
    wrapIpc("settings:create", async (payload) =>
      settingsService.createLegalSetting(payload)
    )
  );
  ipcMain.handle(
    "settings:update",
    wrapIpc("settings:update", async (id, payload) =>
      settingsService.updateLegalSetting(id, payload)
    )
  );
  ipcMain.handle(
    "settings:history",
    wrapIpc("settings:history", async (id, limit) =>
      settingsService.listLegalSettingHistory(id, limit)
    )
  );
  ipcMain.handle(
    "settings:rollback",
    wrapIpc("settings:rollback", async (id, historyId, payload) =>
      settingsService.rollbackLegalSetting(id, historyId, payload)
    )
  );
  ipcMain.handle(
    "settings:access",
    wrapIpc("settings:access", async () => settingsService.getAccessContext())
  );
}

module.exports = { registerSettingsHandlers };
