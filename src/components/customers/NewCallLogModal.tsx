'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Sparkles, X } from 'lucide-react';
import { createInteractionLog } from '@/app/actions';

/**
 * 「新增通話紀錄」按鈕 + Modal 表單。
 *
 * 情緒選項對應資料庫的 customer_reaction enum，值本身是中文
 * （'正面' / '中立' / '保留'），所以介面直接顯示中文，避免出現
 * 「畫面寫 Positive、資料庫存正面」這種對不上的情況。
 */
const REACTIONS = [
  { value: '正面' as const, label: '正面', hint: 'Positive', cls: 'on-positive' },
  { value: '中立' as const, label: '中立', hint: 'Neutral', cls: 'on-neutral' },
  { value: '保留' as const, label: '保留', hint: 'Negative', cls: 'on-negative' },
];

const CHANNELS = [
  { value: 'phone' as const, label: '電話' },
  { value: 'visit' as const, label: '面訪' },
  { value: 'line' as const, label: 'LINE' },
  { value: 'email' as const, label: 'Email' },
  { value: 'message' as const, label: '訊息' },
  { value: 'other' as const, label: '其他' },
];

/** 以 Asia/Taipei 為基準取得今天（YYYY-MM-DD） */
function todayTpe(offsetDays = 0): string {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (offsetDays === 0) return s;
  return new Date(Date.parse(`${s}T00:00:00Z`) + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function nowTimeTpe(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function NewCallLogModal({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const [date, setDate] = useState(todayTpe());
  const [time, setTime] = useState('09:00');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]['value']>('phone');
  const [reaction, setReaction] = useState<(typeof REACTIONS)[number]['value']>('正面');
  const [rawNote, setRawNote] = useState('');
  const [followUpAction, setFollowUpAction] = useState('');
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [followUpDueDate, setFollowUpDueDate] = useState(todayTpe(7));
  const [useAi, setUseAi] = useState(true);

  function reset() {
    setDate(todayTpe());
    setTime(nowTimeTpe());
    setChannel('phone');
    setReaction('正面');
    setRawNote('');
    setFollowUpAction('');
    setCreateFollowUp(true);
    setFollowUpDueDate(todayTpe(7));
    setUseAi(true);
    setError('');
    setWarning('');
  }

  function openModal() {
    reset();
    setOpen(true);
  }

  // Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawNote.trim()) {
      setError('請輸入通話內容');
      return;
    }

    startTransition(async () => {
      setError('');
      setWarning('');

      const res = await createInteractionLog({
        customerId,
        date,
        time,
        channel,
        reaction,
        rawNote,
        followUpAction,
        createFollowUp: createFollowUp && followUpAction.trim().length > 0,
        followUpDueDate,
        useAi,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      // revalidatePath 已在 Server Action 內執行，這裡再 refresh 確保
      // 當前這個 Client Component 拿到的 RSC payload 也是最新的
      router.refresh();

      if (res.warning) {
        setWarning(res.warning);
        setTimeout(() => setOpen(false), 2600);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={openModal}>
        <Plus size={16} />
        新增通話紀錄
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!pending) setOpen(false);
          }}
        >
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="新增通話紀錄"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>新增通話紀錄・{customerName}</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="關閉"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={submit} style={{ display: 'contents' }}>
              <div className="modal-body">
                {/* 日期 / 時間 */}
                <div className="two-col">
                  <div>
                    <label htmlFor="cl-date" className="field-label">
                      通話日期
                    </label>
                    <input
                      id="cl-date"
                      type="date"
                      required
                      max={todayTpe()}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="cl-time" className="field-label">
                      時間
                    </label>
                    <input
                      id="cl-time"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* 聯繫方式 */}
                <div>
                  <label htmlFor="cl-channel" className="field-label">
                    聯繫方式
                  </label>
                  <select
                    id="cl-channel"
                    value={channel}
                    onChange={(e) =>
                      setChannel(e.target.value as (typeof CHANNELS)[number]['value'])
                    }
                  >
                    {CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 情緒 / 評價 */}
                <div>
                  <span className="field-label">通話情緒／客戶反應</span>
                  <div className="seg-group">
                    {REACTIONS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setReaction(r.value)}
                        className={`seg-btn ${reaction === r.value ? r.cls : ''}`}
                        aria-pressed={reaction === r.value}
                      >
                        {r.label}
                        <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>{r.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 摘要 */}
                <div>
                  <label htmlFor="cl-note" className="field-label">
                    對話摘要／紀錄內容
                  </label>
                  <textarea
                    id="cl-note"
                    required
                    rows={5}
                    value={rawNote}
                    onChange={(e) => setRawNote(e.target.value)}
                    placeholder="例：客戶詢問定存到期後的續存方案，對目前利率略有疑慮，希望比較高股息 ETF 的報酬與風險。"
                    style={{ resize: 'vertical', minHeight: 96 }}
                  />
                </div>

                {/* 承諾事項 */}
                <div>
                  <label htmlFor="cl-followup" className="field-label">
                    當時承諾的 Follow Up 事項
                  </label>
                  <input
                    id="cl-followup"
                    type="text"
                    value={followUpAction}
                    onChange={(e) => setFollowUpAction(e.target.value)}
                    placeholder="例：寄送定存與高股息 ETF 對照表"
                  />
                </div>

                {followUpAction.trim() && (
                  <div style={{ background: 'var(--hover)', borderRadius: 12, padding: 12 }}>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={createFollowUp}
                        onChange={(e) => setCreateFollowUp(e.target.checked)}
                      />
                      <span>
                        同時建立 Follow Up 追蹤事項
                        <span
                          style={{ display: 'block', color: 'var(--faint)', fontSize: 12, marginTop: 2 }}
                        >
                          會出現在提醒中心與首頁的待處理清單，逾期會標紅
                        </span>
                      </span>
                    </label>

                    {createFollowUp && (
                      <div style={{ marginTop: 10 }}>
                        <label htmlFor="cl-due" className="field-label">
                          到期日
                        </label>
                        <input
                          id="cl-due"
                          type="date"
                          min={date}
                          value={followUpDueDate}
                          onChange={(e) => setFollowUpDueDate(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* AI 摘要 */}
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                  />
                  <span>
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                      請 AI 整理摘要與需求標籤
                    </span>
                    <span
                      style={{ display: 'block', color: 'var(--faint)', fontSize: 12, marginTop: 2 }}
                    >
                      由 Gemini 產生 90 字摘要與客戶需求分類。AI 失敗不會影響儲存。
                    </span>
                  </span>
                </label>

                {error && (
                  <p
                    role="alert"
                    className="m-0 flex items-start gap-2 text-xs"
                    style={{
                      color: 'var(--badge-rose-text)',
                      background: 'var(--badge-rose-bg)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      lineHeight: 1.6,
                    }}
                  >
                    <AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                    {error}
                  </p>
                )}

                {warning && (
                  <p
                    className="m-0 text-xs"
                    style={{
                      color: 'var(--badge-amber-text)',
                      background: 'var(--badge-amber-bg)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      lineHeight: 1.6,
                    }}
                  >
                    {warning}
                  </p>
                )}
              </div>

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending && (
                    <Sparkles size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  )}
                  {pending ? (useAi ? 'AI 整理中…' : '儲存中…') : '儲存紀錄'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
