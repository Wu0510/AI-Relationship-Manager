/**
 * 集中管理環境變數，缺漏時在啟動階段就報錯，避免 runtime 才炸在 API Route。
 */
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`[env] 缺少環境變數 ${key}，請檢查 .env.local`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  supabase: {
    url: () => required('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  },
  gemini: {
    apiKey: () => required('GEMINI_API_KEY'),
    // gemini-2.5-* 已對新申請的 API key 停止提供（呼叫會回 404 NOT_FOUND）
    model: () => optional('GEMINI_MODEL', 'gemini-3.6-flash'),
    proModel: () => optional('GEMINI_MODEL_PRO', 'gemini-3.6-flash'),
  },
  google: {
    clientId: () => required('GOOGLE_CLIENT_ID'),
    clientSecret: () => required('GOOGLE_CLIENT_SECRET'),
    redirectUri: () => required('GOOGLE_REDIRECT_URI'),
  },
  app: {
    url: () => optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
    timezone: () => optional('APP_TIMEZONE', 'Asia/Taipei'),
  },
} as const;
