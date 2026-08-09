-- ============================================================================
--  清除重複的 seed 資料，並加上唯一約束避免再次發生
--
--  背景：seed.sql 沒有防重複機制，被執行了 4 次，結果：
--    customers 32（應 8）、customer_assets 36（應 9）
--    follow_ups 16（應 4）、tasks 20（應 5）、market_snapshots 16（應 4）
--
--  策略：每組重複只保留最早建立的那一筆。
--        customer_assets / interaction_logs / follow_ups 對 customers 是
--        on delete cascade，所以刪掉重複的 customers 時會自動一起清掉
--        ——不需要（也不應該）另外處理它們。
--        tasks 對 customers 是 on delete set null，需要單獨去重。
-- ============================================================================

begin;

-- ── 1. customers（同一位理專底下同名者視為重複）─────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by advisor_id, name
           order by created_at, id
         ) as rn
    from public.customers
)
delete from public.customers c
 using ranked r
 where c.id = r.id
   and r.rn > 1;

-- ── 2. tasks（不會被 cascade 清掉，需自行去重）──────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by advisor_id, title, starts_at
           order by created_at, id
         ) as rn
    from public.tasks
)
delete from public.tasks t
 using ranked r
 where t.id = r.id
   and r.rn > 1;

-- ── 3. market_snapshots（全域表，沒有 advisor 關聯）─────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by snapshot_date, headline
           order by created_at, id
         ) as rn
    from public.market_snapshots
)
delete from public.market_snapshots m
 using ranked r
 where m.id = r.id
   and r.rn > 1;

-- ── 4. 孤兒 follow_ups / assets / logs（保險，正常會被 cascade 清掉）────────
delete from public.follow_ups f
 where not exists (select 1 from public.customers c where c.id = f.customer_id);
delete from public.customer_assets a
 where not exists (select 1 from public.customers c where c.id = a.customer_id);
delete from public.interaction_logs l
 where not exists (select 1 from public.customers c where c.id = l.customer_id);

-- ── 5. 加上唯一約束，讓 seed 重跑時直接被擋掉而不是靜默複製 ─────────────────
--  market_snapshots 原本的 `on conflict do nothing` 沒有作用，
--  因為當時沒有任何唯一索引可以衝突。
create unique index if not exists uq_market_snapshot
  on public.market_snapshots (snapshot_date, headline);

--  客戶姓名在同一位理專底下唯一。
--  註：真實環境同名客戶是有可能的（那時應改用身分證字號或客戶編號），
--      這裡是為了讓 demo seed 具備冪等性。
create unique index if not exists uq_customer_name_per_advisor
  on public.customers (advisor_id, name);

commit;

-- ── 驗證：應該分別是 8 / 9 / 8 / 4 / 5 / 4 ─────────────────────────────────
select 'customers'         as table_name, count(*) as rows, 8 as expected from public.customers
union all select 'customer_assets',   count(*), 9 from public.customer_assets
union all select 'interaction_logs',  count(*), 8 from public.interaction_logs
union all select 'follow_ups',        count(*), 4 from public.follow_ups
union all select 'tasks',             count(*), 5 from public.tasks
union all select 'market_snapshots',  count(*), 4 from public.market_snapshots
order by table_name;
