// Load `.env` only in development when available. In packaged apps `dotenv` may
// not be present so avoid throwing at startup.
try {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // @ts-ignore
    require("dotenv/config");
  }
} catch {
  // ignore: missing dotenv in production builds
}
import "./polyfills";
import { app, ipcMain, globalShortcut, BrowserWindow, screen, clipboard, nativeImage } from "electron";

// Disable GPU/hardware acceleration in development to avoid Chromium
// GPU/cache issues that can cause severe lag or blank/white windows.
try {
  if (!app.isPackaged) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
  }
} catch {
  // ignore if unavailable
}
import type { Event as ElectronEvent } from "electron";
import { createBubbleWindow } from "./windows";
import { captureFullScreenBase64, captureViaOsClipboard, getCachedCapture, startCapturePrewarm } from "./screenshot";
import { createHash } from "node:crypto";
import { Channels } from "../common/ipc";
import * as path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { request } from "undici";
import { log, err } from "./logger";
import { spawn } from "node:child_process";
import { startLocalApiServer, type LocalApiServerHandle } from "./local-api";

const ensureDir = (dir: string) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
};

const getDevProfileSuffix = () => {
  if (app.isPackaged) return "";
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devUrl) return "-dev";
  try {
    const url = new URL(devUrl);
    const port = url.port ? `-${url.port}` : "";
    return `-dev${port}`;
  } catch {
    return "-dev";
  }
};

const baseUserDataRoot =
  process.platform === "win32" ? process.env.LOCALAPPDATA || app.getPath("appData") : app.getPath("appData");
const userDataPath = path.join(baseUserDataRoot, `SmartAssistantDesktop${getDevProfileSuffix()}`);
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

// In dev, also force Chromium to use our dedicated writable directories.
try {
  if (!app.isPackaged) {
    app.commandLine.appendSwitch("user-data-dir", userDataPath);
    app.commandLine.appendSwitch("disk-cache-dir", cachePath);
    app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  }
} catch {
  // ignore
}

let mainWin: BrowserWindow | null = null;
let bubbleWin: BrowserWindow | null = null;
let isPinned = readPinnedState();
let isQuitting = false;

let ensureLocalApiPromise: Promise<boolean> | null = null;
let localApiHandle: LocalApiServerHandle | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isConnRefusedError = (e: unknown) => {
  const code = typeof e === "object" && e !== null && "code" in e ? (e as any).code : undefined;
  const msg = e instanceof Error ? e.message : String(e);
  return code === "ECONNREFUSED" || msg.includes("ECONNREFUSED");
};

const findLocalApiEntry = (): string | null => {
  // Dev-only convenience: backend lives next to Frontend in this repo.
  // In packaged builds, we embed the backend in-process (see local-api.ts).
  const candidates: string[] = [];
  try {
    candidates.push(path.resolve(process.cwd(), "..", "backend", "dist", "local-api.js"));
  } catch {
    // ignore
  }
  try {
    candidates.push(path.resolve(app.getAppPath(), "..", "backend", "dist", "local-api.js"));
  } catch {
    // ignore
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
};

const isLocalApiHealthy = async (healthUrl: string): Promise<boolean> => {
  try {
    const res = await request(healthUrl, { method: "GET" });
    // Drain body to avoid leaks.
    await res.body.text();
    return res.statusCode >= 200 && res.statusCode < 300;
  } catch {
    return false;
  }
};

const ensureLocalApiRunning = async (port: string): Promise<boolean> => {
  if (process.env.SMART_ASSISTANT_AUTOSTART_LOCAL_API === "false") return false;
  if (ensureLocalApiPromise) return ensureLocalApiPromise;

  ensureLocalApiPromise = (async () => {
    const healthUrl = `http://127.0.0.1:${port}/health`;
    if (await isLocalApiHealthy(healthUrl)) return true;

    if (app.isPackaged) {
      try {
        // Run backend in-process in packaged builds.
        localApiHandle = await startLocalApiServer({ port: Number.parseInt(port, 10), host: "127.0.0.1" });
      } catch (e: unknown) {
        err("[AUTO-START] failed to start embedded local API:", e instanceof Error ? e.message : String(e));
        return false;
      }

      const timeoutMs = Number.parseInt(process.env.SMART_ASSISTANT_LOCAL_API_START_TIMEOUT_MS ?? "3500", 10);
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await isLocalApiHealthy(healthUrl)) return true;
        await sleep(150);
      }

      err("[AUTO-START] embedded local API did not become healthy in time:", healthUrl);
      return false;
    }

    const entry = findLocalApiEntry();
    if (!entry) {
      err("[AUTO-START] local-api.js not found; cannot auto-start backend");
      return false;
    }

    log("[AUTO-START] starting local backend:", entry);
    try {
      const child = spawn("node", [entry], {
        cwd: path.resolve(entry, "..", "..", ".."),
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: process.env
      });
      child.unref();
    } catch (e: unknown) {
      err("[AUTO-START] failed to spawn backend:", e instanceof Error ? e.message : String(e));
      return false;
    }

    const timeoutMs = Number.parseInt(process.env.SMART_ASSISTANT_LOCAL_API_START_TIMEOUT_MS ?? "3500", 10);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await isLocalApiHealthy(healthUrl)) return true;
      await sleep(200);
    }

    err("[AUTO-START] backend did not become healthy in time:", healthUrl);
    return false;
  })().finally(() => {
    ensureLocalApiPromise = null;
  });

  return ensureLocalApiPromise;
};

