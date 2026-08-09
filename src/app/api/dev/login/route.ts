import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/dev/login — 開發用一鍵登入
 *
 * 為什麼需要這支：
 *   Server Component（page.tsx）**不能寫 cookie**，所以沒辦法在裡面「帶入」登入身份。
 *   Supabase session 必須由能寫 cookie 的地方建立 —— Route Handler、Server Action，
 *   或瀏覽器端的 signInWithPassword。這支就是最省事的 Route Handler 版本。
 *
 * 登入成功後 @supabase/ssr 會寫入 sb-<project>-auth-token cookie，
 * 之後 Server Component 建立的 client 才會以 `authenticated` 角色連線，
 * 通過 GRANT 檢查，並讓 RLS 的 auth.uid() 取得值。
 *
 * ⚠️ 僅限開發環境：production 一律回 404。
 *    帳密從環境變數讀，不要寫死在程式裡：
 *      DEV_LOGIN_EMAIL=rm@bank.com
 *      DEV_LOGIN_PASSWORD=<你在 Supabase Auth 設定的密碼>
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      {
        error: '缺少 DEV_LOGIN_EMAIL / DEV_LOGIN_PASSWORD',
        hint: '請在 .env.local 補上這兩個變數後重啟 dev server，或改用 /login 手動登入。',
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Route Handler 裡的 cookies() 是可寫的，這是這支路由存在的理由
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      {
        error: `登入失敗：${error.message}`,
        hint:
          error.message === 'Invalid login credentials'
            ? `Supabase Auth 裡的 ${email} 密碼與 DEV_LOGIN_PASSWORD 不符。可在 Dashboard → Authentication → Users 重設密碼。`
            : error.message === 'Email not confirmed'
              ? '該帳號尚未驗證 email。請在 Supabase Dashboard 手動將其標為已確認，或關閉 email 驗證。'
              : undefined,
      },
      { status: 401 },
    );
  }

  const next = request.nextUrl.searchParams.get('next') ?? '/';
  const target = next.startsWith('/') ? next : '/'; // 防 open redirect

  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));

  // 把 signInWithPassword 期間寫入的 cookie 轉寫到 redirect 回應上
  for (const cookie of cookieStore.getAll()) {
    response.cookies.set(cookie.name, cookie.value);
  }

  console.log(`[dev/login] 已登入 ${data.user?.email}（uid=${data.user?.id}）`);
  return response;
}
