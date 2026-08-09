import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest, toErrorResponse } from '@/lib/api';
import {
  loadCustomerContext,
  streamAdvisorChat,
  summarizeConversation,
  type ChatTurn,
} from '@/lib/gemini/service';
import { createClient, requireAdvisorId } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** history 超過這個長度就壓縮成摘要，避免 prompt 無限膨脹 */
const HISTORY_LIMIT = 20;
const KEEP_RECENT = 6;

const BodySchema = z.object({
  customerId: z.uuid(),
  message: z.string().trim().min(1, '訊息不可為空').max(4000),
  sessionId: z.uuid().optional(),
});

/**
 * POST /api/ai/chat
 * 理專點擊某位客戶發起聊天 → 後端組裝上下文（客戶資料 + 持有部位 + 通聯紀錄 + 市場動態）
 * → 丟給 Gemini → 以 text/plain 串流回傳。
 *
 * body: { customerId, message, sessionId? }
 * 回應 header 帶 X-Session-Id，前端下一輪帶回來即可延續同一段對話。
 */
export async function POST(request: NextRequest) {
  try {
    const advisorId = await requireAdvisorId();
    const supabase = await createClient();

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(z.prettifyError(parsed.error));
    const { customerId, message } = parsed.data;
    let { sessionId } = parsed.data;

    /* ── 1. 組裝動態上下文 ───────────────────────────────────────────── */
    const ctx = await loadCustomerContext(supabase, customerId);

    /* ── 2. 取得／建立對話 session ───────────────────────────────────── */
    let historySummary: string | null = null;

    if (sessionId) {
      const { data } = await supabase
        .from('chat_sessions')
        .select('id, summary')
        .eq('id', sessionId)
        .single();
      if (!data) {
        const err = new Error('SESSION_NOT_FOUND');
        err.name = 'NotFoundError';
        throw err;
      }
      historySummary = data.summary;
    } else {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          advisor_id: advisorId,
          customer_id: customerId,
          title: `與 ${ctx.customer.name} 相關的討論`,
        })
        .select('id')
        .single();
      if (error) throw new Error(`建立對話失敗：${error.message}`);
      sessionId = data.id as string;
    }

    /* ── 3. 讀取歷史訊息 ─────────────────────────────────────────────── */
    const { data: rows } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    let history = (rows ?? []) as ChatTurn[];

    // 歷史過長 → 壓縮舊訊息成摘要，只保留最近幾輪
    if (history.length > HISTORY_LIMIT) {
      const older = history.slice(0, -KEEP_RECENT);
      historySummary = await summarizeConversation(older);
      history = history.slice(-KEEP_RECENT);
      await supabase.from('chat_sessions').update({ summary: historySummary }).eq('id', sessionId);
    }

    /* ── 4. 寫入使用者訊息 ───────────────────────────────────────────── */
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      advisor_id: advisorId,
      role: 'user',
      content: message,
    });

    /* ── 5. 串流回應，結束後把完整回覆寫回 DB ────────────────────────── */
    const generator = await streamAdvisorChat({
      ctx,
      question: message,
      history,
      historySummary,
    });

    const encoder = new TextEncoder();
    const finalSessionId = sessionId;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = '';
        try {
          for await (const chunk of generator) {
            full += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error('[ai/chat] stream error', error);
          controller.enqueue(encoder.encode('\n\n⚠️ 產生回覆時發生錯誤，請重試。'));
        } finally {
          controller.close();
          if (full) {
            await supabase.from('chat_messages').insert({
              session_id: finalSessionId,
              advisor_id: advisorId,
              role: 'model',
              content: full,
              model: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
            });
            await supabase
              .from('chat_sessions')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', finalSessionId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Session-Id': finalSessionId,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * GET /api/ai/chat?customerId=... — 取回該客戶最近一段對話（重整頁面後續接用）
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdvisorId();
    const supabase = await createClient();
    const customerId = request.nextUrl.searchParams.get('customerId');
    if (!customerId) return badRequest('缺少 customerId');

    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id, title, summary, updated_at')
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) return NextResponse.json({ session: null, messages: [] });

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ session, messages: messages ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
