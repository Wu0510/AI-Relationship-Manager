-- ============================================================================
--  bank_transactions — 銀行交易明細（模擬抓取匯入）
--
--  設計上與其他業務表一致：
--    1. 帶 advisor_id 並套用相同的 RLS policy（advisor_id = auth.uid()）
--    2. 明確 GRANT 給 authenticated —— RLS 管「哪些列看得到」，
--       GRANT 管「這張表准不准碰」，兩層都要過（缺 GRANT 會回 42501）
--    3. external_id + 唯一索引，讓重複同步不會產生重複資料
--       （seed.sql 被跑 4 次變成 32 位客戶的教訓）
-- ============================================================================

create table if not exists public.bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  advisor_id       uuid not null references public.advisors(id)  on delete cascade,
  -- 注意：對應 customers.id，型別是 uuid 而不是 text。
  -- 用 text 會無法建立外鍵、也無法與客戶頁 join。
  customer_id      uuid not null references public.customers(id) on delete cascade,

  -- 銀行端的交易序號。同一位理專底下唯一，用來擋掉重複匯入。
  external_id      text          not null,

  transaction_date timestamptz   not null,
  merchant_name    text          not null,
  -- 正數＝收入（股息、薪轉），負數＝支出（消費、保費）
  amount           numeric(16,2) not null,
  category         varchar(32)   not null,
  account_number   varchar(4)    not null,
  currency         char(3)       not null default 'TWD',

  -- 資料來源：mock（模擬）/ open_banking / csv …
  source           text          not null default 'mock',
  raw              jsonb         not null default '{}'::jsonb,
  created_at       timestamptz   not null default now()
);

-- 同一位理專不會匯入同一筆銀行交易兩次
create unique index if not exists uq_bank_tx_external
  on public.bank_transactions (advisor_id, external_id);

create index if not exists idx_bank_tx_customer
  on public.bank_transactions (customer_id, transaction_date desc);
create index if not exists idx_bank_tx_advisor_date
  on public.bank_transactions (advisor_id, transaction_date desc);
create index if not exists idx_bank_tx_category
  on public.bank_transactions (advisor_id, category);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.bank_transactions enable row level security;

drop policy if exists "advisor owns rows" on public.bank_transactions;
create policy "advisor owns rows" on public.bank_transactions
  for all to authenticated
  using (advisor_id = (select auth.uid()))
  with check (advisor_id = (select auth.uid()));

-- ── GRANT（缺這段 API 會回 42501，與 RLS 無關）──────────────────────────────
grant select, insert, update, delete on public.bank_transactions to authenticated;
grant all on public.bank_transactions to service_role;
revoke all on public.bank_transactions from anon;

-- ── 子表未帶 advisor_id 時自動由 customer 補上（沿用既有 trigger）───────────
drop trigger if exists trg_fill_advisor on public.bank_transactions;
create trigger trg_fill_advisor
  before insert on public.bank_transactions
  for each row execute function public.fill_advisor_id();

-- ============================================================================
--  彙總 view：每位客戶的收支概況（給客戶詳情頁用）
--  security_invoker → 沿用呼叫者的 RLS
-- ============================================================================
create or replace view public.v_customer_cashflow
with (security_invoker = true) as
select
  customer_id,
  advisor_id,
  count(*)                                                   as tx_count,
  min(transaction_date)                                      as first_tx_at,
  max(transaction_date)                                      as last_tx_at,
  sum(case when amount > 0 then amount else 0 end)           as total_income,
  sum(case when amount < 0 then -amount else 0 end)          as total_expense,
  sum(amount)                                                as net_flow,
  -- 支出最多的類別
  (array_agg(category order by amount asc))[1]               as top_expense_category
from public.bank_transactions
group by customer_id, advisor_id;

grant select on public.v_customer_cashflow to authenticated;

-- ── 驗證 ───────────────────────────────────────────────────────────────────
select
  c.column_name,
  c.data_type,
  c.character_maximum_length as len,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'bank_transactions'
order by c.ordinal_position;

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'bank_transactions'
   and grantee in ('anon', 'authenticated', 'service_role')
 group by grantee
 order by grantee;
