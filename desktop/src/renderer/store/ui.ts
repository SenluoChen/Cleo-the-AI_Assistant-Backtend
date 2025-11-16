import { create } from "zustand";

type Msg = { role: "user" | "assistant" | "system"; content: string };

interface UIState {
  messages: Msg[];
  screenshot?: string | null;
  pushing: boolean;
  pinned: boolean;
  add: (m: Msg) => void;
  setScreenshot: (b64?: string | null) => void;
  setPushing: (v: boolean) => void;
  setPinned: (v: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  messages: [{ role: "assistant", content: "歡迎使用 Smart Assistant，請描述你的需求或貼上相關資訊，我會協助你整理下一步。" }],
  screenshot: null,
  pushing: false,
  pinned: false,
  add: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setScreenshot: (b64) => set(() => ({ screenshot: b64 })),
  setPushing: (v) => set(() => ({ pushing: v })),
  setPinned: (v) => set(() => ({ pinned: v }))
}));
