import { NextResponse } from 'next/server';

import { getTaiwanMarketSnapshot } from '@/lib/market/service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getTaiwanMarketSnapshot();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error('[api/market] error', error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      {
        status: 500,
      },
    );
  }
}