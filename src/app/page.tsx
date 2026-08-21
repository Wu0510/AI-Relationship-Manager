import Link from 'next/link';
import {
  Bell,
  Cake,
  CheckCircle2,
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

import {
  AiAssistantProvider,
  AskAiButton,
} from '@/components/dashboard/AiAssistantDrawer';

import {
  AppShell,
  type ShellReminder,
} from '@/components/layout/AppShell';

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
 * 型別
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
 * 小元件
 * ========================================================================== */

const AVATAR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
];


function Avatar({
  name,
  size = 'sm',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const bg =
    AVATAR_COLORS[
      (name.charCodeAt(0) || 0) % AVATAR_COLORS.length
    ];

  return (
    <div
      className={`avatar avatar-${size}`}
      style={{ background: bg }}
    >
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
  return (
    <span className={`badge badge-${color}`}>
      {children}
    </span>
  );
}


function riskColor(
  risk: RiskLevel | null,
): 'emerald' | 'amber' | 'rose' | 'slate' {
  if (!risk) return 'slate';

  if (risk === 'RR1' || risk === 'RR2') {
    return 'emerald';
  }

  if (risk === 'RR3') {
    return 'amber';
  }

  return 'rose';
}


/* ==========================================================================
 * 新版 KPI Card
 * ========================================================================== */

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between">

        <div>
          <p className="m-0 text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mb-0 mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Icon size={19} />
        </div>

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

      <div className="flex flex-col gap-1">
        {children}
      </div>

    </div>
  );
}


function EmptyRow({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="empty-row">
      {children}
    </div>
  );
}


/* ==========================================================================
 * Dashboard
 * ========================================================================== */

