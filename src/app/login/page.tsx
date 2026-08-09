'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * 登入頁 — 版面沿用原型：左側漸層品牌區（lg 以上顯示）+ 右側表單。
 * 取代原型的 localStorage 假登入，改走 Supabase Auth。
 *
 * useSearchParams() 需包一層 Suspense，否則 next build 會在 prerender 時失敗。
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState('rm@bank.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? '帳號或密碼錯誤，請確認後再試一次'
          : signInError.message,
      );
      setSubmitting(false);
      return;
    }

    router.push(searchParams.get('next') ?? '/');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* ── 左側品牌區（lg 以上） ─────────────────────────────────────── */}
      <div className="login-brand">
        <div className="login-brand-dots" />
        <div style={{ position: 'relative' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="brand-icon"
              style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(4px)' }}
            >
              <Sparkles size={16} />
            </div>
            <span className="text-sm font-semibold">理專助理 AI</span>
          </div>
          <h1 className="mt-10 mb-0 text-3xl font-semibold" style={{ lineHeight: 1.4 }}>
            把資料變成
            <br />
            可以直接說出口的話術
          </h1>
          <p className="mt-4 mb-0 text-sm" style={{ opacity: 0.85, lineHeight: 1.8, maxWidth: 380 }}>
            整合客戶持有部位、通聯紀錄與當日市場動態，由 Gemini 產生高情商的溝通建議與行動清單。
          </p>
        </div>
        <p className="m-0 text-xs" style={{ opacity: 0.6, position: 'relative' }}>
          資料受 Supabase Row Level Security 保護，每位理專僅能存取名下客戶。
        </p>
      </div>

      {/* ── 右側表單 ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div className="login-brand-mobile">
            <div className="brand-icon">
              <Sparkles size={16} />
            </div>
            <span className="text-sm font-semibold">理專助理 AI</span>
          </div>

          <h2 className="m-0 text-lg font-semibold">登入</h2>
          <p className="mt-1 mb-6 text-xs" style={{ color: 'var(--muted)' }}>
            請使用公司配發的帳號
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--faint)' }}>
                帳號
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium"
                style={{ color: 'var(--faint)' }}
              >
                密碼
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="m-0 text-xs"
                style={{
                  color: 'var(--badge-rose-text)',
                  background: 'var(--badge-rose-bg)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary justify-center" disabled={submitting}>
              {submitting && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              {submitting ? '登入中…' : '登入'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
