import {
  NextResponse,
  type NextRequest,
} from 'next/server';

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
 * History Settings
 * ========================================================================== */

const HISTORY_LIMIT = 20;
const KEEP_RECENT = 6;


/* ==========================================================================
 * Request Schema
 *
 * market:
 * {
 *   mode: "market",
 *   message: "今天市場摘要"
 * }
 *
 * customer:
 * {
 *   mode: "customer",
 *   customerId: "...",
 *   message: "今天怎麼跟這位客戶開場？"
 * }
 * ========================================================================== */

const BodySchema =
  z.discriminatedUnion(
    'mode',
    [
      z.object({
        mode:
          z.literal(
            'market',
          ),

        message:
          z
            .string()
            .trim()
            .min(
              1,
              '訊息不可為空',
            )
            .max(
              4000,
            ),

        sessionId:
          z
            .uuid()
            .optional(),
      }),

      z.object({
        mode:
          z.literal(
            'customer',
          ),

        customerId:
          z.uuid(),

        message:
          z
            .string()
            .trim()
            .min(
              1,
              '訊息不可為空',
            )
            .max(
              4000,
            ),

        sessionId:
          z
            .uuid()
            .optional(),
      }),
    ],
  );


/* ==========================================================================
 * POST /api/ai/chat
 * ========================================================================== */

