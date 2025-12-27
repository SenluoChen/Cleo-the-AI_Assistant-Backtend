import { BrowserWindow, screen } from "electron";
import * as path from "path";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 660,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload-main.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Exclude our window from OS-level screen capture/screenshot where supported.
  try {
    win.setContentProtection(true);
  } catch {
    // ignore
  }
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  return win;
}

export function createBubbleWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const size = 84;
  const bubble = new BrowserWindow({
    width: size,
    height: size,
    x: workArea.x + workArea.width - size - 16,
    y: workArea.y + workArea.height - size - 16,
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

  // Some Windows configurations require setting this after creation to avoid a solid fallback background.
  try {
    bubble.setBackgroundColor("#00000000");
  } catch {
    // ignore
  }

  // Exclude bubble from screenshots/screen capture where supported.
  try {
    bubble.setContentProtection(true);
  } catch {
    // ignore
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL("bubble.html", devUrl.endsWith("/") ? devUrl : `${devUrl}/`).toString();
    bubble.loadURL(url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[BUBBLE] Failed to load dev bubble URL", message);
    });
  } else {
    bubble.loadFile(path.join(__dirname, "../renderer/bubble.html"));
  }
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
