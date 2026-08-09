'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarDays, CheckSquare, Clock, Loader2, Plus, X } from 'lucide-react';
import { createTask, type NewTaskType, type TaskPriority } from '@/app/actions';

const TYPES: {
  value: NewTaskType;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number }>;
}[] = [
  { value: 'event', label: '行程', hint: '約訪、會議', icon: CalendarDays },
  { value: 'task', label: '待辦', hint: '例行工作', icon: CheckSquare },
  { value: 'follow_up', label: '追蹤事項', hint: '進提醒中心', icon: Clock },
];

const PRIORITIES: { value: TaskPriority; label: string; cls: string }[] = [
  { value: 'high', label: '高', cls: 'on-negative' },
  { value: 'medium', label: '中', cls: 'on-neutral' },
  { value: 'low', label: '低', cls: 'on-positive' },
];

export interface TaskCustomerOption {
  id: string;
  name: string;
}

function nowTimeTpe(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/**
 * 「新增行程／待辦」按鈕 + Modal。
 *
 * defaultDate 由行事曆頁傳入 —— 使用者點某一天再按新增時，
 * 日期會預填那一天而不是今天。
 */
export function NewTaskModal({
  defaultDate,
  customers,
}: {
  defaultDate: string;
  customers: TaskCustomerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [type, setType] = useState<NewTaskType>('event');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(defaultDate);
  const [time, setTime] = useState('09:00');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');

  function openModal() {
    setType('event');
    setTitle('');
    setDueDate(defaultDate);
    setTime(nowTimeTpe());
    setPriority('medium');
    setDescription('');
    setCustomerId('');
    setError('');
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('請輸入標題');
      return;
    }
    if (type === 'follow_up' && !customerId) {
      setError('追蹤事項必須指定客戶（提醒中心是依客戶顯示的）');
      return;
    }

    startTransition(async () => {
      setError('');
      const res = await createTask({
        type,
        title,
        dueDate,
        time,
        priority,
        description,
        customerId: customerId || null,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      router.refresh();
      setOpen(false);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={openModal}>
        <Plus size={16} />
        新增行程／待辦
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!pending) setOpen(false);
          }}
        >
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="新增行程或待辦"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>新增行程／待辦</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="關閉"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={submit} style={{ display: 'contents' }}>
              <div className="modal-body">
                {/* 類型 */}
                <div>
                  <span className="field-label">類型</span>
                  <div className="seg-group">
                    {TYPES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setType(t.value)}
                          className={`seg-btn ${type === t.value ? 'on-selected' : ''}`}
                          aria-pressed={type === t.value}
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            <Icon size={14} />
                            {t.label}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                            {t.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 mb-0 text-xs" style={{ color: 'var(--faint)', lineHeight: 1.6 }}>
                    {type === 'follow_up'
                      ? '寫入 follow_ups 表，會出現在提醒中心並可標記完成。'
                      : '寫入 tasks 表，會出現在行事曆與首頁「今日待辦」。'}
                  </p>
                </div>

                {/* 標題 */}
                <div>
                  <label htmlFor="tk-title" className="field-label">
                    標題
                  </label>
                  <input
                    id="tk-title"
                    type="text"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      type === 'event'
                        ? '例：約訪黃雅婷討論子女教育金'
                        : type === 'task'
                          ? '例：整理本月到期商品清單'
                          : '例：寄送退休試算表'
                    }
                  />
                </div>

                {/* 日期 / 時間 */}
                <div className="two-col">
                  <div>
                    <label htmlFor="tk-date" className="field-label">
                      {type === 'follow_up' ? '到期日' : '執行日期'}
                    </label>
                    <input
                      id="tk-date"
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="tk-time" className="field-label">
                      時間
                      {type === 'follow_up' && (
                        <span style={{ opacity: 0.7 }}>（追蹤事項不使用）</span>
                      )}
                    </label>
                    <input
                      id="tk-time"
                      type="time"
                      value={time}
                      disabled={type === 'follow_up'}
                      onChange={(e) => setTime(e.target.value)}
                      style={type === 'follow_up' ? { opacity: 0.5 } : undefined}
                    />
                  </div>
                </div>

                {/* 優先級 */}
                <div>
                  <span className="field-label">優先級</span>
                  <div className="seg-group">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPriority(p.value)}
                        className={`seg-btn ${priority === p.value ? p.cls : ''}`}
                        aria-pressed={priority === p.value}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 客戶 */}
                <div>
                  <label htmlFor="tk-customer" className="field-label">
                    關聯客戶
                    {type === 'follow_up' ? '（必填）' : '（選填）'}
                  </label>
                  <select
                    id="tk-customer"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">— 不關聯特定客戶 —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 備註 */}
                <div>
                  <label htmlFor="tk-desc" className="field-label">
                    備註描述
                  </label>
                  <textarea
                    id="tk-desc"
                    rows={3}
                    maxLength={4000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="選填。例：客戶希望先看保本型方案的比較表。"
                    style={{ resize: 'vertical', minHeight: 72 }}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="m-0 flex items-start gap-2 text-xs"
                    style={{
                      color: 'var(--badge-rose-text)',
                      background: 'var(--badge-rose-bg)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      lineHeight: 1.6,
                    }}
                  >
                    <AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                    {error}
                  </p>
                )}
              </div>

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {pending && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                  {pending ? '儲存中…' : '建立'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
