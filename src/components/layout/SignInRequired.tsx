import { ShieldAlert } from 'lucide-react';

/**
 * 未登入時的統一畫面。
 *
 * 未登入的請求在 PostgREST 是 `anon` 角色，而 grants migration 已把 anon 對
 * public schema 的權限全部 revoke，因此任何查詢都會回 42501。那個錯誤看起來
 * 像權限沒設好，實際上只是還沒建立 session —— 所以這裡先攔下來給明確指引。
 */
export function SignInRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="flex items-center gap-3">
          <div className="brand-icon" style={{ background: 'var(--badge-amber-bg)' }}>
            <ShieldAlert size={16} style={{ color: 'var(--badge-amber-text)' }} />
          </div>
          <div>
            <h1 className="m-0 text-base font-semibold">尚未登入</h1>
            <p className="mt-1 mb-0 text-xs" style={{ color: 'var(--muted)' }}>
              需要理專身份才能讀取客戶資料
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm" style={{ color: 'var(--muted)', lineHeight: 1.8 }}>
          未登入的請求在 Supabase 會以 <code>anon</code> 角色連線，而 anon 對業務表的權限已被撤除，
          因此任何查詢都會回 <code>42501</code>。這不是 GRANT 或 RLS 設錯，只是還沒建立 session。
          Server Component 無法寫入 cookie，登入必須經由 /login 或 Route Handler 完成。
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/login" className="btn btn-primary">
            前往登入
          </a>
          <a href="/api/dev/login" className="btn btn-outline">
            開發用一鍵登入
          </a>
        </div>
      </div>
    </div>
  );
}
