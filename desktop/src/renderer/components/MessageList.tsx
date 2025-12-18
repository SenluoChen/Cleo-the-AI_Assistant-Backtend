import { useUI } from "../store/ui";

const roleLabel: Record<"user" | "assistant" | "system", string> = {
  user: "你",
  assistant: "Smart Assistant",
  system: "系統訊息"
};

const roleAvatar: Record<"user" | "assistant" | "system", string> = {
  user: "U",
  assistant: "SA",
  system: "ℹ"
};

export default function MessageList() {
  const { messages, screenshot } = useUI();

  return (
    <div className="message-feed">
      {messages.map((message, index) => (
        <article key={`${message.role}-${index}`} className={`message message--${message.role}`}>
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
