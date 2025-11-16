import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../common/ipc";
import { type AnalyzePayload, type AnalyzeResponse } from "../common/schemas";

const TOGGLE_MAIN_CHANNEL = Channels.TOGGLE_MAIN;
const CAPTURE_SCREEN_CHANNEL = "capture-screen";
const SET_PIN_STATE_CHANNEL = Channels.SET_PIN_STATE;
const GET_PIN_STATE_CHANNEL = Channels.GET_PIN_STATE;
const PIN_STATE_UPDATED_CHANNEL = Channels.PIN_STATE_UPDATED;

const api = {
  captureScreen: () => ipcRenderer.invoke(CAPTURE_SCREEN_CHANNEL) as Promise<string>,
  toggleMain: () => ipcRenderer.send(TOGGLE_MAIN_CHANNEL),
  analyze: (payload: AnalyzePayload) =>
    ipcRenderer.invoke("analyze", payload) as Promise<AnalyzeResponse>,
  setPinned: (pinned: boolean) => ipcRenderer.invoke(SET_PIN_STATE_CHANNEL, pinned) as Promise<boolean>,
  getPinned: () => ipcRenderer.invoke(GET_PIN_STATE_CHANNEL) as Promise<boolean>,
  onPinState: (listener: (pinned: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, pinned: boolean) => listener(Boolean(pinned));
    ipcRenderer.on(PIN_STATE_UPDATED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(PIN_STATE_UPDATED_CHANNEL, handler);
  }
};

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("electronAPI", api);
