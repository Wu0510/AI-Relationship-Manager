import Link from 'next/link';
import { AiAssistantProvider, AskAiButton } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { CompleteFollowUpButton } from '@/components/reminders/CompleteFollowUpButton';
import { daysFromToday, formatTwd, relativeDay } from '@/lib/format';
import { loadShellData } from '@/lib/shell';
import { createClient } from '@/lib/supabase/server';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'followup', label: 'Follow Up' },
  { key: 'birthday', label: '生日' },
  { key: 'maturity', label: '商品到期' },
  { key: 'stale', label: '久未聯繫' },
] as const;

type RowType = 'followup' | 'birthday' | 'maturity' | 'stale';

interface ReminderRow {
  key: string;
  type: RowType;
  customerId: string;
  customerName: string;
  text: string;
  /** 排序與急迫度用；負數＝已逾期 */
  days: number;
  followUpId?: string;
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e'];

function Avatar({ name }: { name: string }) {
  const bg = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return (
    <div className="avatar avatar-sm" style={{ background: bg }}>
      {name.slice(0, 1)}
    </div>
  );
}

/** 急迫度配色 — 逾期紅、3 天內琥珀、其餘灰 */
function urgency(days: number): { color: 'rose' | 'amber' | 'slate'; label: string } {
  if (days < 0) return { color: 'rose', label: `已逾期 ${-days} 天` };
  if (days === 0) return { color: 'rose', label: '今天' };
  if (days <= 3) return { color: 'amber', label: relativeDay(days) };
  return { color: 'slate', label: relativeDay(days) };
}

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const { tab } = await searchParams;
  const activeTab = TABS.find((t) => t.key === tab)?.key ?? 'all';
  const staleDays = shell.advisor.stale_days;

  const supabase = await createClient();

  const [alertsRes, followUpsRes, assetsRes] = await Promise.all([
    supabase.from('v_customer_alerts').select('*'),
    supabase
      .from('follow_ups')
      .select('id, content, due_date, customer_id, customers(name)')
      .eq('status', 'pending')
      .order('due_date'),
    supabase
      .from('customer_assets')
      .select('id, product_name, asset_type, amount_twd, maturity_date, customer_id, customers(name)')
      .eq('is_active', true)
      .not('maturity_date', 'is', null),
  ]);

  const dbError = alertsRes.error ?? followUpsRes.error ?? assetsRes.error;

  const one = <T,>(rel: T | T[] | null | undefined): T | null =>
    !rel ? null : Array.isArray(rel) ? (rel[0] ?? null) : rel;

  const rows: ReminderRow[] = [];

  for (const f of followUpsRes.data ?? []) {
    rows.push({
      key: `fu-${f.id}`,
      type: 'followup',
      customerId: f.customer_id as string,
      customerName: one(f.customers as { name: string }[])?.name ?? '—',
      text: f.content as string,
      days: daysFromToday(f.due_date as string) ?? 0,
      followUpId: f.id as string,
    });
  }

  for (const a of alertsRes.data ?? []) {
    const b = a.days_to_birthday as number | null;
    if (b != null && b >= 0 && b <= 7) {
      rows.push({
        key: `bd-${a.customer_id}`,
        type: 'birthday',
        customerId: a.customer_id as string,
        customerName: (a.name as string) ?? '—',
        text: b === 0 ? '今天生日' : '生日提醒',
        days: b,
      });
    }
    const s = a.days_since_contact as number | null;
    if (s != null && s >= staleDays) {
      rows.push({
        key: `st-${a.customer_id}`,
        type: 'stale',
        customerId: a.customer_id as string,
        customerName: (a.name as string) ?? '—',
        text: `已 ${s} 天未聯繫・${formatTwd(Number(a.aum_twd))}`,
        days: -s, // 負數讓越久未聯繫的排越前面
      });
    }
  }

  for (const a of assetsRes.data ?? []) {
    const d = daysFromToday(a.maturity_date as string);
    if (d === null || d < -3 || d > 7) continue;
    rows.push({
      key: `mt-${a.id}`,
      type: 'maturity',
      customerId: a.customer_id as string,
      customerName: one(a.customers as { name: string }[])?.name ?? '—',
      text: `${a.asset_type} 到期：${a.product_name}・${formatTwd(Number(a.amount_twd))}`,
      days: d,
    });
  }

  rows.sort((x, y) => x.days - y.days);

  const counts = {
    all: rows.length,
    followup: rows.filter((r) => r.type === 'followup').length,
    birthday: rows.filter((r) => r.type === 'birthday').length,
    maturity: rows.filter((r) => r.type === 'maturity').length,
    stale: rows.filter((r) => r.type === 'stale').length,
  };

  const filtered = activeTab === 'all' ? rows : rows.filter((r) => r.type === activeTab);

  return (
    <AiAssistantProvider>
      <AppShell advisor={shell.advisor} todayLabel={shell.todayLabel} reminders={shell.reminders}>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="m-0 text-xl font-semibold">提醒中心</h2>
            <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--muted)' }}>
              共 {rows.length} 則・依急迫度排序（逾期優先）
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <a
                key={t.key}
                href={t.key === 'all' ? '/reminders' : `/reminders?tab=${t.key}`}
                className={`chip ${activeTab === t.key ? 'active' : ''}`}
                style={
                  activeTab === t.key
                    ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                    : undefined
                }
              >
                {t.label}
                <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 12 }}>{counts[t.key]}</span>
              </a>
            ))}
          </div>

          {dbError && (
            <div
              className="card"
              style={{ borderColor: 'var(--badge-rose-border)', background: 'var(--badge-rose-bg)' }}
            >
              <p className="m-0 text-sm" style={{ color: 'var(--badge-rose-text)' }}>
                讀取失敗：[{dbError.code}] {dbError.message}
              </p>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div className="empty-row">這個分類目前沒有提醒</div>
            ) : (
              filtered.map((r, i) => {
                const u = urgency(r.days);
                return (
                  <div
                    key={r.key}
                    className="flex items-center justify-between gap-3"
                    style={{
                      padding: '14px 16px',
                      borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <Link
                      href={`/customers/${r.customerId}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar name={r.customerName} />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-medium">{r.customerName}</p>
                        <p className="m-0 truncate text-xs" style={{ color: 'var(--muted)' }}>
                          {r.text}
                        </p>
                      </div>
                    </Link>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`badge badge-${u.color}`}>
                        {r.type === 'stale' ? `${-r.days} 天` : u.label}
                      </span>
                      {r.type === 'followup' && r.followUpId && (
                        <CompleteFollowUpButton id={r.followUpId} />
                      )}
                      <AskAiButton customerId={r.customerId} customerName={r.customerName} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </AppShell>
    </AiAssistantProvider>
  );
}
