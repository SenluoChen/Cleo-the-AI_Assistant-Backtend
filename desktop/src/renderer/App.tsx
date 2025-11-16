import { useCallback, useEffect, useState } from "react";
import MessageList from "./components/MessageList";
import InputBar from "./components/InputBar";
import { useUI } from "./store/ui";
import "./styles/app.css";

const pinnedShortcuts = [
  { label: "新對話", badge: "⌘N" },
  { label: "探索案例", badge: "⌘K" },
  { label: "螢幕截圖", badge: "⌘⇧5" }
];

const projectLinks = [
  { label: "智慧客服", hint: "進行中" },
  { label: "研究報告", hint: "需回覆" },
  { label: "團隊任務", hint: "8 個項目" }
];

export default function App() {
  const { pinned, setPinned } = useUI();
  const [pinning, setPinning] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchPinned = async () => {
      if (!window.api?.getPinned) return;
      try {
        const current = await window.api.getPinned();
        if (active) {
          setPinned(current);
        }
      } catch (error) {
        console.error("Failed to fetch pin state", error);
      }
    };
    fetchPinned();
    const unsubscribe = window.api?.onPinState?.((next) => {
      setPinned(next);
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo">SA</div>
          <div>
            <p className="sidebar__eyebrow">Smart Assistant</p>
            <p className="sidebar__title">你的策略夥伴</p>
          </div>
        </div>

        <button className="sidebar__new-chat">＋ 建立新對話</button>

        <nav className="sidebar__section">
          <p className="sidebar__label">常用捷徑</p>
          <ul>
            {pinnedShortcuts.map((item) => (
              <li key={item.label}>
                <button className="sidebar__item">
                  <span>{item.label}</span>
                  <span className="sidebar__badge">{item.badge}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar__section">
          <p className="sidebar__label">專案</p>
          <ul>
            {projectLinks.map((project) => (
              <li key={project.label}>
                <button className="sidebar__item">
                  <span>{project.label}</span>
                  <span className="sidebar__hint">{project.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="workspace">
        <div className="workspace__top-bar">
          <div className="workspace__drag-region" aria-hidden="true" />
          <button
            type="button"
            className={`pin-toggle ${pinned ? "is-pinned" : ""}`}
            onClick={handlePinToggle}
            disabled={pinning || !window.api?.setPinned}
          >
            <span aria-hidden="true">📌</span>
            {pinned ? "已固定視窗" : "固定對話視窗"}
          </button>
        </div>
        <header className="workspace__header">
          <div>
            <p className="workspace__eyebrow">Smart Assistant</p>
            <h1>快速綜整、洞察，並推進你的專案</h1>
            <p className="workspace__subtitle">提出問題、貼上畫面或資料，讓助理為你整理下一步。</p>
          </div>
          <div className="workspace__status">
            <span className="status-dot" />
            即時分析已啟用
          </div>
        </header>

        <main className="workspace__conversation">
          <div className="conversation-card">
            <MessageList />
          </div>
        </main>

        <footer className="workspace__composer">
          <div className="conversation-card conversation-card--composer">
            <InputBar />
            <p className="composer__hint">Enter 傳送 · Shift + Enter 換行 · 支援貼上螢幕截圖</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
