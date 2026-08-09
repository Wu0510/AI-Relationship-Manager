'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Loader2, MessageSquare, Send, Sparkles, X } from 'lucide-react';

/* ==========================================================================
 *  Context — 讓 server 端渲染的客戶卡片也能開啟這個 client 面板
 *  （server component 無法把 onClick 傳給 client，所以用 context + 小按鈕元件）
 * ========================================================================== */

interface PanelTarget {
  customerId: string | null;
  customerName: string;
}

const AiAssistantContext = createContext<{ open: (t: PanelTarget) => void } | null>(null);

function useAiAssistant() {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) throw new Error('AskAiButton 必須放在 <AiAssistantProvider> 內');
  return ctx;
}

/* ==========================================================================
 *  觸發按鈕 — 放在客戶卡片／列表列上
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
  const { open } = useAiAssistant();
  return (
    <button
      type="button"
      onClick={(e) => {
        // stopPropagation 擋掉祖先節點的 onClick（例如整列的展開／收合）。
        // preventDefault 是為了萬一這顆按鈕被放進 <a> 或 <form> 裡 ——
        // anchor 的導航屬於 activation behavior、不是 listener，
        // 單靠 stopPropagation 是擋不住的，只有 preventDefault 有效。
        // （目前的用法都把它與 Link 平行擺放，不會嵌套。）
        e.stopPropagation();
        e.preventDefault();
        open({ customerId, customerName });
      }}
      className={className ?? 'badge badge-indigo'}
    >
      <Sparkles size={11} />
      {children ?? 'AI 話術'}
    </button>
  );
}

/* ==========================================================================
 *  Provider + 面板本體（原型的 assistant-fab / assistant-panel）
 * ========================================================================== */

interface Message {
  role: 'user' | 'model';
  content: string;
}

const QUICK_PROMPTS = [
  '今天聯繫這位客戶，開場該說什麼？',
  '目前的資產配置有什麼問題？',
  '依風險屬性可以討論哪些商品方向？',
  '有哪些待辦或逾期事項要處理？',
];

export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState(false);
  const [target, setTarget] = useState<PanelTarget>({ customerId: null, customerName: '' });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const open = useCallback((t: PanelTarget) => {
    setTarget((prev) => {
      // 切換客戶時重置對話，避免把 A 客戶的脈絡帶到 B 客戶
      if (prev.customerId !== t.customerId) {
        setMessages([]);
        setError('');
        sessionIdRef.current = null;
      }
      return t;
    });
    setOpenState(true);
  }, []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setOpenState(false);
    setStreaming(false);
  }, []);

  useEffect(() => {
    if (!openState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openState, close]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || streaming) return;

    if (!target.customerId) {
      setError('請先從客戶卡片點「AI 話術」，助理才知道要分析哪一位客戶。');
      return;
    }

    setInput('');
    setError('');
    setStreaming(true);
    setMessages((m) => [...m, { role: 'user', content: question }, { role: 'model', content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          customerId: target.customerId,
          message: question,
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const sid = res.headers.get('X-Session-Id');
      if (sid) sessionIdRef.current = sid;
      if (!res.body) throw new Error('伺服器沒有回傳串流內容');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: 'model',
            content: next[next.length - 1].content + chunk,
          };
          return next;
        });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
      setMessages((m) => (m[m.length - 1]?.content === '' ? m.slice(0, -1) : m));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <AiAssistantContext.Provider value={{ open }}>
      {children}

      {/* ── 浮動按鈕 ─────────────────────────────────────────────────── */}
      <button
        type="button"
        className="assistant-fab"
        aria-label={openState ? '關閉 AI 助理' : '開啟 AI 助理'}
        onClick={() => (openState ? close() : setOpenState(true))}
      >
        {openState ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      {/* ── 面板 ─────────────────────────────────────────────────────── */}
      {openState && (
        <div className="assistant-panel" role="dialog" aria-label="AI 理專助理">
          <div className="assistant-head">
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span className="flex-1 truncate">
              AI 助理
              {target.customerName && (
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  {' '}
                  · {target.customerName}
                </span>
              )}
            </span>
            <button type="button" className="icon-btn" onClick={close} aria-label="關閉">
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="assistant-msgs">
            {messages.length === 0 && (
              <>
                <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
                  {target.customerId
                    ? '已載入這位客戶的持有部位、通聯紀錄與今日市場動態。挑一個問題開始：'
                    : '請先從客戶卡片點「AI 話術」，我才知道要分析哪一位客戶。'}
                </p>
                {target.customerId && (
                  <div className="flex flex-col gap-1.5">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => send(p)}
                        className="row-btn text-xs"
                        style={{ border: '1px solid var(--border)' }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`msg-row ${m.role === 'user' ? 'user' : ''}`}>
                <div className={`msg-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
                  {m.content ||
                    (streaming && (
                      <span
                        className="inline-flex items-center gap-2"
                        style={{ color: 'var(--muted)' }}
                      >
                        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        正在組裝客戶上下文…
                      </span>
                    ))}
                </div>
              </div>
            ))}

            {error && (
              <p className="badge badge-rose" style={{ whiteSpace: 'normal', lineHeight: 1.6 }}>
                {error}
              </p>
            )}
          </div>

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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="輸入問題…"
            />
            <button
              type="submit"
              className="send-btn"
              disabled={streaming || !input.trim()}
              aria-label="送出"
            >
              {streaming ? (
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
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
