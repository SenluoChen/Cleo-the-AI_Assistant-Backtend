import { z } from "zod";

export const ChatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string()
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const AnalyzePayload = z.object({
  question: z.string().min(1),
  messages: z.array(ChatMessage).optional(),
  image: z.string().optional() // dataURL base64
});
export type AnalyzePayload = z.infer<typeof AnalyzePayload>;

export const AnalyzeResponse = z.object({
  answer: z.string()
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;
