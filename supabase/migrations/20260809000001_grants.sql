-- ============================================================================
--  補上 PostgREST 角色的資料表存取權
--
--  為什麼需要這支：
--    Supabase 專案「通常」設有 default privileges，讓 public schema 新建的表
--    自動授權給 anon / authenticated / service_role。但這並非所有專案都成立，
--    缺少時 API 會回 42501「permission denied for table ...」，
--    而且錯誤跟 RLS 無關 —— RLS 是「哪些列看得到」，GRANT 是「這張表准不准碰」，
--    兩層都要過。
--
--  安全模型不變：authenticated 拿到的是「表層級」權限，
--  實際可見的列仍由 init_schema.sql 的 RLS policy（advisor_id = auth.uid()）決定。
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ── 業務表：登入後的理專可讀寫，可見範圍交給 RLS ────────────────────────────
grant select, insert, update, delete on
  public.advisors,
  public.customers,
  public.customer_assets,
  public.interaction_logs,
  public.follow_ups,
  public.tasks,
  public.chat_sessions,
  public.chat_messages
to authenticated;

-- ── 市場動態：全體登入理專唯讀（RLS policy 已是 using (true)）──────────────
grant select on public.market_snapshots to authenticated;

-- ── 儀表板提醒 view（security_invoker，仍沿用底層表的 RLS）─────────────────
grant select on public.v_customer_alerts to authenticated;

-- ── RPC ────────────────────────────────────────────────────────────────────
grant execute on function public.get_customer_ai_context(uuid, int) to authenticated, service_role;

-- ── service_role：後端維運用，繞過 RLS ─────────────────────────────────────
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ── google_credentials：只有 service_role 進得去 ───────────────────────────
--  這張表存 OAuth token，RLS 開啟但刻意不建任何 policy。
--  這裡再從 GRANT 層面把 anon / authenticated 徹底鎖掉，形成雙重防線
--  ——即使哪天有人不小心加了 policy，沒有 GRANT 依然讀不到。
revoke all on public.google_credentials from anon, authenticated;

-- ── anon（未登入）：不給任何資料表權限 ─────────────────────────────────────
--  登入前只會用到 /auth/v1 端點，不需要碰 public schema 的表。
revoke all on all tables in schema public from anon;
grant usage on schema public to anon;

-- ── 未來新建的物件自動比照，避免再踩同一個坑 ───────────────────────────────
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;

-- ── 驗證：列出目前各表的授權狀況 ───────────────────────────────────────────
--  執行後應該看到 authenticated 對 8 張業務表有 SELECT/INSERT/UPDATE/DELETE，
--  且 google_credentials 只有 service_role。
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
