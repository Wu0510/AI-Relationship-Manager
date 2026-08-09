import { CalendarCheck, CheckCircle2, Database, Palette, User, XCircle } from 'lucide-react';
import { AiAssistantProvider } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { ProfileForm, StaleDaysSlider, ThemeToggle } from '@/components/settings/SettingsForm';
import { BankSyncButton } from '@/components/BankSyncButton';
import { loadShellData } from '@/lib/shell';
import { createClient } from '@/lib/supabase/server';

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e'];

export default async function SettingsPage() {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const supabase = await createClient();

  // 各表筆數 — 順便當作資料庫連線的健康檢查
  const [customers, assets, logs, followUps, tasks, bankTx] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('customer_assets').select('id', { count: 'exact', head: true }),
    supabase.from('interaction_logs').select('id', { count: 'exact', head: true }),
    supabase.from('follow_ups').select('id', { count: 'exact', head: true }),
    supabase.from('tasks').select('id', { count: 'exact', head: true }),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }),
  ]);

  const counts = [
    ['客戶', customers.count],
    ['持有商品', assets.count],
    ['通聯紀錄', logs.count],
    ['Follow Up', followUps.count],
    ['行程', tasks.count],
    // bank_transactions 可能還沒建表 → count 會是 null，顯示 '—'
    ['銀行交易明細', bankTx.count],
  ] as const;

  const displayName = shell.advisor.name || shell.advisor.email;
  const bg = AVATAR_COLORS[(displayName.charCodeAt(0) || 0) % AVATAR_COLORS.length];

  // 客戶數異常提示：seed 重複執行過會變成 8 的倍數
  const customerCount = customers.count ?? 0;
  const seedLooksDuplicated = customerCount > 8 && customerCount % 8 === 0;

  return (
    <AiAssistantProvider>
      <AppShell advisor={shell.advisor} todayLabel={shell.todayLabel} reminders={shell.reminders}>
        <div className="flex flex-col gap-4" style={{ maxWidth: 640 }}>
          <h2 className="m-0 text-xl font-semibold">設定</h2>

          {/* ── 個人資料 ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <User size={16} />
                <h3>個人資料</h3>
              </div>
            </div>

            <div className="mb-5 flex items-center gap-4">
              <div className="avatar avatar-lg" style={{ background: bg }}>
                {displayName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="m-0 text-sm font-medium">{displayName}</p>
                <p className="mt-0.5 mb-0 text-xs" style={{ color: 'var(--faint)' }}>
                  {shell.advisor.email}
                </p>
                <p className="mt-0.5 mb-0 font-mono text-xs" style={{ color: 'var(--faint)' }}>
                  uid: {shell.advisor.id.slice(0, 8)}…
                </p>
              </div>
            </div>

            <ProfileForm
              initialName={shell.advisor.name}
              initialBranch={shell.advisor.branch ?? ''}
            />
          </div>

          {/* ── 外觀 ─────────────────────────────────────────────────── */}
          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <Palette size={16} />
                <h3>外觀</h3>
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* ── 通知設定 ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <CalendarCheck size={16} />
                <h3>通知設定</h3>
              </div>
            </div>
            <StaleDaysSlider initial={shell.advisor.stale_days} />
          </div>

          {/* ── 資料狀態 ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <Database size={16} />
                <h3>資料狀態</h3>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {counts.map(([label, n]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>
                    {label}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {n ?? '—'} 筆
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <p className="m-0 text-sm font-medium">銀行帳戶同步</p>
              <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--faint)', lineHeight: 1.7 }}>
                模擬向銀行 API 抓取名下所有客戶的交易明細並寫入 bank_transactions。
                重複同步會被唯一索引擋掉，不會產生重複資料。
              </p>
              <BankSyncButton />
            </div>

            {seedLooksDuplicated && (
              <div
                className="mt-4"
                style={{
                  background: 'var(--badge-amber-bg)',
                  border: '1px solid var(--badge-amber-border)',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <p
                  className="m-0 text-xs font-medium"
                  style={{ color: 'var(--badge-amber-text)' }}
                >
                  客戶數為 {customerCount} 筆，看起來 seed.sql 被執行了{' '}
                  {customerCount / 8} 次
                </p>
                <p
                  className="mt-1.5 mb-0 text-xs"
                  style={{ color: 'var(--badge-amber-text)', lineHeight: 1.7 }}
                >
                  在 Supabase SQL Editor 執行{' '}
                  <code>supabase/migrations/20260809000002_dedupe_seed.sql</code>{' '}
                  可清成正確的 8 筆，並加上唯一索引避免再次重複。
                </p>
              </div>
            )}
          </div>

          {/* ── 整合狀態 ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <CheckCircle2 size={16} />
                <h3>外部服務</h3>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-medium">Google Calendar</p>
                  <p className="mt-0.5 mb-0 text-xs" style={{ color: 'var(--faint)' }}>
                    授權後新增待辦會自動建立日曆行程，並可雙向讀取
                  </p>
                </div>
                <a href="/api/google/auth" className="btn btn-outline" style={{ flexShrink: 0 }}>
                  連結帳號
                </a>
              </div>

              <div
                className="flex items-center justify-between gap-3"
                style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm font-medium">Gemini</p>
                  <p className="mt-0.5 mb-0 text-xs" style={{ color: 'var(--faint)' }}>
                    模型：{process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'}
                  </p>
                </div>
                <span
                  className={`badge badge-${process.env.GEMINI_API_KEY ? 'emerald' : 'rose'}`}
                  style={{ flexShrink: 0 }}
                >
                  {process.env.GEMINI_API_KEY ? (
                    <>
                      <CheckCircle2 size={11} /> 已設定
                    </>
                  ) : (
                    <>
                      <XCircle size={11} /> 缺 API Key
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--faint)', lineHeight: 1.7 }}>
            姓名、分行與提醒閾值透過 Server Action 寫入 advisors 表，仍受 RLS 保護
            —— 你只能改到自己那一列。深色模式屬於瀏覽器偏好，存在 localStorage。
          </p>
        </div>
      </AppShell>
    </AiAssistantProvider>
  );
}
