import { useMemo } from "react";
import { useUI } from "../store/ui";

export default function ChatSidebar({ onClose }: { onClose: () => void }) {
  const conversations = useUI((s) => s.conversations);
  const activeConversationId = useUI((s) => s.activeConversationId);
  const newConversation = useUI((s) => s.newConversation);
  const loadConversation = useUI((s) => s.loadConversation);

  const sorted = useMemo(() => {
    return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations]);

  return (
    <aside className="chat-sidebar" aria-label="歷史對話">
      <div className="chat-sidebar__header">
        <button
          type="button"
          className="chat-sidebar__new"
          onClick={() => {
            newConversation();
            onClose();
          }}
        >
          ＋ 新對話
        </button>
      </div>

      <div className="chat-sidebar__section-label">歷史對話</div>

      <div className="chat-sidebar__list" role="list">
        {sorted.map((c) => {
          const active = c.id === activeConversationId;
          return (
            <button
              key={c.id}
              type="button"
              className={`chat-sidebar__item ${active ? "is-active" : ""}`}
              onClick={() => {
                loadConversation(c.id);
                onClose();
              }}
              role="listitem"
              aria-current={active ? "true" : undefined}
              title={c.title}
            >
              {c.title}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
