import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import {
  badRequest,
  toErrorResponse,
} from '@/lib/api';

import {
  loadCustomerContext,
  streamAdvisorChat,
  streamMarketChat,
  summarizeConversation,
  type ChatTurn,
} from '@/lib/gemini/service';

import {
  createClient,
  requireAdvisorId,
} from '@/lib/supabase/server';


export const runtime = 'nodejs';
export const maxDuration = 60;


/* ==========================================================================
 *  History Settings
 * ========================================================================== */

const HISTORY_LIMIT = 20;
const KEEP_RECENT = 6;


/* ==========================================================================
 *  Request Schema
 *
 *  market:
 *  {
 *    mode: "market",
 *    message: "今天市場摘要"
 *  }
 *
 *  customer:
 *  {
 *    mode: "customer",
 *    customerId: "...",
 *    message: "今天怎麼跟這位客戶開場？"
 *  }
 * ========================================================================== */

const BodySchema = z.discriminatedUnion(
  'mode',
  [
    z.object({
      mode: z.literal('market'),

      message: z
        .string()
        .trim()
        .min(1, '訊息不可為空')
        .max(4000),

      sessionId:
        z.uuid().optional(),
    }),

    z.object({
      mode: z.literal('customer'),

      customerId:
        z.uuid(),

      message: z
        .string()
        .trim()
        .min(1, '訊息不可為空')
        .max(4000),

      sessionId:
        z.uuid().optional(),
    }),
  ],
);


/* ==========================================================================
 *  POST /api/ai/chat
 * ========================================================================== */

