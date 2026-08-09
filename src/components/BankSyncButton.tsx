'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Landmark, Loader2, RefreshCw } from 'lucide-react';

/**
 * 「同步銀行帳戶資料」按鈕。
 *
 * 打 POST /api/bank-sync → 模擬抓取並寫入 bank_transactions → router.refresh()
 * 讓 Server Component 重新查詢（不需要手動管理列表狀態）。
 */

/** Loading 期間輪播的階段提示，讓等待有進度感 */
const STAGES = [
  '正在安全連線至銀行 API…',
  '驗證 OAuth 授權憑證…',
  '讀取帳戶交易明細…',
  '解析並分類交易資料…',
  '寫入資料庫…',
];

interface SyncResult {
  success: boolean;
  inserted: number;
  skipped: number;
  generated: number;
  customers: number;
  summary?: {
    income: number;
    expense: number;
    net: number;
    byCategory: Record<string, number>;
  };
  timing?: { bankLatencyMs: number; totalMs: number };
  error?: string;
  hint?: string;
}

export function BankSyncButton({
  customerId,
  days = 60,
  perCustomer = 12,
  label = '同步銀行帳戶資料',
  className,
}: {
  /** 指定則只同步該客戶，省略則同步名下全部客戶 */
  customerId?: string;
  days?: number;
  perCustomer?: number;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 輪播階段提示
  useEffect(() => {
    if (!loading) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setStage(0);
    timerRef.current = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 700);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  // 成功提示 6 秒後自動收起
  useEffect(() => {
    if (!result?.success) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  async function sync() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/bank-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(customerId ? { customerId } : {}), days, perCustomer }),
      });

      const body = (await res.json()) as SyncResult;

      if (!res.ok || !body.success) {
        setError({ message: body.error ?? `HTTP ${res.status}`, hint: body.hint });
        return;
      }

      setResult(body);
      // 讓當前頁面的 Server Component 重新查詢，列表就會出現新資料
      router.refresh();
    } catch (err) {
      setError({ message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={sync}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-70"
        style={{
          background: loading
            ? 'var(--muted)'
            : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          boxShadow: loading ? 'none' : '0 8px 20px rgba(79,70,229,.28)',
        }}
      >
        {loading ? (
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <Landmark size={16} />
        )}
        {loading ? '同步中…' : label}
      </button>

      {/* ── Loading 階段提示 ─────────────────────────────────────────────── */}
      {loading && (
        <div
          className="mt-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
          style={{ background: 'var(--active-bg)', border: '1px solid var(--badge-indigo-border)' }}
        >
          <RefreshCw
            size={14}
            style={{ color: 'var(--accent)', animation: 'spin 1.4s linear infinite', flexShrink: 0 }}
          />
          <div className="min-w-0">
            <p className="m-0 text-xs font-medium" style={{ color: 'var(--active-text)' }}>
              {STAGES[stage]}
            </p>
            <div
              className="mt-1.5"
              style={{
                height: 3,
                borderRadius: 999,
                background: 'var(--badge-indigo-border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${((stage + 1) / STAGES.length) * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: 999,
                  transition: 'width .5s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 成功 ─────────────────────────────────────────────────────────── */}
      {result?.success && !loading && (
        <div
          className="mt-3 rounded-xl px-3.5 py-3"
          style={{
            background: 'var(--badge-emerald-bg)',
            border: '1px solid var(--badge-emerald-border)',
          }}
        >
          <p
            className="m-0 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--badge-emerald-text)' }}
          >
            <CheckCircle2 size={13} />
            同步完成 — 新增 {result.inserted} 筆
            {result.skipped > 0 && `，略過 ${result.skipped} 筆重複`}
          </p>

          <p
            className="mt-1.5 mb-0 text-xs"
            style={{ color: 'var(--badge-emerald-text)', opacity: 0.85, lineHeight: 1.6 }}
          >
            涵蓋 {result.customers} 位客戶
            {result.summary && (
              <>
                ・收入 NT$ {result.summary.income.toLocaleString('zh-TW')} ・支出 NT${' '}
                {result.summary.expense.toLocaleString('zh-TW')}
              </>
            )}
            {result.timing && `・耗時 ${(result.timing.totalMs / 1000).toFixed(1)}s`}
          </p>

          {result.skipped > 0 && (
            <p
              className="mt-1.5 mb-0 text-xs"
              style={{ color: 'var(--badge-emerald-text)', opacity: 0.7, lineHeight: 1.6 }}
            >
              重複的筆數是靠 (advisor_id, external_id) 唯一索引擋掉的 —— 重按同步不會產生重複資料。
            </p>
          )}
        </div>
      )}

      {/* ── 失敗 ─────────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          className="mt-3 rounded-xl px-3.5 py-3"
          style={{ background: 'var(--badge-rose-bg)', border: '1px solid var(--badge-rose-border)' }}
        >
          <p
            className="m-0 flex items-start gap-1.5 text-xs font-medium"
            style={{ color: 'var(--badge-rose-text)', lineHeight: 1.6 }}
          >
            <AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
            {error.message}
          </p>
          {error.hint && (
            <p
              className="mt-1.5 mb-0 text-xs"
              style={{ color: 'var(--badge-rose-text)', opacity: 0.85, lineHeight: 1.6 }}
            >
              {error.hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
