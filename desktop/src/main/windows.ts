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
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload-bubble.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  bubble.loadFile(path.join(__dirname, "../renderer/bubble.html"));
  return bubble;
}
