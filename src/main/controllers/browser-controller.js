const { wrapIpc } = require("../utils/ipc");

function registerBrowserHandlers(ipcMain, browserService) {
  ipcMain.handle(
    "browser:navigate",
    wrapIpc("browser:navigate", async (url) => {
      if (!browserService) {
        return null;
      }
      return browserService.navigate(url);
    })
  );

  ipcMain.on("browser:set-bounds", (_event, bounds) => {
    if (!browserService) {
      return;
    }
    browserService.setBounds(bounds);
  });

  ipcMain.on("browser:set-visible", (_event, visible) => {
    if (!browserService) {
      return;
    }
    browserService.setVisible(visible);
  });
}

module.exports = { registerBrowserHandlers };
