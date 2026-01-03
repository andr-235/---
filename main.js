const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const { initDb, closeDb } = require("./db");

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

app
  .whenReady()
  .then(() => {
    Menu.setApplicationMenu(null);
    initDb();
    createMainWindow();
  })
  .catch((error) => {
    console.error("App failed to initialize:", error);
    app.exit(1);
  });

app.on("activate", () => {
  app.whenReady().then(() => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
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
