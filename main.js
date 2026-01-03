const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    mainWindow.loadURL(startUrl).catch((error) => {
      console.error("Failed to load URL:", error);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, "index.html")).catch((error) => {
      console.error("Failed to load index.html:", error);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("app:get-version", () => app.getVersion());

app.on("ready", () => {
  Menu.setApplicationMenu(null);
  createMainWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
