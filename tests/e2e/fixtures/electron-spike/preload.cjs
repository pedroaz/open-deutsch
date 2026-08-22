const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openDeutschSpike", {
  chooseDirectory: () => ipcRenderer.invoke("spike:choose-directory"),
  onActivityRoute: (listener) =>
    ipcRenderer.on("spike:activity-route", (_event, activityId) => listener(activityId)),
});
