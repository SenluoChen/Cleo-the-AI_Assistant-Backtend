import { BrowserWindow, desktopCapturer, screen } from "electron";

const HIDE_DELAY_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureFullScreenBase64(target?: BrowserWindow | null): Promise<string> {
  const win = target ?? BrowserWindow.getFocusedWindow();
  const hideForCapture = process.env.SMART_ASSISTANT_HIDE_CAPTURE === "true";
  const shouldHide = hideForCapture && (win?.isVisible() ?? false);

  if (shouldHide) {
    win?.hide();
    await sleep(HIDE_DELAY_MS);
  }

  try {
    const displays = screen.getAllDisplays();
    const max = displays.reduce(
      (acc, display) => ({
        width: Math.max(acc.width, display.size.width),
        height: Math.max(acc.height, display.size.height)
      }),
      { width: 0, height: 0 }
    );
    const thumbnailSize = {
      width: max.width || 1920,
      height: max.height || 1080
    };

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize
    });

    if (!sources.length) {
      throw new Error("No screen sources available");
    }

    const best = sources.reduce((prev, current) => {
      const prevSize = prev.thumbnail.getSize();
      const currSize = current.thumbnail.getSize();
      const prevPixels = prevSize.width * prevSize.height;
      const currPixels = currSize.width * currSize.height;
      return currPixels > prevPixels ? current : prev;
    }, sources[0]);

    return best.thumbnail.toPNG().toString("base64");
  } finally {
    if (shouldHide) {
      win?.show();
    }
  }
}
