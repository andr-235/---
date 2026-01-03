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