export default async function DashboardPage() {
  const shell = await loadShellData();

  if (!shell) {
    return <SignInRequired />;
  }

  const supabase = await createClient();

  const today = shell.today;
  const staleDays = shell.advisor.stale_days;
  const monthPrefix = today.slice(0, 7);


  /* ==========================================================================
   * Supabase Data
   * ========================================================================== */

  const [
    customersRes,
    alertsRes,
    tasksRes,
    assetsRes,
    followUpsRes,
  ] = await Promise.all([

    supabase
      .from('customers')
      .select(
        'id, name, age, occupation, aum_twd, invest_style, risk_level, birthday, joined_date, last_contact_at, tags, note',
      )
      .eq('is_archived', false)
      .order('aum_twd', { ascending: false }),

    supabase
      .from('v_customer_alerts')
      .select('*'),

    supabase
      .from('tasks')
      .select(
        'id, title, starts_at, is_done, customer_id',
      )
      .gte(
        'starts_at',
        `${today}T00:00:00+08:00`,
      )
      .lte(
        'starts_at',
        `${today}T23:59:59+08:00`,
      )
      .order('starts_at'),

    supabase
      .from('customer_assets')
      .select(
        'id, customer_id, asset_type, product_name, amount_twd, return_pct, maturity_date',
      )
      .eq('is_active', true),

    supabase
      .from('follow_ups')
      .select(
        'id, customer_id, content, due_date',
      )
      .eq('status', 'pending')
      .order('due_date'),
  ]);


  const dbError =
    customersRes.error ??
    alertsRes.error ??
    tasksRes.error ??
    assetsRes.error ??
    followUpsRes.error;


  const customers =
    (customersRes.data ?? []) as unknown as CustomerRow[];

  const alerts =
    (alertsRes.data ?? []) as unknown as AlertRow[];

  const tasks =
    (tasksRes.data ?? []) as unknown as TaskRow[];

  const assets =
    (assetsRes.data ?? []) as unknown as AssetRow[];

  const followUps =
    (followUpsRes.data ?? []) as unknown as FollowUpRow[];


  const byId = new Map(
    customers.map((c) => [c.id, c]),
  );

  const alertById = new Map(
    alerts.map((a) => [a.customer_id, a]),
  );


  /* ==========================================================================
   * KPI
   * ========================================================================== */

  const totalAum = customers.reduce(
    (sum, customer) =>
      sum + Number(customer.aum_twd),
    0,
  );

  const doneCount =
    tasks.filter((task) => task.is_done).length;

  const callRate =
    tasks.length
      ? Math.round(
          (doneCount / tasks.length) * 100,
        )
      : 0;

  const todayBirthdays =
    customers.filter(
      (customer) =>
        alertById.get(customer.id)
          ?.days_to_birthday === 0,
    ).length;

  const monthlyNew =
    customers.filter(
      (customer) =>
        customer.joined_date?.slice(0, 7) ===
        monthPrefix,
    ).length;


  /* ==========================================================================
   * 提醒分組
   * ========================================================================== */

  const withDays = <T,>(
    list: T[],
    get: (x: T) => string | null,
  ) =>
    list
      .map((x) => ({
        item: x,
        days: daysFromToday(get(x)),
      }))
      .filter(
        (
          x,
        ): x is {
          item: T;
          days: number;
        } => x.days !== null,
      );


  const birthdayList = customers
    .map((c) => ({
      c,
      days:
        alertById.get(c.id)
          ?.days_to_birthday ?? null,
    }))
    .filter(
      (
        x,
      ): x is {
        c: CustomerRow;
        days: number;
      } =>
        x.days !== null &&
        x.days >= 0 &&
        x.days <= 7,
    )
    .sort(
      (a, b) => a.days - b.days,
    );


  const maturing = withDays(
    assets.filter(
      (asset) => asset.maturity_date,
    ),
    (asset) => asset.maturity_date,
  ).filter(
    (x) =>
      x.days >= -3 &&
      x.days <= 7,
  );


  const cdMaturity = maturing
    .filter(
      (x) =>
        x.item.asset_type === '定存',
    )
    .sort(
      (a, b) =>
        a.days - b.days,
    );


  const fundMaturity = maturing
    .filter(
      (x) =>
        x.item.asset_type === '基金',
    )
    .sort(
      (a, b) =>
        a.days - b.days,
    );


  const etfMoves = assets.filter(
    (asset) =>
      asset.asset_type === 'ETF' &&
      asset.return_pct != null &&
      Math.abs(
        Number(asset.return_pct),
      ) >= 5,
  );


  const pendingFollowUps = withDays(
    followUps,
    (followUp) => followUp.due_date,
  ).sort(
    (a, b) =>
      a.days - b.days,
  );


  const staleList = customers
    .map((customer) => ({
      c: customer,
      days:
        alertById.get(customer.id)
          ?.days_since_contact ?? null,
    }))
    .filter(
      (
        x,
      ): x is {
        c: CustomerRow;
        days: number;
      } =>
        x.days !== null &&
        x.days >= staleDays,
    )
    .sort(
      (a, b) =>
        b.days - a.days,
    );


  /* ==========================================================================
   * 今日建議聯繫
   * Rule-based Priority Scoring
   * ========================================================================== */

  const suggestions = customers
    .map((c) => {
      const alert =
        alertById.get(c.id);

      let score = 0;
      const reasons: string[] = [];


      /* 久未聯絡 */

      if (
        alert?.days_since_contact != null &&
        alert.days_since_contact >= staleDays
      ) {
        score +=
          alert.days_since_contact;

        reasons.push(
          `已 ${alert.days_since_contact} 天未聯繫`,
        );
      }


      /* 商品到期 */

      for (
        const x of maturing.filter(
          (m) =>
            m.item.customer_id === c.id,
        )
      ) {
        score +=
          (7 - x.days) * 8;

        reasons.push(
          x.days <= 0
            ? `${x.item.product_name} 已到期`
            : `${x.item.product_name} ${x.days} 天後到期`,
        );
      }


      /* ETF 波動 */

      for (
        const e of etfMoves.filter(
          (move) =>
            move.customer_id === c.id,
        )
      ) {
        const pct =
          Number(e.return_pct);

        score +=
          Math.abs(pct) * 3;

        reasons.push(
          `${e.product_name} 報酬率 ${formatPct(pct)}`,
        );
      }


      /* 生日 */

      if (
        alert?.days_to_birthday != null &&
        alert.days_to_birthday >= 0 &&
        alert.days_to_birthday <= 7
      ) {
        score +=
          (7 - alert.days_to_birthday) * 5;

        reasons.push(
          alert.days_to_birthday === 0
            ? '今天生日'
            : `${alert.days_to_birthday} 天後生日`,
        );
      }


      /* Follow Up */

      for (
        const followUp of pendingFollowUps.filter(
          (item) =>
            item.item.customer_id === c.id &&
            item.days <= 1,
        )
      ) {
        score +=
          followUp.days < 0
            ? 60
            : 40;

        reasons.push(
          followUp.days < 0
            ? `Follow Up 已逾期 ${-followUp.days} 天`
            : followUp.days === 0
              ? 'Follow Up 今天到期'
              : 'Follow Up 明天到期',
        );
      }


      return {
        c,
        score,
        reasons,
      };
    })
    .filter(
      (suggestion) =>
        suggestion.score > 0,
    )
    .sort(
      (a, b) =>
        b.score - a.score,
    );


  const brief =
    suggestions.length === 0
      ? '今天暫無特別緊急的客戶待辦，適合安排例行關係維繫聯繫。'
      : `今天建議優先聯繫 ${Math.min(
          suggestions.length,
          3,
        )} 位客戶：` +
        suggestions
          .slice(0, 3)
          .map(
            (suggestion) =>
              `${suggestion.c.name}（${suggestion.reasons[0]}）`,
          )
          .join('、') +
        '。';


  /* ==========================================================================
   * 通知鈴
   * ========================================================================== */

  const shellReminders: ShellReminder[] = [

    ...pendingFollowUps.map(
      (followUp) => ({
        customerName:
          byId.get(
            followUp.item.customer_id,
          )?.name ?? '—',

        text:
          followUp.item.content,
      }),
    ),

    ...cdMaturity.map(
      (item) => ({
        customerName:
          byId.get(
            item.item.customer_id,
          )?.name ?? '—',

        text:
          `定存到期：${item.item.product_name}`,
      }),
    ),

    ...birthdayList.map(
      (birthday) => ({
        customerName:
          birthday.c.name,

        text:
          '生日提醒',
      }),
    ),
  ];


  /* ==========================================================================
   * 六個月客戶趨勢
   * ========================================================================== */

  const trend = Array.from(
    { length: 6 },
    (_, index) => {
      const date = new Date(
        Date.parse(
          `${today.slice(0, 7)}-01T00:00:00Z`,
        ),
      );

      date.setUTCMonth(
        date.getUTCMonth() -
          (5 - index),
      );

      const key =
        date
          .toISOString()
          .slice(0, 7);

      return {
        label:
          `${date.getUTCMonth() + 1}月`,

        value:
          customers.filter(
            (customer) =>
              (customer.joined_date ?? '') <=
              `${key}-31`,
          ).length,
      };
    },
  );


  const trendMax = Math.max(
    ...trend.map(
      (item) => item.value,
    ),
    1,
  );


  /* ==========================================================================
   * UI
   * ========================================================================== */

  return (
    <AiAssistantProvider>

      <AppShell
        advisor={shell.advisor}
        todayLabel={shell.todayLabel}
        reminders={shellReminders}
      >

        {/* ==============================================================
         * Database Error
         * ============================================================== */}

        {dbError && (
          <div
            className="mb-5 rounded-xl border p-4"
            style={{
              borderColor:
                'var(--badge-rose-border)',
              background:
                'var(--badge-rose-bg)',
            }}
          >

            <div className="flex items-start gap-3">

              <ShieldAlert
                size={18}
                style={{
                  color: 'var(--rose)',
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />

              <div className="min-w-0">

                <p
                  className="m-0 text-sm font-semibold"
                  style={{
                    color:
                      'var(--badge-rose-text)',
                  }}
                >
                  無法讀取資料庫
                </p>

                <p
                  className="mb-0 mt-1 break-all font-mono text-xs"
                  style={{
                    color:
                      'var(--badge-rose-text)',
                  }}
                >
                  {dbError.code
                    ? `[${dbError.code}] `
                    : ''}

                  {dbError.message}
                </p>

                {dbError.code === '42501' && (
                  <p
                    className="mb-0 mt-2 text-xs"
                    style={{
                      color:
                        'var(--muted)',
                      lineHeight: 1.7,
                    }}
                  >
                    這是 GRANT 缺失，不是 RLS 問題。
                    請執行

                    <code>
                      {' '}
                      supabase/migrations/20260809000001_grants.sql
                    </code>
                    。
                  </p>
                )}

              </div>

            </div>
          </div>
        )}


        {/* ==============================================================
         * PAGE INTRO
         * ============================================================== */}

        <div className="mb-6">

          <h1 className="m-0 text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>

          <p className="mb-0 mt-1 text-sm text-slate-500">
            今日客戶經營與關係管理總覽
          </p>

        </div>


        {/* ==============================================================
         * NEW KPI
         * ============================================================== */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">

          <StatCard
            label="客戶數"
            value={customers.length}
            icon={Users}
          />

          <StatCard
            label="總資產 AUM"
            value={formatTwd(totalAum)}
            icon={Wallet}
          />

          <StatCard
            label="今日待辦"
            value={`${doneCount}/${tasks.length}`}
            icon={CheckCircle2}
          />

          <StatCard
            label="今日生日"
            value={todayBirthdays}
            icon={Cake}
          />

          <StatCard
            label="本月新增客戶"
            value={monthlyNew}
            icon={TrendingUp}
          />

          <StatCard
            label="Call客完成率"
            value={`${callRate}%`}
            icon={Clock}
          />

        </div>


        {/* ==============================================================
         * TREND
         * ============================================================== */}

        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <div className="mb-5 flex items-center justify-between">

            <div>

              <p className="m-0 text-sm font-semibold text-slate-900">
                客戶成長趨勢
              </p>

              <p className="mb-0 mt-1 text-xs text-slate-400">
                近六個月累積客戶數
              </p>

            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp size={17} />
            </div>

          </div>


          <div
            className="flex items-end gap-3"
            style={{
              height: 110,
            }}
          >

            {trend.map((item) => (

              <div
                key={item.label}
                className="flex flex-1 flex-col items-center gap-2"
              >

                <div
                  className="w-full max-w-9 rounded-t-md bg-blue-500"
                  style={{
                    height:
                      Math.max(
                        Math.round(
                          (item.value /
                            trendMax) *
                            90,
                        ),
                        4,
                      ),
                  }}
                  title={`${item.label}：${item.value} 位`}
                />

                <span className="text-xs text-slate-400">
                  {item.label}
                </span>

              </div>

            ))}

          </div>

        </div>


        {/* ==============================================================
         * AI INSIGHT + TODAY TASKS
         * ============================================================== */}

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">


          {/* ============================================================
           * NEW AI PRIORITY INSIGHT
           * ============================================================ */}

          <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">

            {/* AI Header */}

            <div className="border-b border-blue-100 bg-blue-50/60 px-6 py-4">

              <div className="flex items-center justify-between gap-4">

                <div className="flex items-center gap-3">

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                    <Sparkles size={19} />
                  </div>

                  <div>

                    <p className="m-0 text-sm font-semibold text-slate-900">
                      AI Priority Insight
                    </p>

                    <p className="mb-0 mt-0.5 text-xs text-slate-500">
                      今日客戶經營建議
                    </p>

                  </div>

                </div>


                <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-600">
                  AI Generated
                </span>

              </div>

            </div>


            {/* AI Content */}

            <div className="p-6">

              <p className="m-0 text-sm leading-7 text-slate-600">
                {brief}
              </p>


              {suggestions.length > 0 && (
                <>

                  <div className="my-5 border-t border-slate-100" />


                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

                    <div className="min-w-0">

                      <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Top Priority
                      </p>

                      <div className="mt-2 flex items-center gap-3">

                        <Avatar
                          name={
                            suggestions[0]
                              .c.name
                          }
                          size="md"
                        />

                        <div className="min-w-0">

                          <p className="m-0 truncate text-sm font-semibold text-slate-900">
                            {
                              suggestions[0]
                                .c.name
                            }
                          </p>

                          <p className="mb-0 mt-1 text-xs text-slate-500">
                            {
                              suggestions[0]
                                .reasons[0]
                            }
                          </p>

                        </div>

                      </div>

                    </div>


                    <AskAiButton
                      customerId={
                        suggestions[0].c.id
                      }
                      customerName={
                        suggestions[0].c.name
                      }
                      className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      產生溝通建議 →
                    </AskAiButton>

                  </div>

                </>
              )}

            </div>

          </div>


          {/* ============================================================
           * TODAY TASKS
           * ============================================================ */}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="mb-5 flex items-center justify-between">

              <div>

                <p className="m-0 text-sm font-semibold text-slate-900">
                  今日待辦
                </p>

                <p className="mb-0 mt-1 text-xs text-slate-400">
                  {doneCount}/{tasks.length} 已完成
                </p>

              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <CheckCircle2 size={17} />
              </div>

            </div>


            <div className="flex flex-col gap-2">

              {tasks.length === 0 ? (

                <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  今天沒有排定的行程
                </div>

              ) : (

                tasks.map((task) => {

                  const customer =
                    task.customer_id
                      ? byId.get(
                          task.customer_id,
                        )
                      : null;

                  return (

                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 transition hover:bg-slate-50"
                    >

                      {task.is_done ? (

                        <CheckCircle2
                          size={18}
                          className="shrink-0 text-emerald-500"
                        />

                      ) : (

                        <Circle
                          size={18}
                          className="shrink-0 text-slate-300"
                        />

                      )}


                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          task.is_done
                            ? 'text-slate-400 line-through'
                            : 'font-medium text-slate-700'
                        }`}
                      >
                        {customer?.name ??
                          task.title}
                      </span>


                      <span className="shrink-0 text-xs font-medium text-slate-400">
                        {task.starts_at.slice(
                          11,
                          16,
                        )}
                      </span>

                    </div>

                  );
                })

              )}

            </div>

          </div>

        </div>


        {/* ==============================================================
         * REMINDER CARDS
         * ============================================================== */}

        <div className="cards-grid">

          {/* Suggested Customers */}

          <SectionCard
            title="今日建議聯絡客戶"
            icon={Users}
          >

            {suggestions.length === 0 ? (

              <EmptyRow>
                今天沒有特別建議的客戶
              </EmptyRow>

            ) : (

              suggestions
                .slice(0, 4)
                .map((suggestion) => (

                  <div
                    key={suggestion.c.id}
                    className="row-btn"
                  >

                    <Link
                      href={`/customers/${suggestion.c.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >

                      <Avatar
                        name={
                          suggestion.c.name
                        }
                      />

                      <div className="min-w-0 flex-1">

                        <p className="m-0 text-sm font-medium">
                          {suggestion.c.name}
                        </p>

                        <p
                          className="m-0 truncate text-xs"
                          style={{
                            color:
                              'var(--muted)',
                          }}
                        >
                          {
                            suggestion
                              .reasons[0]
                          }
                        </p>

                      </div>

                    </Link>


                    <AskAiButton
                      customerId={
                        suggestion.c.id
                      }
                      customerName={
                        suggestion.c.name
                      }
                    />

                  </div>

                ))

            )}

          </SectionCard>


          {/* Birthday */}

          <SectionCard
            title="生日提醒"
            icon={Cake}
          >

            {birthdayList.length === 0 ? (

              <EmptyRow>
                近期無客戶生日
              </EmptyRow>

            ) : (

              birthdayList.map(
                ({ c, days }) => (

                  <Link
                    key={c.id}
                    href={`/customers/${c.id}`}
                    className="row-btn justify-between"
                  >

                    <div className="flex min-w-0 items-center gap-3">

                      <Avatar
                        name={c.name}
                      />

                      <span className="truncate text-sm font-medium">
                        {c.name}
                      </span>

                    </div>

                    <Badge color="amber">
                      {relativeDay(days)}
                    </Badge>

                  </Link>

                ),
              )

            )}

          </SectionCard>


          {/* CD Maturity */}

          <SectionCard
            title="定存到期"
            icon={Landmark}
          >

            {cdMaturity.length === 0 ? (

              <EmptyRow>
                近期無定存到期
              </EmptyRow>

            ) : (

              cdMaturity.map(
                ({ item, days }) => {

                  const customer =
                    byId.get(
                      item.customer_id,
                    );

                  return (

                    <Link
                      key={item.id}
                      href={`/customers/${item.customer_id}?tab=products`}
                      className="row-btn justify-between"
                    >

                      <div className="flex min-w-0 items-center gap-3">

                        <Avatar
                          name={
                            customer?.name ??
                            '—'
                          }
                        />

                        <div className="min-w-0">

                          <p className="m-0 text-sm font-medium">
                            {customer?.name ??
                              '—'}
                          </p>

                          <p
                            className="m-0 truncate text-xs"
                            style={{
                              color:
                                'var(--faint)',
                            }}
                          >
                            {formatTwd(
                              Number(
                                item.amount_twd,
                              ),
                            )}
                          </p>

                        </div>

                      </div>


                      <Badge
                        color={
                          days <= 0
                            ? 'rose'
                            : 'amber'
                        }
                      >
                        {relativeDay(days)}
                      </Badge>

                    </Link>

                  );
                },
              )

            )}

          </SectionCard>


          {/* Fund */}

          <SectionCard
            title="基金到期"
            icon={Wallet}
          >

            {fundMaturity.length === 0 ? (

              <EmptyRow>
                近期無基金到期
              </EmptyRow>

            ) : (

              fundMaturity.map(
                ({ item, days }) => {

                  const customer =
                    byId.get(
                      item.customer_id,
                    );

                  return (

                    <Link
                      key={item.id}
                      href={`/customers/${item.customer_id}?tab=products`}
                      className="row-btn justify-between"
                    >

                      <div className="flex min-w-0 items-center gap-3">

                        <Avatar
                          name={
                            customer?.name ??
                            '—'
                          }
                        />

                        <div className="min-w-0">

                          <p className="m-0 text-sm font-medium">
                            {customer?.name ??
                              '—'}
                          </p>

                          <p
                            className="m-0 truncate text-xs"
                            style={{
                              color:
                                'var(--faint)',
                            }}
                          >
                            {
                              item.product_name
                            }
                          </p>

                        </div>

                      </div>


                      <Badge
                        color={
                          days <= 0
                            ? 'rose'
                            : 'amber'
                        }
                      >
                        {relativeDay(days)}
                      </Badge>

                    </Link>

                  );
                },
              )

            )}

          </SectionCard>


          {/* ETF */}

          <SectionCard
            title="ETF 追蹤"
            icon={TrendingUp}
          >

            {etfMoves.length === 0 ? (

              <EmptyRow>
                近期無明顯波動
              </EmptyRow>

            ) : (

              etfMoves.map((asset) => {

                const customer =
                  byId.get(
                    asset.customer_id,
                  );

                const pct =
                  Number(
                    asset.return_pct,
                  );

                return (

                  <Link
                    key={asset.id}
                    href={`/customers/${asset.customer_id}?tab=products`}
                    className="row-btn justify-between"
                  >

                    <div className="flex min-w-0 items-center gap-3">

                      <Avatar
                        name={
                          customer?.name ??
                          '—'
                        }
                      />

                      <div className="min-w-0">

                        <p className="m-0 text-sm font-medium">
                          {customer?.name ??
                            '—'}
                        </p>

                        <p
                          className="m-0 truncate text-xs"
                          style={{
                            color:
                              'var(--faint)',
                          }}
                        >
                          {
                            asset.product_name
                          }
                        </p>

                      </div>

                    </div>


                    <Badge
                      color={
                        pct > 0
                          ? 'emerald'
                          : 'rose'
                      }
                    >
                      {formatPct(pct)}
                    </Badge>

                  </Link>

                );
              })

            )}

          </SectionCard>


          {/* Follow Up */}

          <SectionCard
            title="Follow Up 提醒"
            icon={Clock}
          >

            {pendingFollowUps.length === 0 ? (

              <EmptyRow>
                沒有待處理 Follow Up
              </EmptyRow>

            ) : (

              pendingFollowUps
                .slice(0, 4)
                .map(
                  ({ item, days }) => {

                    const customer =
                      byId.get(
                        item.customer_id,
                      );

                    return (

                      <Link
                        key={item.id}
                        href={`/customers/${item.customer_id}?tab=followup`}
                        className="row-btn"
                      >

                        <Avatar
                          name={
                            customer?.name ??
                            '—'
                          }
                        />

                        <div className="min-w-0 flex-1">

                          <div className="flex items-center justify-between gap-2">

                            <p className="m-0 text-sm font-medium">
                              {customer?.name ??
                                '—'}
                            </p>

                            <Badge
                              color={
                                days < 0
                                  ? 'rose'
                                  : days === 0
                                    ? 'amber'
                                    : 'slate'
                              }
                            >
                              {relativeDay(
                                days,
                              )}
                            </Badge>

                          </div>


                          <p
                            className="m-0 truncate text-xs"
                            style={{
                              color:
                                'var(--muted)',
                            }}
                          >
                            {item.content}
                          </p>

                        </div>

                      </Link>

                    );
                  },
                )

            )}

          </SectionCard>

        </div>


        {/* ==============================================================
         * CUSTOMER OVERVIEW
         * ============================================================== */}

        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

          <div className="mb-4 flex items-center justify-between">

            <div>

              <div className="flex items-center gap-2">

                <LayoutDashboard
                  size={17}
                  className="text-blue-600"
                />

                <h3 className="m-0 text-sm font-semibold text-slate-900">
                  客戶總覽
                </h3>

              </div>

              <p className="mb-0 mt-1 text-xs text-slate-400">
                依 AUM 由高至低排序
              </p>

            </div>


            <span className="text-xs font-medium text-slate-400">
              共 {customers.length} 位
            </span>

          </div>


          {customers.length === 0 &&
          !dbError ? (

            <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              目前沒有客戶資料，請執行
              supabase/seed.sql
            </div>

          ) : (

            <div className="flex flex-col gap-1">

              {customers.map((customer) => {

                const alert =
                  alertById.get(
                    customer.id,
                  );

                return (

                  <div
                    key={customer.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50"
                  >

                    <Link
                      href={`/customers/${customer.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >

                      <Avatar
                        name={customer.name}
                        size="md"
                      />


                      <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2">

                          <p className="m-0 text-sm font-semibold text-slate-800">
                            {customer.name}
                          </p>

                          <Badge
                            color={riskColor(
                              customer.risk_level,
                            )}
                          >
                            {customer.risk_level ??
                              '未評估'}
                          </Badge>


                          {alert?.days_since_contact !=
                            null &&
                            alert.days_since_contact >=
                              staleDays && (

                              <Badge color="rose">
                                久未聯繫
                              </Badge>

                            )}

                        </div>


                        <p className="mb-0 mt-1 truncate text-xs text-slate-400">

                          {[
                            customer.age
                              ? `${customer.age} 歲`
                              : null,

                            customer.occupation,

                            customer.invest_style,
                          ]
                            .filter(Boolean)
                            .join('・')}

                          {customer.tags.length > 0 &&
                            ` · ${customer.tags.join(
                              '、',
                            )}`}

                        </p>

                      </div>


                      <div className="hidden shrink-0 text-right sm:block">

                        <p className="m-0 text-sm font-semibold text-slate-900">
                          {formatTwd(
                            Number(
                              customer.aum_twd,
                            ),
                          )}
                        </p>

                        <p className="mb-0 mt-1 text-xs text-slate-400">
                          最後聯繫{' '}
                          {customer.last_contact_at ??
                            '—'}
                        </p>

                      </div>

                    </Link>


                    <AskAiButton
                      customerId={
                        customer.id
                      }
                      customerName={
                        customer.name
                      }
                    />

                  </div>

                );
              })}

            </div>

          )}

        </div>


        {/* ==============================================================
         * DISCLAIMER
         * ============================================================== */}

        <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-400">

          <Bell size={12} />

          AI 建議由 Gemini 產生，僅供參考，不構成投資建議。

        </p>


      </AppShell>

    </AiAssistantProvider>
  );
}