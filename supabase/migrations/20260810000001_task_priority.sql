-- ============================================================================
--  為「新增行程／待辦」表單補上缺少的欄位
--
--  背景：行事曆頁的新增表單需要「優先級」與「行程(event)」類型，
--        但原 schema 沒有 priority 欄位，task_kind 也只有
--        ('call','visit','task','review')。
--
--  另外補 follow_ups 的 priority 與 description：
--        表單的「追蹤事項」類型會寫進 follow_ups（而不是 tasks），
--        因為提醒中心的 Follow Up 分頁讀的是那張表，
--        寫進 tasks 會讓使用者在提醒中心找不到自己剛建的追蹤事項。
--        補上這兩欄後，表單三種類型的輸入都不會被丟掉。
--
--  注意：ALTER TYPE ... ADD VALUE 不能在「同一個交易內」立刻使用新值，
--        所以這支刻意不包 begin/commit。逐段執行也沒問題。
-- ============================================================================

-- ── 1. task_kind 新增 'event' ───────────────────────────────────────────────
alter type task_kind add value if not exists 'event';

-- ── 2. 優先級 enum ─────────────────────────────────────────────────────────
do $$ begin
  create type task_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null;
end $$;

-- ── 3. tasks.priority ──────────────────────────────────────────────────────
alter table public.tasks
  add column if not exists priority task_priority not null default 'medium';

create index if not exists idx_tasks_priority
  on public.tasks (advisor_id, priority, starts_at)
  where not is_done;

-- ── 4. follow_ups.priority / description ───────────────────────────────────
alter table public.follow_ups
  add column if not exists priority task_priority not null default 'medium';

alter table public.follow_ups
  add column if not exists description text;

create index if not exists idx_followups_priority
  on public.follow_ups (advisor_id, priority, due_date)
  where status = 'pending';

-- ── 驗證 ───────────────────────────────────────────────────────────────────
select
  table_name,
  column_name,
  data_type,
  udt_name,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tasks', 'follow_ups')
  and column_name in ('priority', 'description', 'kind')
order by table_name, column_name;

-- task_kind 應包含 event
select enumlabel as task_kind_values
  from pg_enum
 where enumtypid = 'task_kind'::regtype
 order by enumsortorder;
