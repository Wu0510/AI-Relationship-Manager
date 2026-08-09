import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AiAssistantProvider, AskAiButton } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { NewCallLogModal } from '@/components/customers/NewCallLogModal';
import { daysFromToday, formatDateWithWeekday, formatPct, formatTwd, relativeDay } from '@/lib/format';
import { loadShellData } from '@/lib/shell';
import { createClient } from '@/lib/supabase/server';
import type { RiskLevel } from '@/types/domain';

const TABS = [
  { key: 'basic', label: '基本資料' },
  { key: 'products', label: '持有商品' },
  { key: 'calls', label: '通話紀錄' },
  { key: 'followup', label: 'Follow Up' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e'];

function riskColor(risk: RiskLevel | null) {
  if (!risk) return 'slate';
  if (risk === 'RR1' || risk === 'RR2') return 'emerald';
  if (risk === 'RR3') return 'amber';
  return 'rose';
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = (TABS.find((t) => t.key === tab)?.key ?? 'basic') as TabKey;

  const supabase = await createClient();

  const [customerRes, assetsRes, logsRes, followUpsRes] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('customer_assets')
      .select('*')
      .eq('customer_id', id)
      .eq('is_active', true)
      .order('maturity_date', { nullsFirst: false }),
    supabase
      .from('interaction_logs')
      .select('*')
      .eq('customer_id', id)
      .order('occurred_at', { ascending: false }),
    supabase.from('follow_ups').select('*').eq('customer_id', id).order('due_date'),
  ]);

  // RLS 會讓別人的客戶查不到 → 等同不存在
  if (!customerRes.data) notFound();

  const c = customerRes.data as Record<string, unknown>;
  const name = c.name as string;
  const assets = (assetsRes.data ?? []) as Record<string, unknown>[];
  const logs = (logsRes.data ?? []) as Record<string, unknown>[];
  const followUps = (followUpsRes.data ?? []) as Record<string, unknown>[];

  const holdings = assets.reduce((s, a) => s + Number(a.amount_twd), 0);
  const daysSince = c.last_contact_at ? -(daysFromToday(c.last_contact_at as string) ?? 0) : null;
  const bg = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

  const basicRows: [string, string][] = [
    ['姓名', name],
    ['年齡', c.age ? `${c.age} 歲` : '—'],
    ['職業', (c.occupation as string) ?? '—'],
    ['家庭狀況', (c.family_status as string) ?? '—'],
    ['總資產 AUM', formatTwd(Number(c.aum_twd))],
    ['投資屬性', (c.invest_style as string) ?? '—'],
    ['風險屬性', (c.risk_level as string) ?? '未評估'],
    ['生日', c.birthday ? formatDateWithWeekday(c.birthday as string) : '—'],
    ['成為客戶', (c.joined_date as string) ?? '—'],
    [
      '最近聯絡',
      c.last_contact_at ? `${c.last_contact_at}（${daysSince} 天前）` : '尚無紀錄',
    ],
  ];

  return (
    <AiAssistantProvider>
      <AppShell advisor={shell.advisor} todayLabel={shell.todayLabel} reminders={shell.reminders}>
        <div className="flex flex-col gap-4">
          <a
            href="/customers"
            className="flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--muted)' }}
          >
            <ArrowLeft size={15} />
            返回客戶列表
          </a>

          {/* ── 客戶摘要 ─────────────────────────────────────────────── */}
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="avatar avatar-lg" style={{ background: bg }}>
                  {name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-xl font-semibold">{name}</h2>
                    <span className={`badge badge-${riskColor(c.risk_level as RiskLevel)}`}>
                      {(c.risk_level as string) ?? '未評估'}
                    </span>
                    {daysSince !== null && daysSince >= shell.advisor.stale_days && (
                      <span className="badge badge-rose">已 {daysSince} 天未聯繫</span>
                    )}
                  </div>
                  <p className="mt-1 mb-0 text-sm" style={{ color: 'var(--muted)' }}>
                    {[c.age ? `${c.age} 歲` : null, c.occupation, c.invest_style]
                      .filter(Boolean)
                      .join('・')}
                  </p>
                </div>
              </div>
              <AskAiButton customerId={id} customerName={name} className="btn btn-primary">
                請 AI 產生溝通話術
              </AskAiButton>
            </div>

            <div className="stat-grid mt-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[
                ['總資產 AUM', formatTwd(Number(c.aum_twd))],
                ['在管部位', formatTwd(holdings)],
                ['通聯紀錄', `${logs.length} 筆`],
              ].map(([label, value]) => (
                <div key={label} className="card" style={{ padding: 16, textAlign: 'center' }}>
                  <p className="m-0 text-xs" style={{ color: 'var(--faint)' }}>
                    {label}
                  </p>
                  <p className="mt-1 mb-0 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>

            {(c.tags as string[])?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(c.tags as string[]).map((t) => (
                  <span key={t} className="badge badge-indigo">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {c.note ? (
              <p className="mt-4 mb-0 text-sm" style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
                {c.note as string}
              </p>
            ) : null}
          </div>

          {/* ── 分頁（用 searchParams，不需要 client state）───────────── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              className="flex gap-1 overflow-x-auto"
              style={{ borderBottom: '1px solid var(--border)', padding: '0 8px' }}
            >
              {TABS.map((t) => (
                <a
                  key={t.key}
                  href={`/customers/${id}?tab=${t.key}`}
                  className="whitespace-nowrap px-4 py-2.5 text-sm font-medium"
                  style={{
                    borderBottom: `2px solid ${activeTab === t.key ? 'var(--accent)' : 'transparent'}`,
                    color: activeTab === t.key ? 'var(--accent)' : 'var(--muted)',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </a>
              ))}
            </div>

            <div style={{ padding: 20 }}>
              {activeTab === 'basic' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {basicRows.map(([label, value]) => (
                    <div key={label}>
                      <p className="m-0 text-xs" style={{ color: 'var(--faint)' }}>
                        {label}
                      </p>
                      <p className="mt-1 mb-0 text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'products' && (
                <div className="flex flex-col gap-2.5">
                  {assets.length === 0 ? (
                    <div className="empty-row">目前沒有在管商品</div>
                  ) : (
                    assets.map((a) => {
                      const d = a.maturity_date ? daysFromToday(a.maturity_date as string) : null;
                      const pct = a.return_pct != null ? Number(a.return_pct) : null;
                      return (
                        <div
                          key={a.id as string}
                          className="flex items-center justify-between gap-3"
                          style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="badge badge-slate">{a.asset_type as string}</span>
                              <span className="text-sm font-medium">{a.product_name as string}</span>
                            </div>
                            <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--faint)' }}>
                              {a.maturity_date
                                ? `到期日 ${formatDateWithWeekday(a.maturity_date as string)}・${relativeDay(d)}`
                                : pct !== null
                                  ? '追蹤中'
                                  : '持有中'}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p className="m-0 text-sm font-semibold">
                              {formatTwd(Number(a.amount_twd))}
                            </p>
                            {pct !== null && (
                              <p
                                className="m-0 text-xs font-medium"
                                style={{ color: pct > 0 ? 'var(--emerald)' : 'var(--rose)' }}
                              >
                                {formatPct(pct)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'calls' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="m-0 text-xs" style={{ color: 'var(--muted)' }}>
                      共 {logs.length} 筆・由新到舊
                    </p>
                    <NewCallLogModal customerId={id} customerName={name} />
                  </div>

                  {logs.length === 0 ? (
                    <div className="empty-row">
                      尚無通話紀錄，點右上角「新增通話紀錄」開始第一筆
                    </div>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={log.id as string} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: 'var(--accent)',
                              marginTop: 6,
                              flexShrink: 0,
                            }}
                          />
                          {idx < logs.length - 1 && (
                            <div style={{ width: 1, flex: 1, background: 'var(--border)' }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">
                              {formatDateWithWeekday((log.occurred_at as string).slice(0, 10))}
                            </span>
                            {log.reaction ? (
                              <span
                                className={`badge badge-${
                                  log.reaction === '正面'
                                    ? 'emerald'
                                    : log.reaction === '保留'
                                      ? 'rose'
                                      : 'slate'
                                }`}
                              >
                                {log.reaction as string}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1.5 mb-0 text-sm" style={{ lineHeight: 1.7 }}>
                            {(log.ai_summary as string) || (log.raw_note as string) || '（無內容）'}
                          </p>
                          {(log.needs as string[])?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(log.needs as string[]).map((n) => (
                                <span key={n} className="badge badge-indigo">
                                  {n}
                                </span>
                              ))}
                            </div>
                          )}
                          {log.follow_up_action ? (
                            <p className="mt-2 mb-0 text-xs" style={{ color: 'var(--muted)' }}>
                              當時承諾：{log.follow_up_action as string}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'followup' && (
                <div className="flex flex-col gap-2.5">
                  {followUps.length === 0 ? (
                    <div className="empty-row">沒有 Follow Up 事項</div>
                  ) : (
                    followUps.map((f) => {
                      const d = daysFromToday(f.due_date as string);
                      const done = f.status === 'done';
                      return (
                        <div
                          key={f.id as string}
                          className="flex items-center justify-between gap-3"
                          style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12 }}
                        >
                          <div className="min-w-0">
                            <p
                              className="m-0 text-sm"
                              style={{
                                textDecoration: done ? 'line-through' : 'none',
                                color: done ? 'var(--faint)' : 'inherit',
                              }}
                            >
                              {f.content as string}
                            </p>
                            <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--faint)' }}>
                              到期 {formatDateWithWeekday(f.due_date as string)}
                            </p>
                          </div>
                          <span
                            className={`badge badge-${
                              done ? 'emerald' : d !== null && d < 0 ? 'rose' : d === 0 ? 'amber' : 'slate'
                            }`}
                          >
                            {done ? '已完成' : relativeDay(d)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    </AiAssistantProvider>
  );
}
