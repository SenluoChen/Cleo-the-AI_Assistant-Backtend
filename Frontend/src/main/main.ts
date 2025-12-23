import "dotenv/config";
import "./polyfills";
import { app, ipcMain, globalShortcut, BrowserWindow, screen } from "electron";
import type { Event as ElectronEvent } from "electron";
import { createBubbleWindow } from "./windows";
import { captureFullScreenBase64 } from "./screenshot";
import { Channels } from "../common/ipc";
import * as path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { request } from "undici";
import { log, err } from "./logger";

const ensureDir = (dir: string) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

const userDataPath = path.join(app.getPath("appData"), "SmartAssistantDesktop");
ensureDir(userDataPath);
app.setPath("userData", userDataPath);

const settingsPath = path.join(userDataPath, "settings.json");

const readPinnedState = () => {
  try {
    if (!existsSync(settingsPath)) {
      return false;
    }
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.pinned);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    err("readPinnedState failed:", message);
    return false;
  }
};

const persistPinnedState = (pinned: boolean) => {
  try {
    writeFileSync(settingsPath, JSON.stringify({ pinned }), "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    err("persistPinnedState failed:", message);
  }
};

const cachePath = path.join(userDataPath, "Cache");
const tempPath = path.join(userDataPath, "Temp");
ensureDir(cachePath);
ensureDir(tempPath);
app.setPath("cache", cachePath);
app.setPath("temp", tempPath);

let mainWin: BrowserWindow | null = null;
let bubbleWin: BrowserWindow | null = null;
let isPinned = readPinnedState();
let isQuitting = false;

const resolveDistPath = (...segments: string[]): string => {
  const appPath = app.getAppPath();
  return path.join(appPath, "dist", ...segments);
};

const createMainWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 900,
    height: 660,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: resolveDistPath("preload", "preload-main.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(resolveDistPath("renderer", "index.html"));
  win.webContents.once("did-finish-load", () => {
    win.webContents
      .executeJavaScript("Boolean(window.api)")
      .then((hasApi) => {
        log("[DEBUG] renderer api available:", hasApi);
      })
      .catch((error) => {
        err("[DEBUG] renderer api check failed", error);
      });
  });
  win.webContents.on("console-message", (_event, level, message) => {
    log(`[DEBUG][MAIN-RENDERER][${level}]`, message);
  });
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    err("[DEBUG][MAIN-RENDERER] preload error", preloadPath, error);
  });
  return win;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const positionMainWindowAboveBubble = (win: BrowserWindow) => {
  const bubble = ensureBubbleWindow();
  if (!bubble || bubble.isDestroyed()) {
    return;
  }

  const bubbleBounds = bubble.getBounds();
  const winBounds = win.getBounds();

  const bubbleCenter = {
    x: bubbleBounds.x + Math.floor(bubbleBounds.width / 2),
    y: bubbleBounds.y + Math.floor(bubbleBounds.height / 2)
  };

  const display = screen.getDisplayNearestPoint(bubbleCenter);
  const workArea = display.workArea;

  const gap = 12;
  let x = Math.round(bubbleCenter.x - winBounds.width / 2);
  let y = Math.round(bubbleBounds.y - gap - winBounds.height);

  x = clamp(x, workArea.x, workArea.x + workArea.width - winBounds.width);
  y = clamp(y, workArea.y, workArea.y + workArea.height - winBounds.height);

  win.setPosition(x, y, false);
};

const notifyRendererPinnedState = (win: BrowserWindow, pinned: boolean) => {
  if (win.webContents.isDestroyed()) {
    return;
  }
  if (win.webContents.isLoadingMainFrame()) {
    const handler = () => {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send(Channels.PIN_STATE_UPDATED, pinned);
      }
    };
    win.webContents.once("did-finish-load", handler);
    return;
  }
  win.webContents.send(Channels.PIN_STATE_UPDATED, pinned);
};

const applyPinnedState = (win: BrowserWindow, pinned: boolean) => {
  const level: Parameters<BrowserWindow["setAlwaysOnTop"]>[1] = pinned ? "screen-saver" : "normal";
  win.setAlwaysOnTop(pinned, level);

  if (typeof win.setVisibleOnAllWorkspaces === "function") {
    if (process.platform === "darwin") {
      win.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });
    } else {
      win.setVisibleOnAllWorkspaces(pinned);
    }
  }

  if (typeof win.setFullScreenable === "function") {
    win.setFullScreenable(!pinned);
  }

  notifyRendererPinnedState(win, pinned);
};
const ensureBubbleWindow = () => {
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    return bubbleWin;
  }

  bubbleWin = createBubbleWindow();
  bubbleWin.on("closed", () => {
    bubbleWin = null;
  });
  return bubbleWin;
};

