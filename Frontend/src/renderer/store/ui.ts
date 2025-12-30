import { create } from "zustand";
import { persist } from "zustand/middleware";

type Msg = { role: "user" | "assistant" | "system"; content: string };

type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Msg[];
};

const welcomeMessage: Msg = {
  role: "assistant",
  content: "歡迎使用 Cleo。請描述你的需求，我會協助你處理。"
};

const makeId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

const defaultConversationTitle = "新對話";

const deriveTitleFromMessages = (messages: Msg[]): string => {
  const firstUser = messages.find((m) => m.role === "user" && m.content.trim().length > 0);
  if (!firstUser) return defaultConversationTitle;
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
};

interface UIState {
  messages: Msg[];
  conversations: Conversation[];
  activeConversationId: string;
  screenshot?: string | null;
  pushing: boolean;
  pinned: boolean;
  streamPaused: boolean;

  newConversation: () => void;
  loadConversation: (id: string) => void;

  addMessage: (m: Msg) => void;
  setLastAssistantContent: (content: string) => void;
  appendToLastAssistant: (delta: string) => void;
  setScreenshot: (b64?: string | null) => void;
  setPushing: (v: boolean) => void;
  setPinned: (v: boolean) => void;
  setStreamPaused: (v: boolean) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => {
      const initialId = makeId();
      const initialConversation: Conversation = {
        id: initialId,
        title: defaultConversationTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [welcomeMessage]
      };

      const syncActiveConversation = (nextMessages: Msg[]): Pick<UIState, "messages" | "conversations"> => {
        const { activeConversationId, conversations } = get();
        const updatedAt = Date.now();

        const nextConversations = conversations.map((c) => {
          if (c.id !== activeConversationId) return c;
          const nextTitle = c.title === defaultConversationTitle ? deriveTitleFromMessages(nextMessages) : c.title;
          return { ...c, title: nextTitle, updatedAt, messages: nextMessages };
        });

        return { messages: nextMessages, conversations: nextConversations };
      };

      return {
        messages: initialConversation.messages,
        conversations: [initialConversation],
        activeConversationId: initialId,
        screenshot: null,
        pushing: false,
        pinned: false,
        streamPaused: false,

        newConversation: () => {
          const id = makeId();
          const now = Date.now();
          const conversation: Conversation = {
            id,
            title: defaultConversationTitle,
            createdAt: now,
            updatedAt: now,
            messages: [welcomeMessage]
          };
          set(() => ({
            activeConversationId: id,
            conversations: [conversation, ...get().conversations],
            messages: conversation.messages,
            screenshot: null,
            pushing: false
          }));
        },

        loadConversation: (id: string) => {
          const conversation = get().conversations.find((c) => c.id === id);
          if (!conversation) return;
          set(() => ({
            activeConversationId: id,
            messages: conversation.messages,
            screenshot: null,
            pushing: false
          }));
        },

        addMessage: (m) =>
          set((state) => {
            const nextMessages = [...state.messages, m];
            return syncActiveConversation(nextMessages);
          }),

        setLastAssistantContent: (content) =>
          set((state) => {
            const idx = [...state.messages].reverse().findIndex((m) => m.role === "assistant");
            if (idx === -1) return state;
            const targetIndex = state.messages.length - 1 - idx;
            const next = state.messages.slice();
            next[targetIndex] = { ...next[targetIndex], content };
            return syncActiveConversation(next);
          }),

        appendToLastAssistant: (delta) =>
          set((state) => {
            const idx = [...state.messages].reverse().findIndex((m) => m.role === "assistant");
            if (idx === -1) return state;
            const targetIndex = state.messages.length - 1 - idx;
            const next = state.messages.slice();
            const prev = next[targetIndex];
            next[targetIndex] = { ...prev, content: `${prev.content ?? ""}${delta}` };
            return syncActiveConversation(next);
          }),

        setScreenshot: (b64) => set(() => ({ screenshot: b64 })),
        setPushing: (v) => set(() => ({ pushing: v })),
        setPinned: (v) => set(() => ({ pinned: v })),
        setStreamPaused: (v) => set(() => ({ streamPaused: v })),
      };
    },
    {
      name: "smart-assistant-ui",
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId
      })
    }
  )
);
