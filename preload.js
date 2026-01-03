const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  getCases: () => ipcRenderer.invoke("cases:get-all"),
  createCase: (caseData) => ipcRenderer.invoke("cases:create", caseData),
  getCaseArtifacts: (caseId) =>
    ipcRenderer.invoke("cases:get-artifacts", caseId),
  saveArtifact: (caseId, artifactData) =>
    ipcRenderer.invoke("artifacts:save", caseId, artifactData),
  updateLegalMarks: (caseId, marks) =>
    ipcRenderer.invoke("cases:update-legal-marks", caseId, marks),
});
