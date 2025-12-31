import { contextBridge, ipcRenderer } from "electron";
import { type AnalyzePayload, type AnalyzeResponse } from "../common/schemas";

/**
 * Channels（手動同步 common/ipc.ts）
 */
const Channels = {
  TOGGLE_MAIN: "TOGGLE_MAIN",
  CLOSE_MAIN: "CLOSE_MAIN",
  SET_OPENAI_KEY: "SET_OPENAI_KEY",
  SET_PIN_STATE: "SET_PIN_STATE",
  GET_PIN_STATE: "GET_PIN_STATE",
  PIN_STATE_UPDATED: "PIN_STATE_UPDATED",
  SCREENSHOT_UPDATED: "SCREENSHOT_UPDATED",
} as const;

/**
 * 安全封裝後的 Renderer API
 */
const api = {
  /**
   * 擷取畫面（base64）
   */
  captureScreen: async (): Promise<string> =>
    ipcRenderer.invoke("capture-screen"),

  /**
   * 切換主視窗顯示/隱藏
   */
  toggleMain: () => {
    ipcRenderer.send(Channels.TOGGLE_MAIN);
  },

  /**
   * 關閉程式/視窗
   */
  closeMain: () => {
    ipcRenderer.send(Channels.CLOSE_MAIN);
  },

  /**
   * 分析 payload → 後端模型
   */
  analyze: async (payload: AnalyzePayload): Promise<AnalyzeResponse> =>
    ipcRenderer.invoke("analyze", payload),

  /**
   * Save OpenAI API key for installed users (writes to userData/cleo.env).
   */
  setOpenAIKey: async (apiKey: string): Promise<boolean> =>
    ipcRenderer.invoke(Channels.SET_OPENAI_KEY, apiKey),

  /**
   * 設定 pinned
   */
  setPinned: async (pinned: boolean): Promise<boolean> =>
    ipcRenderer.invoke(Channels.SET_PIN_STATE, pinned),

  /**
   * 取得 pinned 狀態
   */
  getPinned: async (): Promise<boolean> =>
    ipcRenderer.invoke(Channels.GET_PIN_STATE),

  /**
   * 監聽 pinned 更新（主程式通知）
   */
  onPinState: (listener: (pinned: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, pinned: boolean) =>
      listener(Boolean(pinned));

    ipcRenderer.on(Channels.PIN_STATE_UPDATED, handler);

    return () => {
      ipcRenderer.removeListener(Channels.PIN_STATE_UPDATED, handler);
    };
  },

  /**
   * 監聽剪貼簿圖片更新（當主程式檢測到新圖片時會送出）
   */
  onClipboardImage: (listener: (dataUrl: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, dataUrl: string) => listener(String(dataUrl));
    ipcRenderer.on(Channels.SCREENSHOT_UPDATED, handler);
    return () => ipcRenderer.removeListener(Channels.SCREENSHOT_UPDATED, handler);
  },
};

// 暴露在 window 底下
contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("electronAPI", api);
