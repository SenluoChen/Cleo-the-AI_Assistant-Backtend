import { FormEvent, useCallback, useState, ClipboardEvent, useEffect } from "react";
import { analyzeStream } from "../api/client";
import { useUI } from "../store/ui";
import { ThinkingBubble } from "./ThinkingBubble";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

async function toJpegDataUrl(inputDataUrl: string): Promise<string> {
  const dataUrl = String(inputDataUrl || "").trim();
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrl.startsWith("data:image/jpeg")) return dataUrl;

  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        reject(new Error("Invalid image"));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      // Flatten transparency onto white for consistent results.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = dataUrl;
  });
}

export default function ChatWindow() {
  const {
    messages,
    screenshot,
    addMessage,
    setScreenshot,
    pushing,
    setPushing,
    pinned,
    setPinned,
    appendToLastAssistant,
    setLastAssistantContent
  } = useUI();
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);

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

  useEffect(() => {
    let active = true;
    const fetchPinned = async () => {
      if (!window.api?.getPinned) return;
      try {
        const current = await window.api.getPinned();
        if (active) setPinned(current);
      } catch (error) {
        console.error("Failed to fetch pin state", error);
      }
    };
    fetchPinned();
    const unsubscribe = window.api?.onPinState?.((next) => {
      if (active) setPinned(next);
    });
    // Clipboard-first: listen to main process clipboard image events.
    const unsubClip = window.api?.onClipboardImage?.((dataUrl: string) => {
      if (!active) return;
      setScreenshot(dataUrl);
    });
    return () => {
      active = false;
      unsubscribe?.();
      unsubClip?.();
    };
  }, [setPinned]);

  const handlePinToggle = useCallback(async () => {
    if (!window.api?.setPinned || pinning) return;
    const next = !pinned;
    setPinning(true);
    try {
      const resolved = await window.api.setPinned(next);
      setPinned(resolved);
    } catch (error) {
      console.error("Failed to set pin state", error);
    } finally {
      setPinning(false);
    }
  }, [pinned, setPinned, pinning]);

  const toggleMenu = useCallback(() => setMenuOpen((s) => !s), []);

  // --- Sending message ---
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const history = [...messages]
        .filter((msg) => (msg.role === "user" || msg.role === "assistant") && msg.content.trim().length > 0)
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const image = screenshot ? await toJpegDataUrl(screenshot) : undefined;
      const payload = {
        question: trimmed,
        messages: [...history, { role: "user" as const, content: trimmed }],
        image
      };

      setPushing(true);
      addMessage({ role: "user", content: trimmed });
      setDraft("");
      if (screenshot) {
        setScreenshot(null);
      }

      // Create assistant placeholder so we can stream into it.
      addMessage({ role: "assistant", content: "" });

      try {
        for await (const delta of analyzeStream(payload)) {
          appendToLastAssistant(delta);
        }
      } catch (error: unknown) {
        setLastAssistantContent(`⚠️ Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setPushing(false);
      }
    },
    [messages, screenshot, addMessage, setScreenshot, setPushing, appendToLastAssistant, setLastAssistantContent]
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
        <div className="chat-header-left">
          <button type="button" className="chat-menu-btn" onClick={toggleMenu} aria-expanded={menuOpen}>
            ☰
          </button>
        </div>
        <div className="chat-title">Smart Assistant</div>
        <div className="chat-header-right">
          <button
            type="button"
            className={`chat-pin-btn ${pinned ? "is-pinned" : ""}`}
            onClick={handlePinToggle}
            disabled={pinning || !window.api?.setPinned}
            aria-label={pinned ? "取消固定視窗" : "固定視窗"}
          >
            📌
          </button>

          <button
            type="button"
            className="chat-close-btn"
            onClick={() => window.api?.closeMain?.()}
            disabled={!window.api?.closeMain}
            aria-label="關閉視窗"
            title="關閉"
          >
            ×
          </button>
        </div>

        {menuOpen && (
          <div className="chat-menu-popover">
            <button className="menu-item">新對話</button>
            <button className="menu-item">探索案例</button>
            <button className="menu-item">螢幕截圖</button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const showCursor = Boolean(pushing && isLast && msg.role === "assistant");

          return (
            <div
              key={`${msg.role}-${i}`}
              className={`bubble bubble--${msg.role}`}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, ...props }) => (
                    <a {...props} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                  code: ({ className, children, ...props }) => (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {showCursor && <span className="stream-cursor" aria-hidden="true" />}
            </div>
          );
        })}

        {/* AI thinking animation */}
        {pushing && <ThinkingBubble />}
      </div>

      {/* Composer */}
      <div className="chat-composer">
        <div className={`composer-screenshot-preview ${screenshot || capturingScreenshot ? "is-visible" : ""}`}>
          {capturingScreenshot && !screenshot && (
            <div className="composer-screenshot-loading" role="status" aria-live="polite" aria-label="Capturing screenshot">
              <span className="apple-spinner" aria-hidden="true" />
              <span className="composer-screenshot-loading__text">截圖中…</span>
            </div>
          )}

          {screenshot && <img src={screenshot} alt="screenshot preview" />}
        </div>

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

          <div className="composer-actions">
            <button
              type="submit"
              className="composer-send"
              disabled={pushing || !draft.trim()}
              aria-label="Send message"
            >
              {pushing ? "..." : "Send"}
            </button>

            <button
              type="button"
              className="composer-screenshot"
              onClick={async () => {
                try {
                  if (capturingScreenshot) return;
                  setCapturingScreenshot(true);
                  const data = await window.api?.captureScreen?.();
                  const text = String(data ?? "").trim();
                  if (text) {
                    const dataUrl = text.startsWith("data:") ? text : `data:image/png;base64,${text}`;
                    setScreenshot(dataUrl);
                  }
                } catch (err) {
                  console.error("Screenshot failed", err);
                } finally {
                  setCapturingScreenshot(false);
                }
              }}
              title="Screenshot"
              aria-label="Screenshot"
              disabled={pushing || capturingScreenshot || !window.api?.captureScreen}
            >
              <span className="btn-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 7H6L7 5H17L18 7H20C21.1046 7 22 7.89543 22 9V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V9C2 7.89543 2.89543 7 4 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8"/>
                </svg>
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
