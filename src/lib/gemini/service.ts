import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGenAI, MODELS } from '@/lib/gemini/client';
import {
  ADVISOR_SUGGESTION_SCHEMA,
  CALL_LOG_SCHEMA,
  SYSTEM_INSTRUCTION,
  buildAnalysisPrompt,
  buildCallLogPrompt,
  buildChatPrompt,
} from '@/lib/gemini/prompt';
import type {
  AdvisorSuggestion,
  AnalysisType,
  CallLogAnalysis,
  CustomerAiContext,
} from '@/types/domain';

/* ==========================================================================
 *  上下文載入：一次 RPC 撈齊客戶檔案 / 部位 / 通聯 / 追蹤 / 市場動態
 *  RPC 是 security invoker，RLS 會擋掉不屬於這位理專的客戶
 * ========================================================================== */

export async function loadCustomerContext(
  supabase: SupabaseClient,
  customerId: string,
  logLimit = 8,
): Promise<CustomerAiContext> {
  const { data, error } = await supabase.rpc('get_customer_ai_context', {
    p_customer_id: customerId,
    p_log_limit: logLimit,
  });

  if (error) throw new Error(`載入客戶上下文失敗：${error.message}`);
  if (!data?.customer) {
    const err = new Error('CUSTOMER_NOT_FOUND');
    err.name = 'NotFoundError';
    throw err;
  }
  return data as CustomerAiContext;
}

/* ==========================================================================
 *  1. 客戶分析（結構化輸出）— 對應原型 6 個 AI 按鈕
 * ========================================================================== */

export async function generateAnalysis(
  ctx: CustomerAiContext,
  type: AnalysisType,
): Promise<AdvisorSuggestion> {
  const ai = getGenAI();
  const useProModel = type === 'analyze' || type === 'allocation';

  const response = await ai.models.generateContent({
    model: useProModel ? MODELS.pro() : MODELS.fast(),
    contents: buildAnalysisPrompt(ctx, type),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: ADVISOR_SUGGESTION_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini 未回傳內容（可能觸發安全過濾或超出 token 上限）');

  return JSON.parse(text) as AdvisorSuggestion;
}

/* ==========================================================================
 *  2. 對話（串流）— 帶入歷史訊息的多輪聊天
 * ========================================================================== */

export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

/**
 * 回傳一個文字串流。第一輪把完整上下文塞進 prompt，
 * 後續輪次只送提問（上下文已在 history 裡）。
 */
export async function streamAdvisorChat(params: {
  ctx: CustomerAiContext;
  question: string;
  history: ChatTurn[];
  /** 長對話壓縮後的摘要，避免 history 無限膨脹 */
  historySummary?: string | null;
}): Promise<AsyncGenerator<string>> {
  const { ctx, question, history, historySummary } = params;
  const ai = getGenAI();

  const isFirstTurn = history.length === 0;
  const userMessage = isFirstTurn
    ? buildChatPrompt(ctx, question)
    : question;

  const systemInstruction = historySummary
    ? `${SYSTEM_INSTRUCTION}\n\n## 先前對話摘要\n${historySummary}`
    : SYSTEM_INSTRUCTION;

  const chat = ai.chats.create({
    model: MODELS.fast(),
    history: history.map((t) => ({ role: t.role, parts: [{ text: t.content }] })),
    config: {
      systemInstruction,
      temperature: 0.8,
      maxOutputTokens: 4096,
    },
  });

  const stream = await chat.sendMessageStream({ message: userMessage });

  async function* toTextStream() {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }

  return toTextStream();
}

/* ==========================================================================
 *  3. 通聯紀錄摘要 — 取代原型的 generateAISummary() 正則比對
 * ========================================================================== */

export async function analyzeCallLog(
  customerName: string,
  rawNote: string,
): Promise<CallLogAnalysis> {
  const ai = getGenAI();

  const response = await ai.models.generateContent({
    model: MODELS.fast(),
    contents: buildCallLogPrompt(customerName, rawNote),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: CALL_LOG_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini 未回傳摘要內容');

  const parsed = JSON.parse(text) as CallLogAnalysis;
  return {
    ...parsed,
    suggested_follow_up: parsed.suggested_follow_up?.trim() || null,
  };
}

/* ==========================================================================
 *  4. 對話歷史壓縮 — 訊息超過門檻時把舊訊息換成摘要
 * ========================================================================== */

export async function summarizeConversation(turns: ChatTurn[]): Promise<string> {
  const ai = getGenAI();
  const transcript = turns
    .map((t) => `${t.role === 'user' ? '理專' : 'AI'}：${t.content}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: MODELS.fast(),
    contents: `請將以下理專與 AI 助理的對話壓縮成 200 字以內的重點摘要，保留已達成的結論、客戶偏好與待辦事項。\n\n${transcript}`,
    config: { temperature: 0.2, maxOutputTokens: 512 },
  });

  return response.text ?? '';
}