const showMainWindow = (focus = true) => {
  if (!mainWin || mainWin.isDestroyed()) {
    return;
  }

  const shouldReposition = !mainWin.isVisible() || mainWin.isMinimized();
  if (shouldReposition) {
    positionMainWindowAboveBubble(mainWin);
  }

  if (mainWin.isMinimized()) {
    mainWin.restore();
  }

  if (!mainWin.isVisible()) {
    mainWin.show();
  }

  if (focus) {
    mainWin.focus();
  }

  if (!isPinned && typeof mainWin.moveTop === "function") {
    mainWin.moveTop();
  }

  if (isPinned) {
    applyPinnedState(mainWin, true);
  }
};

app.whenReady().then(() => {
  mainWin = createMainWindow();
  ensureBubbleWindow();

  if (mainWin) {
    applyPinnedState(mainWin, isPinned);
  }

  log("Application ready");

  const captureEnabled = process.env.SMART_ASSISTANT_ENABLE_SCREEN_CAPTURE === "true";

  ipcMain.on(Channels.TOGGLE_MAIN, () => {
    ensureBubbleWindow();
    if (!mainWin || mainWin.isDestroyed()) {
      mainWin = createMainWindow();
      applyPinnedState(mainWin, isPinned);
      mainWin.once("ready-to-show", () => {
        showMainWindow(true);
      });
      return;
    }

    const shouldHide = mainWin.isVisible() && !mainWin.isMinimized();

    if (shouldHide) {
      mainWin.hide();
      return;
    }

    if (!mainWin.webContents.isLoadingMainFrame()) {
      showMainWindow(true);
    } else {
      const handleFinish = () => {
        showMainWindow(true);
      };
      mainWin.webContents.once("did-finish-load", handleFinish);
    }
  });

  ipcMain.handle("capture-screen", async () => {
    if (!captureEnabled) {
      log("capture-screen skipped (disabled by SMART_ASSISTANT_ENABLE_SCREEN_CAPTURE)");
      return "";
    }

    const win = BrowserWindow.getFocusedWindow() ?? mainWin;
    try {
      return await captureFullScreenBase64(win ?? undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      err("capture-screen failed:", message);
      throw new Error(message);
    }
  });

  ipcMain.handle("analyze", async (_event, payload) => {
    const defaultPort = process.env.LOCAL_API_PORT ?? "8787";
    const defaultUrl = `http://127.0.0.1:${defaultPort}/analyze`;
    const url = process.env.VITE_ANALYZE_URL ?? defaultUrl;

    if (!process.env.VITE_ANALYZE_URL) {
      log(`[WARN] VITE_ANALYZE_URL not set, falling back to ${defaultUrl}`);
    }

    const res = await request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`API Error: ${res.statusCode}\n${text}`);
    }

    return JSON.parse(text);
  });

  ipcMain.handle(Channels.SET_PIN_STATE, (_event, pinned: boolean) => {
    isPinned = Boolean(pinned);
    if (mainWin) {
      applyPinnedState(mainWin, isPinned);
    }
    persistPinnedState(isPinned);
    return isPinned;
  });

  ipcMain.handle(Channels.GET_PIN_STATE, () => isPinned);

  mainWin.once("ready-to-show", () => {
    if (!mainWin) return;
    if (isPinned) {
      applyPinnedState(mainWin, true);
      mainWin.show();
      mainWin.moveTop();
      return;
    }
    mainWin.show();
  });

  mainWin.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (!isPinned) {
      mainWin?.hide();
      return;
    }
    mainWin?.show();
  });

  mainWin.on("minimize", (event: ElectronEvent) => {
    if (!isPinned || isQuitting || !mainWin) return;
    event.preventDefault();
    mainWin.restore();
    mainWin.show();
    mainWin.moveTop();
  });

  mainWin.on("hide", (event: ElectronEvent) => {
    if (!isPinned || isQuitting || !mainWin) return;
    event.preventDefault();
    mainWin.show();
    mainWin.moveTop();
  });

  mainWin.on("blur", () => {
    if (isPinned && mainWin && !isQuitting) {
      mainWin.setAlwaysOnTop(true);
      mainWin.moveTop();
    }
  });

  mainWin.on("closed", () => {
    mainWin = null;
  });

  app.on("browser-window-blur", (_event, win) => {
    if (win === mainWin && isPinned && !isQuitting) {
      applyPinnedState(mainWin, true);
    }
  });

  app.on("browser-window-focus", (_event, win) => {
    if (win === mainWin && isPinned && !isQuitting) {
      applyPinnedState(mainWin, true);
    }
  });
  app.on("activate", () => {
    ensureBubbleWindow();
    if (!mainWin || mainWin.isDestroyed()) {
      mainWin = createMainWindow();
      applyPinnedState(mainWin, isPinned);
      return;
    }
    showMainWindow(true);
  });
});

app.on("window-all-closed", () => {
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
});
