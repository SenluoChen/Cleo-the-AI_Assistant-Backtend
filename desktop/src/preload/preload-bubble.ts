import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../common/ipc";

contextBridge.exposeInMainWorld("bubbleAPI", {
  toggleMain: () => ipcRenderer.send(Channels.TOGGLE_MAIN)
});
