import { FormEvent, useCallback, useState, ClipboardEvent, useEffect } from "react";
import { analyzeStream } from "../api/client";
import { useUI } from "../store/ui";
import { ThinkingBubble } from "./ThinkingBubble";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    return () => {
      active = false;
      unsubscribe?.();
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

      const payload = {
        question: trimmed,
        messages: [...history, { role: "user" as const, content: trimmed }],
        image: screenshot ?? undefined
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
          >
            📌
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
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            className={`bubble bubble--${msg.role}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        ))}

        {/* AI thinking animation */}
        {pushing && <ThinkingBubble />}
      </div>

      {/* Composer */}
      <div className="chat-composer">
        <div className={`composer-screenshot-preview ${screenshot ? "is-visible" : ""}`}>
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
                  const data = await window.api?.captureScreen?.();
                  if (data) {
                    const text = String(data);
                    const dataUrl = text.startsWith("data:") ? text : `data:image/png;base64,${text}`;
                    setScreenshot(dataUrl);
                  }
                } catch (err) {
                  console.error("Screenshot failed", err);
                }
              }}
              title="截圖"
              aria-label="截圖"
              disabled={pushing || !window.api?.captureScreen}
            >
              <span className="btn-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 7H6L7 5H17L18 7H20C21.1046 7 22 7.89543 22 9V18C22 19.1046 21.1046 20 20 20H4C2.89543 20 2 19.1046 2 18V9C2 7.89543 2.89543 7 4 7Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              </span>
              <span className="btn-label">截圖</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
