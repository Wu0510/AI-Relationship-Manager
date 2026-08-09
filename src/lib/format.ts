import { env } from '@/lib/env';

const TZ = env.app.timezone();

/** 以 Asia/Taipei 為準的「今天」（YYYY-MM-DD） */
export function todayInTz(tz: string = TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** 距今幾天；正數＝未來，負數＝過去。傳入 YYYY-MM-DD 或 ISO 字串。 */
export function daysFromToday(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayInTz()}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  return Math.round((target - today) / 86_400_000);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** '2026-08-12' → '三' */
export function weekdayOf(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const t = Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return WEEKDAYS[new Date(t).getUTCDay()];
}

/**
 * '2026-08-12' → '2026-08-12（三）'
 *
 * 星期必須在 server 端算好餵給模型。實測過 Gemini 會自行補上「下週三」這類
 * 描述——即使上下文完全沒提供星期資訊。約訪話術講錯星期對理專是硬傷，
 * 所以連同日期一起給，並在 system instruction 明令不得自行推算。
 */
export function formatDateWithWeekday(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const date = dateStr.slice(0, 10);
  const wd = weekdayOf(date);
  return wd ? `${date}（${wd}）` : date;
}

/** 3 → 「3 天後」、0 →「今天」、-5 →「5 天前」 */
export function relativeDay(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  if (days === -1) return '昨天';
  return days > 0 ? `${days} 天後` : `${-days} 天前`;
}

/** 8000000 → 「NT$ 800 萬」；未滿一萬顯示元 */
export function formatTwd(amount: number | null | undefined): string {
  if (amount == null) return '—';
  if (Math.abs(amount) < 10_000) return `NT$ ${Math.round(amount).toLocaleString('zh-TW')}`;
  const wan = amount / 10_000;
  const text = Number.isInteger(wan) ? wan.toLocaleString('zh-TW') : wan.toFixed(1);
  return `NT$ ${text} 萬`;
}

/** KPI 用的緊湊金額：552000000 → 「5.52 億」、8000000 → 「800 萬」 */
export function formatTwdCompact(amount: number | null | undefined): { value: string; unit: string } {
  if (amount == null) return { value: '—', unit: '' };
  const abs = Math.abs(amount);
  if (abs >= 100_000_000) return { value: (amount / 100_000_000).toFixed(2), unit: '億' };
  if (abs >= 10_000) return { value: Math.round(amount / 10_000).toLocaleString('zh-TW'), unit: '萬' };
  return { value: Math.round(amount).toLocaleString('zh-TW'), unit: '元' };
}

/** 12 → 「+12.0%」 */
export function formatPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}
