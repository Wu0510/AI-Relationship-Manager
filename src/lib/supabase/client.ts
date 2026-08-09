'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Client Component 用的 Supabase client（單例）。
 * 只帶 anon key，一切存取都受 RLS 保護。
 */
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return browserClient;
}
