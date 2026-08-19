import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Cake,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  LayoutDashboard,
  Landmark,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { AiAssistantProvider, AskAiButton } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell, type ShellReminder } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { loadShellData } from '@/lib/shell';
import {
  daysFromToday,
  formatPct,
  formatTwd,
  relativeDay,
} from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { RiskLevel } from '@/types/domain';

/* ==========================================================================
 *  型別（只描述本頁 select 的欄位）
 * ========================================================================== */

interface CustomerRow {
  id: string;
  name: string;
  age: number | null;
  occupation: string | null;
  aum_twd: number;
  invest_style: string | null;
  risk_level: RiskLevel | null;
  birthday: string | null;
  joined_date: string | null;
  last_contact_at: string | null;
  tags: string[];
  note: string | null;
}

interface AlertRow {
  customer_id: string;
  days_since_contact: number | null;
  days_to_birthday: number | null;
  days_to_next_maturity: number | null;
  overdue_follow_ups: number | null;
}

interface TaskRow {
  id: string;
  title: string;
  starts_at: string;
  is_done: boolean;
  customer_id: string | null;
}

interface AssetRow {
  id: string;
  customer_id: string;
  asset_type: string;
  product_name: string;
  amount_twd: number;
  return_pct: number | null;
  maturity_date: string | null;
}

interface FollowUpRow {
  id: string;
  customer_id: string;
  content: string;
  due_date: string;
}

/* ==========================================================================
 *  小元件（沿用原型的 class）
 * ========================================================================== */

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e'];

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const bg = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
  return (
    <div className={`avatar avatar-${size}`} style={{ background: bg }}>
      {name.slice(0, 1)}
    </div>
  );
}

