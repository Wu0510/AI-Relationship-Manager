import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { AiAssistantProvider } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { NewTaskModal, type TaskCustomerOption } from '@/components/calendar/NewTaskModal';
import { formatDateWithWeekday, formatTwd } from '@/lib/format';
import { loadShellData } from '@/lib/shell';
import { createClient } from '@/lib/supabase/server';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

type EventType = 'task' | 'followup' | 'birthday' | 'maturity' | 'call';

const EVENT_STYLE: Record<EventType, { color: string; label: string }> = {
  task: { color: 'var(--accent)', label: '行程' },
  followup: { color: '#8b5cf6', label: 'Follow Up' },
  birthday: { color: 'var(--amber)', label: '生日' },
  maturity: { color: 'var(--rose)', label: '商品到期' },
  call: { color: 'var(--emerald)', label: '通話紀錄' },
};

interface CalEvent {
  key: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  text: string;
  customerId: string | null;
  time?: string;
  link?: string | null;
  /** 20260810000001 migration 之後才有；舊資料為 null */
  priority?: 'high' | 'medium' | 'low' | null;
  description?: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; d?: string }>;
}) {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const sp = await searchParams;
  const today = shell.today;

  // 月份以 1-12 表示（網址好讀），內部運算再轉 0-11
  const year = Number(sp.y) || Number(today.slice(0, 4));
  const month = Number(sp.m) || Number(today.slice(5, 7));
  const monthStart = `${year}-${pad2(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;
  const selectedDate = sp.d && sp.d.startsWith(`${year}-${pad2(month)}`) ? sp.d : null;

  const supabase = await createClient();

  const [tasksRes, followUpsRes, customersRes, assetsRes, logsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, starts_at, is_done, customer_id, google_html_link, kind, priority, description')
      .gte('starts_at', `${monthStart}T00:00:00+08:00`)
      .lte('starts_at', `${monthEnd}T23:59:59+08:00`),
    supabase
      .from('follow_ups')
      .select('id, content, due_date, customer_id, priority, description, customers(name)')
      .eq('status', 'pending')
      .gte('due_date', monthStart)
      .lte('due_date', monthEnd),
    supabase.from('customers').select('id, name, birthday').eq('is_archived', false),
    supabase
      .from('customer_assets')
      .select('id, product_name, asset_type, amount_twd, maturity_date, customer_id, customers(name)')
      .eq('is_active', true)
      .gte('maturity_date', monthStart)
      .lte('maturity_date', monthEnd),
    supabase
      .from('interaction_logs')
      .select('id, occurred_at, customer_id, customers(name)')
      .gte('occurred_at', `${monthStart}T00:00:00+08:00`)
      .lte('occurred_at', `${monthEnd}T23:59:59+08:00`),
  ]);

  const dbError =
    tasksRes.error ?? followUpsRes.error ?? customersRes.error ?? assetsRes.error ?? logsRes.error;

  const one = <T,>(rel: T | T[] | null | undefined): T | null =>
    !rel ? null : Array.isArray(rel) ? (rel[0] ?? null) : rel;

  const events: CalEvent[] = [];

  for (const t of tasksRes.data ?? []) {
    const iso = t.starts_at as string;
    events.push({
      key: `t-${t.id}`,
      date: iso.slice(0, 10),
      type: 'task',
      text: `${t.title}${t.is_done ? '（已完成）' : ''}`,
      customerId: (t.customer_id as string) ?? null,
      time: iso.slice(11, 16),
      link: (t.google_html_link as string) ?? null,
      priority: (t.priority as 'high' | 'medium' | 'low' | null) ?? null,
      description: (t.description as string) ?? null,
    });
  }
  for (const f of followUpsRes.data ?? []) {
    events.push({
      key: `f-${f.id}`,
      date: f.due_date as string,
      type: 'followup',
      text: `${one(f.customers as { name: string }[])?.name ?? '—'}・${f.content}`,
      customerId: (f.customer_id as string) ?? null,
      priority: (f.priority as 'high' | 'medium' | 'low' | null) ?? null,
      description: (f.description as string) ?? null,
    });
  }
  for (const c of customersRes.data ?? []) {
    const b = c.birthday as string | null;
    if (!b) continue;
    // 生日只比對月日，對齊到當前檢視的年份
    if (Number(b.slice(5, 7)) !== month) continue;
    events.push({
      key: `b-${c.id}`,
      date: `${year}-${b.slice(5)}`,
      type: 'birthday',
      text: `${c.name}・生日`,
      customerId: c.id as string,
    });
  }
  for (const a of assetsRes.data ?? []) {
    events.push({
      key: `m-${a.id}`,
      date: a.maturity_date as string,
      type: 'maturity',
      text: `${one(a.customers as { name: string }[])?.name ?? '—'}・${a.product_name} 到期（${formatTwd(Number(a.amount_twd))}）`,
      customerId: (a.customer_id as string) ?? null,
    });
  }
  for (const l of logsRes.data ?? []) {
    events.push({
      key: `l-${l.id}`,
      date: (l.occurred_at as string).slice(0, 10),
      type: 'call',
      text: `${one(l.customers as { name: string }[])?.name ?? '—'}・通話紀錄`,
      customerId: (l.customer_id as string) ?? null,
    });
  }

  const customerOptions: TaskCustomerOption[] = (customersRes.data ?? [])
    .map((c) => ({ id: c.id as string, name: c.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

  const byDate = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  // 月曆格：補滿前後空格湊成整週
  const startWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startWeekday + 1;
    const d = new Date(Date.UTC(year, month - 1, dayNum));
    const iso = d.toISOString().slice(0, 10);
    return { iso, dayNum: d.getUTCDate(), inMonth: dayNum >= 1 && dayNum <= daysInMonth };
  });

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const selectedEvents = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <AiAssistantProvider>
      <AppShell advisor={shell.advisor} todayLabel={shell.todayLabel} reminders={shell.reminders}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-semibold">行事曆</h2>
              <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--muted)' }}>
                整合系統行程、Follow Up、生日、商品到期與通話紀錄
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/calendar?y=${prev.y}&m=${prev.m}`} className="icon-btn" aria-label="上個月">
                <ChevronLeft size={17} />
              </Link>
              <span className="text-sm font-medium" style={{ minWidth: 92, textAlign: 'center' }}>
                {year} 年 {month} 月
              </span>
              <Link href={`/calendar?y=${next.y}&m=${next.m}`} className="icon-btn" aria-label="下個月">
                <ChevronRight size={17} />
              </Link>
              <Link href="/calendar" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: 13 }}>
                今天
              </Link>
            </div>
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

          {/* 圖例 */}
          <div className="flex flex-wrap items-center gap-4">
            {Object.entries(EVENT_STYLE).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                <span
                  style={{ width: 8, height: 8, borderRadius: 999, background: v.color, display: 'block' }}
                />
                {v.label}
              </span>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            {/* ── 月曆 ─────────────────────────────────────────────── */}
            <div className="card">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="py-1.5 text-center text-xs font-medium"
                    style={{ color: 'var(--faint)' }}
                  >
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => {
                  const dayEvents = cell.inMonth ? (byDate.get(cell.iso) ?? []) : [];
                  const isToday = cell.iso === today;
                  const isSelected = cell.iso === selectedDate;
                  return (
                    <Link
                      key={cell.iso}
                      href={`/calendar?y=${year}&m=${month}&d=${cell.iso}`}
                      className="flex flex-col items-start gap-1 p-1.5"
                      style={{
                        height: 80,
                        borderRadius: 12,
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                        background: isSelected ? 'var(--active-bg)' : 'transparent',
                        opacity: cell.inMonth ? 1 : 0.35,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        className="flex items-center justify-center text-xs font-medium"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: isToday ? 'var(--accent)' : 'transparent',
                          color: isToday ? '#fff' : 'inherit',
                        }}
                      >
                        {cell.dayNum}
                      </span>
                      <span className="flex flex-wrap gap-0.5">
                        {dayEvents.slice(0, 6).map((e) => (
                          <span
                            key={e.key}
                            title={e.text}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              background: EVENT_STYLE[e.type].color,
                              display: 'block',
                            }}
                          />
                        ))}
                      </span>
                      {dayEvents.length > 6 && (
                        <span style={{ fontSize: 10, color: 'var(--faint)' }}>
                          +{dayEvents.length - 6}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── 選定日期詳情 ─────────────────────────────────────── */}
            <div className="card">
              <div className="section-title" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="section-title-left">
                  <CalendarDays size={16} />
                  <h3>{selectedDate ? formatDateWithWeekday(selectedDate) : '選擇日期'}</h3>
                </div>
                {/* 日期預填為當前選取的那一天，沒選則用今天 */}
                <NewTaskModal defaultDate={selectedDate ?? today} customers={customerOptions} />
              </div>

              {!selectedDate ? (
                <div className="empty-row">點選左側日期查看當天行程</div>
              ) : selectedEvents.length === 0 ? (
                <div className="empty-row">這天沒有任何行程或提醒</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {selectedEvents.map((e) => (
                    <div key={e.key} className="row-btn" style={{ alignItems: 'flex-start' }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: EVENT_STYLE[e.type].color,
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge badge-slate">{EVENT_STYLE[e.type].label}</span>
                          {e.priority && (
                            <span className={`prio prio-${e.priority}`}>
                              {e.priority === 'high' ? '高' : e.priority === 'medium' ? '中' : '低'}
                            </span>
                          )}
                          {e.time && (
                            <span className="text-xs" style={{ color: 'var(--faint)' }}>
                              {e.time}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 mb-0 text-sm" style={{ lineHeight: 1.6 }}>
                          {e.customerId ? (
                            <Link href={`/customers/${e.customerId}`}>{e.text}</Link>
                          ) : (
                            e.text
                          )}
                        </p>
                        {e.description && (
                          <p
                            className="mt-1 mb-0 text-xs"
                            style={{ color: 'var(--muted)', lineHeight: 1.6 }}
                          >
                            {e.description}
                          </p>
                        )}
                      </div>
                      {e.link && (
                        <a
                          href={e.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-btn"
                          title="在 Google 日曆開啟"
                          style={{ width: 28, height: 28, flexShrink: 0 }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 mb-0 text-xs" style={{ color: 'var(--faint)', lineHeight: 1.7 }}>
                系統行程可與 Google Calendar 雙向同步。尚未連結時仍可正常建立，
                同步狀態會記錄在 tasks.sync_error。
              </p>
            </div>
          </div>
        </div>
      </AppShell>
    </AiAssistantProvider>
  );
}
