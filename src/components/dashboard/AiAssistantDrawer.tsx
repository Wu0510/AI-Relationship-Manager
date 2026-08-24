'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DollarSign,
  Globe2,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Newspaper,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';


/* ==========================================================================
 * Types
 * ========================================================================== */

type AssistantMode =
  | 'market'
  | 'customer';


interface PanelTarget {
  customerId: string | null;
  customerName: string;
}


interface Message {
  role: 'user' | 'model';
  content: string;
}


interface CustomerOption {
  id: string;
  name: string;
  age: number | null;
  occupation: string | null;
  aum_twd: number;
  risk_level: string | null;
}


/* ==========================================================================
 * Context
 * ========================================================================== */

const AiAssistantContext =
  createContext<{
    open: (
      target: PanelTarget,
    ) => void;
  } | null>(null);


function useAiAssistant() {
  const ctx =
    useContext(
      AiAssistantContext,
    );

  if (!ctx) {
    throw new Error(
      'AskAiButton 必須放在 <AiAssistantProvider> 內',
    );
  }

  return ctx;
}


/* ==========================================================================
 * Customer AI Button
 * ========================================================================== */

export function AskAiButton({
  customerId,
  customerName,
  className,
  children,
}: {
  customerId: string;
  customerName: string;
  className?: string;
  children?: ReactNode;
}) {
  const { open } =
    useAiAssistant();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();

        open({
          customerId,
          customerName,
        });
      }}
      className={
        className ??
        'badge badge-indigo'
      }
    >
      <Sparkles size={11} />

      {children ??
        'AI 話術'}
    </button>
  );
}


/* ==========================================================================
 * Quick Prompts
 * ========================================================================== */

const MARKET_PROMPTS = [
  {
    label:
      '今日市場摘要',

    prompt:
      '請整理最新市場摘要，包含台股與美股的重要行情、強弱比較與理專可關注事項。',

    icon:
      Newspaper,
  },

  {
    label:
      '台股重點',

    prompt:
      '請整理最新台股行情、主要產業指數表現與理專可關注事項。',

    icon:
      TrendingUp,
  },

  {
    label:
      '美股重點',

    prompt:
      '請整理最新美股重要行情，包含 S&P 500、Nasdaq、Dow Jones 與理專可關注事項。',

    icon:
      Globe2,
  },

  {
    label:
      '匯率與利率',

    prompt:
      '請整理目前系統可取得的匯率與利率市場資訊，並清楚標示尚未接入的資料來源。',

    icon:
      DollarSign,
  },
];


const CUSTOMER_PROMPTS = [
  '今天適合跟這位客戶聊什麼？',
  '幫我產生今天的 Call 客開場話術。',
  '目前的資產配置有什麼值得注意？',
  '有哪些待辦或逾期事項需要追蹤？',
];


/* ==========================================================================
 * Helpers
 * ========================================================================== */

function formatAum(
  value: number,
) {
  if (
    value >= 100000000
  ) {
    return `NT$ ${(value / 100000000).toFixed(1)} 億`;
  }

  if (
    value >= 10000
  ) {
    return `NT$ ${Math.round(value / 10000).toLocaleString('zh-TW')} 萬`;
  }

  return `NT$ ${value.toLocaleString('zh-TW')}`;
}


/* ==========================================================================
 * Provider
 * ========================================================================== */

