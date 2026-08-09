import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest, toErrorResponse } from '@/lib/api';
import { generateAnalysis, loadCustomerContext } from '@/lib/gemini/service';
import { createClient, requireAdvisorId } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  customerId: z.uuid(),
  type: z.enum(['analyze', 'opener', 'allocation', 'risk', 'product', 'followup']),
  /** 是否把結果寫進 chat_sessions，方便理專回頭查 */
  persist: z.boolean().optional().default(false),
});

/**
 * POST /api/ai/analyze
 * 對應原型的 6 個 AI 分析按鈕，回傳結構化的顧問建議。
 *
 * body: { customerId, type, persist? }
 */
export async function POST(request: NextRequest) {
  try {
    const advisorId = await requireAdvisorId();
    const supabase = await createClient();

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(z.prettifyError(parsed.error));
    const { customerId, type, persist } = parsed.data;

    // RLS 保證這裡只撈得到自己的客戶
    const ctx = await loadCustomerContext(supabase, customerId);
    const suggestion = await generateAnalysis(ctx, type);

    if (persist) {
      const { data: session } = await supabase
        .from('chat_sessions')
        .insert({
          advisor_id: advisorId,
          customer_id: customerId,
          title: `${ctx.customer.name}・AI 分析`,
        })
        .select('id')
        .single();

      if (session) {
        await supabase.from('chat_messages').insert([
          { session_id: session.id, advisor_id: advisorId, role: 'user', content: `[${type}] AI 分析` },
          {
            session_id: session.id,
            advisor_id: advisorId,
            role: 'model',
            content: suggestion.suggested_message,
            meta: suggestion,
          },
        ]);
      }
    }

    return NextResponse.json({
      customer: { id: ctx.customer.id, name: ctx.customer.name },
      type,
      suggestion,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
