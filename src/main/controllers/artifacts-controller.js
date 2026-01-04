const { wrapIpc } = require("../utils/ipc");

function registerArtifactHandlers(ipcMain, artifactService, legalService) {
  ipcMain.handle(
    "artifacts:save",
    wrapIpc("artifacts:save", async (caseId, artifactData) =>
      artifactService.saveArtifact(caseId, artifactData)
    )
  );

  ipcMain.handle(
    "artifacts:capture",
    wrapIpc("artifacts:capture", async (caseId, subjectId) =>
      artifactService.captureArtifact(caseId, subjectId)
    )
  );

  ipcMain.handle(
    "artifacts:set-legal",
    wrapIpc("artifacts:set-legal", async (artifactId, payload) =>
      legalService.setArtifactLegal(artifactId, payload)
    )
  );
}

module.exports = { registerArtifactHandlers };