export async function POST(
  request: NextRequest,
) {
  try {
    /* ======================================================================
     *  1. Auth
     * ====================================================================== */

    const advisorId =
      await requireAdvisorId();

    const supabase =
      await createClient();


    /* ======================================================================
     *  2. Parse Request
     * ====================================================================== */

    const parsed =
      BodySchema.safeParse(
        await request.json(),
      );


    if (!parsed.success) {
      return badRequest(
        z.prettifyError(
          parsed.error,
        ),
      );
    }


    const body = parsed.data;

    const mode =
      body.mode;

    const message =
      body.message;

    let sessionId =
      body.sessionId;


    /* ======================================================================
     *  3. Customer Context
     *
     *  market mode 不需要客戶資料
     * ====================================================================== */

    let customerContext = null;

    if (
      mode === 'customer'
    ) {
      customerContext =
        await loadCustomerContext(
          supabase,
          body.customerId,
        );
    }


    /* ======================================================================
     *  4. Session
     * ====================================================================== */

    let historySummary:
      string | null = null;


    if (sessionId) {
      const {
        data: session,
      } = await supabase
        .from('chat_sessions')
        .select(
          'id, summary, customer_id',
        )
        .eq(
          'id',
          sessionId,
        )
        .single();


      if (!session) {
        const err =
          new Error(
            'SESSION_NOT_FOUND',
          );

        err.name =
          'NotFoundError';

        throw err;
      }


      historySummary =
        session.summary;
    } else {
      /* ====================================================================
       *  Create New Session
       * ==================================================================== */

      if (
        mode === 'customer'
      ) {
        const {
          data,
          error,
        } = await supabase
          .from('chat_sessions')
          .insert({
            advisor_id:
              advisorId,

            customer_id:
              body.customerId,

            title:
              `與 ${customerContext!.customer.name} 相關的討論`,
          })
          .select('id')
          .single();


        if (error) {
          throw new Error(
            `建立對話失敗：${error.message}`,
          );
        }


        sessionId =
          data.id as string;
      } else {
        /*
         * 市場模式沒有 customerId。
         *
         * 前提：
         * chat_sessions.customer_id 必須允許 NULL。
         *
         * 如果你的 Supabase 欄位目前是 NOT NULL，
         * 等一下測試時會看到 DB error，
         * 我們再改 schema。
         */

        const {
          data,
          error,
        } = await supabase
          .from('chat_sessions')
          .insert({
            advisor_id:
              advisorId,

            customer_id:
              null,

            title:
              '市場助理',
          })
          .select('id')
          .single();


        if (error) {
          throw new Error(
            `建立市場對話失敗：${error.message}`,
          );
        }


        sessionId =
          data.id as string;
      }
    }


    /* ======================================================================
     *  5. Read History
     * ====================================================================== */

    const {
      data: rows,
    } = await supabase
      .from('chat_messages')
      .select(
        'role, content',
      )
      .eq(
        'session_id',
        sessionId,
      )
      .order(
        'created_at',
        {
          ascending: true,
        },
      );


    let history =
      (rows ?? []) as ChatTurn[];


    /* ======================================================================
     *  6. Compress Long History
     * ====================================================================== */

    if (
      history.length >
      HISTORY_LIMIT
    ) {
      const older =
        history.slice(
          0,
          -KEEP_RECENT,
        );


      historySummary =
        await summarizeConversation(
          older,
        );


      history =
        history.slice(
          -KEEP_RECENT,
        );


      await supabase
        .from('chat_sessions')
        .update({
          summary:
            historySummary,
        })
        .eq(
          'id',
          sessionId,
        );
    }


    /* ======================================================================
     *  7. Save User Message
     * ====================================================================== */

    const {
      error: userMessageError,
    } = await supabase
      .from('chat_messages')
      .insert({
        session_id:
          sessionId,

        advisor_id:
          advisorId,

        role: 'user',

        content:
          message,
      });


    if (userMessageError) {
      throw new Error(
        `儲存訊息失敗：${userMessageError.message}`,
      );
    }


    /* ======================================================================
     *  8. Choose AI
     * ====================================================================== */

    const generator =
      mode === 'market'
        ? await streamMarketChat({
            question:
              message,

            history,

            historySummary,
          })
        : await streamAdvisorChat({
            ctx:
              customerContext!,

            question:
              message,

            history,

            historySummary,
          });


    /* ======================================================================
     *  9. Streaming Response
     * ====================================================================== */

    const encoder =
      new TextEncoder();

    const finalSessionId =
      sessionId;


    const stream =
      new ReadableStream<Uint8Array>({
        async start(
          controller,
        ) {
          let full = '';


          try {
            for await (
              const chunk
              of generator
            ) {
              full +=
                chunk;

              controller.enqueue(
                encoder.encode(
                  chunk,
                ),
              );
            }
          } catch (error) {
            console.error(
              '[ai/chat] stream error',
              error,
            );


            controller.enqueue(
              encoder.encode(
                '\n\n⚠️ 產生回覆時發生錯誤，請重試。',
              ),
            );
          } finally {
            controller.close();


            /* ==============================================================
             * Save Gemini Response
             * ============================================================== */

            if (full) {
              await supabase
                .from(
                  'chat_messages',
                )
                .insert({
                  session_id:
                    finalSessionId,

                  advisor_id:
                    advisorId,

                  role:
                    'model',

                  content:
                    full,

                  model:
                    process.env
                      .GEMINI_MODEL ??
                    'gemini-3.6-flash',
                });


              await supabase
                .from(
                  'chat_sessions',
                )
                .update({
                  updated_at:
                    new Date()
                      .toISOString(),
                })
                .eq(
                  'id',
                  finalSessionId,
                );
            }
          }
        },
      });


    /* ======================================================================
     *  10. Return Stream
     * ====================================================================== */

    return new Response(
      stream,
      {
        headers: {
          'Content-Type':
            'text/plain; charset=utf-8',

          'Cache-Control':
            'no-cache, no-transform',

          'X-Session-Id':
            finalSessionId,
        },
      },
    );
  } catch (error) {
    return toErrorResponse(
      error,
    );
  }
}


/* ==========================================================================
 *  GET /api/ai/chat
 *
 *  目前保留原本用途：
 *  取得指定客戶最近一次對話
 * ========================================================================== */

export async function GET(
  request: NextRequest,
) {
  try {
    await requireAdvisorId();

    const supabase =
      await createClient();


    const customerId =
      request.nextUrl.searchParams.get(
        'customerId',
      );


    if (!customerId) {
      return badRequest(
        '缺少 customerId',
      );
    }


    const {
      data: session,
    } = await supabase
      .from('chat_sessions')
      .select(
        'id, title, summary, updated_at',
      )
      .eq(
        'customer_id',
        customerId,
      )
      .order(
        'updated_at',
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();


    if (!session) {
      return NextResponse.json({
        session: null,
        messages: [],
      });
    }


    const {
      data: messages,
    } = await supabase
      .from('chat_messages')
      .select(
        'id, role, content, created_at',
      )
      .eq(
        'session_id',
        session.id,
      )
      .order(
        'created_at',
        {
          ascending: true,
        },
      );


    return NextResponse.json({
      session,
      messages:
        messages ?? [],
    });
  } catch (error) {
    return toErrorResponse(
      error,
    );
  }
}