import { ChangeEvent, ClipboardEvent, KeyboardEvent, useCallback, useState } from "react";
import { analyze } from "../api/client";
import { useUI } from "../store/ui";

export default function InputBar() {
  const [q, setQ] = useState("");
  const { add, setScreenshot, setPushing, pushing } = useUI();

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.type.startsWith("image/")) continue;

        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            setScreenshot(result);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    [setScreenshot]
  );

  async function onSend() {
    if (!q.trim() || pushing) return;
    setPushing(true);

    add({ role: "user", content: q });
    const text = q;
    setQ("");

    try {
      const ans = await analyze({ question: text });
      add({ role: "assistant", content: ans.answer });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      add({ role: "assistant", content: `❗ Error: ${message}` });
    } finally {
      setPushing(false);
    }
  }

  const disableSend = pushing || !q.trim();

  return (
    <div className="composer">
      <label className="sr-only" htmlFor="composer-input">
        請輸入想要詢問的內容
      </label>
      <textarea
        id="composer-input"
        className="composer__textarea"
        rows={1}
        placeholder="描述你的需求，或貼上螢幕截圖讓助理協助分析"
        value={q}
        disabled={pushing}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setQ(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void onSend();
          }
        }}
        onPaste={handlePaste}
      />

      <div className="composer__actions">
        <span className="composer__state">{pushing ? "助理思考中…" : "等待輸入"}</span>
        <button
          className="composer__send"
          onClick={onSend}
          disabled={disableSend}
        >
          傳送
        </button>
      </div>
    </div>
  );
}
