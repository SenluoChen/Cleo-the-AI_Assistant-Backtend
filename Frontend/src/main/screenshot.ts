import { BrowserWindow, clipboard, desktopCapturer, screen, shell } from "electron";
import { createHash } from "node:crypto";

const HIDE_DELAY_MS = 150;
const DEFAULT_CAPTURE_MAX_SIDE = 1280;
const DEFAULT_JPEG_QUALITY = 80;

type CachedCapture = { dataUrl: string; ts: number };
let lastCapture: CachedCapture | null = null;
let prewarmTimer: NodeJS.Timeout | null = null;

const hashBuffer = (buf: Buffer): string => createHash("sha1").update(buf).digest("hex");

const getClipboardImagePng = (): Buffer | null => {
  try {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const png = img.toPNG();
    return png?.length ? png : null;
  } catch {
    return null;
  }
};

export async function captureViaOsClipboard(): Promise<string> {
  // Windows: use OS screen clip UI (similar to Win+Shift+S) -> image lands in clipboard.
  // This is typically faster than desktopCapturer and matches native UX.
  if (process.platform !== "win32") {
    throw new Error("OS capture is only implemented for Windows");
  }

  const timeoutMs = clampInt(
    Number.parseInt(process.env.SMART_ASSISTANT_OS_CAPTURE_TIMEOUT_MS ?? "", 10) || 15_000,
    1_000,
    60_000
  );
  const pollMs = clampInt(
    Number.parseInt(process.env.SMART_ASSISTANT_OS_CAPTURE_POLL_MS ?? "", 10) || 120,
    30,
    1_000
  );

  const before = getClipboardImagePng();
  const beforeHash = before ? hashBuffer(before) : null;

  // Launch OS screen clip UI.
  // On Windows 10/11 this opens the built-in snipping overlay.
  // Electron returns void on some versions; treat failure as exception.
  await shell.openExternal("ms-screenclip:");

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const current = getClipboardImagePng();
    if (current) {
      const currentHash = hashBuffer(current);
      if (!beforeHash || currentHash !== beforeHash) {
        const b64 = current.toString("base64");
        const dataUrl = `data:image/png;base64,${b64}`;
        lastCapture = { dataUrl, ts: Date.now() };
        return dataUrl;
      }
    }
    await sleep(pollMs);
  }

  throw new Error("OS screen clip timed out (no new clipboard image)");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clampInt = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
};

