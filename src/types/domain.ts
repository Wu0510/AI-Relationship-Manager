/**
 * 領域型別 — 對應 supabase/migrations 的資料表。
 * 執行 `npm run db:types` 可產生完整的 Database 型別，兩者可並存。
 */

export type RiskLevel = 'RR1' | 'RR2' | 'RR3' | 'RR4' | 'RR5';
export type InvestStyle = '保守型' | '穩健型' | '積極型';
export type AssetType = '定存' | '基金' | 'ETF' | '股票' | '債券' | '保險' | '外幣' | '現金' | '其他';
export type InteractionChannel = 'phone' | 'visit' | 'email' | 'line' | 'message' | 'other';
export type CustomerReaction = '正面' | '中立' | '保留';
export type FollowUpStatus = 'pending' | 'done' | 'cancelled';
export type TaskKind = 'call' | 'visit' | 'task' | 'review';
export type ChatRole = 'user' | 'model';

export interface Customer {
  id: string;
  advisor_id: string;
  name: string;
  age: number | null;
  occupation: string | null;
  family_status: string | null;
  phone: string | null;
  email: string | null;
  aum_twd: number;
  invest_style: InvestStyle | null;
  risk_level: RiskLevel | null;
  birthday: string | null;
  joined_date: string | null;
  last_contact_at: string | null;
  note: string | null;
  tags: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerAsset {
  id: string;
  customer_id: string;
  asset_type: AssetType;
  product_name: string;
  product_code: string | null;
  amount_twd: number;
  cost_twd: number | null;
  return_pct: number | null;
  currency: string;
  purchased_at: string | null;
  maturity_date: string | null;
  is_active: boolean;
  meta: Record<string, unknown>;
}

export interface InteractionLog {
  id: string;
  customer_id: string;
  channel: InteractionChannel;
  occurred_at: string;
  raw_note: string | null;
  ai_summary: string | null;
  needs: string[];
  reaction: CustomerReaction | null;
  next_contact_date: string | null;
  follow_up_action: string | null;
}

export interface FollowUp {
  id: string;
  customer_id: string;
  content: string;
  due_date: string;
  status: FollowUpStatus;
  completed_at: string | null;
}

export interface Task {
  id: string;
  advisor_id: string;
  customer_id: string | null;
  kind: TaskKind;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  is_all_day: boolean;
  is_done: boolean;
  google_event_id: string | null;
  google_calendar_id: string;
  google_html_link: string | null;
  synced_at: string | null;
  sync_error: string | null;
}

export interface MarketSnapshot {
  headline: string;
  summary: string | null;
  category: string | null;
  indices: Record<string, unknown>;
}

/** get_customer_ai_context() RPC 的回傳形狀 */
export interface CustomerAiContext {
  customer: Customer;
  assets: CustomerAsset[];
  interactions: InteractionLog[];
  follow_ups: FollowUp[];
  upcoming_tasks: Task[];
  market: MarketSnapshot[];
}

/** AI 分析功能（沿用原型的 AI_ACTIONS） */
export type AnalysisType =
  | 'analyze'     // 分析客戶輪廓
  | 'opener'      // 今天可以聊什麼（開場話術）
  | 'allocation'  // 資產配置檢視
  | 'risk'        // 風險屬性建議
  | 'product'     // 推薦適合商品
  | 'followup';   // 產生 Follow Up 建議

/** Gemini 結構化輸出：AI 顧問建議 */
export interface AdvisorSuggestion {
  headline: string;
  situation: string;
  talking_points: string[];
  suggested_message: string;
  next_actions: { action: string; due_in_days: number }[];
  compliance_notes: string[];
}

/** Gemini 結構化輸出：通聯紀錄摘要 */
export interface CallLogAnalysis {
  summary: string;
  needs: string[];
  reaction: CustomerReaction;
  suggested_follow_up: string | null;
  suggested_next_contact_days: number | null;
}
