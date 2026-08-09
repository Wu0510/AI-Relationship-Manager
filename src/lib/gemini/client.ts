import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';

let genai: GoogleGenAI | undefined;

/** Gemini client 單例。API Key 只存在 server 端。 */
export function getGenAI(): GoogleGenAI {
  if (!genai) {
    genai = new GoogleGenAI({ apiKey: env.gemini.apiKey() });
  }
  return genai;
}

export const MODELS = {
  /** 日常對話、話術生成 — 快且便宜 */
  fast: () => env.gemini.model(),
  /** 客戶輪廓深度分析、資產配置檢視 — 推理品質優先 */
  pro: () => env.gemini.proModel(),
} as const;
