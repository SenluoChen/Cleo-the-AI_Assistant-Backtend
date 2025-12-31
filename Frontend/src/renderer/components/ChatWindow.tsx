import { FormEvent, useCallback, useState, ClipboardEvent, useEffect } from "react";
import { analyzeStream } from "../api/client";
import { useUI } from "../store/ui";
import ChatMessages from "./ChatMessages";
import ChatSidebar from "./ChatSidebar";
import { RobotHeadIcon } from "./RobotHeadIcon";

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
  const screenshot = useUI((s) => s.screenshot);
  const addMessage = useUI((s) => s.addMessage);
  const setScreenshot = useUI((s) => s.setScreenshot);
  const pushing = useUI((s) => s.pushing);
  const setPushing = useUI((s) => s.setPushing);
  const pinned = useUI((s) => s.pinned);
  const setPinned = useUI((s) => s.setPinned);
  const appendToLastAssistant = useUI((s) => s.appendToLastAssistant);
  const setLastAssistantContent = useUI((s) => s.setLastAssistantContent);

  const [draft, setDraft] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);

  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [openAiKeyDraft, setOpenAiKeyDraft] = useState("");
  const [keyPromptError, setKeyPromptError] = useState<string | null>(null);

  const isOpenAiKeyError = (msg: string) => {
    const m = msg.toLowerCase();
    return (
      m.includes("openai_api_key_invalid") ||
      m.includes("openai_api_key_missing") ||
      m.includes("incorrect api key") ||
      m.includes("invalid api key") ||
      m.includes("openai_secret_id is not configured")
    );
  };

  const saveOpenAiKey = useCallback(async () => {
    if (!window.api?.setOpenAIKey) {
      setKeyPromptError("This build does not support setting keys.");
      return;
    }
    const key = openAiKeyDraft.trim();
    if (!key) {
      setKeyPromptError("Please paste your API key.");
      return;
    }
    setKeyPromptError(null);
    try {
      await window.api.setOpenAIKey(key);
      setShowKeyPrompt(false);
      setOpenAiKeyDraft("");
      setLastAssistantContent("✅ OpenAI key saved. Please resend your message.");
    } catch (e: unknown) {
      setKeyPromptError(e instanceof Error ? e.message : String(e));
    }
  }, [openAiKeyDraft, setLastAssistantContent]);

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

  const toggleSidebar = useCallback(() => setSidebarOpen((s) => !s), []);

  // --- Sending message ---
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const history = [...useUI.getState().messages]
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
        let buffer = "";
        let rafId: number | null = null;
        let needsFlush = false;
        let unsubPaused: (() => void) | null = null;

        const scheduleFlush = () => {
          if (rafId !== null) return;
          // If stream is paused, defer flushing until resumed.
          if (useUI.getState().streamPaused) {
            needsFlush = true;
            if (!unsubPaused) {
              unsubPaused = useUI.subscribe((s) => s.streamPaused, (val) => {
                if (!val) {
                  // resumed
                  if (needsFlush) {
                    needsFlush = false;
                    scheduleFlush();
                  }
                  if (unsubPaused) {
                    unsubPaused();
                    unsubPaused = null;
                  }
                }
              });
            }
            return;
          }

          rafId = window.requestAnimationFrame(() => {
            rafId = null;
            if (!buffer) return;
            const chunk = buffer;
            buffer = "";
            appendToLastAssistant(chunk);
          });
        };

        for await (const delta of analyzeStream(payload)) {
          buffer += delta;
          scheduleFlush();
        }

        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }

        if (buffer) {
          appendToLastAssistant(buffer);
          buffer = "";
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setLastAssistantContent(`⚠️ Error: ${message}`);
        if (isOpenAiKeyError(message)) {
          setShowKeyPrompt(true);
        }
      } finally {
        setPushing(false);
        if (unsubPaused) {
          unsubPaused();
          unsubPaused = null;
        }
      }
    },
    [screenshot, addMessage, setScreenshot, setPushing, appendToLastAssistant, setLastAssistantContent]
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
          <button type="button" className="chat-menu-btn" onClick={toggleSidebar} aria-expanded={sidebarOpen}>
            <svg className="chat-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="chat-title">
          <RobotHeadIcon size={22} className="chat-title__icon" />
          <span className="chat-title__text">Cleo</span>
        </div>
        <div className="chat-header-right">
          <button
            type="button"
            className={`chat-pin-btn ${pinned ? "is-pinned" : ""}`}
            onClick={handlePinToggle}
            disabled={pinning || !window.api?.setPinned}
            aria-label={pinned ? "取消固定視窗" : "固定視窗"}
          >
            <svg className="chat-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <circle cx="12" cy="7" r="5" stroke="currentColor" strokeWidth="2" />
              <path
                d="M10.2 6.2c.9-1.3 2.4-2.1 4.2-2.1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M10.5 12v8l1.5 2 1.5-2v-8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            className="chat-close-btn"
            onClick={() => window.api?.closeMain?.()}
            disabled={!window.api?.closeMain}
            aria-label="關閉視窗"
            title="關閉"
          >
            <svg className="chat-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M7 7l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {sidebarOpen && <ChatSidebar onClose={() => setSidebarOpen(false)} />}
      </div>

      {/* Messages */}
      <ChatMessages />

      {showKeyPrompt && (
        <div className="chat-overlay" role="dialog" aria-modal="true" aria-label="Set OpenAI API key">
          <div className="chat-overlay__panel">
            <div className="chat-overlay__title">Set OpenAI API key</div>
            <div className="chat-overlay__desc">
              Paste your OpenAI API key to enable real responses in the installed app.
              The key is saved to your user profile (userData/cleo.env).
            </div>
            <input
              className="chat-overlay__input"
              placeholder="sk-..."
              value={openAiKeyDraft}
              onChange={(e) => setOpenAiKeyDraft(e.target.value)}
              autoFocus
            />
            {keyPromptError && <div className="chat-overlay__error">{keyPromptError}</div>}
            <div className="chat-overlay__actions">
              <button type="button" className="chat-overlay__btn" onClick={() => setShowKeyPrompt(false)}>
                Cancel
              </button>
              <button type="button" className="chat-overlay__btn chat-overlay__btn--primary" onClick={() => void saveOpenAiKey()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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
