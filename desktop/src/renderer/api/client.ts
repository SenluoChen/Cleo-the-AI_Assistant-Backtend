import { AnalyzePayload, AnalyzeResponse } from "../../common/schemas";

const API_URL = import.meta.env.VITE_ANALYZE_URL;

export async function analyze(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  if (window.api?.analyze) {
    return window.api.analyze(payload);
  }

  if (!API_URL) {
    throw new Error("❗ VITE_ANALYZE_URL is not configured");
  }

  const response = await fetch(API_URL, {
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
