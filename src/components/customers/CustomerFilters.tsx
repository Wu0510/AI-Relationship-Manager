'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

const RISK_OPTIONS = ['全部', 'RR1', 'RR2', 'RR3', 'RR4', 'RR5'] as const;
const SORT_OPTIONS = [
  { value: 'aum', label: '資產規模' },
  { value: 'contact', label: '最近聯絡' },
  { value: 'name', label: '姓名' },
] as const;

/**
 * 篩選條件寫進 URL searchParams，由 server component 重新查詢。
 * 好處是可分享連結、可用瀏覽器上一頁，而且篩選邏輯留在資料庫端。
 */
export function CustomerFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const risk = searchParams.get('risk') ?? '全部';
  const sort = searchParams.get('sort') ?? 'aum';

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === '全部' || (k === 'sort' && v === 'aum')) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/customers?${qs}` : '/customers'));
  }

  // 搜尋框做 debounce，避免每個字都打一次查詢
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (q === current) return;
    const timer = setTimeout(() => push({ q }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="flex flex-1 items-center gap-2"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '8px 12px',
          minWidth: 220,
          background: 'var(--input-bg)',
        }}
      >
        <Search size={16} style={{ color: 'var(--faint)', flexShrink: 0 }} />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名或職業"
          style={{ border: 'none', padding: 0, background: 'transparent' }}
        />
        {pending && (
          <Loader2 size={14} style={{ color: 'var(--faint)', animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      <select
        value={risk}
        onChange={(e) => push({ risk: e.target.value })}
        style={{ maxWidth: 180 }}
        aria-label="風險屬性篩選"
      >
        {RISK_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r === '全部' ? '風險屬性：全部' : r}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(e) => push({ sort: e.target.value })}
        style={{ maxWidth: 180 }}
        aria-label="排序"
      >
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            排序：{s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
