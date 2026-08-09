'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireAdvisorId } from '@/lib/supabase/server';

/**
 * Server Actions — 頁面上的簡單變更走這裡，不必為每個操作開一支 API Route。
 * 所有寫入都經由使用者 session 的 Supabase client，因此仍受 RLS 保護：
 * 理專改不到別人的資料，不需要在這裡手動比對 advisor_id。
 */

export async function completeFollowUp(id: string) {
  await requireAdvisorId();
  const supabase = await createClient();

  const { error } = await supabase
    .from('follow_ups')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/reminders');
  revalidatePath('/');
  return { ok: true as const };
}

export async function reopenFollowUp(id: string) {
  await requireAdvisorId();
  const supabase = await createClient();

  const { error } = await supabase
    .from('follow_ups')
    .update({ status: 'pending', completed_at: null })
    .eq('id', id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/reminders');
  return { ok: true as const };
}

export async function toggleTask(id: string, isDone: boolean) {
  await requireAdvisorId();
  const supabase = await createClient();

  const { error } = await supabase
    .from('tasks')
    .update({ is_done: isDone, completed_at: isDone ? new Date().toISOString() : null })
    .eq('id', id);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/');
  revalidatePath('/calendar');
  return { ok: true as const };
}

export async function updateStaleDays(days: number) {
  const advisorId = await requireAdvisorId();
  const supabase = await createClient();

  const clamped = Math.min(Math.max(Math.round(days), 15), 90);

  const { error } = await supabase
    .from('advisors')
    .update({ stale_days: clamped })
    .eq('id', advisorId);

  if (error) return { ok: false as const, error: error.message };

  // 這個值影響「久未聯繫」判定，所有頁面都要重新計算
  revalidatePath('/', 'layout');
  return { ok: true as const, value: clamped };
}

export async function updateAdvisorProfile(input: { name: string; branch: string }) {
  const advisorId = await requireAdvisorId();
  const supabase = await createClient();

  const { error } = await supabase
    .from('advisors')
    .update({ name: input.name.trim(), branch: input.branch.trim() || null })
    .eq('id', advisorId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/* ==========================================================================
 *  新增通聯紀錄
 * ========================================================================== */

export interface NewCallLogInput {
  customerId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  channel: 'phone' | 'visit' | 'email' | 'line' | 'message' | 'other';
  reaction: '正面' | '中立' | '保留';
  rawNote: string;
  followUpAction: string;
  /** 是否同時建立 Follow Up 追蹤事項（會出現在提醒中心） */
  createFollowUp: boolean;
  /** Follow Up 到期日 YYYY-MM-DD */
  followUpDueDate: string;
  /** 是否請 Gemini 整理摘要與需求標籤 */
  useAi: boolean;
}

export async function createInteractionLog(input: NewCallLogInput) {
  const advisorId = await requireAdvisorId();
  const supabase = await createClient();

  const note = input.rawNote.trim();
  if (!note) return { ok: false as const, error: '請輸入通話內容' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false as const, error: '通話日期格式不正確' };
  }

  // 確認客戶存在且屬於自己（RLS 會擋掉別人的客戶 → 查不到即無權限）
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', input.customerId)
    .maybeSingle();

  if (!customer) return { ok: false as const, error: '找不到這位客戶，或您沒有存取權限' };

  const time = /^\d{2}:\d{2}$/.test(input.time) ? input.time : '09:00';
  const occurredAt = `${input.date}T${time}:00+08:00`;

  /* ── 選用：請 Gemini 整理摘要與需求標籤 ─────────────────────────────────
     刻意不讓 AI 失敗阻斷儲存 —— 紀錄本身是理專的工作成果，
     不能因為第三方服務掛掉就存不進去。失敗只回傳 warning。            */
  let aiSummary: string | null = null;
  let needs: string[] = [];
  let warning: string | undefined;

  if (input.useAi) {
    try {
      const { analyzeCallLog } = await import('@/lib/gemini/service');
      const analysis = await analyzeCallLog(customer.name as string, note);
      aiSummary = analysis.summary;
      needs = analysis.needs;
    } catch (err) {
      warning = `已儲存，但 AI 摘要失敗：${(err as Error).message}`;
    }
  }

  const { data: log, error } = await supabase
    .from('interaction_logs')
    .insert({
      customer_id: input.customerId,
      advisor_id: advisorId,
      channel: input.channel,
      occurred_at: occurredAt,
      raw_note: note,
      ai_summary: aiSummary,
      needs,
      reaction: input.reaction,
      follow_up_action: input.followUpAction.trim() || null,
      next_contact_date: input.createFollowUp ? input.followUpDueDate || null : null,
    })
    .select('id')
    .single();

  if (error) return { ok: false as const, error: `寫入失敗：${error.message}` };

  /* ── 選用：一併建立 Follow Up，讓承諾事項真的進入提醒流程 ───────────── */
  if (input.createFollowUp && input.followUpAction.trim() && input.followUpDueDate) {
    const { error: fuError } = await supabase.from('follow_ups').insert({
      customer_id: input.customerId,
      advisor_id: advisorId,
      content: input.followUpAction.trim(),
      due_date: input.followUpDueDate,
      source_log_id: log.id,
    });
    if (fuError) {
      warning = `${warning ? warning + '；' : ''}Follow Up 建立失敗：${fuError.message}`;
    }
  }

  // interaction_logs 的觸發器會自動更新 customers.last_contact_at，
  // 所以首頁的「久未聯繫」與提醒中心都要一起重算。
  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath('/customers');
  revalidatePath('/reminders');
  revalidatePath('/');

  return { ok: true as const, warning };
}

/* ==========================================================================
 *  新增行程 / 待辦 / 追蹤事項（行事曆頁的表單）
 * ========================================================================== */

export type NewTaskType = 'event' | 'task' | 'follow_up';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface NewTaskInput {
  type: NewTaskType;
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** HH:mm；follow_up 類型不使用（follow_ups 只有日期） */
  time: string;
  priority: TaskPriority;
  description: string;
  customerId: string | null;
}

/**
 * 依類型寫入不同的表：
 *   event / task  → tasks（行事曆的主要實體）
 *   follow_up     → follow_ups
 *
 * 為什麼 follow_up 不寫進 tasks：提醒中心的「Follow Up」分頁讀的是
 * follow_ups 表，而且那裡才有「標記完成」的流程。若寫進 tasks，
 * 使用者會在提醒中心找不到自己剛建立的追蹤事項 ——
 * 兩個看起來一樣、行為卻不同的東西是最難排查的那種問題。
 * 行事曆頁同時查這兩張表，所以兩種都會出現在月曆上。
 */
export async function createTask(input: NewTaskInput) {
  const advisorId = await requireAdvisorId();
  const supabase = await createClient();

  const title = input.title.trim();
  if (!title) return { ok: false as const, error: '請輸入標題' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    return { ok: false as const, error: '日期格式不正確' };
  }

  // 指定客戶時確認存取權限（RLS 會擋掉別人的客戶 → 查不到即無權限）
  if (input.customerId) {
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('id', input.customerId)
      .maybeSingle();
    if (!data) return { ok: false as const, error: '找不到指定的客戶，或您沒有存取權限' };
  }

  const description = input.description.trim() || null;

  /* ── 追蹤事項 → follow_ups ─────────────────────────────────────────── */
  if (input.type === 'follow_up') {
    if (!input.customerId) {
      return { ok: false as const, error: '追蹤事項必須指定客戶（提醒中心是依客戶顯示的）' };
    }

    const { error } = await supabase.from('follow_ups').insert({
      customer_id: input.customerId,
      advisor_id: advisorId,
      content: title,
      description,
      due_date: input.dueDate,
      priority: input.priority,
    });

    if (error) return { ok: false as const, error: `寫入失敗：${error.message}` };

    revalidatePath('/calendar');
    revalidatePath('/reminders');
    revalidatePath('/');
    if (input.customerId) revalidatePath(`/customers/${input.customerId}`);

    return { ok: true as const, target: 'follow_ups' as const };
  }

  /* ── 行程 / 待辦 → tasks ───────────────────────────────────────────── */
  const time = /^\d{2}:\d{2}$/.test(input.time) ? input.time : '09:00';
  const startsAt = `${input.dueDate}T${time}:00+08:00`;
  // 預設 30 分鐘；tasks 有 ends_at >= starts_at 的 check constraint
  const endsAt = new Date(Date.parse(startsAt) + 30 * 60_000).toISOString();

  const { error } = await supabase.from('tasks').insert({
    advisor_id: advisorId,
    customer_id: input.customerId,
    kind: input.type, // 'event' | 'task'（'event' 由 20260810000001 migration 加入 enum）
    title,
    description,
    starts_at: startsAt,
    ends_at: endsAt,
    priority: input.priority,
  });

  if (error) {
    // 最可能的原因是 priority 欄位或 'event' enum 值還沒建立
    const hint =
      error.message.includes('priority') || error.message.includes('invalid input value')
        ? '（請先在 Supabase SQL Editor 執行 supabase/migrations/20260810000001_task_priority.sql）'
        : '';
    return { ok: false as const, error: `寫入失敗：${error.message}${hint}` };
  }

  revalidatePath('/calendar');
  revalidatePath('/');
  if (input.customerId) revalidatePath(`/customers/${input.customerId}`);

  return { ok: true as const, target: 'tasks' as const };
}
