import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { badRequest, toErrorResponse } from '@/lib/api';
import { fetchBankTransactions } from '@/lib/bank/mock-provider';
import { createClient, requireAdvisorId } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  /** 只同步單一客戶；省略則同步名下所有客戶 */
  customerId: z.uuid().optional(),
  /** 往回抓幾天，預設 60 */
  days: z.number().int().min(1).max(365).optional().default(60),
  /** 每位客戶抓幾筆，預設 12 */
  perCustomer: z.number().int().min(1).max(100).optional().default(12),
});

/**
 * POST /api/bank-sync
 * 模擬向銀行 API 抓取交易明細，解析後寫入 bank_transactions。
 *
 * body: { customerId?, days?, perCustomer? }
 *
 * 去重機制：以 (advisor_id, external_id) 唯一索引搭配 ignoreDuplicates upsert。
 * 重複按同步按鈕不會產生重複資料 —— 只會回報 skipped 筆數。
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const advisorId = await requireAdvisorId();
    const supabase = await createClient();

    // 允許空 body
    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) return badRequest(z.prettifyError(parsed.error));
    const { customerId, days, perCustomer } = parsed.data;

    /* ── 1. 取得要同步的客戶（RLS 保證只拿到自己的）───────────────────── */
    let customerQuery = supabase
      .from('customers')
      .select('id, name')
      .eq('is_archived', false);
    if (customerId) customerQuery = customerQuery.eq('id', customerId);

    const { data: customers, error: customerError } = await customerQuery;
    if (customerError) throw new Error(`讀取客戶清單失敗：${customerError.message}`);

    if (!customers || customers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: customerId
            ? '找不到指定的客戶，或您沒有存取權限'
            : '名下沒有任何客戶，請先建立客戶或執行 supabase/seed.sql',
          inserted: 0,
        },
        { status: 404 },
      );
    }

    /* ── 2. 向「銀行」抓取（模擬）──────────────────────────────────────── */
    const { transactions, latencyMs } = await fetchBankTransactions({
      customerIds: customers.map((c) => c.id as string),
      days,
      perCustomer,
    });

    /* ── 3. 寫入 Supabase ─────────────────────────────────────────────── */
    const rows = transactions.map((t) => ({
      advisor_id: advisorId,
      customer_id: t.customerId,
      external_id: t.externalId,
      transaction_date: t.transactionDate,
      merchant_name: t.merchantName,
      amount: t.amount,
      category: t.category,
      account_number: t.accountNumber,
      currency: t.currency,
      source: 'mock',
      raw: t.raw,
    }));

    // ignoreDuplicates + .select() → 回傳的只有「真正新增」的列，
    // 所以 inserted 數字是準確的，不是「送出的筆數」。
    const { data: insertedRows, error: insertError } = await supabase
      .from('bank_transactions')
      .upsert(rows, { onConflict: 'advisor_id,external_id', ignoreDuplicates: true })
      .select('id');

    if (insertError) {
      const missingTable =
        insertError.code === '42P01' || insertError.message.includes('bank_transactions');
      return NextResponse.json(
        {
          success: false,
          error: `寫入失敗：${insertError.message}`,
          hint: missingTable
            ? '請先在 Supabase SQL Editor 執行 supabase/migrations/20260810000002_bank_transactions.sql'
            : insertError.code === '42501'
              ? 'GRANT 缺失（與 RLS 無關）。請確認建表 SQL 的 grant 段落已執行。'
              : undefined,
          inserted: 0,
        },
        { status: 500 },
      );
    }

    const inserted = insertedRows?.length ?? 0;
    const skipped = rows.length - inserted;

    /* ── 4. 統計回傳 ──────────────────────────────────────────────────── */
    const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + -t.amount, 0);

    const byCategory: Record<string, number> = {};
    for (const t of transactions) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      generated: rows.length,
      customers: customers.length,
      range: { days, perCustomer },
      summary: {
        income: Math.round(income),
        expense: Math.round(expense),
        net: Math.round(income - expense),
        byCategory,
      },
      timing: { bankLatencyMs: latencyMs, totalMs: Date.now() - startedAt },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * GET /api/bank-sync?customerId=...&limit=50
 * 讀回已匯入的交易明細（供頁面顯示或驗證同步結果）。
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdvisorId();
    const supabase = await createClient();

    const customerId = request.nextUrl.searchParams.get('customerId');
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 50), 200);

    let query = supabase
      .from('bank_transactions')
      .select(
        'id, customer_id, transaction_date, merchant_name, amount, category, account_number, currency, customers(name)',
      )
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          hint:
            error.code === '42P01'
              ? '資料表不存在，請先執行 supabase/migrations/20260810000002_bank_transactions.sql'
              : undefined,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, count: data?.length ?? 0, transactions: data ?? [] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
