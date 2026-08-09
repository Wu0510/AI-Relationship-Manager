'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { completeFollowUp } from '@/app/actions';

/** 「標記完成」按鈕 — 呼叫 Server Action，成功後由 revalidatePath 重新渲染。 */
export function CompleteFollowUpButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="text-xs" style={{ color: 'var(--rose)' }}>
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError('');
            const res = await completeFollowUp(id);
            if (!res.ok) setError(res.error);
          })
        }
        className="flex items-center gap-1 text-xs font-medium"
        style={{ color: 'var(--accent)', opacity: pending ? 0.5 : 1 }}
      >
        {pending ? (
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <Check size={12} />
        )}
        標記完成
      </button>
    </span>
  );
}
