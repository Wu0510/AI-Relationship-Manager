import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Server Component / Route Handler / Server Action 用的 Supabase client。
 * 走使用者的 session cookie，所有查詢都受 RLS 保護。
 *
 * 型別強化：跑過 `npm run db:types` 後，改成
 *   createServerClient<Database>(...)
 * 即可獲得完整 table 型別推導。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabase.url(), env.supabase.anonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 在 Server Component 中呼叫 set 會拋錯，交給 middleware 續期即可
        }
      },
    },
  });
}

/** 取得目前登入的理專；未登入回傳 null。 */
export async function getCurrentAdvisor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: advisor } = await supabase
    .from('advisors')
    .select('*')
    .eq('id', user.id)
    .single();

  return advisor ? { ...advisor, userId: user.id } : { id: user.id, userId: user.id, email: user.email, name: '', stale_days: 45 };
}

/** API Route 專用：未登入直接丟出可被 catch 成 401 的錯誤。 */
export async function requireAdvisorId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const err = new Error('UNAUTHORIZED');
    err.name = 'UnauthorizedError';
    throw err;
  }
  return user.id;
}
