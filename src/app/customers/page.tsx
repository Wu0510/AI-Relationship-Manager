import Link from 'next/link';
import { ChevronRight, Users } from 'lucide-react';
import { AiAssistantProvider, AskAiButton } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { CustomerFilters } from '@/components/customers/CustomerFilters';
import { formatTwd } from '@/lib/format';
import { loadShellData } from '@/lib/shell';
import { createClient } from '@/lib/supabase/server';
import type { RiskLevel } from '@/types/domain';

interface Row {
  id: string;
  name: string;
  age: number | null;
  occupation: string | null;
  aum_twd: number;
  invest_style: string | null;
  risk_level: RiskLevel | null;
  last_contact_at: string | null;
  tags: string[];
}

function riskColor(risk: RiskLevel | null) {
  if (!risk) return 'slate';
  if (risk === 'RR1' || risk === 'RR2') return 'emerald';
  if (risk === 'RR3') return 'amber';
  return 'rose';
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

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; risk?: string; sort?: string }>;
}) {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const { q, risk, sort } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from('customers')
    .select('id, name, age, occupation, aum_twd, invest_style, risk_level, last_contact_at, tags')
    .eq('is_archived', false);

  // 搜尋姓名或職業（PostgREST 的 or 語法，%*% 是 ilike 的萬用字元）
  if (q?.trim()) {
    const term = q.trim().replace(/[,()]/g, '');
    query = query.or(`name.ilike.*${term}*,occupation.ilike.*${term}*`);
  }
  if (risk && risk !== '全部') query = query.eq('risk_level', risk);

  if (sort === 'contact') query = query.order('last_contact_at', { ascending: true, nullsFirst: true });
  else if (sort === 'name') query = query.order('name', { ascending: true });
  else query = query.order('aum_twd', { ascending: false });

  const { data, error } = await query;
  const customers = (data ?? []) as unknown as Row[];

  return (
    <AiAssistantProvider>
      <AppShell advisor={shell.advisor} todayLabel={shell.todayLabel} reminders={shell.reminders}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-semibold">客戶管理</h2>
              <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--muted)' }}>
                共 {customers.length} 位・資料受 RLS 隔離，僅顯示您名下的客戶
              </p>
            </div>
          </div>

          <CustomerFilters />

          {error && (
            <div
              className="card"
              style={{ borderColor: 'var(--badge-rose-border)', background: 'var(--badge-rose-bg)' }}
            >
              <p className="m-0 text-sm" style={{ color: 'var(--badge-rose-text)' }}>
                讀取失敗：[{error.code}] {error.message}
              </p>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>客戶</th>
                    <th className="hidden sm:table-cell">資產規模</th>
                    <th className="hidden md:table-cell">風險屬性</th>
                    <th className="hidden lg:table-cell">最近聯絡</th>
                    <th className="hidden xl:table-cell">標籤</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-row">
                          {q || risk ? '沒有符合條件的客戶' : '目前沒有客戶資料'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/customers/${c.id}`} className="flex items-center gap-3">
                            <Avatar name={c.name} />
                            <div className="min-w-0">
                              <p className="m-0 text-sm font-medium">{c.name}</p>
                              <p className="m-0 truncate text-xs" style={{ color: 'var(--muted)' }}>
                                {[c.age ? `${c.age} 歲` : null, c.occupation].filter(Boolean).join('・')}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="hidden font-medium sm:table-cell">
                          {formatTwd(Number(c.aum_twd))}
                        </td>
                        <td className="hidden md:table-cell">
                          <span className={`badge badge-${riskColor(c.risk_level)}`}>
                            {c.risk_level ?? '未評估'}
                          </span>
                        </td>
                        <td className="hidden lg:table-cell" style={{ color: 'var(--muted)' }}>
                          {c.last_contact_at ?? '—'}
                        </td>
                        <td className="hidden xl:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            {c.tags.slice(0, 2).map((t) => (
                              <span key={t} className="badge badge-slate">
                                {t}
                              </span>
                            ))}
                            {c.tags.length > 2 && (
                              <span className="text-xs" style={{ color: 'var(--faint)' }}>
                                +{c.tags.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            <AskAiButton customerId={c.id} customerName={c.name} />
                            <Link
                              href={`/customers/${c.id}`}
                              className="flex items-center gap-0.5 text-sm font-medium"
                              style={{ color: 'var(--accent)' }}
                            >
                              詳情
                              <ChevronRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--faint)' }}>
            <Users size={12} />
            篩選條件會寫進網址，可直接分享或用瀏覽器上一頁回到前一個檢視。
          </p>
        </div>
      </AppShell>
    </AiAssistantProvider>
  );
}
