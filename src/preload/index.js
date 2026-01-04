const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  getCases: () => ipcRenderer.invoke("cases:get-all"),
  createCase: (caseData) => ipcRenderer.invoke("cases:create", caseData),
  updateCase: (caseId, caseData) =>
    ipcRenderer.invoke("cases:update", caseId, caseData),
  deleteCase: (caseId) => ipcRenderer.invoke("cases:delete", caseId),
  getCaseArtifacts: (caseId) =>
    ipcRenderer.invoke("cases:get-artifacts", caseId),
  saveArtifact: (caseId, artifactData) =>
    ipcRenderer.invoke("artifacts:save", caseId, artifactData),
  captureArtifact: (caseId, subjectId) =>
    ipcRenderer.invoke("artifacts:capture", caseId, subjectId),
  listLegalMarks: () => ipcRenderer.invoke("legal-marks:list"),
  setArtifactLegal: (artifactId, payload) =>
    ipcRenderer.invoke("artifacts:set-legal", artifactId, payload),
  updateLegalMarks: (caseId, marks) =>
    ipcRenderer.invoke("cases:update-legal-marks", caseId, marks),
  settings: {
    list: () => ipcRenderer.invoke("settings:list"),
    create: (payload) => ipcRenderer.invoke("settings:create", payload),
    update: (id, payload) => ipcRenderer.invoke("settings:update", id, payload),
    history: (id, limit) => ipcRenderer.invoke("settings:history", id, limit),
    rollback: (id, historyId, payload) =>
      ipcRenderer.invoke("settings:rollback", id, historyId, payload),
    access: () => ipcRenderer.invoke("settings:access"),
  },
  export: {
    caseReport: (caseId, options) =>
      ipcRenderer.invoke("export:case-report", caseId, options),
  },
  browserNavigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  setBrowserBounds: (bounds) => ipcRenderer.send("browser:set-bounds", bounds),
  setBrowserVisible: (visible) =>
    ipcRenderer.send("browser:set-visible", visible),
  onBrowserState: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", listener);
    return () => ipcRenderer.removeListener("browser:state", listener);
  },
});
