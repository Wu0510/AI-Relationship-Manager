import Link from 'next/link';

import {
  ChevronRight,
  Users,
} from 'lucide-react';

import {
  AiAssistantProvider,
  AskAiButton,
} from '@/components/dashboard/AiAssistantDrawer';

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

  if (risk === 'RR1' || risk === 'RR2') {
    return 'emerald';
  }

  if (risk === 'RR3') {
    return 'amber';
  }

  return 'rose';
}


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
}: {
  name: string;
}) {
  const bg =
    AVATAR_COLORS[
      (name.charCodeAt(0) || 0) %
        AVATAR_COLORS.length
    ];

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: bg }}
    >
      {name.slice(0, 1)}
    </div>
  );
}


export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    risk?: string;
    sort?: string;
  }>;
}) {
  const shell =
    await loadShellData();

  if (!shell) {
    return <SignInRequired />;
  }


  const {
    q,
    risk,
    sort,
  } = await searchParams;


  const supabase =
    await createClient();


  let query = supabase
    .from('customers')
    .select(
      'id, name, age, occupation, aum_twd, invest_style, risk_level, last_contact_at, tags',
    )
    .eq('is_archived', false);


  /* ============================================================
   * Search
   * ============================================================ */

  if (q?.trim()) {
    const term =
      q
        .trim()
        .replace(/[,()]/g, '');

    query = query.or(
      `name.ilike.*${term}*,occupation.ilike.*${term}*`,
    );
  }


  if (
    risk &&
    risk !== '全部'
  ) {
    query =
      query.eq(
        'risk_level',
        risk,
      );
  }


  /* ============================================================
   * Sort
   * ============================================================ */

  if (sort === 'contact') {
    query =
      query.order(
        'last_contact_at',
        {
          ascending: true,
          nullsFirst: true,
        },
      );
  } else if (sort === 'name') {
    query =
      query.order(
        'name',
        {
          ascending: true,
        },
      );
  } else {
    query =
      query.order(
        'aum_twd',
        {
          ascending: false,
        },
      );
  }


  const {
    data,
    error,
  } = await query;


  const customers =
    (data ?? []) as unknown as Row[];


  return (
    <AiAssistantProvider>

      <AppShell
        advisor={shell.advisor}
        todayLabel={shell.todayLabel}
        reminders={shell.reminders}
      >

        <div className="flex flex-col gap-5">

          {/* ======================================================
           * HEADER
           * ====================================================== */}

          <div>

            <h1 className="m-0 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              客戶管理
            </h1>

            <p className="mb-0 mt-1 text-sm text-slate-500 dark:text-slate-400">
              共 {customers.length} 位・資料受 RLS 隔離，僅顯示您名下的客戶
            </p>

          </div>


          {/* ======================================================
           * FILTERS
           * ====================================================== */}

          <CustomerFilters />


          {/* ======================================================
           * ERROR
           * ====================================================== */}

          {error && (

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">

              <p className="m-0 text-sm text-rose-700 dark:text-rose-300">
                讀取失敗：[{error.code}] {error.message}
              </p>

            </div>

          )}


          {/* ======================================================
           * CUSTOMER TABLE CARD
           * ====================================================== */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

            <div className="overflow-x-auto">

              <table className="w-full table-fixed border-collapse">

                {/* ==================================================
                 * COLUMN WIDTHS
                 * ================================================== */}

                <colgroup>
                  <col className="w-[220px]" />
                  <col className="w-[150px]" />
                  <col className="w-[110px]" />
                  <col className="w-[150px]" />
                  <col className="w-[260px]" />
                  <col className="w-[180px]" />
                </colgroup>


                {/* ==================================================
                 * HEADER
                 * ================================================== */}

                <thead className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/50">

                  <tr>

                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      客戶
                    </th>

                    <th className="hidden px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell dark:text-slate-400">
                      資產規模
                    </th>

                    <th className="hidden px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 md:table-cell dark:text-slate-400">
                      風險屬性
                    </th>

                    <th className="hidden px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 lg:table-cell dark:text-slate-400">
                      最近聯絡
                    </th>

                    <th className="hidden px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 xl:table-cell dark:text-slate-400">
                      標籤
                    </th>

                    <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      操作
                    </th>

                  </tr>

                </thead>


                {/* ==================================================
                 * BODY
                 * ================================================== */}

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">

                  {customers.length === 0 ? (

                    <tr>

                      <td
                        colSpan={6}
                        className="px-6 py-12"
                      >

                        <div className="text-center text-sm text-slate-400">
                          {q || risk
                            ? '沒有符合條件的客戶'
                            : '目前沒有客戶資料'}
                        </div>

                      </td>

                    </tr>

                  ) : (

                    customers.map((c) => (

                      <tr
                        key={c.id}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >

                        {/* ==========================================
                         * CUSTOMER
                         * ========================================== */}

                        <td className="px-5 py-4 align-middle">

                          <Link
                            href={`/customers/${c.id}`}
                            className="flex min-w-0 items-center gap-3"
                          >

                            <Avatar name={c.name} />


                            <div className="min-w-0">

                              <p className="m-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {c.name}
                              </p>

                              <p className="mb-0 mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                {[
                                  c.age
                                    ? `${c.age} 歲`
                                    : null,

                                  c.occupation,
                                ]
                                  .filter(Boolean)
                                  .join('・')}
                              </p>

                            </div>

                          </Link>

                        </td>


                        {/* ==========================================
                         * AUM
                         * ========================================== */}

                        <td className="hidden px-5 py-4 align-middle sm:table-cell">

                          <p className="m-0 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatTwd(
                              Number(
                                c.aum_twd,
                              ),
                            )}
                          </p>

                        </td>


                        {/* ==========================================
                         * RISK
                         * ========================================== */}

                        <td className="hidden px-5 py-4 align-middle md:table-cell">

                          <span
                            className={`badge badge-${riskColor(
                              c.risk_level,
                            )}`}
                          >
                            {c.risk_level ??
                              '未評估'}
                          </span>

                        </td>


                        {/* ==========================================
                         * LAST CONTACT
                         * ========================================== */}

                        <td className="hidden px-5 py-4 align-middle lg:table-cell">

                          <span className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                            {c.last_contact_at ??
                              '—'}
                          </span>

                        </td>


                        {/* ==========================================
                         * TAGS
                         * ========================================== */}

                        <td className="hidden px-5 py-4 align-middle xl:table-cell">

                          <div className="flex max-w-[240px] flex-wrap gap-1.5">

                            {c.tags
                              .slice(0, 3)
                              .map((tag) => (

                                <span
                                  key={tag}
                                  className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  <span className="truncate">
                                    {tag}
                                  </span>
                                </span>

                              ))}


                            {c.tags.length > 3 && (

                              <span className="inline-flex items-center px-1 text-xs text-slate-400">
                                +{c.tags.length - 3}
                              </span>

                            )}

                          </div>

                        </td>


                        {/* ==========================================
                         * ACTIONS
                         * ========================================== */}

                        <td className="px-5 py-4 align-middle">

                          <div className="flex min-w-[150px] items-center justify-end gap-3">

                            <div className="shrink-0">
                              <AskAiButton
                                customerId={c.id}
                                customerName={c.name}
                              />
                            </div>


                            <Link
                              href={`/customers/${c.id}`}
                              className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              詳情

                              <ChevronRight
                                size={14}
                              />
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


          {/* ======================================================
           * FOOTER NOTE
           * ====================================================== */}

          <p className="flex items-center gap-1.5 text-xs text-slate-400">

            <Users size={12} />

            篩選條件會寫進網址，可直接分享或用瀏覽器上一頁回到前一個檢視。

          </p>

        </div>

      </AppShell>

    </AiAssistantProvider>
  );
}