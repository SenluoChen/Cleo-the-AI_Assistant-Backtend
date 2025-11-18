import { create } from "zustand";

type Msg = { role: "user" | "assistant" | "system"; content: string };

interface UIState {
  messages: Msg[];
  screenshot?: string | null;
  pushing: boolean;
  pinned: boolean;

  addMessage: (m: Msg) => void;
  setScreenshot: (b64?: string | null) => void;
  setPushing: (v: boolean) => void;
  setPinned: (v: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  messages: [
    {
      role: "assistant",
      content:
        "歡迎使用 Smart Assistant。請描述你的需求，我會協助你處理。",
    },
  ],
  screenshot: null,
  pushing: false,
  pinned: false,

  addMessage: (m) => set((state) => ({ messages: [...state.messages, m] })),
  setScreenshot: (b64) => set(() => ({ screenshot: b64 })),
  setPushing: (v) => set(() => ({ pushing: v })),
  setPinned: (v) => set(() => ({ pinned: v })),
}));