export async function POST(
  request: NextRequest,
) {
  try {

    /* ======================================================================
     * 1. Auth
     * ====================================================================== */

    const advisorId =
      await requireAdvisorId();


    const supabase =
      await createClient();


    /* ======================================================================
     * 2. Parse Request
     * ====================================================================== */

    const parsed =
      BodySchema.safeParse(
        await request.json(),
      );


    if (
      !parsed.success
    ) {
      return badRequest(
        z.prettifyError(
          parsed.error,
        ),
      );
    }


    const body =
      parsed.data;


    const mode =
      body.mode;


    const message =
      body.message;


    let sessionId =
      body.sessionId;


    /* ======================================================================
     * 3. Customer Context
     *
     * market mode 不需要客戶資料
     * ====================================================================== */

    let customerContext =
      null;


    if (
      mode ===
      'customer'
    ) {
      customerContext =
        await loadCustomerContext(
          supabase,
          body.customerId,
        );
    }


    /* ======================================================================
     * 4. Session
     * ====================================================================== */

    let historySummary:
      string | null =
      null;


    if (
      sessionId
    ) {

      const {
        data:
          session,
      } =
        await supabase
          .from(
            'chat_sessions',
          )
          .select(
            'id, summary, customer_id',
          )
          .eq(
            'id',
            sessionId,
          )
          .single();


      if (
        !session
      ) {
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
       * Create New Session
       * ==================================================================== */

      if (
        mode ===
        'customer'
      ) {

        const {
          data,
          error,
        } =
          await supabase
            .from(
              'chat_sessions',
            )
            .insert({
              advisor_id:
                advisorId,

              customer_id:
                body.customerId,

              title:
                `與 ${customerContext!.customer.name} 相關的討論`,
            })
            .select(
              'id',
            )
            .single();


        if (
          error
        ) {
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
         * chat_sessions.customer_id
         * 必須允許 NULL。
         */

        const {
          data,
          error,
        } =
          await supabase
            .from(
              'chat_sessions',
            )
            .insert({
              advisor_id:
                advisorId,

              customer_id:
                null,

              title:
                '市場助理',
            })
            .select(
              'id',
            )
            .single();


        if (
          error
        ) {
          throw new Error(
            `建立市場對話失敗：${error.message}`,
          );
        }


        sessionId =
          data.id as string;
      }
    }


    /* ======================================================================
     * 5. Read History
     * ====================================================================== */

    const {
      data:
        rows,
    } =
      await supabase
        .from(
          'chat_messages',
        )
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
            ascending:
              true,
          },
        );


    let history =
      (
        rows ??
        []
      ) as ChatTurn[];


    /* ======================================================================
     * 6. Compress Long History
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
        .from(
          'chat_sessions',
        )
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
     * 7. Save User Message
     * ====================================================================== */

    const {
      error:
        userMessageError,
    } =
      await supabase
        .from(
          'chat_messages',
        )
        .insert({
          session_id:
            sessionId,

          advisor_id:
            advisorId,

          role:
            'user',

          content:
            message,
        });


    if (
      userMessageError
    ) {
      throw new Error(
        `儲存訊息失敗：${userMessageError.message}`,
      );
    }


    /* ======================================================================
     * 8. Choose AI
     * ====================================================================== */

    const generator =
      mode ===
      'market'

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
     * 9. Streaming Response
     *
     * 防止：
     *
     * ERR_INVALID_STATE
     * Controller is already closed
     *
     * 瀏覽器中止連線或 stream 已關閉時，
     * 不再重複 enqueue / close。
     * ====================================================================== */

    const encoder =
      new TextEncoder();


    const finalSessionId =
      sessionId;


    const stream =
      new ReadableStream<
        Uint8Array
      >({

        async start(
          controller,
        ) {

          let full =
            '';


          let closed =
            false;


          /*
           * 安全送出 chunk。
           *
           * 如果 client 已經離開、
           * controller 已 close，
           * 就停止 enqueue。
           */
          const safeEnqueue =
            (
              text: string,
            ) => {

              if (
                closed
              ) {
                return false;
              }


              try {

                controller.enqueue(
                  encoder.encode(
                    text,
                  ),
                );


                return true;

              } catch (
                error
              ) {

                closed =
                  true;


                console.warn(
                  '[ai/chat] stream enqueue skipped because controller is closed',
                  error,
                );


                return false;
              }
            };


          /*
           * 安全關閉 stream。
           *
           * 避免同一個 controller
           * 被 close 兩次。
           */
          const safeClose =
            () => {

              if (
                closed
              ) {
                return;
              }


              try {

                controller.close();

              } catch (
                error
              ) {

                console.warn(
                  '[ai/chat] stream close skipped',
                  error,
                );

              } finally {

                closed =
                  true;

              }
            };


          try {

            for await (
              const chunk
              of generator
            ) {

              /*
               * 即使前端突然關閉聊天室，
               * Gemini 可能仍會繼續吐 chunk。
               *
               * 如果 stream 已失效，
               * 就停止繼續 enqueue。
               */
              if (
                closed
              ) {
                break;
              }


              full +=
                chunk;


              const sent =
                safeEnqueue(
                  chunk,
                );


              if (
                !sent
              ) {
                break;
              }
            }

          } catch (
            error
          ) {

            console.error(
              '[ai/chat] stream error',
              error,
            );


            /*
             * 只有 stream 尚未關閉時，
             * 才嘗試把錯誤訊息送到前端。
             */
            safeEnqueue(
              '\n\n⚠️ 產生回覆時發生錯誤，請重試。',
            );

          } finally {

            /*
             * 先安全結束 HTTP Stream。
             */
            safeClose();


            /* ==============================================================
             * Save Gemini Response
             * ============================================================== */

            if (
              full
            ) {

              try {

                const {
                  error:
                    messageSaveError,
                } =
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
                        process
                          .env
                          .GEMINI_MODEL ??
                        'gemini-3.6-flash',
                    });


                if (
                  messageSaveError
                ) {

                  console.error(
                    '[ai/chat] failed to save model message',
                    messageSaveError,
                  );

                }


                const {
                  error:
                    sessionUpdateError,
                } =
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


                if (
                  sessionUpdateError
                ) {

                  console.error(
                    '[ai/chat] failed to update session',
                    sessionUpdateError,
                  );

                }

              } catch (
                saveError
              ) {

                /*
                 * DB 儲存失敗不能再讓
                 * Stream lifecycle 爆掉。
                 */
                console.error(
                  '[ai/chat] save response error',
                  saveError,
                );

              }
            }
          }
        },
      });


    /* ======================================================================
     * 10. Return Stream
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

  } catch (
    error
  ) {

    return toErrorResponse(
      error,
    );

  }
}