app.on("before-quit", async () => {
  try {
    if (localApiHandle) {
      await localApiHandle.close();
      localApiHandle = null;
    }
  } catch {
    // ignore
  }
});

// In dev, compiled entrypoints live in dist/main and assets in dist/{renderer,preload}.
// In production, the same relative layout is preserved inside the packaged app.
const distRoot = path.resolve(__dirname, "..");
const resolveDistPath = (...segments: string[]): string => {
  return path.join(distRoot, ...segments);
};

const resolveAppIconPath = (): string => {
  // Prefer a PNG that matches the in-app floating logo. Electron will convert it to a native icon.
  // - Packaged: the renderer bundle should include public assets under dist/renderer.
  // - Dev: read directly from Frontend/public.
  const packagedPath = resolveDistPath("renderer", "cleo-logo.png");
  const devPath = path.resolve(distRoot, "..", "public", "cleo-logo.png");

  if (app.isPackaged) {
    return existsSync(packagedPath) ? packagedPath : devPath;
  }

  return existsSync(devPath) ? devPath : packagedPath;
};

const createMainWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 900,
    height: 660,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#ffffff",
    icon: resolveAppIconPath(),
    webPreferences: {
      preload: resolveDistPath("preload", "preload-main.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Exclude our window from OS-level screen capture/screenshot where supported (Windows/macOS).
  // This avoids needing to hide the window to keep it out of the screenshot.
  try {
    win.setContentProtection(true);
  } catch {
    // ignore
  }

  // In dev, allow running against a Vite dev server for HMR.
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      err("Failed to load dev server URL", message);
    });
  } else {
    win.loadFile(resolveDistPath("renderer", "index.html"));
  }
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

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
};

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

  // Ensure the local API is running so the renderer can reach http://127.0.0.1:8787
  // (used by renderer fetch/SSE when VITE_ANALYZE_URL is not set).
  const defaultPort = process.env.LOCAL_API_PORT ?? "8787";
  if (!process.env.VITE_ANALYZE_URL && process.env.SMART_ASSISTANT_AUTOSTART_LOCAL_API !== "false") {
    ensureLocalApiRunning(defaultPort).catch(() => {
      // errors are already logged inside ensureLocalApiRunning
    });
  }

  // Dev UX: show the main window immediately when using a Vite dev server.
  // In production the UI is typically opened via the bubble.
  if (process.env.VITE_DEV_SERVER_URL) {
    showMainWindow(true);
  }

  // Optional: keep a fresh screenshot cached so the button feels instant.
  // Enable with SMART_ASSISTANT_CAPTURE_PREWARM=true (default: off)
  startCapturePrewarm();

  // Start clipboard watcher (clipboard-first architecture).
  // This can be expensive on Windows (large image buffers + hashing), so keep it opt-in.
  const captureMode = String(process.env.SMART_ASSISTANT_CAPTURE_MODE ?? "").toLowerCase();
  const shouldWatchClipboard =
    process.env.SMART_ASSISTANT_CLIP_WATCH === "true" || captureMode === "os" || captureMode === "clipboard";
  if (shouldWatchClipboard) {
    let lastHash: string | null = null;
    const basePollMs = clampInt(Number.parseInt(process.env.SMART_ASSISTANT_CLIP_POLL_MS ?? "", 10) || 300, 50, 2000);
    const maxPollMs = clampInt(Number.parseInt(process.env.SMART_ASSISTANT_CLIP_POLL_MAX_MS ?? "", 10) || 2000, 200, 10_000);

    // Dev-only benchmark helpers: measure how fast the watcher reacts after clipboard changes.
    const benchEnabled = process.env.SMART_ASSISTANT_CLIP_BENCH === "true";
    const benchWaiters: Array<(ms: number) => void> = [];
    let lastBenchWriteAt: number | null = null;

    const notifyBench = (ms: number) => {
      while (benchWaiters.length) {
        const resolve = benchWaiters.shift();
        try {
          resolve?.(ms);
        } catch {
          // ignore
        }
      }
    };

    const waitForBenchResult = () => new Promise<number>((resolve) => benchWaiters.push(resolve));

    const runClipboardBench = async () => {
      const iters = clampInt(Number.parseInt(process.env.SMART_ASSISTANT_CLIP_BENCH_ITERS ?? "", 10) || 30, 5, 500);
      const intervalMs = clampInt(Number.parseInt(process.env.SMART_ASSISTANT_CLIP_BENCH_INTERVAL_MS ?? "", 10) || 250, 50, 5000);

      // 1x1 PNG (constant). We'll alternate clipboard empty -> image so the hash changes reliably.
      const onePxPng =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8q9cAAAAASUVORK5CYII=";
      const img = nativeImage.createFromDataURL(onePxPng);

      const samples: number[] = [];
      log(`[CLIP-BENCH] start iters=${iters} pollMs=${basePollMs} intervalMs=${intervalMs}`);

      for (let i = 0; i < iters; i++) {
        clipboard.clear();
        await sleep(40);

        lastBenchWriteAt = Date.now();
        clipboard.writeImage(img);

        const dt = await waitForBenchResult();
        samples.push(dt);
        await sleep(intervalMs);
      }

      samples.sort((a, b) => a - b);
      const avg = Math.round(samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length));
      const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0;
      const p90 = samples[Math.floor(samples.length * 0.9)] ?? 0;
      const min = samples[0] ?? 0;
      const max = samples[samples.length - 1] ?? 0;
      log(`[CLIP-BENCH] done n=${samples.length} avg=${avg}ms p50=${p50}ms p90=${p90}ms min=${min}ms max=${max}ms`);

      if (process.env.SMART_ASSISTANT_CLIP_BENCH_EXIT === "true") {
        try {
          app.quit();
        } catch {
          // ignore
        }
      }
    };

    let currentPollMs = basePollMs;

    const hasImageOnClipboard = (): boolean => {
      // Fast path: avoid decoding/encoding images when clipboard doesn't even have an image.
      // Note: On Windows the format names are often not MIME types (e.g. "PNG", "DeviceIndependentBitmap").
      try {
        const formats = clipboard.availableFormats();
        return formats.some((raw) => {
          const f = String(raw).toLowerCase();
          if (f.startsWith("image/")) return true;
          if (f.includes("png") || f.includes("jpeg") || f.includes("jpg") || f.includes("bmp") || f.includes("gif")) return true;
          if (f.includes("dib") || f.includes("deviceindependentbitmap") || f.includes("cf_dib")) return true;
          return false;
        });
      } catch {
        // If formats aren't available for some reason, fall back to readImage.
        return true;
      }
    };

    const pickPngishFormat = (): string | null => {
      try {
        const formats = clipboard.availableFormats();
        const exact = formats.find((f) => String(f).toLowerCase() === "image/png") ?? formats.find((f) => String(f).toLowerCase() === "png");
        if (exact) return String(exact);
        const loose = formats.find((f) => String(f).toLowerCase().includes("png"));
        return loose ? String(loose) : null;
      } catch {
        return null;
      }
    };

    const scheduleNext = () => {
      setTimeout(() => {
        void pollOnce();
      }, currentPollMs);
    };

    const pollOnce = async () => {
      try {
        if (!hasImageOnClipboard()) {
          // Allow the same image to be detected again after clipboard is cleared.
          lastHash = null;
          currentPollMs = basePollMs;
          scheduleNext();
          return;
        }

        // Prefer reading raw image buffer when available; avoids re-encoding nativeImage -> PNG every poll.
        let buf: Buffer | null = null;
        try {
          const fmt = pickPngishFormat();
          if (fmt) {
            buf = clipboard.readBuffer(fmt);
          }
        } catch {
          // ignore
        }

        if (!buf || buf.length === 0) {
          const img = clipboard.readImage();
          if (img.isEmpty()) {
            lastHash = null;
            currentPollMs = basePollMs;
            scheduleNext();
            return;
          }
          buf = img.toPNG();
        }

        if (!buf || buf.length === 0) {
          scheduleNext();
          return;
        }

        const h = createHash("sha1").update(buf).digest("hex");
        if (h === lastHash) {
          // Adaptive backoff when clipboard stays the same (common case).
          currentPollMs = Math.min(maxPollMs, Math.max(basePollMs, Math.floor(currentPollMs * 1.6)));
          scheduleNext();
          return;
        }

        lastHash = h;
        currentPollMs = basePollMs;
        const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

        if (benchEnabled && lastBenchWriteAt) {
          const dt = Date.now() - lastBenchWriteAt;
          lastBenchWriteAt = null;
          notifyBench(dt);
        }

        if (mainWin && !mainWin.webContents.isDestroyed()) {
          mainWin.webContents.send(Channels.SCREENSHOT_UPDATED, dataUrl);
        }
      } catch {
        // ignore
      } finally {
        scheduleNext();
      }
    };

    // Kick off polling loop.
    void pollOnce();

    if (benchEnabled) {
      void runClipboardBench();
    }
  }

  // Default to enabled in dev; allow opt-out via env.
  // Set SMART_ASSISTANT_ENABLE_SCREEN_CAPTURE=false to disable.
  const captureEnabled = process.env.SMART_ASSISTANT_ENABLE_SCREEN_CAPTURE !== "false";

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

  ipcMain.on(Channels.CLOSE_MAIN, () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.handle("capture-screen", async () => {
    if (!captureEnabled) {
      log("capture-screen skipped (disabled by SMART_ASSISTANT_ENABLE_SCREEN_CAPTURE)");
      return "";
    }

    try {
      const start = Date.now();

      const mode = (process.env.SMART_ASSISTANT_CAPTURE_MODE ?? "auto").toLowerCase();

      // If prewarm is enabled (opt-in), return a fresh cached image immediately.
      if (process.env.SMART_ASSISTANT_CAPTURE_PREWARM === "true") {
        const cached = getCachedCapture(1500);
        if (cached) {
          if (process.env.SMART_ASSISTANT_CAPTURE_DEBUG_TIMING === "true") {
            log(`[CAPTURE] cache-hit total ${Date.now() - start} ms, bytes=${cached.length}`);
          }
          return cached;
        }
      }

      // Always capture on click so the button works even when prewarm is disabled.
      // Default behavior: instant full-screen capture via desktopCapturer.
      // Optional: on Windows, use OS screen clip (user selects region) when explicitly requested.
      let dataUrl: string;
      if (process.platform === "win32" && (mode === "os" || mode === "clipboard")) {
        dataUrl = await captureViaOsClipboard();
      } else {
        dataUrl = await captureFullScreenBase64(mainWin);
      }

      if (process.env.SMART_ASSISTANT_CAPTURE_DEBUG_TIMING === "true") {
        log(`[CAPTURE] click-capture total ${Date.now() - start} ms, bytes=${dataUrl.length}`);
      }
      return dataUrl;
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

    const doRequest = async () => {
      return request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
    };

    let res;
    try {
      res = await doRequest();
    } catch (e: unknown) {
      // If backend isn't running locally yet, try to auto-start it once in dev.
      if (!process.env.VITE_ANALYZE_URL && isConnRefusedError(e)) {
        const started = await ensureLocalApiRunning(defaultPort);
        if (started) {
          res = await doRequest();
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

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
