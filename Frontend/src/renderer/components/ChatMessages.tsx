import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUI } from "../store/ui";
import { ThinkingBubble } from "./ThinkingBubble";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming
}: {
  message: Msg;
  isStreaming: boolean;
}) {
  const markdownComponents = useMemo(
    () => ({
      a: ({ children, ...props }: any) => (
        <a {...props} target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
      code: ({ className, children, ...props }: any) => (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }),
    []
  );

  return (
    <div className={`bubble bubble--${message.role}`}>
      {isStreaming ? (
        <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      )}
      {/* removed inline stream cursor to avoid duplicate loading indicators; thinking animation is used instead */}
    </div>
  );
});

export default function ChatMessages() {
  const messages = useUI((s) => s.messages);
  const pushing = useUI((s) => s.pushing);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const updateAutoScrollFlag = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 48;
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    updateAutoScrollFlag();

    const onScroll = () => updateAutoScrollFlag();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [updateAutoScrollFlag]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const rafId = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [messages, pushing]);

  return (
    <div className="chat-messages" ref={messagesContainerRef}>
      {messages.map((msg, i) => {
        const isLast = i === messages.length - 1;
        const isStreaming = Boolean(pushing && isLast && msg.role === "assistant");
        return <MessageBubble key={`${msg.role}-${i}`} message={msg} isStreaming={isStreaming} />;
      })}

      {pushing && <ThinkingBubble />}
    </div>
  );
}
