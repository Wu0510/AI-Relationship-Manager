import { createClient, getCurrentAdvisor } from '@/lib/supabase/server';
import { daysFromToday, todayInTz, weekdayOf } from '@/lib/format';
import type { ShellReminder } from '@/components/layout/AppShell';

export interface ShellData {
  advisor: {
    id: string;
    name: string;
    email: string;
    branch: string | null;
    stale_days: number;
  };
  todayLabel: string;
  today: string;
  reminders: ShellReminder[];
}

/**
 * 每個頁面共用的外框資料：理專資訊 + 通知鈴內容 + 今日日期。
 * 回傳 null 代表未登入，頁面應顯示 <SignInRequired />。
 */
export async function loadShellData(): Promise<ShellData | null> {
  const advisor = await getCurrentAdvisor();
  if (!advisor) return null;

  const supabase = await createClient();
  const today = todayInTz();

  const [followUpsRes, customersRes, assetsRes] = await Promise.all([
    supabase
      .from('follow_ups')
      .select('id, content, due_date, customers(name)')
      .eq('status', 'pending')
      .order('due_date')
      .limit(20),
    supabase.from('v_customer_alerts').select('customer_id, name, days_to_birthday'),
    supabase
      .from('customer_assets')
      .select('id, product_name, asset_type, maturity_date, customers(name)')
      .eq('is_active', true)
      .not('maturity_date', 'is', null)
      .limit(50),
  ]);

  const one = <T,>(rel: T | T[] | null | undefined): T | null =>
    !rel ? null : Array.isArray(rel) ? (rel[0] ?? null) : rel;

  const reminders: ShellReminder[] = [
    ...(followUpsRes.data ?? []).map((f) => ({
      customerName: one(f.customers as { name: string }[])?.name ?? '—',
      text: f.content as string,
    })),
    ...(assetsRes.data ?? [])
      .filter((a) => {
        const d = daysFromToday(a.maturity_date as string);
        return d !== null && d >= -3 && d <= 7;
      })
      .map((a) => ({
        customerName: one(a.customers as { name: string }[])?.name ?? '—',
        text: `${a.asset_type} 到期：${a.product_name}`,
      })),
    ...(customersRes.data ?? [])
      .filter((c) => {
        const d = c.days_to_birthday as number | null;
        return d != null && d >= 0 && d <= 7;
      })
      .map((c) => ({ customerName: (c.name as string) ?? '—', text: '生日提醒' })),
  ];

  return {
    advisor: {
      id: advisor.id as string,
      name: (advisor.name as string) ?? '',
      email: (advisor.email as string) ?? '',
      branch: (advisor.branch as string) ?? null,
      stale_days: (advisor.stale_days as number) ?? 45,
    },
    today,
    todayLabel: `${today.slice(0, 4)} 年 ${Number(today.slice(5, 7))} 月 ${Number(
      today.slice(8, 10),
    )} 日 星期${weekdayOf(today)}`,
    reminders,
  };
}
