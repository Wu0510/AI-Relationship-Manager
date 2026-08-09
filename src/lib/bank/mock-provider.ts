import 'server-only';

/**
 * 模擬銀行資料來源。
 *
 * 刻意與 route handler 分開：日後接真實的 Open Banking API 或 CSV 匯入時，
 * 只要換掉這個檔案並保持 BankTransaction 的形狀不變，route 完全不用改。
 */

export interface BankTransaction {
  /** 銀行端交易序號 —— 用來擋掉重複匯入 */
  externalId: string;
  customerId: string;
  transactionDate: string; // ISO 8601
  merchantName: string;
  /** 正數＝收入，負數＝支出 */
  amount: number;
  category: string;
  /** 帳號末四碼 */
  accountNumber: string;
  currency: string;
  raw: Record<string, unknown>;
}

/* ==========================================================================
 *  店家目錄 — 每個項目自帶類別、金額範圍與發生頻率
 * ========================================================================== */

interface MerchantSpec {
  name: string;
  category: string;
  /** [最小, 最大]，單位元；負數代表支出 */
  range: [number, number];
  /** 相對權重，越大越常出現 */
  weight: number;
}

const MERCHANTS: MerchantSpec[] = [
  // ── 餐飲 ──
  { name: '星巴克', category: '餐飲', range: [-320, -85], weight: 10 },
  { name: '全家便利商店', category: '餐飲', range: [-260, -45], weight: 12 },
  { name: '鼎泰豐', category: '餐飲', range: [-2400, -680], weight: 3 },
  { name: 'UberEats', category: '餐飲', range: [-680, -180], weight: 8 },
  { name: '路易莎咖啡', category: '餐飲', range: [-220, -70], weight: 6 },

  // ── 生活消費 ──
  { name: '全聯福利中心', category: '生活消費', range: [-3200, -420], weight: 9 },
  { name: '家樂福', category: '生活消費', range: [-4500, -600], weight: 5 },
  { name: '屈臣氏', category: '生活消費', range: [-1200, -180], weight: 4 },
  { name: 'PChome 24h', category: '生活消費', range: [-8600, -390], weight: 5 },

  // ── 交通 ──
  { name: '台灣高鐵', category: '交通', range: [-1490, -290], weight: 4 },
  { name: '中油加油站', category: '交通', range: [-2200, -800], weight: 6 },
  { name: '悠遊卡自動加值', category: '交通', range: [-1000, -500], weight: 7 },

  // ── 保險 ──
  { name: '國泰人壽', category: '保險', range: [-42_000, -8600], weight: 3 },
  { name: '富邦人壽', category: '保險', range: [-38_000, -7200], weight: 2 },
  { name: '南山人壽 醫療險', category: '保險', range: [-18_000, -4800], weight: 2 },

  // ── 醫療 ──
  { name: '台大醫院', category: '醫療', range: [-4800, -320], weight: 2 },
  { name: '長庚紀念醫院', category: '醫療', range: [-3600, -280], weight: 2 },

  // ── 教育 ──
  { name: '兒童美語學費', category: '教育', range: [-26_000, -12_000], weight: 2 },
  { name: '誠品書店', category: '教育', range: [-2400, -320], weight: 3 },

  // ── 投資理財（支出面：扣款買入）──
  { name: '基金定期定額扣款', category: '投資理財', range: [-30_000, -5000], weight: 6 },
  { name: '證券交割扣款', category: '投資理財', range: [-180_000, -25_000], weight: 4 },

  // ── 投資理財（收入面）──
  { name: '台積電股息', category: '投資理財', range: [8600, 96_000], weight: 4 },
  { name: '元大高股息 (0056) 配息', category: '投資理財', range: [4200, 58_000], weight: 4 },
  { name: '國泰永續高股息 (00878) 配息', category: '投資理財', range: [3600, 42_000], weight: 3 },
  { name: '定存利息', category: '投資理財', range: [1200, 26_000], weight: 3 },
  { name: '基金贖回入帳', category: '投資理財', range: [45_000, 380_000], weight: 2 },

  // ── 收入 ──
  { name: '薪資轉帳', category: '收入', range: [62_000, 260_000], weight: 5 },
  { name: '獎金入帳', category: '收入', range: [30_000, 480_000], weight: 1 },
];

const TOTAL_WEIGHT = MERCHANTS.reduce((s, m) => s + m.weight, 0);

function pickMerchant(rand: () => number): MerchantSpec {
  let r = rand() * TOTAL_WEIGHT;
  for (const m of MERCHANTS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return MERCHANTS[MERCHANTS.length - 1];
}

/** 帳號末四碼 —— 同一位客戶固定同一組，看起來才像同一個帳戶 */
function accountFor(customerId: string): string {
  let h = 0;
  for (let i = 0; i < customerId.length; i++) {
    h = (h * 31 + customerId.charCodeAt(i)) % 10_000;
  }
  return String(h).padStart(4, '0');
}

/* ==========================================================================
 *  抓取
 * ========================================================================== */

export interface FetchOptions {
  customerIds: string[];
  /** 往回抓幾天 */
  days: number;
  /** 每位客戶抓幾筆 */
  perCustomer: number;
}

/**
 * 模擬向銀行請求交易明細。
 *
 * externalId 由 customerId + 日期 + 序號組成，因此「同一天同一位客戶的第 N 筆」
 * 在重複同步時會產生相同的 id，配合 DB 的唯一索引就能天然去重
 * —— 不會每按一次按鈕就多一份資料。
 */
export async function fetchBankTransactions(
  options: FetchOptions,
): Promise<{ transactions: BankTransaction[]; latencyMs: number }> {
  const { customerIds, days, perCustomer } = options;

  // 模擬銀行 API 的網路延遲（含 TLS handshake 與授權），讓前端 loading 有意義
  const latencyMs = 600 + Math.floor(Math.random() * 900);
  await new Promise((resolve) => setTimeout(resolve, latencyMs));

  const transactions: BankTransaction[] = [];
  const now = Date.now();

  for (const customerId of customerIds) {
    const account = accountFor(customerId);

    for (let i = 0; i < perCustomer; i++) {
      const spec = pickMerchant(Math.random);

      // 在區間內取值，並依金額大小決定進位單位（大額進位到百元較擬真）
      const [lo, hi] = spec.range;
      const raw = lo + Math.random() * (hi - lo);
      const magnitude = Math.abs(raw);
      const step = magnitude >= 10_000 ? 100 : magnitude >= 1000 ? 10 : 1;
      const amount = Math.round(raw / step) * step;

      // 分散在過去 N 天內的營業時間
      const dayOffset = Math.floor(Math.random() * days);
      const hour = 8 + Math.floor(Math.random() * 14);
      const minute = Math.floor(Math.random() * 60);
      const d = new Date(now - dayOffset * 86_400_000);
      d.setHours(hour, minute, 0, 0);
      const dateKey = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
        d.getDate(),
      ).padStart(2, '0')}`;

      transactions.push({
        externalId: `MOCK-${customerId.slice(0, 8)}-${dateKey}-${String(i).padStart(3, '0')}`,
        customerId,
        transactionDate: d.toISOString(),
        merchantName: spec.name,
        amount,
        category: spec.category,
        accountNumber: account,
        currency: 'TWD',
        raw: {
          provider: 'mock-bank',
          channel: amount > 0 ? 'INWARD' : 'CARD',
          fetched_at: new Date().toISOString(),
        },
      });
    }
  }

  // 由新到舊
  transactions.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

  return { transactions, latencyMs };
}
