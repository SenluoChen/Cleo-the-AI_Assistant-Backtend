import { contextBridge, ipcRenderer } from "electron";

/**
 * preload 不能 require 外部 TS/JS，
 * 所以把 Channels 直接寫死在這裡，
 * 值必須與 common/ipc.ts 保持完全一致。
 */
const Channels = {
  TOGGLE_MAIN: "TOGGLE_MAIN",
  SET_PIN_STATE: "SET_PIN_STATE",
  GET_PIN_STATE: "GET_PIN_STATE",
  PIN_STATE_UPDATED: "PIN_STATE_UPDATED",
} as const;

// 暴露給泡泡視窗的 API
contextBridge.exposeInMainWorld("bubbleAPI", {
  toggleMain: () => ipcRenderer.send(Channels.TOGGLE_MAIN),
});
