import { NextResponse } from 'next/server';

import {
  getMarketNewsSnapshot,
} from '@/lib/market/news';


export const runtime =
  'nodejs';


export async function GET() {
  try {
    const data =
      await getMarketNewsSnapshot();

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error(
      '[api/news] error',
      error,
    );

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