import { FormEvent, useCallback, useState, ClipboardEvent } from "react";
import { analyze } from "../api/client";
import { useUI } from "../store/ui";
import { ThinkingBubble } from "./ThinkingBubble";

export default function ChatWindow() {
  const { messages, screenshot, addMessage, setScreenshot, pushing, setPushing } = useUI();
  const [draft, setDraft] = useState("");

  // --- Paste handler（支援貼圖片） ---
  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLInputElement>) => {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.type.startsWith("image/")) continue;

        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            setScreenshot(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [setScreenshot]
  );

  // --- Sending message ---
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setPushing(true);
      addMessage({ role: "user", content: trimmed });
      setDraft("");

      try {
        const response = await analyze({ question: trimmed });

        addMessage({
          role: "assistant",
          content: response.answer,
        });
      } catch (error: unknown) {
        addMessage({
          role: "assistant",
          content: `⚠️ Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        setPushing(false);
      }
    },
    [addMessage, setPushing]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (pushing || !draft.trim()) return;
      void sendMessage(draft);
    },
    [draft, pushing, sendMessage]
  );

  return (
    <div className="chat-root">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title">Smart Assistant</div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            className={`bubble bubble--${msg.role}`}
          >
            {msg.content}
          </div>
        ))}

        {/* Image preview */}
        {screenshot && (
          <div className="bubble bubble--preview">
            <img src={screenshot} alt="pasted screenshot" />
          </div>
        )}

        {/* AI thinking animation */}
        {pushing && <ThinkingBubble />}
      </div>

      {/* Composer */}
      <div className="chat-composer">
        <form onSubmit={handleSubmit} className="composer-form">
          <input
            name="message"
            className="composer-input"
            placeholder="Send a message..."
            value={draft}
            disabled={pushing}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
          />

          <button
            type="submit"
            className="composer-send"
            disabled={pushing || !draft.trim()}
          >
            {pushing ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
