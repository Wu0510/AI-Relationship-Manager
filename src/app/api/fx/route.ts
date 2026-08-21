import {
    NextResponse,
  } from 'next/server';
  
  import {
    getFxSnapshot,
  } from '@/lib/market/fx';
  
  export const runtime =
    'nodejs';
  
  export async function GET() {
    try {
      const data =
        await getFxSnapshot();
  
      return NextResponse.json({
        ok: true,
        data,
      });
    } catch (error) {
      console.error(
        '[api/fx] error',
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