const getCaptureMaxSide = () => {
  const raw = Number.parseInt(process.env.SMART_ASSISTANT_CAPTURE_MAX_SIDE ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_CAPTURE_MAX_SIDE;
};

const getCaptureFormat = () => {
  const raw = (process.env.SMART_ASSISTANT_CAPTURE_FORMAT ?? "jpeg").trim().toLowerCase();
  return raw === "png" ? "png" : "jpeg";
};

const getJpegQuality = () => {
  const raw = Number.parseInt(process.env.SMART_ASSISTANT_CAPTURE_JPEG_QUALITY ?? "", 10);
  return clampInt(Number.isFinite(raw) ? raw : DEFAULT_JPEG_QUALITY, 10, 100);
};

export async function captureFullScreenBase64(target?: BrowserWindow | null): Promise<string> {
  const debugTiming = process.env.SMART_ASSISTANT_CAPTURE_DEBUG_TIMING === "true";
  const t0 = debugTiming ? Date.now() : 0;
  const win = target ?? BrowserWindow.getFocusedWindow();
  const hideForCapture = process.env.SMART_ASSISTANT_HIDE_CAPTURE === "true";
  const shouldHide = hideForCapture && (win?.isVisible() ?? false);

  if (shouldHide) {
    win?.hide();
    await sleep(HIDE_DELAY_MS);
  }

  try {
    // For perceived performance, prefer capturing the display the user is interacting with
    // (nearest the cursor) instead of sizing based on the largest display.
    const cursorPoint = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const displaySize = activeDisplay?.size ?? { width: 1920, height: 1080 };

    // Capturing at native resolution (e.g. 4K/5K) and encoding as PNG can be very slow.
    // We cap the longest side by default to keep latency low.
    const maxSide = getCaptureMaxSide();
    const rawWidth = displaySize.width || 1920;
    const rawHeight = displaySize.height || 1080;
    const longestSide = Math.max(rawWidth, rawHeight);
    const scale = longestSide > maxSide ? maxSide / longestSide : 1;
    const thumbnailSize = {
      width: Math.max(1, Math.round(rawWidth * scale)),
      height: Math.max(1, Math.round(rawHeight * scale))
    };

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize
    });

    if (debugTiming) {
      const ms = Date.now() - t0;
      console.debug(`[CAPTURE] getSources done in ${ms} ms (thumb ${thumbnailSize.width}x${thumbnailSize.height}, sources=${sources.length})`);
    }

    if (!sources.length) {
      throw new Error("No screen sources available");
    }

    const activeDisplayId = activeDisplay ? String(activeDisplay.id) : null;
    const preferred = activeDisplayId
      ? sources.find((s) => {
          const d = (s as any)?.display_id;
          return typeof d === "string" && d === activeDisplayId;
        })
      : undefined;

    const best =
      preferred ??
      sources.reduce((prev, current) => {
        const prevSize = prev.thumbnail.getSize();
        const currSize = current.thumbnail.getSize();
        const prevPixels = prevSize.width * prevSize.height;
        const currPixels = currSize.width * currSize.height;
        return currPixels > prevPixels ? current : prev;
      }, sources[0]);

    const format = getCaptureFormat();
    if (format === "png") {
      const tEncode0 = debugTiming ? Date.now() : 0;
      const b64 = best.thumbnail.toPNG().toString("base64");
      lastCapture = { dataUrl: `data:image/png;base64,${b64}`, ts: Date.now() };
      if (debugTiming) {
        console.debug(`[CAPTURE] encode png ${Date.now() - tEncode0} ms, total ${Date.now() - t0} ms, b64len=${b64.length}`);
      }
      return lastCapture.dataUrl;
    }

    const quality = getJpegQuality();
    const tEncode0 = debugTiming ? Date.now() : 0;
    const b64 = best.thumbnail.toJPEG(quality).toString("base64");
    lastCapture = { dataUrl: `data:image/jpeg;base64,${b64}`, ts: Date.now() };
    if (debugTiming) {
      console.debug(`[CAPTURE] encode jpeg(q=${quality}) ${Date.now() - tEncode0} ms, total ${Date.now() - t0} ms, b64len=${b64.length}`);
    }
    return lastCapture.dataUrl;
  } finally {
    if (shouldHide) {
      win?.show();
    }
  }
}

export function getCachedCapture(maxAgeMs = 1200): string | null {
  if (!lastCapture) return null;
  if (Date.now() - lastCapture.ts > maxAgeMs) return null;
  return lastCapture.dataUrl;
}

export function startCapturePrewarm(): void {
  if (prewarmTimer) return;
  // If capture mode is clipboard-only, do not run desktopCapturer in the background.
  if (process.env.SMART_ASSISTANT_CAPTURE_MODE === "clipboard") return;

  // Default ON for instant-feel capture; allow opt-out.
  if (process.env.SMART_ASSISTANT_CAPTURE_PREWARM === "false") return;

  const intervalMs = clampInt(
    Number.parseInt(process.env.SMART_ASSISTANT_CAPTURE_PREWARM_INTERVAL_MS ?? "", 10) || 1200,
    300,
    10_000
  );

  // Background refresh of the cached screenshot. Failures are ignored.
  // Kick one immediately so the first click has something to return.
  void captureFullScreenBase64(undefined).catch(() => {});
  prewarmTimer = setInterval(() => {
    void captureFullScreenBase64(undefined).catch(() => {});
  }, intervalMs);
}

export function stopCapturePrewarm(): void {
  if (!prewarmTimer) return;
  clearInterval(prewarmTimer);
  prewarmTimer = null;
}
