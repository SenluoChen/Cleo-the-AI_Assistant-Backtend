import type { AnalyzePayload, AnalyzeResponse } from "../common/schemas";

type RendererAPI = {
  captureScreen?: () => Promise<string>;
  toggleMain?: () => void;
  analyze: (payload: AnalyzePayload) => Promise<AnalyzeResponse>;
  setPinned?: (pinned: boolean) => Promise<boolean>;
  getPinned?: () => Promise<boolean>;
  onPinState?: (listener: (pinned: boolean) => void) => () => void;
};

declare global {
  interface Window {
    api?: RendererAPI;
    electronAPI?: RendererAPI;
    bubbleAPI?: {
      toggleMain: () => void;
    };
  }
}

export {};
