-- ============================================================================
--  AI 理專助理 — 初始 Schema
--  執行方式：Supabase Dashboard → SQL Editor 貼上執行
--            或 supabase db push（需 supabase CLI 並已 link 專案）
-- ============================================================================

create extension if not exists pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
--  Enum 型別
-- ────────────────────────────────────────────────────────────────────────────
-- 每個 type 各自一個 DO block：例外處理會回滾整個 block，
-- 若寫在同一個 block 裡，重跑時後面的 duplicate 會把前面已建好的一起回滾。
do $$ begin create type risk_level          as enum ('RR1','RR2','RR3','RR4','RR5');
exception when duplicate_object then null; end $$;

do $$ begin create type invest_style        as enum ('保守型','穩健型','積極型');
exception when duplicate_object then null; end $$;

do $$ begin create type asset_type          as enum ('定存','基金','ETF','股票','債券','保險','外幣','現金','其他');
exception when duplicate_object then null; end $$;

do $$ begin create type interaction_channel as enum ('phone','visit','email','line','message','other');
exception when duplicate_object then null; end $$;

do $$ begin create type customer_reaction   as enum ('正面','中立','保留');
exception when duplicate_object then null; end $$;

do $$ begin create type follow_up_status    as enum ('pending','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type task_kind           as enum ('call','visit','task','review');
exception when duplicate_object then null; end $$;

do $$ begin create type chat_role           as enum ('user','model');
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────────────────────
--  共用 trigger：自動維護 updated_at
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============================================================================
--  1. advisors — 理專（對應 auth.users）
-- ============================================================================
create table if not exists public.advisors (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text        not null,
  name        text        not null default '',
  branch      text,
  avatar_url  text,
  -- 「久未聯繫」判定天數，原型 settings 頁的 staleDays
  stale_days  int         not null default 45 check (stale_days between 7 and 365),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_advisors_updated
  before update on public.advisors
  for each row execute function public.set_updated_at();

-- 新使用者註冊時自動建立 advisor profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.advisors (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  2. customers — 客戶主檔
-- ============================================================================
create table if not exists public.customers (
  id               uuid primary key default gen_random_uuid(),
  advisor_id       uuid not null references public.advisors(id) on delete cascade,
  name             text not null,
  age              int check (age between 0 and 120),
  occupation       text,
  family_status    text,                       -- 「已婚，育有 2 名子女」
  phone            text,
  email            text,
  -- 總資產（AUM），單位：新台幣「元」。原型是「萬」，seed 已 ×10000
  aum_twd          numeric(16,2) not null default 0 check (aum_twd >= 0),
  invest_style     invest_style,
  risk_level       risk_level,
  birthday         date,
  joined_date      date,
  last_contact_at  date,                       -- 由 interaction_logs 觸發器自動更新
  note             text,
  tags             text[] not null default '{}',
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_customers_advisor        on public.customers (advisor_id) where not is_archived;
create index if not exists idx_customers_last_contact   on public.customers (advisor_id, last_contact_at);
create index if not exists idx_customers_birthday       on public.customers (advisor_id, birthday);
create index if not exists idx_customers_tags           on public.customers using gin (tags);

create trigger trg_customers_updated
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================================
--  3. customer_assets — 客戶持有的投資標的
-- ============================================================================
create table if not exists public.customer_assets (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete cascade,
  advisor_id     uuid not null references public.advisors(id) on delete cascade, -- 反正規化，供 RLS 快速過濾
  asset_type     asset_type   not null,
  product_name   text         not null,        -- 「元大台灣50 (0050)」
  product_code   text,                         -- 「0050」
  amount_twd     numeric(16,2) not null default 0 check (amount_twd >= 0),
  cost_twd       numeric(16,2),
  return_pct     numeric(7,2),                 -- 報酬率 %，對應原型 changePct
  currency       char(3)      not null default 'TWD',
  purchased_at   date,
  maturity_date  date,                         -- 定存／基金到期日
  is_active      boolean      not null default true,
  meta           jsonb        not null default '{}'::jsonb,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create index if not exists idx_assets_customer  on public.customer_assets (customer_id) where is_active;
create index if not exists idx_assets_maturity  on public.customer_assets (advisor_id, maturity_date)
  where is_active and maturity_date is not null;

create trigger trg_assets_updated
  before update on public.customer_assets
  for each row execute function public.set_updated_at();

-- ============================================================================
--  4. interaction_logs — 通聯／拜訪紀錄
-- ============================================================================
create table if not exists public.interaction_logs (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers(id) on delete cascade,
  advisor_id        uuid not null references public.advisors(id) on delete cascade,
  channel           interaction_channel not null default 'phone',
  occurred_at       timestamptz not null default now(),
  raw_note          text,                      -- 理專輸入的原始通話內容
  ai_summary        text,                      -- Gemini 產生的摘要
  needs             text[] not null default '{}',
  reaction          customer_reaction,
  next_contact_date date,
  follow_up_action  text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_logs_customer on public.interaction_logs (customer_id, occurred_at desc);
create index if not exists idx_logs_advisor  on public.interaction_logs (advisor_id, occurred_at desc);

-- 新增通聯紀錄時，自動把客戶的 last_contact_at 往前推
create or replace function public.sync_last_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.customers
     set last_contact_at = greatest(
           coalesce(last_contact_at, '1900-01-01'::date),
           (new.occurred_at at time zone 'Asia/Taipei')::date
         )
   where id = new.customer_id;
  return new;
end $$;

drop trigger if exists trg_logs_sync_contact on public.interaction_logs;
create trigger trg_logs_sync_contact
  after insert on public.interaction_logs
  for each row execute function public.sync_last_contact();

-- ============================================================================
--  5. follow_ups — 後續追蹤事項
-- ============================================================================
create table if not exists public.follow_ups (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  advisor_id    uuid not null references public.advisors(id) on delete cascade,
  content       text not null,
  due_date      date not null,
  status        follow_up_status not null default 'pending',
  source_log_id uuid references public.interaction_logs(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_followups_due on public.follow_ups (advisor_id, status, due_date);

create trigger trg_followups_updated
  before update on public.follow_ups
  for each row execute function public.set_updated_at();

-- ============================================================================
--  6. tasks — 今日待辦 / 客戶約訪（← 與 Google Calendar 雙向同步）
-- ============================================================================
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  advisor_id         uuid not null references public.advisors(id) on delete cascade,
  customer_id        uuid references public.customers(id) on delete set null,
  kind               task_kind   not null default 'call',
  title              text        not null,
  description        text,
  location           text,
  starts_at          timestamptz not null,
  ends_at            timestamptz,
  is_all_day         boolean     not null default false,
  is_done            boolean     not null default false,
  completed_at       timestamptz,
  -- Google Calendar 同步欄位
  google_event_id    text,
  google_calendar_id text        not null default 'primary',
  google_html_link   text,
  synced_at          timestamptz,
  sync_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tasks_time_order check (ends_at is null or ends_at >= starts_at)
);

-- 同一位理專的同一顆 Google Event 只能對應一筆 task（供 upsert 用）
create unique index if not exists uq_tasks_google_event
  on public.tasks (advisor_id, google_event_id) where google_event_id is not null;
create index if not exists idx_tasks_schedule on public.tasks (advisor_id, starts_at);

create trigger trg_tasks_updated
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================================
--  7. chat_sessions / chat_messages — AI 對話歷史
-- ============================================================================
create table if not exists public.chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  advisor_id  uuid not null references public.advisors(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  title       text not null default '新對話',
  summary     text,                            -- 長對話壓縮後的摘要，回灌進 Prompt
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_sessions_advisor on public.chat_sessions (advisor_id, updated_at desc);

create trigger trg_sessions_updated
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  advisor_id uuid not null references public.advisors(id) on delete cascade,
  role       chat_role not null,
  content    text      not null,
  model      text,
  meta       jsonb     not null default '{}'::jsonb,  -- token 用量、grounding 來源等
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_session on public.chat_messages (session_id, created_at);

-- ============================================================================
--  8. google_credentials — OAuth token（僅 service_role 可存取）
-- ============================================================================
create table if not exists public.google_credentials (
  advisor_id    uuid primary key references public.advisors(id) on delete cascade,
  google_email  text,
  access_token  text not null,
  refresh_token text,
  scope         text,
  token_type    text default 'Bearer',
  expiry_date   timestamptz,
  sync_token    text,                          -- Calendar 增量同步用
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_google_creds_updated
  before update on public.google_credentials
  for each row execute function public.set_updated_at();

-- ============================================================================
--  9. market_snapshots — 當日市場動態（全域共用，給 Gemini Prompt 用）
-- ============================================================================
create table if not exists public.market_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  headline      text not null,
  summary       text,
  category      text,                          -- 台股 / 美股 / 利率 / 匯率 / 基金
  indices       jsonb not null default '{}'::jsonb,  -- {"TAIEX": {"close":23150,"changePct":0.8}}
  source        text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_market_date on public.market_snapshots (snapshot_date desc);

-- ============================================================================
--  Row Level Security
-- ============================================================================
alter table public.advisors           enable row level security;
alter table public.customers          enable row level security;
alter table public.customer_assets    enable row level security;
alter table public.interaction_logs   enable row level security;
alter table public.follow_ups         enable row level security;
alter table public.tasks              enable row level security;
alter table public.chat_sessions      enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.market_snapshots   enable row level security;
-- google_credentials 開了 RLS 但「不建立任何 policy」→ 只有 service_role 能讀寫
alter table public.google_credentials enable row level security;

drop policy if exists "advisor manages own profile" on public.advisors;
create policy "advisor manages own profile" on public.advisors
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 以下 7 張表共用同一條規則：advisor_id 必須等於當前登入者
do $$
declare t text;
begin
  foreach t in array array['customers','customer_assets','interaction_logs','follow_ups','tasks','chat_sessions','chat_messages']
  loop
    execute format('drop policy if exists "advisor owns rows" on public.%I', t);
    execute format($f$
      create policy "advisor owns rows" on public.%I
        for all to authenticated
        using (advisor_id = (select auth.uid()))
        with check (advisor_id = (select auth.uid()))
    $f$, t);
  end loop;
end $$;

drop policy if exists "market readable by all advisors" on public.market_snapshots;
create policy "market readable by all advisors" on public.market_snapshots
  for select to authenticated using (true);

-- ============================================================================
--  便利 trigger：子表未帶 advisor_id 時，自動由 customer 補上
-- ============================================================================
create or replace function public.fill_advisor_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.advisor_id is null and new.customer_id is not null then
    select advisor_id into new.advisor_id from public.customers where id = new.customer_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['customer_assets','interaction_logs','follow_ups']
  loop
    execute format('drop trigger if exists trg_fill_advisor on public.%I', t);
    execute format(
      'create trigger trg_fill_advisor before insert on public.%I
         for each row execute function public.fill_advisor_id()', t);
  end loop;
end $$;

-- ============================================================================
--  RPC：一次撈齊組 Gemini Prompt 需要的所有上下文
--  security invoker → 沿用呼叫者的 RLS，理專拿不到別人的客戶
-- ============================================================================
create or replace function public.get_customer_ai_context(
  p_customer_id uuid,
  p_log_limit   int default 8
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'customer', (
      select to_jsonb(c) - 'advisor_id'
        from public.customers c where c.id = p_customer_id
    ),
    'assets', coalesce((
      select jsonb_agg(to_jsonb(a) - 'advisor_id' order by a.maturity_date nulls last, a.amount_twd desc)
        from public.customer_assets a
       where a.customer_id = p_customer_id and a.is_active
    ), '[]'::jsonb),
    'interactions', coalesce((
      select jsonb_agg(to_jsonb(l) - 'advisor_id' order by l.occurred_at desc)
        from (
          select * from public.interaction_logs
           where customer_id = p_customer_id
           order by occurred_at desc
           limit p_log_limit
        ) l
    ), '[]'::jsonb),
    'follow_ups', coalesce((
      select jsonb_agg(to_jsonb(f) - 'advisor_id' order by f.due_date)
        from public.follow_ups f
       where f.customer_id = p_customer_id and f.status = 'pending'
    ), '[]'::jsonb),
    'upcoming_tasks', coalesce((
      select jsonb_agg(to_jsonb(t) - 'advisor_id' order by t.starts_at)
        from public.tasks t
       where t.customer_id = p_customer_id
         and not t.is_done
         and t.starts_at >= now() - interval '1 day'
    ), '[]'::jsonb),
    'market', coalesce((
      select jsonb_agg(jsonb_build_object(
               'headline', m.headline, 'summary', m.summary,
               'category', m.category, 'indices', m.indices))
        from public.market_snapshots m
       where m.snapshot_date = (select max(snapshot_date) from public.market_snapshots)
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_customer_ai_context(uuid, int) to authenticated;

-- ============================================================================
--  View：儀表板提醒（生日 / 到期 / 久未聯繫）— 對應原型 getReminders()
-- ============================================================================
create or replace view public.v_customer_alerts
with (security_invoker = true) as
select
  c.id                as customer_id,
  c.advisor_id,
  c.name,
  c.aum_twd,
  c.risk_level,
  c.last_contact_at,
  (current_date - c.last_contact_at)                              as days_since_contact,
  -- 下一次生日還有幾天
  case when c.birthday is null then null else
    (make_date(
       extract(year from current_date)::int
         + case when to_char(c.birthday,'MM-DD') < to_char(current_date,'MM-DD') then 1 else 0 end,
       extract(month from c.birthday)::int,
       extract(day   from c.birthday)::int
     ) - current_date)
  end                                                             as days_to_birthday,
  (select min(a.maturity_date - current_date)
     from public.customer_assets a
    where a.customer_id = c.id and a.is_active and a.maturity_date is not null)
                                                                  as days_to_next_maturity,
  (select count(*) from public.follow_ups f
    where f.customer_id = c.id and f.status = 'pending' and f.due_date <= current_date)
                                                                  as overdue_follow_ups
from public.customers c
where not c.is_archived;
