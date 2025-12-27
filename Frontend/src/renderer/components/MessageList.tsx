import { useUI } from "../store/ui";
import { useEffect, useRef } from "react";

const roleLabel: Record<"user" | "assistant" | "system", string> = {
  user: "你",
  assistant: "Cleo",
  system: "系統訊息"
};

const roleAvatar: Record<"user" | "assistant" | "system", string> = {
  user: "U",
  assistant: "SA",
  system: "ℹ"
};

export default function MessageList() {
  const { messages, screenshot, pinned } = useUI();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const prevLengthRef = useRef<number>(messages.length);

  useEffect(() => {
    if (pinned) {
      prevLengthRef.current = messages.length;
      return;
    }

    const behavior: ScrollBehavior = messages.length !== prevLengthRef.current ? "smooth" : "auto";
    prevLengthRef.current = messages.length;

    // Prefer scrolling the last message into view when available
    if (lastMessageRef.current) {
      try {
        lastMessageRef.current.scrollIntoView({ behavior, block: "nearest" });
        return;
      } catch (e) {
        /* ignore and fallback */
      }
    }

    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, pinned]);

  return (
    <div className="message-feed" ref={containerRef}>
      {messages.map((message, index) => (
        <article
          ref={index === messages.length - 1 ? lastMessageRef : undefined}
          key={`${message.role}-${index}`}
          className={`message message--${message.role}`}
        >
          <div className="message__avatar" aria-hidden="true">{roleAvatar[message.role]}</div>
          <div className="message__body">
            <p className="message__role">{roleLabel[message.role]}</p>
            <div className="message__content">{message.content}</div>
          </div>
        </article>
      ))}

      {screenshot && (
        <article className="message message--preview">
          <div className="message__avatar" aria-hidden="true">SA</div>
          <div className="message__body">
            <p className="message__role">螢幕截圖</p>
            <div className="message__preview">
              <img src={screenshot} alt="最近貼上的螢幕截圖" />
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
