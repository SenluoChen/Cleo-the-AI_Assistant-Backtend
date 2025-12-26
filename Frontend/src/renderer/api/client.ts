import { AnalyzePayload, AnalyzeResponse } from "../../common/schemas";

const API_URL = import.meta.env.VITE_ANALYZE_URL as string | undefined;
const DEFAULT_API_URL = "http://127.0.0.1:8787/analyze";

const resolveApiUrl = () => {
  return API_URL || DEFAULT_API_URL;
};

export async function analyze(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  if (window.api?.analyze) {
    return window.api.analyze(payload);
  }

  const url = resolveApiUrl();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API Error: ${response.status}\n${text}`);
  }

  return (await response.json()) as AnalyzeResponse;
}

type AnalyzeStreamEvent =
  | { event: "meta"; data: { ok: boolean } }
  | { event: "delta"; data: { delta: string } }
  | { event: "done"; data: { done: true } }
  | { event: "error"; data: { error: string } };

const parseSseLines = async function* (response: Response): AsyncGenerator<AnalyzeStreamEvent, void, void> {
  if (!response.body) {
    throw new Error("Streaming not supported (missing response body)");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let currentEvent: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) break;
      const rawLine = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);

      const line = rawLine.replace(/\r$/, "");
      if (!line) {
        currentEvent = null;
        continue;
      }

      if (line.startsWith("event:")) {
        currentEvent = line.slice("event:".length).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        const jsonText = line.slice("data:".length).trim();
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          continue;
        }

        const parsedObj = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
        const event = (currentEvent ?? "message") as AnalyzeStreamEvent["event"];
        if (event === "delta") {
          yield { event: "delta", data: { delta: String(parsedObj["delta"] ?? "") } };
        } else if (event === "done") {
          yield { event: "done", data: { done: true } };
        } else if (event === "error") {
          yield { event: "error", data: { error: String(parsedObj["error"] ?? "Unknown error") } };
        } else if (event === "meta") {
          yield { event: "meta", data: { ok: Boolean(parsedObj["ok"] ?? false) } };
        }
      }
    }
  }
};

export async function* analyzeStream(payload: AnalyzePayload): AsyncGenerator<string, void, void> {
  // Prefer streaming via SSE fetch so we can show partial deltas as they arrive.
  // This will work in the renderer (Electron) and in browsers that can reach the local API.
  const url = resolveApiUrl();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API Error: ${response.status}\n${text}`);
    }

    for await (const evt of parseSseLines(response)) {
      if (evt.event === "delta") {
        if (evt.data.delta) yield evt.data.delta;
      }
      if (evt.event === "error") {
        throw new Error(evt.data.error);
      }
      if (evt.event === "done") {
        return;
      }
    }
  } catch (err) {
    // If streaming fetch fails (e.g., backend not reachable from renderer),
    // fall back to IPC analyze if available which returns the full answer.
    if (window.api?.analyze) {
      const res = await window.api.analyze(payload);
      const answer = typeof (res as any)?.answer === "string" ? (res as any).answer : "";
      if (answer) yield answer;
      return;
    }

    // Re-throw original error when no fallback available.
    throw err;
  }
}
