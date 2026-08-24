const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openDeutschCompatibility", {
  chooseDirectory: () => ipcRenderer.invoke("compatibility:choose-directory"),
  onActivityRoute: (listener) =>
    ipcRenderer.on("compatibility:activity-route", (_event, activityId) => listener(activityId)),
});
