import {
    NextResponse,
  } from 'next/server';
  
  import {
    getTreasurySnapshot,
  } from '@/lib/market/treasury';
  
  export const runtime =
    'nodejs';
  
  export async function GET() {
    try {
      const data =
        await getTreasurySnapshot();
  
      return NextResponse.json({
        ok: true,
        data,
      });
    } catch (error) {
      console.error(
        '[api/treasury] error',
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