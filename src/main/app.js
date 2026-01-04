const { app, BrowserWindow } = require("electron");
const path = require("path");

function createMainWindow({ browserService }) {
  const appPath = app.getAppPath();
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(appPath, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(appPath, "src", "preload", "index.js"),
    },
  });

  mainWindow.setMenuBarVisibility(false);
  if (browserService) {
    browserService.attachWindow(mainWindow);
  }

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    mainWindow.loadURL(startUrl).catch((error) => {
      console.error("Не удалось загрузить URL:", error);
    });
  } else {
    mainWindow.loadFile(path.join(appPath, "src", "renderer", "index.html")).catch((error) => {
      console.error("Не удалось загрузить index.html:", error);
    });
  }

  mainWindow.on("closed", () => {
    if (browserService) {
      browserService.destroy();
    }
  });

  return mainWindow;
}

module.exports = { createMainWindow };

