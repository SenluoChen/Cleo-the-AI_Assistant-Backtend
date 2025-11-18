import { BrowserWindow, screen } from "electron";
import * as path from "path";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#f3f4f6",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload-main.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  return win;
}

export function createBubbleWindow(): BrowserWindow {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const size = 64;
  const bubble = new BrowserWindow({
    width: size,
    height: size,
    x: workAreaSize.width - size - 16,
    y: workAreaSize.height - size - 16,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload-bubble.js"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false
    }
  });
  bubble.loadFile(path.join(__dirname, "../renderer/bubble.html"));
  bubble.webContents.once("did-finish-load", () => {
    const script = `(() => {
      const api = window.bubbleAPI;
      return { exists: Boolean(api), keys: api ? Object.keys(api) : [] };
    })()`;
    bubble.webContents
      .executeJavaScript(script)
      .then((result) => {
        console.log("[DEBUG] bubbleAPI inspect:", result);
      })
      .catch((error) => {
        console.error("[DEBUG] bubbleAPI check failed", error);
      });
  });
  bubble.webContents.on("console-message", (_event, level, message) => {
    console.log(`[DEBUG][BUBBLE][${level}]`, message);
  });
  bubble.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[DEBUG][BUBBLE] preload error", preloadPath, error);
  });
  bubble.setAlwaysOnTop(true, "screen-saver");
  if (typeof bubble.setVisibleOnAllWorkspaces === "function") {
    bubble.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  return bubble;
}
