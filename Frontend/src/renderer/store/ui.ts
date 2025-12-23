import { create } from "zustand";

type Msg = { role: "user" | "assistant" | "system"; content: string };

interface UIState {
  messages: Msg[];
  screenshot?: string | null;
  pushing: boolean;
  pinned: boolean;

  addMessage: (m: Msg) => void;
  setLastAssistantContent: (content: string) => void;
  appendToLastAssistant: (delta: string) => void;
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
  setLastAssistantContent: (content) =>
    set((state) => {
      const idx = [...state.messages].reverse().findIndex((m) => m.role === "assistant");
      if (idx === -1) return state;
      const targetIndex = state.messages.length - 1 - idx;
      const next = state.messages.slice();
      next[targetIndex] = { ...next[targetIndex], content };
      return { messages: next };
    }),
  appendToLastAssistant: (delta) =>
    set((state) => {
      const idx = [...state.messages].reverse().findIndex((m) => m.role === "assistant");
      if (idx === -1) return state;
      const targetIndex = state.messages.length - 1 - idx;
      const next = state.messages.slice();
      const prev = next[targetIndex];
      next[targetIndex] = { ...prev, content: `${prev.content ?? ""}${delta}` };
      return { messages: next };
    }),
  setScreenshot: (b64) => set(() => ({ screenshot: b64 })),
  setPushing: (v) => set(() => ({ pushing: v })),
  setPinned: (v) => set(() => ({ pinned: v })),
}));