function Badge({
  children,
  color = 'slate',
}: {
  children: React.ReactNode;
  color?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

function riskColor(risk: RiskLevel | null): 'emerald' | 'amber' | 'rose' | 'slate' {
  if (!risk) return 'slate';
  if (risk === 'RR1' || risk === 'RR2') return 'emerald';
  if (risk === 'RR3') return 'amber';
  return 'rose';
}

function TrendTag({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined) return null;
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return (
    <span className={`trend-tag trend-${dir}`}>
      {pct > 0 && <ArrowUpRight size={12} />}
      {pct < 0 && <ArrowDownRight size={12} />}
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  feature = false,
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ size?: number }>;
  trend?: number | null;
  feature?: boolean;
  delay?: number;
}) {
  return (
    <div
      className={`metric-card rise${feature ? ' metric-card--feature' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="metric-head">
        <div className="metric-icon">
          <Icon size={feature ? 20 : 17} />
        </div>
        {trend !== undefined && <TrendTag pct={trend ?? null} />}
      </div>
      <div>
        <p className="metric-value">{value}</p>
        <p className="metric-label mt-1.5">{label}</p>
        {sub && <p className="metric-sub mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="section-title">
        <div className="section-title-left">
          <Icon size={16} />
          <h3>{title}</h3>
        </div>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="empty-row">{children}</div>;
}

/* ==========================================================================
 *  Dashboard
 * ========================================================================== */

export default async function DashboardPage() {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const supabase = await createClient();
  const today = shell.today;
  const staleDays = shell.advisor.stale_days;
  const monthPrefix = today.slice(0, 7);

  const [customersRes, alertsRes, tasksRes, assetsRes, followUpsRes] = await Promise.all([
    supabase
      .from('customers')
      .select(
        'id, name, age, occupation, aum_twd, invest_style, risk_level, birthday, joined_date, last_contact_at, tags, note',
      )
      .eq('is_archived', false)
      .order('aum_twd', { ascending: false }),
    supabase.from('v_customer_alerts').select('*'),
    supabase
      .from('tasks')
      .select('id, title, starts_at, is_done, customer_id')
      .gte('starts_at', `${today}T00:00:00+08:00`)
      .lte('starts_at', `${today}T23:59:59+08:00`)
      .order('starts_at'),
    supabase
      .from('customer_assets')
      .select('id, customer_id, asset_type, product_name, amount_twd, return_pct, maturity_date')
      .eq('is_active', true),
    supabase
      .from('follow_ups')
      .select('id, customer_id, content, due_date')
      .eq('status', 'pending')
      .order('due_date'),
  ]);

  const dbError =
    customersRes.error ?? alertsRes.error ?? tasksRes.error ?? assetsRes.error ?? followUpsRes.error;

  const customers = (customersRes.data ?? []) as unknown as CustomerRow[];
  const alerts = (alertsRes.data ?? []) as unknown as AlertRow[];
  const tasks = (tasksRes.data ?? []) as unknown as TaskRow[];
  const assets = (assetsRes.data ?? []) as unknown as AssetRow[];
  const followUps = (followUpsRes.data ?? []) as unknown as FollowUpRow[];

  const byId = new Map(customers.map((c) => [c.id, c]));
  const alertById = new Map(alerts.map((a) => [a.customer_id, a]));

  /* ── KPI ─────────────────────────────────────────────────────────────── */
  const totalAum = customers.reduce((s, c) => s + Number(c.aum_twd), 0);
  const doneCount = tasks.filter((t) => t.is_done).length;
  const callRate = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const todayBirthdays = customers.filter(
    (c) => alertById.get(c.id)?.days_to_birthday === 0,
  ).length;
  const monthlyNew = customers.filter((c) => c.joined_date?.slice(0, 7) === monthPrefix).length;

  /* ── 提醒分組（對應原型 getReminders）────────────────────────────────── */
  const withDays = <T,>(list: T[], get: (x: T) => string | null) =>
    list
      .map((x) => ({ item: x, days: daysFromToday(get(x)) }))
      .filter((x): x is { item: T; days: number } => x.days !== null);

  const birthdayList = customers
    .map((c) => ({ c, days: alertById.get(c.id)?.days_to_birthday ?? null }))
    .filter((x): x is { c: CustomerRow; days: number } => x.days !== null && x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days);

  const maturing = withDays(
    assets.filter((a) => a.maturity_date),
    (a) => a.maturity_date,
  ).filter((x) => x.days >= -3 && x.days <= 7);

  const cdMaturity = maturing.filter((x) => x.item.asset_type === '定存').sort((a, b) => a.days - b.days);
  const fundMaturity = maturing.filter((x) => x.item.asset_type === '基金').sort((a, b) => a.days - b.days);
  const etfMoves = assets.filter(
    (a) => a.asset_type === 'ETF' && a.return_pct != null && Math.abs(Number(a.return_pct)) >= 5,
  );

  const pendingFollowUps = withDays(followUps, (f) => f.due_date).sort((a, b) => a.days - b.days);

  const staleList = customers
    .map((c) => ({ c, days: alertById.get(c.id)?.days_since_contact ?? null }))
    .filter((x): x is { c: CustomerRow; days: number } => x.days !== null && x.days >= staleDays)
    .sort((a, b) => b.days - a.days);

  /* ── 今日建議聯繫（規則計分，對應原型 getSuggestions）────────────────── */
  const suggestions = customers
    .map((c) => {
      const a = alertById.get(c.id);
      let score = 0;
      const reasons: string[] = [];

      if (a?.days_since_contact != null && a.days_since_contact >= staleDays) {
        score += a.days_since_contact;
        reasons.push(`已 ${a.days_since_contact} 天未聯繫`);
      }
      for (const x of maturing.filter((m) => m.item.customer_id === c.id)) {
        score += (7 - x.days) * 8;
        reasons.push(x.days <= 0 ? `${x.item.product_name} 已到期` : `${x.item.product_name} ${x.days} 天後到期`);
      }
      for (const e of etfMoves.filter((m) => m.customer_id === c.id)) {
        const pct = Number(e.return_pct);
        score += Math.abs(pct) * 3;
        reasons.push(`${e.product_name} 報酬率 ${formatPct(pct)}`);
      }
      if (a?.days_to_birthday != null && a.days_to_birthday >= 0 && a.days_to_birthday <= 7) {
        score += (7 - a.days_to_birthday) * 5;
        reasons.push(a.days_to_birthday === 0 ? '今天生日' : `${a.days_to_birthday} 天後生日`);
      }
      for (const f of pendingFollowUps.filter((f) => f.item.customer_id === c.id && f.days <= 1)) {
        score += f.days < 0 ? 60 : 40;
        reasons.push(
          f.days < 0 ? `Follow Up 已逾期 ${-f.days} 天` : f.days === 0 ? 'Follow Up 今天到期' : 'Follow Up 明天到期',
        );
      }
      return { c, score, reasons };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const brief =
    suggestions.length === 0
      ? '早安，今天暫無特別緊急的客戶待辦，適合安排例行關係維繫聯繫。'
      : `早安，今天建議優先聯繫 ${Math.min(suggestions.length, 3)} 位客戶：` +
        suggestions
          .slice(0, 3)
          .map((s) => `${s.c.name}（${s.reasons[0]}）`)
          .join('、') +
        '。';

  /* ── 通知鈴 ──────────────────────────────────────────────────────────── */
  const shellReminders: ShellReminder[] = [
    ...pendingFollowUps.map((f) => ({
      customerName: byId.get(f.item.customer_id)?.name ?? '—',
      text: f.item.content,
    })),
    ...cdMaturity.map((x) => ({
      customerName: byId.get(x.item.customer_id)?.name ?? '—',
      text: `定存到期：${x.item.product_name}`,
    })),
    ...birthdayList.map((b) => ({ customerName: b.c.name, text: '生日提醒' })),
  ];

  /* ── 近 6 個月新增客戶趨勢 ───────────────────────────────────────────── */
  const trend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`));
    d.setUTCMonth(d.getUTCMonth() - (5 - i));
    const key = d.toISOString().slice(0, 7);
    return {
      label: `${d.getUTCMonth() + 1}月`,
      value: customers.filter((c) => (c.joined_date ?? '') <= `${key}-31`).length,
    };
  });
  const trendMax = Math.max(...trend.map((t) => t.value), 1);

  /* ── 便當盒看板的增長趨勢（皆來自真實資料）─────────────────────────── */
  const prevCumulative = trend[4]?.value ?? 0;
  const custGrowthPct =
    prevCumulative > 0 ? Math.round(((customers.length - prevCumulative) / prevCumulative) * 100) : null;

  const newThisMonth = (trend[5]?.value ?? customers.length) - (trend[4]?.value ?? 0);
  const newPrevMonth = (trend[4]?.value ?? 0) - (trend[3]?.value ?? 0);
  const newGrowthPct =
    newPrevMonth > 0 ? Math.round(((newThisMonth - newPrevMonth) / newPrevMonth) * 100) : null;

  const avgAum = customers.length ? Math.round(totalAum / customers.length) : 0;
  const maxAum = customers.reduce((m, c) => Math.max(m, Number(c.aum_twd)), 0) || 1;

  return (
    <AiAssistantProvider>
      <AppShell
        advisor={shell.advisor}
        todayLabel={shell.todayLabel}
        reminders={shellReminders}
      >
        {dbError && (
          <div className="card mb-4" style={{ borderColor: 'var(--badge-rose-border)', background: 'var(--badge-rose-bg)' }}>
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 2 }} />
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold" style={{ color: 'var(--badge-rose-text)' }}>
                  無法讀取資料庫
                </p>
                <p className="mt-1 mb-0 font-mono text-xs break-all" style={{ color: 'var(--badge-rose-text)' }}>
                  {dbError.code ? `[${dbError.code}] ` : ''}
                  {dbError.message}
                </p>
                {dbError.code === '42501' && (
                  <p className="mt-2 mb-0 text-xs" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
                    這是 GRANT 缺失，不是 RLS 問題。請執行
                    <code> supabase/migrations/20260809000001_grants.sql</code>。
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 核心數據看板（Bento Grid）────────────────────────────────── */}
        <div className="bento-grid">
          <div
            className="metric-card metric-card--feature rise"
            style={{ animationDelay: '0ms' }}
          >
            <div className="metric-head">
              <div className="metric-icon">
                <Wallet size={20} />
              </div>
              <span className="trend-tag trend-up">
                <ArrowUpRight size={12} />
                本月 +{monthlyNew} 戶
              </span>
            </div>
            <div>
              <p className="metric-label">總資產規模 AUM</p>
              <p className="metric-value mt-1">{formatTwd(totalAum)}</p>
              <p className="metric-sub mt-2">
                平均每戶 {formatTwd(avgAum)}・共 {customers.length} 位客戶
              </p>
            </div>
          </div>

          <MetricCard
            label="客戶總覽"
            value={customers.length}
            sub={`本月新增 ${monthlyNew} 位`}
            icon={Users}
            trend={custGrowthPct}
            delay={80}
          />
          <MetricCard
            label="今日待辦"
            value={`${doneCount}/${tasks.length}`}
            sub={`Call 客完成率 ${callRate}%`}
            icon={CheckCircle2}
            delay={160}
          />
          <MetricCard
            label="今日生日"
            value={todayBirthdays}
            sub={todayBirthdays > 0 ? '記得送上祝福' : '今日無壽星'}
            icon={Cake}
            delay={240}
          />
          <MetricCard
            label="本月新增客戶"
            value={monthlyNew}
            sub="較上月變化"
            icon={TrendingUp}
            trend={newGrowthPct}
            delay={320}
          />
        </div>

        {/* ── 焦點：AI 每日建議 + 優先聯繫客戶 ─────────────────────────── */}
        <div className="dash-grid" style={{ marginTop: 16 }}>
          <div className="hero-card rise" style={{ animationDelay: '360ms' }}>
            <div className="hero-tag">
              <Sparkles size={18} />
              <span>AI 每日建議</span>
            </div>
            <p>{brief}</p>
            {suggestions.length > 0 && (
              <AskAiButton
                customerId={suggestions[0].c.id}
                customerName={suggestions[0].c.name}
                className="hero-btn"
              >
                問 AI 該怎麼開場 →
              </AskAiButton>
            )}
          </div>

          <div className="focus-card rise" style={{ animationDelay: '440ms' }}>
            <div className="section-title">
              <div className="section-title-left">
                <Sparkles size={16} />
                <h3>優先聯繫客戶</h3>
              </div>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                AI 智慧排序
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {suggestions.length === 0 ? (
                <EmptyRow>今天沒有特別建議的客戶</EmptyRow>
              ) : (
                suggestions.slice(0, 4).map((s, i) => (
                  <div key={s.c.id} className="glow-row">
                    {/* Link 與 AskAiButton 是兄弟節點，不是父子 ——
                        button 嵌在 a 裡是無效 HTML，而且 stopPropagation()
                        擋不住 anchor 的 activation behavior（那不是 listener）。 */}
                    <span className={`focus-rank${i === 0 ? ' top' : ''}`}>{i + 1}</span>
                    <Link
                      href={`/customers/${s.c.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar name={s.c.name} />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-sm font-medium">{s.c.name}</p>
                        <p className="m-0 truncate text-xs" style={{ color: 'var(--muted)' }}>
                          {s.reasons[0]}
                        </p>
                      </div>
                    </Link>
                    <AskAiButton customerId={s.c.id} customerName={s.c.name} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── 今日待辦 + 近 6 個月趨勢 ─────────────────────────────────── */}
        <div className="dash-grid" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <TrendingUp size={16} />
                <h3>近 6 個月客戶數趨勢</h3>
              </div>
            </div>
            <div className="flex items-end gap-3" style={{ height: 140 }}>
              {trend.map((t) => (
                <div key={t.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 40,
                      height: Math.max(Math.round((t.value / trendMax) * 116), 4),
                      borderRadius: '10px 10px 0 0',
                      background: 'linear-gradient(180deg,#818cf8,#4f46e5)',
                      boxShadow: '0 0 16px rgba(99,102,241,0.4)',
                    }}
                    title={`${t.label}：${t.value} 位`}
                  />
                  <span className="text-xs" style={{ color: 'var(--faint)' }}>
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <div className="section-title-left">
                <CheckCircle2 size={16} />
                <h3>
                  今日待辦 ({doneCount}/{tasks.length})
                </h3>
              </div>
            </div>
            <div className="todo-list">
              {tasks.length === 0 ? (
                <EmptyRow>今天沒有排定的行程</EmptyRow>
              ) : (
                tasks.map((t) => {
                  const c = t.customer_id ? byId.get(t.customer_id) : null;
                  return (
                    <div key={t.id} className="todo-item">
                      {t.is_done ? (
                        <CheckCircle2 size={18} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
                      ) : (
                        <Circle size={18} style={{ color: 'var(--faint)', flexShrink: 0 }} />
                      )}
                      <span className={`todo-name truncate ${t.is_done ? 'todo-done' : ''}`}>
                        {c?.name ?? t.title}
                      </span>
                      <span className="todo-time">{t.starts_at.slice(11, 16)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── 提醒卡 ───────────────────────────────────────────────────── */}
        <div className="cards-grid">
          <SectionCard title="生日提醒" icon={Cake}>
            {birthdayList.length === 0 ? (
              <EmptyRow>近期無客戶生日</EmptyRow>
            ) : (
              birthdayList.map(({ c, days }) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="row-btn justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.name} />
                    <span className="truncate text-sm font-medium">{c.name}</span>
                  </div>
                  <Badge color="amber">{relativeDay(days)}</Badge>
                </Link>
              ))
            )}
          </SectionCard>

          <SectionCard title="定存到期" icon={Landmark}>
            {cdMaturity.length === 0 ? (
              <EmptyRow>近期無定存到期</EmptyRow>
            ) : (
              cdMaturity.map(({ item, days }) => {
                const c = byId.get(item.customer_id);
                return (
                  <Link
                    key={item.id}
                    href={`/customers/${item.customer_id}?tab=products`}
                    className="row-btn justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c?.name ?? '—'} />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-medium">{c?.name ?? '—'}</p>
                        <p className="m-0 truncate text-xs" style={{ color: 'var(--faint)' }}>
                          {formatTwd(Number(item.amount_twd))}
                        </p>
                      </div>
                    </div>
                    <Badge color={days <= 0 ? 'rose' : 'amber'}>{relativeDay(days)}</Badge>
                  </Link>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="基金到期" icon={Wallet}>
            {fundMaturity.length === 0 ? (
              <EmptyRow>近期無基金到期</EmptyRow>
            ) : (
              fundMaturity.map(({ item, days }) => {
                const c = byId.get(item.customer_id);
                return (
                  <Link
                    key={item.id}
                    href={`/customers/${item.customer_id}?tab=products`}
                    className="row-btn justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c?.name ?? '—'} />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-medium">{c?.name ?? '—'}</p>
                        <p className="m-0 truncate text-xs" style={{ color: 'var(--faint)' }}>
                          {item.product_name}
                        </p>
                      </div>
                    </div>
                    <Badge color={days <= 0 ? 'rose' : 'amber'}>{relativeDay(days)}</Badge>
                  </Link>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="ETF 追蹤" icon={TrendingUp}>
            {etfMoves.length === 0 ? (
              <EmptyRow>近期無明顯波動</EmptyRow>
            ) : (
              etfMoves.map((e) => {
                const c = byId.get(e.customer_id);
                const pct = Number(e.return_pct);
                return (
                  <Link
                    key={e.id}
                    href={`/customers/${e.customer_id}?tab=products`}
                    className="row-btn justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c?.name ?? '—'} />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-medium">{c?.name ?? '—'}</p>
                        <p className="m-0 truncate text-xs" style={{ color: 'var(--faint)' }}>
                          {e.product_name}
                        </p>
                      </div>
                    </div>
                    <Badge color={pct > 0 ? 'emerald' : 'rose'}>{formatPct(pct)}</Badge>
                  </Link>
                );
              })
            )}
          </SectionCard>

          <SectionCard title="Follow Up 提醒" icon={Clock}>
            {pendingFollowUps.length === 0 ? (
              <EmptyRow>沒有待處理 Follow Up</EmptyRow>
            ) : (
              pendingFollowUps.slice(0, 4).map(({ item, days }) => {
                const c = byId.get(item.customer_id);
                return (
                  <Link
                    key={item.id}
                    href={`/customers/${item.customer_id}?tab=followup`}
                    className="row-btn"
                  >
                    <Avatar name={c?.name ?? '—'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="m-0 text-sm font-medium">{c?.name ?? '—'}</p>
                        <Badge color={days < 0 ? 'rose' : days === 0 ? 'amber' : 'slate'}>
                          {relativeDay(days)}
                        </Badge>
                      </div>
                      <p className="m-0 truncate text-xs" style={{ color: 'var(--muted)' }}>
                        {item.content}
                      </p>
                    </div>
                  </Link>
                )
              })
            )}
          </SectionCard>
        </div>

        {/* ── 客戶總覽 ─────────────────────────────────────────────────── */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-title">
            <div className="section-title-left">
              <LayoutDashboard size={16} />
              <h3>客戶總覽（依 AUM 排序）</h3>
            </div>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              共 {customers.length} 位
            </span>
          </div>

          {customers.length === 0 && !dbError ? (
            <EmptyRow>目前沒有客戶資料，請執行 supabase/seed.sql</EmptyRow>
          ) : (
            <div className="flex flex-col gap-1">
              {customers.map((c, i) => {
                const a = alertById.get(c.id);
                const aumPct = Math.max(Math.round((Number(c.aum_twd) / maxAum) * 100), 3);
                const stale =
                  a?.days_since_contact != null && a.days_since_contact >= staleDays;
                return (
                  <div key={c.id} className="glow-row">
                    {/* 整列除了右側 AI 按鈕以外都可點擊。Link 與按鈕平行擺放，
                        不把按鈕包進 Link ——那是無效 HTML，且 stopPropagation()
                        無法阻止 anchor 導航（activation behavior 不是 listener）。 */}
                    <span className="hidden w-6 shrink-0 text-center text-xs font-semibold sm:block" style={{ color: 'var(--faint)' }}>
                      {i + 1}
                    </span>
                    <Link
                      href={`/customers/${c.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar name={c.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="m-0 text-sm font-semibold">{c.name}</p>
                          <Badge color={riskColor(c.risk_level)}>{c.risk_level ?? '未評估'}</Badge>
                          {c.occupation && <Badge color="slate">{c.occupation}</Badge>}
                          {c.invest_style && <Badge color="indigo">{c.invest_style}</Badge>}
                          {c.tags.slice(0, 2).map((t) => (
                            <Badge key={t} color="slate">
                              {t}
                            </Badge>
                          ))}
                          {stale && <Badge color="rose">久未聯繫</Badge>}
                        </div>
                        <p className="m-0 mt-0.5 truncate text-xs" style={{ color: 'var(--faint)' }}>
                          {[c.age ? `${c.age} 歲` : null, `最後聯繫 ${c.last_contact_at ?? '—'}`]
                            .filter(Boolean)
                            .join('・')}
                        </p>
                      </div>
                      <div className="hidden shrink-0 items-center gap-3 sm:flex">
                        <div className="h-10 w-16 shrink-0 self-center">
                          <div className="flex h-full flex-col justify-center gap-1.5">
                            <p className="m-0 text-right text-sm font-semibold">
                              {formatTwd(Number(c.aum_twd))}
                            </p>
                            <div className="aum-bar" style={{ width: `${aumPct}%` }} />
                          </div>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--faint)' }} />
                      </div>
                    </Link>
                    <AskAiButton customerId={c.id} customerName={c.name} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-xs" style={{ color: 'var(--faint)' }}>
          <Bell size={12} />
          AI 建議由 Gemini 產生，僅供參考，不構成投資建議。
        </p>
      </AppShell>
    </AiAssistantProvider>
  );
}
