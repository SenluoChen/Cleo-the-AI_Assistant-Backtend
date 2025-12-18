import { z } from "zod";

export const AnalyzePayload = z.object({
  question: z.string().min(1),
  image: z.string().optional() // dataURL base64
});
export type AnalyzePayload = z.infer<typeof AnalyzePayload>;

export const AnalyzeResponse = z.object({
  answer: z.string()
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponse>;
