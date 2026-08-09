'use client';

import { useState } from 'react';
import {
  Clock,
  Copy,
  Loader2,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { AdvisorSuggestion, AnalysisType } from '@/types/domain';

/** 對應原型的 AI_ACTIONS 六個按鈕 */
const ACTIONS: { key: AnalysisType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'analyze', label: '分析客戶', icon: Users },
  { key: 'opener', label: '產生聊天開場', icon: MessageSquare },
  { key: 'allocation', label: '分析資產配置', icon: Wallet },
  { key: 'risk', label: '分析客戶風險', icon: TrendingUp },
  { key: 'product', label: '推薦適合商品', icon: Sparkles },
  { key: 'followup', label: '產生 Follow Up 建議', icon: Clock },
];

export interface ConsoleCustomer {
  id: string;
  name: string;
  risk_level: string | null;
  aum_label: string;
}

export function AiConsole({
  customers,
  suggested,
}: {
  customers: ConsoleCustomer[];
  suggested: { id: string; name: string; reason: string }[];
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [activeType, setActiveType] = useState<AnalysisType | null>(null);
  const [result, setResult] = useState<AdvisorSuggestion | null>(null);
  const [loading, setLoading] = useState<AnalysisType | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const current = customers.find((c) => c.id === customerId);

  async function run(type: AnalysisType) {
    if (!customerId) {
      setError('請先選擇客戶');
      return;
    }
    setLoading(type);
    setError('');
    setActiveType(type);
    setResult(null);

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, type }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult(body.suggestion as AdvisorSuggestion);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function copyMessage() {
    if (!result) return;
    await navigator.clipboard.writeText(result.suggested_message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 今日建議優先聯繫 */}
      {suggested.length > 0 && (
        <div className="card">
          <div className="section-title">
            <div className="section-title-left">
              <Sparkles size={16} />
              <h3>今天建議優先聯繫</h3>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggested.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCustomerId(s.id);
                  setResult(null);
                  setActiveType(null);
                }}
                className="chip"
                style={
                  customerId === s.id
                    ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                    : undefined
                }
              >
                {s.name} · {s.reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 選客戶 + 六個功能 */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="cust" className="text-xs font-medium" style={{ color: 'var(--faint)' }}>
            選擇客戶
          </label>
          <select
            id="cust"
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setResult(null);
              setActiveType(null);
            }}
            style={{ maxWidth: 260 }}
          >
            {customers.length === 0 ? (
              <option value="">（沒有客戶資料）</option>
            ) : (
              customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.risk_level ?? '未評估'}・{c.aum_label}）
                </option>
              ))
            )}
          </select>
          {current && (
            <a
              href={`/customers/${current.id}`}
              className="text-sm font-medium"
              style={{ color: 'var(--accent)' }}
            >
              查看完整檔案 →
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              disabled={loading !== null || !customerId}
              onClick={() => run(key)}
              className={`btn ${activeType === key ? 'btn-primary' : 'btn-outline'}`}
              style={loading !== null ? { opacity: 0.6 } : undefined}
            >
              {loading === key ? (
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Icon size={15} />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{ borderColor: 'var(--badge-rose-border)', background: 'var(--badge-rose-bg)' }}
        >
          <p className="m-0 text-sm" style={{ color: 'var(--badge-rose-text)' }}>
            {error}
          </p>
        </div>
      )}

      {/* 結果 */}
      {loading !== null && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Loader2
            size={22}
            style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)', margin: '0 auto' }}
          />
          <p className="mt-3 mb-0 text-sm" style={{ color: 'var(--muted)' }}>
            正在組裝客戶上下文並請 Gemini 分析…
          </p>
        </div>
      )}

      {result && loading === null && (
        <div className="flex flex-col gap-4">
          <div className="hero-card">
            <div className="hero-tag">
              <Sparkles size={18} />
              <span>{ACTIONS.find((a) => a.key === activeType)?.label}</span>
            </div>
            <p>{result.headline}</p>
          </div>

          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <h3>為什麼是現在</h3>
              </div>
            </div>
            <p className="m-0 text-sm" style={{ lineHeight: 1.8, color: 'var(--muted)' }}>
              {result.situation}
            </p>
          </div>

          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <h3>重點觀察</h3>
              </div>
            </div>
            <ol className="m-0 flex flex-col gap-2" style={{ paddingLeft: 20 }}>
              {result.talking_points.map((p, i) => (
                <li key={i} className="text-sm" style={{ lineHeight: 1.7 }}>
                  {p}
                </li>
              ))}
            </ol>
          </div>

          <div className="card" style={{ borderColor: 'var(--accent)' }}>
            <div className="section-title">
              <div className="section-title-left">
                <MessageSquare size={16} />
                <h3>可直接發送給客戶的訊息</h3>
              </div>
              <button
                type="button"
                onClick={copyMessage}
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--accent)' }}
              >
                <Copy size={13} />
                {copied ? '已複製' : '複製'}
              </button>
            </div>
            <p className="m-0 text-sm" style={{ lineHeight: 1.9 }}>
              {result.suggested_message}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card">
              <div className="section-title">
                <div className="section-title-left">
                  <Clock size={16} />
                  <h3>建議下一步</h3>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {result.next_actions.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{a.action}</span>
                    <span
                      className={`badge badge-${a.due_in_days === 0 ? 'rose' : a.due_in_days <= 2 ? 'amber' : 'slate'}`}
                    >
                      {a.due_in_days === 0 ? '今天' : `${a.due_in_days} 天內`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ background: 'var(--badge-amber-bg)', borderColor: 'var(--badge-amber-border)' }}>
              <div className="section-title">
                <div className="section-title-left" style={{ color: 'var(--badge-amber-text)' }}>
                  <h3 style={{ color: 'var(--badge-amber-text)' }}>法遵提醒（勿轉貼給客戶）</h3>
                </div>
              </div>
              <ul className="m-0 flex flex-col gap-1.5" style={{ paddingLeft: 18 }}>
                {result.compliance_notes.map((n, i) => (
                  <li key={i} className="text-xs" style={{ lineHeight: 1.7, color: 'var(--badge-amber-text)' }}>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!result && loading === null && !error && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p className="m-0 text-sm" style={{ color: 'var(--muted)' }}>
            選擇一位客戶，點擊上方任一功能，AI 會在這裡產生結果。
          </p>
        </div>
      )}
    </div>
  );
}
