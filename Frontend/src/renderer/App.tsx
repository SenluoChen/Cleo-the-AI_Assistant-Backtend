import ChatWindow from "./components/ChatWindow";
import "./styles/app.css";

export default function App() {
  return (
    <div className="app-compact">
      <div className="conversation-card">
        <ChatWindow />
      </div>
    </div>
  );
}
