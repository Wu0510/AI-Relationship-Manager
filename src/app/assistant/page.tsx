import { AiAssistantProvider } from '@/components/dashboard/AiAssistantDrawer';
import { AppShell } from '@/components/layout/AppShell';
import { SignInRequired } from '@/components/layout/SignInRequired';
import { AiConsole, type ConsoleCustomer } from '@/components/assistant/AiConsole';
import { daysFromToday, formatTwd, relativeDay } from '@/lib/format';
import { loadShellData } from '@/lib/shell';
import { createClient } from '@/lib/supabase/server';

export default async function AssistantPage() {
  const shell = await loadShellData();
  if (!shell) return <SignInRequired />;

  const supabase = await createClient();
  const staleDays = shell.advisor.stale_days;

  const [customersRes, alertsRes, assetsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, risk_level, aum_twd')
      .eq('is_archived', false)
      .order('aum_twd', { ascending: false }),
    supabase.from('v_customer_alerts').select('*'),
    supabase
      .from('customer_assets')
      .select('customer_id, product_name, maturity_date')
      .eq('is_active', true)
      .not('maturity_date', 'is', null),
  ]);

  const dbError = customersRes.error ?? alertsRes.error ?? assetsRes.error;

  const customers: ConsoleCustomer[] = (customersRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    risk_level: (c.risk_level as string) ?? null,
    aum_label: formatTwd(Number(c.aum_twd)),
  }));

  /* 今日建議優先聯繫：取最急迫的理由當標籤 */
  const suggested: { id: string; name: string; reason: string }[] = [];
  for (const a of alertsRes.data ?? []) {
    const id = a.customer_id as string;
    const name = (a.name as string) ?? '—';
    const since = a.days_since_contact as number | null;
    const bday = a.days_to_birthday as number | null;
    const overdue = Number(a.overdue_follow_ups ?? 0);

    const maturity = (assetsRes.data ?? [])
      .filter((x) => x.customer_id === id)
      .map((x) => ({ name: x.product_name as string, days: daysFromToday(x.maturity_date as string) }))
      .filter((x): x is { name: string; days: number } => x.days !== null && x.days >= -3 && x.days <= 7)
      .sort((x, y) => x.days - y.days)[0];

    let reason: string | null = null;
    let weight = 0;

    if (overdue > 0) {
      reason = `${overdue} 筆 Follow Up 待處理`;
      weight = 100;
    }
    if (maturity && 90 > weight) {
      reason = maturity.days <= 0 ? `${maturity.name} 已到期` : `${maturity.name} ${relativeDay(maturity.days)}到期`;
      weight = 90;
    }
    if (bday != null && bday >= 0 && bday <= 7 && 80 > weight) {
      reason = bday === 0 ? '今天生日' : `生日 ${relativeDay(bday)}`;
      weight = 80;
    }
    if (since != null && since >= staleDays && 70 > weight) {
      reason = `已 ${since} 天未聯繫`;
      weight = 70;
    }

    if (reason) suggested.push({ id, name, reason });
  }
  suggested.splice(4);

  return (
    <AiAssistantProvider>
      <AppShell advisor={shell.advisor} todayLabel={shell.todayLabel} reminders={shell.reminders}>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="m-0 text-xl font-semibold">AI 助理</h2>
            <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--muted)' }}>
              不只是聊天，而是能直接協助日常工作的分析工具。上下文由後端組裝（客戶檔案、持有部位、通聯紀錄、當日市場動態）。
            </p>
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

          <AiConsole customers={customers} suggested={suggested} />
        </div>
      </AppShell>
    </AiAssistantProvider>
  );
}
