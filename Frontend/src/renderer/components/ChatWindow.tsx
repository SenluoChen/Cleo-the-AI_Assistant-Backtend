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

      setPushing(true);
      addMessage({ role: "user", content: trimmed });
      setDraft("");

      // Create assistant placeholder so we can stream into it.
      addMessage({ role: "assistant", content: "" });

      try {
        for await (const delta of analyzeStream({ question: trimmed })) {
          appendToLastAssistant(delta);
        }
      } catch (error: unknown) {
        setLastAssistantContent(`⚠️ Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setPushing(false);
      }
    },
    [addMessage, setPushing, appendToLastAssistant, setLastAssistantContent]
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
