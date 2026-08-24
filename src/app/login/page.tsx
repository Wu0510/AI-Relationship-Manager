'use client';

import {
  Suspense,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  Loader2,
  Sparkles,
} from 'lucide-react';

import {
  createClient,
} from '@/lib/supabase/client';


/**
 * 登入頁
 *
 * - 左側：產品品牌與定位
 * - 右側：Supabase Auth 登入
 * - 公開 Demo 帳密，方便 LinkedIn / 104 面試官直接體驗
 *
 * useSearchParams() 需包在 Suspense，
 * 避免 Next.js build prerender 錯誤。
 */

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}


function LoginForm() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const supabase =
    createClient();


  /*
   * Demo 帳號直接預填。
   *
   * 注意：
   * 這是公開 Demo 帳密，
   * 不要在這裡放真正私人帳號。
   */
  const [email, setEmail] =
    useState(
      'rm@bank.com',
    );

  const [
    password,
    setPassword,
  ] =
    useState(
      'Demo2026!',
    );


  const [
    error,
    setError,
  ] =
    useState('');


  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);


  async function handleSubmit(
    e: React.FormEvent,
  ) {
    e.preventDefault();

    setError('');
    setSubmitting(true);


    const {
      error:
        signInError,
    } =
      await supabase
        .auth
        .signInWithPassword({
          email,
          password,
        });


    if (
      signInError
    ) {
      setError(
        signInError.message ===
          'Invalid login credentials'
          ? '帳號或密碼錯誤，請確認後再試一次'
          : signInError.message,
      );

      setSubmitting(
        false,
      );

      return;
    }


    router.push(
      searchParams.get(
        'next',
      ) ?? '/',
    );

    router.refresh();
  }


  return (
    <div className="flex min-h-screen">

      {/* ================================================================
       * 左側品牌區
       * ================================================================ */}

      <div className="login-brand">

        <div className="login-brand-dots" />


        <div
          style={{
            position:
              'relative',
          }}
        >

          <div className="flex items-center gap-2.5">

            <div
              className="brand-icon"
              style={{
                background:
                  'rgba(255,255,255,.18)',

                backdropFilter:
                  'blur(4px)',
              }}
            >
              <Sparkles
                size={16}
              />
            </div>


            <span className="text-sm font-semibold">
              理專助理 AI
            </span>

          </div>


          <h1
            className="mt-10 mb-0 text-3xl font-semibold"
            style={{
              lineHeight:
                1.4,
            }}
          >
            把資料變成

            <br />

            可以直接說出口的話術
          </h1>


          <p
            className="mt-4 mb-0 text-sm"
            style={{
              opacity:
                0.85,

              lineHeight:
                1.8,

              maxWidth:
                380,
            }}
          >
            整合客戶持有部位、通聯紀錄與當日市場動態，
            由 Gemini 產生高情商的溝通建議與行動清單。
          </p>

        </div>


        <p
          className="m-0 text-xs"
          style={{
            opacity:
              0.6,

            position:
              'relative',
          }}
        >
          資料受 Supabase Row Level Security 保護，
          每位理專僅能存取名下客戶。
        </p>

      </div>


      {/* ================================================================
       * 右側登入表單
       * ================================================================ */}

      <div className="flex flex-1 items-center justify-center p-6">

        <div
          style={{
            width:
              '100%',

            maxWidth:
              360,
          }}
        >

          {/* Mobile Brand */}

          <div className="login-brand-mobile">

            <div className="brand-icon">
              <Sparkles
                size={16}
              />
            </div>


            <span className="text-sm font-semibold">
              理專助理 AI
            </span>

          </div>


          {/* Title */}

          <h2 className="m-0 text-lg font-semibold">
            登入
          </h2>


          <p
            className="mt-1 mb-4 text-xs"
            style={{
              color:
                'var(--muted)',
            }}
          >
            AI Relationship Manager Prototype
          </p>


          {/* ============================================================
           * Demo Account Box
           * ============================================================ */}

          <div
            className="mb-5 rounded-xl p-3 text-xs"
            style={{
              background:
                'var(--active-bg)',

              border:
                '1px solid var(--badge-indigo-border)',

              color:
                'var(--text)',

              lineHeight:
                1.8,
            }}
          >

            <div
              className="mb-1 font-semibold"
              style={{
                color:
                  'var(--accent)',
              }}
            >
              Demo Account
            </div>


            <div>
              帳號：
              <strong>
                rm@bank.com
              </strong>
            </div>


            <div>
              密碼：
              <strong>
                Demo2026!
              </strong>
            </div>


            <div
              className="mt-1"
              style={{
                color:
                  'var(--muted)',
              }}
            >
              帳密已自動填入，可直接登入體驗。
            </div>

          </div>


          {/* ============================================================
           * Login Form
           * ============================================================ */}

          <form
            onSubmit={
              handleSubmit
            }
            className="flex flex-col gap-4"
          >

            {/* Email */}

            <div>

              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-medium"
                style={{
                  color:
                    'var(--faint)',
                }}
              >
                帳號
              </label>


              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) =>
                  setEmail(
                    e.target.value,
                  )
                }
              />

            </div>


            {/* Password */}

            <div>

              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium"
                style={{
                  color:
                    'var(--faint)',
                }}
              >
                密碼
              </label>


              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) =>
                  setPassword(
                    e.target.value,
                  )
                }
              />

            </div>


            {/* Error */}

            {error && (

              <p
                role="alert"
                className="m-0 text-xs"
                style={{
                  color:
                    'var(--badge-rose-text)',

                  background:
                    'var(--badge-rose-bg)',

                  borderRadius:
                    10,

                  padding:
                    '8px 12px',
                }}
              >
                {error}
              </p>

            )}


            {/* Submit */}

            <button
              type="submit"
              className="btn btn-primary justify-center"
              disabled={
                submitting
              }
            >

              {submitting && (

                <Loader2
                  size={15}
                  style={{
                    animation:
                      'spin 1s linear infinite',
                  }}
                />

              )}


              {submitting
                ? '登入中…'
                : '登入'}

            </button>


            {/* Demo Notice */}

            <p
              className="m-0 text-center text-[11px]"
              style={{
                color:
                  'var(--faint)',

                lineHeight:
                  1.6,
              }}
            >
              此系統為作品集 Prototype，
              所有客戶資料皆為模擬資料。
            </p>

          </form>

        </div>

      </div>

    </div>
  );
}