export function AiAssistantProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [openState, setOpenState] =
    useState(false);

  const [maximized, setMaximized] =
    useState(false);

  const [mode, setMode] =
    useState<AssistantMode>(
      'market',
    );

  const [
    target,
    setTarget,
  ] =
    useState<PanelTarget>({
      customerId: null,
      customerName: '',
    });


  /* ------------------------------------------------------------------------
   * Customer selector
   * ---------------------------------------------------------------------- */

  const [
    customers,
    setCustomers,
  ] =
    useState<
      CustomerOption[]
    >([]);

  const [
    customerSearch,
    setCustomerSearch,
  ] =
    useState('');

  const [
    loadingCustomers,
    setLoadingCustomers,
  ] =
    useState(false);

  const [
    customerLoadError,
    setCustomerLoadError,
  ] =
    useState('');


  /* ------------------------------------------------------------------------
   * Chat
   * ---------------------------------------------------------------------- */

  const [
    messages,
    setMessages,
  ] =
    useState<Message[]>([]);

  const [
    input,
    setInput,
  ] =
    useState('');

  const [
    streaming,
    setStreaming,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState('');


  const sessionIdRef =
    useRef<string | null>(
      null,
    );

  const scrollRef =
    useRef<HTMLDivElement>(
      null,
    );

  const abortRef =
    useRef<AbortController | null>(
      null,
    );


  /* ==========================================================================
   * Load Customers
   * ========================================================================== */

  const loadCustomers =
    useCallback(
      async () => {
        setLoadingCustomers(
          true,
        );

        setCustomerLoadError(
          '',
        );

        try {
          const supabase =
            createClient();

          const {
            data,
            error,
          } =
            await supabase
              .from(
                'customers',
              )
              .select(
                'id, name, age, occupation, aum_twd, risk_level',
              )
              .eq(
                'is_archived',
                false,
              )
              .order(
                'aum_twd',
                {
                  ascending:
                    false,
                },
              )
              .limit(50);


          if (error) {
            throw new Error(
              error.message,
            );
          }


          setCustomers(
            (data ??
              []) as CustomerOption[],
          );
        } catch (err) {
          setCustomerLoadError(
            err instanceof Error
              ? err.message
              : '客戶資料讀取失敗',
          );
        } finally {
          setLoadingCustomers(
            false,
          );
        }
      },
      [],
    );


  /* ==========================================================================
   * Open customer from outside
   * ========================================================================== */

  const open =
    useCallback(
      (
        selected:
          PanelTarget,
      ) => {
        setMode(
          'customer',
        );

        setTarget(
          (previous) => {
            if (
              previous.customerId !==
              selected.customerId
            ) {
              setMessages(
                [],
              );

              setError('');

              sessionIdRef.current =
                null;
            }

            return selected;
          },
        );

        setOpenState(
          true,
        );
      },
      [],
    );


  /* ==========================================================================
   * Load customers when customer tab opens
   * ========================================================================== */

  useEffect(() => {
    if (
      !openState ||
      mode !==
        'customer'
    ) {
      return;
    }

    if (
      customers.length === 0 &&
      !loadingCustomers
    ) {
      loadCustomers();
    }
  }, [
    openState,
    mode,
    customers.length,
    loadingCustomers,
    loadCustomers,
  ]);


  /* ==========================================================================
   * Filter customers
   * ========================================================================== */

  const filteredCustomers =
    useMemo(() => {
      const keyword =
        customerSearch
          .trim()
          .toLowerCase();

      if (!keyword) {
        return customers;
      }

      return customers.filter(
        (customer) => {
          return (
            customer.name
              .toLowerCase()
              .includes(
                keyword,
              ) ||
            (
              customer.occupation ??
              ''
            )
              .toLowerCase()
              .includes(
                keyword,
              ) ||
            (
              customer.risk_level ??
              ''
            )
              .toLowerCase()
              .includes(
                keyword,
              )
          );
        },
      );
    }, [
      customers,
      customerSearch,
    ]);


  /* ==========================================================================
   * Select Customer
   * ========================================================================== */

  function selectCustomer(
    customer:
      CustomerOption,
  ) {
    abortRef.current?.abort();

    setTarget({
      customerId:
        customer.id,

      customerName:
        customer.name,
    });

    setMessages([]);
    setInput('');
    setError('');
    setCustomerSearch('');
    setStreaming(false);

    sessionIdRef.current =
      null;
  }


  function clearCustomer() {
    abortRef.current?.abort();

    setTarget({
      customerId: null,
      customerName: '',
    });

    setMessages([]);
    setInput('');
    setError('');
    setStreaming(false);

    sessionIdRef.current =
      null;
  }


  /* ==========================================================================
   * Close
   * ========================================================================== */

  const close =
    useCallback(() => {
      abortRef.current?.abort();

      setOpenState(false);
      setStreaming(false);
    }, []);


  /* ==========================================================================
   * Switch Mode
   * ========================================================================== */

  function switchMode(
    nextMode:
      AssistantMode,
  ) {
    if (
      nextMode === mode
    ) {
      return;
    }

    abortRef.current?.abort();

    setMode(nextMode);

    setMessages([]);
    setInput('');
    setError('');
    setStreaming(false);

    sessionIdRef.current =
      null;
  }


  /* ==========================================================================
   * ESC Close
   * ========================================================================== */

  useEffect(() => {
    if (!openState) {
      return;
    }

    const onKey = (
      e: KeyboardEvent,
    ) => {
      if (
        e.key ===
        'Escape'
      ) {
        close();
      }
    };

    window.addEventListener(
      'keydown',
      onKey,
    );

    return () =>
      window.removeEventListener(
        'keydown',
        onKey,
      );
  }, [
    openState,
    close,
  ]);


  /* ==========================================================================
   * Auto scroll
   * ========================================================================== */

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top:
        scrollRef.current
          .scrollHeight,

      behavior:
        'smooth',
    });
  }, [messages]);


  /* ==========================================================================
   * Send
   * ========================================================================== */

  async function send(
    text: string,
  ) {
    const question =
      text.trim();

    if (
      !question ||
      streaming
    ) {
      return;
    }


    if (
      mode ===
        'customer' &&
      !target.customerId
    ) {
      setError(
        '請先選擇一位客戶。',
      );

      return;
    }


    setInput('');
    setError('');
    setStreaming(true);


    setMessages(
      (current) => [
        ...current,

        {
          role:
            'user',

          content:
            question,
        },

        {
          role:
            'model',

          content: '',
        },
      ],
    );


    const controller =
      new AbortController();

    abortRef.current =
      controller;


    try {
      const requestBody =
        mode ===
          'market'
          ? {
              mode:
                'market',

              message:
                question,

              ...(sessionIdRef.current
                ? {
                    sessionId:
                      sessionIdRef.current,
                  }
                : {}),
            }
          : {
              mode:
                'customer',

              customerId:
                target.customerId,

              message:
                question,

              ...(sessionIdRef.current
                ? {
                    sessionId:
                      sessionIdRef.current,
                  }
                : {}),
            };


      const response =
        await fetch(
          '/api/ai/chat',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            signal:
              controller.signal,

            body:
              JSON.stringify(
                requestBody,
              ),
          },
        );


      if (
        !response.ok
      ) {
        const body =
          await response
            .json()
            .catch(() => ({
              error:
                `HTTP ${response.status}`,
            }));

        throw new Error(
          body.error ??
            `HTTP ${response.status}`,
        );
      }


      const sid =
        response.headers.get(
          'X-Session-Id',
        );

      if (sid) {
        sessionIdRef.current =
          sid;
      }


      if (
        !response.body
      ) {
        throw new Error(
          '伺服器沒有回傳串流內容',
        );
      }


      const reader =
        response.body
          .getReader();

      const decoder =
        new TextDecoder();


      for (;;) {
        const {
          done,
          value,
        } =
          await reader.read();

        if (done) {
          break;
        }


        const chunk =
          decoder.decode(
            value,
            {
              stream:
                true,
            },
          );


        setMessages(
          (current) => {
            const next =
              [
                ...current,
              ];

            const last =
              next.length -
              1;

            next[last] = {
              role:
                'model',

              content:
                next[last]
                  .content +
                chunk,
            };

            return next;
          },
        );
      }
    } catch (err) {
      if (
        (
          err as Error
        ).name ===
        'AbortError'
      ) {
        return;
      }

      setError(
        (
          err as Error
        ).message,
      );


      setMessages(
        (current) =>
          current[
            current.length -
              1
          ]?.content ===
          ''
            ? current.slice(
                0,
                -1,
              )
            : current,
      );
    } finally {
      setStreaming(false);

      abortRef.current =
        null;
    }
  }


  /* ==========================================================================
   * UI
   * ========================================================================== */

  return (
    <AiAssistantContext.Provider
      value={{ open }}
    >
      {children}


      {/* ================================================================
       * Floating Button
       * ================================================================ */}

      <button
        type="button"
        className="assistant-fab"
        aria-label={
          openState
            ? '關閉 AI 助理'
            : '開啟 AI 助理'
        }
        onClick={() => {
          if (
            openState
          ) {
            close();
          } else {
            setOpenState(
              true,
            );
          }
        }}
      >
        {openState ? (
          <X size={22} />
        ) : (
          <MessageSquare
            size={22}
          />
        )}
      </button>


      {/* ================================================================
       * Panel
       * ================================================================ */}

      {openState && (
        <div
          className={`assistant-panel ${
            maximized
              ? 'assistant-panel-maximized'
              : ''
          }`}
          role="dialog"
          aria-label="AI 理專助理"
        >

          {/* Header */}

          <div className="assistant-head">

            <Sparkles
              size={16}
              style={{
                color:
                  'var(--accent)',
              }}
            />

            <span className="flex-1 truncate">
              AI Assistant
            </span>

            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                color:
                  'var(--accent)',

                background:
                  'var(--accent-light)',
              }}
            >
              BETA
            </span>

            <button
              type="button"
              className="icon-btn"
              onClick={() =>
                setMaximized(
                  (value) =>
                    !value,
                )
              }
              aria-label={
                maximized
                  ? '縮小 AI 助理'
                  : '放大 AI 助理'
              }
              title={
                maximized
                  ? '縮小'
                  : '放大'
              }
            >
              {maximized ? (
                <Minimize2 size={16} />
              ) : (
                <Maximize2 size={16} />
              )}
            </button>


            <button
              type="button"
              className="icon-btn"
              onClick={close}
              aria-label="關閉"
            >
              <X size={16} />
            </button>

          </div>


          {/* ============================================================
           * Tabs
           * ============================================================ */}

          <div
            className="grid grid-cols-2"
            style={{
              borderBottom:
                '1px solid var(--border)',
            }}
          >

            <button
              type="button"
              onClick={() =>
                switchMode(
                  'market',
                )
              }
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition"
              style={{
                color:
                  mode ===
                  'market'
                    ? 'var(--accent)'
                    : 'var(--muted)',

                borderBottom:
                  mode ===
                  'market'
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
              }}
            >
              <Globe2
                size={15}
              />

              市場助理
            </button>


            <button
              type="button"
              onClick={() =>
                switchMode(
                  'customer',
                )
              }
              className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition"
              style={{
                color:
                  mode ===
                  'customer'
                    ? 'var(--accent)'
                    : 'var(--muted)',

                borderBottom:
                  mode ===
                  'customer'
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
              }}
            >
              <UserRound
                size={15}
              />

              客戶助理
            </button>

          </div>


          {/* ============================================================
           * Selected Customer Bar
           * ============================================================ */}

          {mode ===
            'customer' &&
            target.customerId && (

            <div
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{
                borderBottom:
                  '1px solid var(--border)',
              }}
            >

              <div className="min-w-0">

                <p
                  className="m-0 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    color:
                      'var(--muted)',
                  }}
                >
                  Selected Customer
                </p>

                <p
                  className="mb-0 mt-1 truncate text-sm font-semibold"
                  style={{
                    color:
                      'var(--text)',
                  }}
                >
                  {target.customerName}
                </p>

              </div>


              <button
                type="button"
                onClick={
                  clearCustomer
                }
                className="shrink-0 text-xs font-medium"
                style={{
                  color:
                    'var(--accent)',
                }}
              >
                更換客戶
              </button>

            </div>
          )}


          {/* ============================================================
           * Main
           * ============================================================ */}

          <div
            ref={scrollRef}
            className="assistant-msgs"
          >

            {/* ==========================================================
             * CUSTOMER SELECTOR
             * ========================================================== */}

            {mode ===
              'customer' &&
              !target.customerId &&
              messages.length ===
                0 && (

              <div className="flex flex-col gap-4">

                <div>

                  <p
                    className="m-0 text-sm font-semibold"
                    style={{
                      color:
                        'var(--text)',
                    }}
                  >
                    選擇客戶
                  </p>

                  <p
                    className="mb-0 mt-1 text-xs"
                    style={{
                      color:
                        'var(--muted)',

                      lineHeight:
                        1.6,
                    }}
                  >
                    選擇客戶後，AI 會載入客戶資料、資產與通聯紀錄。
                  </p>

                </div>


                {/* Search */}

                <div className="relative">

                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{
                      color:
                        'var(--muted)',
                    }}
                  />

                  <input
                    type="text"
                    value={
                      customerSearch
                    }
                    onChange={(e) =>
                      setCustomerSearch(
                        e.target
                          .value,
                      )
                    }
                    placeholder="搜尋姓名、職業、RR..."
                    className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
                    style={{
                      border:
                        '1px solid var(--border)',

                      background:
                        'var(--surface)',

                      color:
                        'var(--text)',
                    }}
                  />

                </div>


                {/* Loading */}

                {loadingCustomers && (

                  <div
                    className="flex items-center justify-center gap-2 py-8 text-xs"
                    style={{
                      color:
                        'var(--muted)',
                    }}
                  >
                    <Loader2
                      size={14}
                      style={{
                        animation:
                          'spin 1s linear infinite',
                      }}
                    />

                    載入客戶資料...
                  </div>

                )}


                {/* Error */}

                {customerLoadError && (

                  <div className="badge badge-rose whitespace-normal">
                    {customerLoadError}
                  </div>

                )}


                {/* Customer list */}

                {!loadingCustomers &&
                  !customerLoadError && (

                  <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">

                    {filteredCustomers.length ===
                    0 ? (

                      <div
                        className="py-8 text-center text-xs"
                        style={{
                          color:
                            'var(--muted)',
                        }}
                      >
                        沒有符合條件的客戶
                      </div>

                    ) : (

                      filteredCustomers.map(
                        (
                          customer,
                        ) => (

                          <button
                            key={
                              customer.id
                            }
                            type="button"
                            onClick={() =>
                              selectCustomer(
                                customer,
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition"
                            style={{
                              border:
                                '1px solid var(--border)',

                              background:
                                'var(--surface)',
                            }}
                          >

                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                              style={{
                                background:
                                  'var(--accent)',
                              }}
                            >
                              {customer.name.slice(
                                0,
                                1,
                              )}
                            </div>


                            <div className="min-w-0 flex-1">

                              <div className="flex items-center gap-2">

                                <span
                                  className="truncate text-sm font-semibold"
                                  style={{
                                    color:
                                      'var(--text)',
                                  }}
                                >
                                  {customer.name}
                                </span>


                                {customer.risk_level && (

                                  <span
                                    className="rounded-full px-2 py-0.5 text-[10px]"
                                    style={{
                                      color:
                                        'var(--accent)',

                                      background:
                                        'var(--accent-light)',
                                    }}
                                  >
                                    {
                                      customer.risk_level
                                    }
                                  </span>

                                )}

                              </div>


                              <p
                                className="mb-0 mt-1 truncate text-xs"
                                style={{
                                  color:
                                    'var(--muted)',
                                }}
                              >
                                {[
                                  customer.age
                                    ? `${customer.age} 歲`
                                    : null,

                                  customer.occupation,

                                  formatAum(
                                    Number(
                                      customer.aum_twd,
                                    ),
                                  ),
                                ]
                                  .filter(
                                    Boolean,
                                  )
                                  .join(
                                    ' · ',
                                  )}
                              </p>

                            </div>

                          </button>

                        ),
                      )

                    )}

                  </div>

                )}

              </div>

            )}


            {/* ==========================================================
             * EMPTY MARKET
             * ========================================================== */}

            {mode ===
              'market' &&
              messages.length ===
                0 && (

              <>

                <div className="mb-4">

                  <p
                    className="m-0 text-sm font-semibold"
                    style={{
                      color:
                        'var(--text)',
                    }}
                  >
                    市場助理
                  </p>

                  <p
                    className="mb-0 mt-1 text-xs"
                    style={{
                      color:
                        'var(--muted)',

                      lineHeight:
                        1.7,
                    }}
                  >
                    目前已接入台股 TWSE 與美股市場資料。
                  </p>

                </div>


                <div className="grid grid-cols-2 gap-2">

                  {MARKET_PROMPTS.map(
                    ({
                      label,
                      prompt,
                      icon:
                        Icon,
                    }) => (

                      <button
                        key={
                          label
                        }
                        type="button"
                        onClick={() =>
                          send(
                            prompt,
                          )
                        }
                        className="rounded-xl p-3 text-left"
                        style={{
                          border:
                            '1px solid var(--border)',

                          background:
                            'var(--surface)',
                        }}
                      >

                        <Icon
                          size={15}
                          style={{
                            color:
                              'var(--accent)',
                          }}
                        />

                        <p
                          className="mb-0 mt-2 text-xs font-semibold"
                          style={{
                            color:
                              'var(--text)',
                          }}
                        >
                          {label}
                        </p>

                      </button>

                    ),
                  )}

                </div>

              </>

            )}


            {/* ==========================================================
             * SELECTED CUSTOMER QUICK PROMPTS
             * ========================================================== */}

            {mode ===
              'customer' &&
              target.customerId &&
              messages.length ===
                0 && (

              <>

                <div className="mb-4">

                  <p
                    className="m-0 text-sm font-semibold"
                    style={{
                      color:
                        'var(--text)',
                    }}
                  >
                    {target.customerName}
                  </p>

                  <p
                    className="mb-0 mt-1 text-xs"
                    style={{
                      color:
                        'var(--muted)',

                      lineHeight:
                        1.7,
                    }}
                  >
                    客戶 Context 已載入，選一個問題開始分析。
                  </p>

                </div>


                <div className="flex flex-col gap-2">

                  {CUSTOMER_PROMPTS.map(
                    (
                      prompt,
                    ) => (

                      <button
                        key={
                          prompt
                        }
                        type="button"
                        onClick={() =>
                          send(
                            prompt,
                          )
                        }
                        className="row-btn text-left text-xs"
                        style={{
                          border:
                            '1px solid var(--border)',
                        }}
                      >
                        {prompt}
                      </button>

                    ),
                  )}

                </div>

              </>

            )}


            {/* ==========================================================
             * Messages
             * ========================================================== */}

            {messages.map(
              (
                message,
                index,
              ) => (

                <div
                  key={index}
                  className={`msg-row ${
                    message.role ===
                    'user'
                      ? 'user'
                      : ''
                  }`}
                >

                  <div
                    className={`msg-bubble ${
                      message.role ===
                      'user'
                        ? 'user'
                        : 'ai'
                    }`}
                  >
                    {message.content ||

                      (streaming && (

                        <span
                          className="inline-flex items-center gap-2"
                          style={{
                            color:
                              'var(--muted)',
                          }}
                        >

                          <Loader2
                            size={13}
                            style={{
                              animation:
                                'spin 1s linear infinite',
                            }}
                          />

                          {mode ===
                          'market'
                            ? '正在整理市場資料…'
                            : '正在分析客戶資料…'}

                        </span>

                      ))}

                  </div>

                </div>

              ),
            )}


            {error && (

              <p
                className="badge badge-rose"
                style={{
                  whiteSpace:
                    'normal',

                  lineHeight:
                    1.6,
                }}
              >
                {error}
              </p>

            )}

          </div>


          {/* ============================================================
           * Input
           * ============================================================ */}

          <form
            className="assistant-input-row"
            onSubmit={(e) => {
              e.preventDefault();

              send(input);
            }}
          >

            <textarea
              rows={1}
              value={input}
              onChange={(e) =>
                setInput(
                  e.target.value,
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key ===
                    'Enter' &&
                  !e.shiftKey
                ) {
                  e.preventDefault();

                  send(input);
                }
              }}
              placeholder={
                mode ===
                'market'
                  ? '問我任何市場問題…'

                  : target.customerId
                    ? `詢問 ${target.customerName}…`

                    : '請先選擇客戶…'
              }
              disabled={
                mode ===
                  'customer' &&
                !target.customerId
              }
            />


            <button
              type="submit"
              className="send-btn"
              disabled={
                streaming ||
                !input.trim() ||
                (
                  mode ===
                    'customer' &&
                  !target.customerId
                )
              }
              aria-label="送出"
            >

              {streaming ? (

                <Loader2
                  size={15}
                  style={{
                    animation:
                      'spin 1s linear infinite',
                  }}
                />

              ) : (

                <Send size={15} />

              )}

            </button>

          </form>

        </div>
      )}

    </AiAssistantContext.Provider>
  );
}