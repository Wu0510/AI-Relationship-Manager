'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { updateAdvisorProfile, updateStaleDays } from '@/app/actions';

export function ProfileForm({
  initialName,
  initialBranch,
}: {
  initialName: string;
  initialBranch: string;
}) {
  const [name, setName] = useState(initialName);
  const [branch, setBranch] = useState(initialBranch);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const dirty = name !== initialName || branch !== initialBranch;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--faint)' }}>
          姓名
        </label>
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="branch" className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--faint)' }}>
          分行
        </label>
        <input
          id="branch"
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="例：台北信義分行"
        />
      </div>

      {error && (
        <p className="m-0 text-xs" style={{ color: 'var(--rose)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              setError('');
              const res = await updateAdvisorProfile({ name, branch });
              if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              } else setError(res.error);
            })
          }
        >
          {pending && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
          儲存
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--emerald)' }}>
            <Check size={13} />
            已儲存
          </span>
        )}
      </div>
    </div>
  );
}

export function StaleDaysSlider({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // 放開滑桿後才寫入，避免拖動過程打出一堆請求
  function commit(next: number) {
    startTransition(async () => {
      setError('');
      const res = await updateStaleDays(next);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else setError(res.error);
    });
  }

  useEffect(() => setValue(initial), [initial]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="m-0 text-sm font-medium">久未聯繫提醒閾值</p>
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          {pending && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
          {value} 天
        </span>
      </div>

      <input
        type="range"
        min={15}
        max={90}
        step={5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        style={{ accentColor: 'var(--accent)', width: '100%' }}
      />

      <p className="mt-2 mb-0 text-xs" style={{ color: 'var(--faint)', lineHeight: 1.7 }}>
        超過此天數未聯繫的客戶，會出現在提醒中心與首頁的「今日建議聯絡」名單。
        這個值存在 advisors.stale_days，所有頁面共用。
      </p>

      {error && (
        <p className="mt-2 mb-0 text-xs" style={{ color: 'var(--rose)' }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-2 mb-0 flex items-center gap-1 text-xs" style={{ color: 'var(--emerald)' }}>
          <Check size={13} />
          已儲存
        </p>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('arm_theme', next ? 'dark' : 'light');
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="m-0 text-sm font-medium">深色模式</p>
        <p className="mt-0.5 mb-0 text-xs" style={{ color: 'var(--faint)' }}>
          切換淺色／深色主題（存在瀏覽器本機）
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={dark}
        aria-label="深色模式"
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: dark ? 'flex-end' : 'flex-start',
          background: dark ? 'var(--accent)' : '#cbd5e1',
          transition: 'background .15s',
        }}
      >
        <span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', display: 'block' }} />
      </button>
    </div>
  );
}
