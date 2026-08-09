import { NextResponse } from 'next/server';

/** 把丟出來的錯誤轉成一致的 JSON 回應。 */
export function toErrorResponse(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'UnauthorizedError') {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }
    if (error.name === 'NotFoundError') {
      return NextResponse.json({ error: '找不到指定資料' }, { status: 404 });
    }
    if (error.name === 'GoogleNotConnectedError') {
      return NextResponse.json(
        { error: '尚未連結 Google 帳號', code: 'GOOGLE_NOT_CONNECTED', authUrl: '/api/google/auth' },
        { status: 409 },
      );
    }
    console.error('[api]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.error('[api] unknown error', error);
  return NextResponse.json({ error: '伺服器發生未預期錯誤' }, { status: 500 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
