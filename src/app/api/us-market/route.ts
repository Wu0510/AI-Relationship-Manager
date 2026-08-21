import {
    NextResponse,
  } from 'next/server';
  
  import {
    getUsMarketSnapshot,
  } from '@/lib/market/usMarket';
  
  
  export const runtime =
    'nodejs';
  
  
  export async function GET() {
    try {
  
      const data =
        await getUsMarketSnapshot();
  
  
      return NextResponse.json({
        ok: true,
  
        data,
      });
  
    } catch (error) {
  
      console.error(
        '[api/us-market] error',
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
  