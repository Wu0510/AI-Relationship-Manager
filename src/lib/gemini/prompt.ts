import {
  daysFromToday,
  formatDateWithWeekday,
  formatPct,
  formatTwd,
  relativeDay,
  todayInTz,
} from '@/lib/format';
import type { AnalysisType, CustomerAiContext } from '@/types/domain';

/* ==========================================================================
 *  1. System Instruction — 定義 AI 的角色、風格與合規紅線
 * ========================================================================== */

export const SYSTEM_INSTRUCTION = `你是「高情商理專 AI 顧問」，服務對象是台灣銀行／證券的財富管理理財專員（以下稱「理專」），不是客戶本人。

## 你的角色
理專每天要面對上百位客戶，時間有限。你的任務是把冰冷的資料（持有部位、到期日、通聯紀錄、市場行情）轉譯成「現在就能拿去打電話或傳訊息」的具體話術與行動建議。

## 溝通風格
- 用繁體中文（台灣用語）。金額用「萬／億」，不要用「万」或簡體字。
- 語氣溫暖、像同事在旁邊給提醒，不要官腔、不要 AI 客服腔。
- 開場先講「為什麼現在要聯繫這位客戶」，再給話術，最後給下一步。
- 話術要能直接複製貼上發給客戶，長度控制在 3～5 句，不要條列式轟炸客戶。
- 具體引用資料中的數字與日期（例如「7/20 到期的 300 萬定存」），不要講空話。

## 高情商原則
- 先照顧關係，再談商品。久未聯繫的客戶，第一句是關心不是推銷。
- 讀懂客戶的生命階段：退休族重穩定、雙薪家庭重教育金、年輕客戶重被動收入。
- 上次通話若情緒是「保留」，這次要放軟、降低推銷密度，先修復關係。
- 生日、節慶、子女升學這類節點優先於商品議題。

## 合規紅線（違反會造成法遵風險，務必嚴守）
- 絕不保證獲利、絕不預測特定標的漲跌幅、不使用「一定」「保證」「穩賺」等字眼。
- 不下達明確的買進／賣出指令，只能提供「可討論」「可評估」的建議方向。
- 推薦商品時，風險等級不得超過客戶的 RR 屬性；若有落差必須明講。
- 涉及數字時只能引用 <上下文> 內提供的資料，不得自行編造報酬率、利率或商品名稱。
- 提及投資標的時，附上「過往績效不代表未來表現」等提醒（放在 compliance_notes，不要塞進話術）。

## 資料使用
- <上下文> 是唯一事實來源。資料沒提到的事，就說「目前資料未顯示」，不要臆測。
- 日期與星期一律直接引用 <上下文> 標註的內容（格式為「2026-08-12（三）」），
  絕不可自行推算星期或說「下週三」「這個週末」這類自己算出來的相對描述。
  上下文已提供「N 天後／N 天前」，需要相對描述時只用這個。
- 若上下文明顯不足以回答，直接告訴理專還需要補哪些資訊。`;

/* ==========================================================================
 *  2. 上下文組裝 — 把 Supabase 撈到的資料序列化成 Gemini 好讀的格式
 *     用 XML-ish 標籤分區，模型對區塊邊界的辨識度比純 Markdown 好
 * ========================================================================== */

function renderCustomerProfile(ctx: CustomerAiContext): string {
  const c = ctx.customer;
  const daysSinceContact = c.last_contact_at ? -(daysFromToday(c.last_contact_at) ?? 0) : null;
  const daysToBirthday = birthdayCountdown(c.birthday);

  const lines = [
    `姓名：${c.name}`,
    c.age != null && `年齡：${c.age} 歲`,
    c.occupation && `職業：${c.occupation}`,
    c.family_status && `家庭狀況：${c.family_status}`,
    `總資產 AUM：${formatTwd(c.aum_twd)}`,
    `投資風格：${c.invest_style ?? '未設定'}／風險屬性：${c.risk_level ?? '未設定'}`,
    c.last_contact_at && `最後聯繫：${c.last_contact_at}（${daysSinceContact} 天前）`,
    daysToBirthday !== null && daysToBirthday <= 30 && `生日：${c.birthday?.slice(5)}（${relativeDay(daysToBirthday)}）`,
    c.joined_date && `成為客戶：${c.joined_date}`,
    c.tags.length > 0 && `既有標籤：${c.tags.join('、')}`,
    c.note && `理專備註：${c.note}`,
  ].filter(Boolean);

  return lines.join('\n');
}

function renderAssets(ctx: CustomerAiContext): string {
  if (ctx.assets.length === 0) return '（此客戶目前無在管商品部位）';

  const total = ctx.assets.reduce((sum, a) => sum + Number(a.amount_twd), 0);

  const rows = ctx.assets.map((a) => {
    const parts = [`・[${a.asset_type}] ${a.product_name}`, `金額 ${formatTwd(Number(a.amount_twd))}`];
    if (total > 0) parts.push(`占比 ${Math.round((Number(a.amount_twd) / total) * 100)}%`);
    if (a.return_pct != null) parts.push(`報酬率 ${formatPct(Number(a.return_pct))}`);
    if (a.maturity_date) {
      const d = daysFromToday(a.maturity_date);
      parts.push(
        `到期日 ${formatDateWithWeekday(a.maturity_date)}｜${relativeDay(d)}${d !== null && d <= 0 ? '，已到期' : ''}`,
      );
    }
    if (a.currency !== 'TWD') parts.push(`計價幣別 ${a.currency}`);
    return parts.join('｜');
  });

  // 配置集中度：讓模型能直接評論而不用自己算
  const byType = new Map<string, number>();
  for (const a of ctx.assets) {
    byType.set(a.asset_type, (byType.get(a.asset_type) ?? 0) + Number(a.amount_twd));
  }
  const allocation = [...byType.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([type, amt]) => `${type} ${Math.round((amt / total) * 100)}%`)
    .join('、');

  return [
    `在管部位合計：${formatTwd(total)}（占 AUM 約 ${Math.round((total / Math.max(Number(ctx.customer.aum_twd), 1)) * 100)}%）`,
    `類別配置：${allocation}`,
    '',
    ...rows,
  ].join('\n');
}

function renderInteractions(ctx: CustomerAiContext): string {
  if (ctx.interactions.length === 0) return '（尚無通聯紀錄，這可能是第一次深度接觸）';

  const CHANNEL_LABEL: Record<string, string> = {
    phone: '電話', visit: '面訪', email: 'Email', line: 'LINE', message: '訊息', other: '其他',
  };

  return ctx.interactions
    .map((log) => {
      const date = log.occurred_at.slice(0, 10);
      const d = daysFromToday(date);
      const head = `【${formatDateWithWeekday(date)}・${relativeDay(d)}・${CHANNEL_LABEL[log.channel] ?? log.channel}】`;
      const body = [
        log.ai_summary || log.raw_note || '（無內容）',
        log.needs.length > 0 && `→ 辨識需求：${log.needs.join('、')}`,
        log.reaction && `→ 客戶反應：${log.reaction}`,
        log.follow_up_action && `→ 當時承諾：${log.follow_up_action}`,
      ].filter(Boolean).join('\n  ');
      return `${head}\n  ${body}`;
    })
    .join('\n');
}

function renderPendingItems(ctx: CustomerAiContext): string {
  const lines: string[] = [];

  for (const f of ctx.follow_ups) {
    const d = daysFromToday(f.due_date);
    const flag = d !== null && d < 0 ? `⚠️ 已逾期 ${-d} 天` : relativeDay(d);
    lines.push(`・Follow Up：${f.content}（到期 ${formatDateWithWeekday(f.due_date)}，${flag}）`);
  }
  for (const t of ctx.upcoming_tasks) {
    lines.push(
      `・已排定行程：${t.title}（${formatDateWithWeekday(t.starts_at)} ${t.starts_at.slice(11, 16)}）`,
    );
  }

  return lines.length > 0 ? lines.join('\n') : '（目前沒有待處理的追蹤事項）';
}

function renderMarket(ctx: CustomerAiContext): string {
  if (ctx.market.length === 0) return '（今日無市場資料，請避免在話術中提及行情）';
  return ctx.market
    .map((m) => `・[${m.category ?? '綜合'}] ${m.headline}\n  ${m.summary ?? ''}`.trimEnd())
    .join('\n');
}

/** 生日倒數（跨年處理）；無生日回傳 null */
function birthdayCountdown(birthday: string | null): number | null {
  if (!birthday) return null;
  const today = todayInTz();
  const [ty, tm, td] = today.split('-').map(Number);
  const [, bm, bd] = birthday.split('-').map(Number);
  const thisYear = Date.UTC(ty, bm - 1, bd);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const target = thisYear >= todayUtc ? thisYear : Date.UTC(ty + 1, bm - 1, bd);
  return Math.round((target - todayUtc) / 86_400_000);
}

/**
 * 組裝完整的動態上下文區塊。
 * 這段會被放進 user turn（而不是 system instruction），
 * 因為它每次請求都不同，放 user turn 才不會破壞 system 層的 prompt cache。
 */
export function buildContextBlock(ctx: CustomerAiContext): string {
  return `<上下文 今日日期="${formatDateWithWeekday(todayInTz())}">

<客戶檔案>
${renderCustomerProfile(ctx)}
</客戶檔案>

<持有部位>
${renderAssets(ctx)}
</持有部位>

<通聯紀錄 說明="由新到舊，最多 8 筆">
${renderInteractions(ctx)}
</通聯紀錄>

<待辦與追蹤>
${renderPendingItems(ctx)}
</待辦與追蹤>

<今日市場動態>
${renderMarket(ctx)}
</今日市場動態>

</上下文>`;
}

/* ==========================================================================
 *  3. 任務指令 — 對應原型的 6 個 AI 分析按鈕
 * ========================================================================== */

export const ANALYSIS_TASKS: Record<AnalysisType, { label: string; instruction: string }> = {
  analyze: {
    label: '分析客戶輪廓',
    instruction: `請分析這位客戶的輪廓：他是什麼樣的人、目前的財務狀態、從通聯紀錄看得出的性格與偏好、以及理專最該留意的一件事。
talking_points 放「輪廓觀察」，suggested_message 放一段適合下次開場的暖身訊息。`,
  },
  opener: {
    label: '今天可以聊什麼',
    instruction: `請給出「今天聯繫這位客戶」的切入點。
talking_points 給 3 個依優先順序排列的話題，每個都要說明「為什麼是現在」（到期日、行情變化、生日、久未聯繫、上次承諾等）。
suggested_message 挑最優先的那一個，寫成可直接發送的訊息。`,
  },
  allocation: {
    label: '資產配置檢視',
    instruction: `請檢視這位客戶的資產配置：集中度是否過高、幣別與商品類別是否失衡、即將到期的部位該如何銜接。
talking_points 放配置面的觀察與可討論的調整方向（不要下明確買賣指令）。
suggested_message 寫成一段邀請客戶做「配置健檢」的訊息。`,
  },
  risk: {
    label: '風險屬性建議',
    instruction: `請比對客戶的風險屬性（RR 等級／投資風格）與實際持有部位是否相符。
若實際持有的風險高於或低於其屬性，明確指出落差與可能的法遵疑慮。
talking_points 放風險面的觀察，compliance_notes 務必列出需要重新做 KYC／風險評估的情況。`,
  },
  product: {
    label: '推薦適合商品',
    instruction: `請依客戶的風險屬性、現有部位缺口與今日市場動態，提出 2～3 個「商品類型」層級的建議方向（例如「短天期投等債 ETF」而非特定基金代號，除非上下文已提供）。
每個建議都要說明適合的理由與對應的客戶需求。
compliance_notes 必須註明：實際銷售前需完成適合度評估、過往績效不代表未來表現。`,
  },
  followup: {
    label: '產生 Follow Up 建議',
    instruction: `請盤點這位客戶的待辦與追蹤事項，判斷輕重緩急。
逾期項目要優先處理並提出補救話術（如何在不失禮的情況下重新接上）。
next_actions 給出具體、可排進行事曆的行動與建議天數。`,
  },
};

/** 結構化輸出的 responseSchema（給 Gemini 的 JSON Schema 子集） */
export const ADVISOR_SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: '一句話總結這次建議的重點，20 字以內' },
    situation: { type: 'string', description: '為什麼現在要聯繫這位客戶，2-3 句' },
    talking_points: {
      type: 'array',
      description: '依優先順序排列的觀察或話題，每則 1-2 句',
      items: { type: 'string' },
    },
    suggested_message: {
      type: 'string',
      description: '可直接複製傳給客戶的訊息，3-5 句，繁體中文，不含條列符號',
    },
    next_actions: {
      type: 'array',
      description: '理專的下一步行動',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          due_in_days: { type: 'integer', description: '幾天內完成，0 代表今天' },
        },
        required: ['action', 'due_in_days'],
      },
    },
    compliance_notes: {
      type: 'array',
      description: '法遵提醒，給理專看的，不要放進客戶訊息',
      items: { type: 'string' },
    },
  },
  required: ['headline', 'situation', 'talking_points', 'suggested_message', 'next_actions', 'compliance_notes'],
} as const;

/** 通聯紀錄摘要的 responseSchema（取代原型的 generateAISummary 正則比對） */
export const CALL_LOG_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '90 字以內的通話摘要' },
    needs: {
      type: 'array',
      description: '從對話中辨識出的客戶需求標籤，例如「定存續存意願」「子女教育金規劃」',
      items: { type: 'string' },
    },
    reaction: { type: 'string', enum: ['正面', '中立', '保留'] },
    suggested_follow_up: { type: 'string', description: '建議的後續追蹤事項；沒有則回空字串' },
    suggested_next_contact_days: { type: 'integer', description: '建議幾天後再聯繫' },
  },
  required: ['summary', 'needs', 'reaction', 'suggested_follow_up', 'suggested_next_contact_days'],
} as const;

/* ==========================================================================
 *  4. 組合完整的 user prompt
 * ========================================================================== */

export function buildAnalysisPrompt(ctx: CustomerAiContext, type: AnalysisType): string {
  const task = ANALYSIS_TASKS[type];
  return `${buildContextBlock(ctx)}

<任務 名稱="${task.label}">
${task.instruction}
</任務>

請依照指定的 JSON 結構輸出。`;
}

export function buildChatPrompt(ctx: CustomerAiContext, question: string): string {
  return `${buildContextBlock(ctx)}

<理專提問>
${question}
</理專提問>

請直接以自然的對話方式回覆理專（不需要 JSON）。若提問涉及話術，請把可直接發送的訊息獨立成一段並用引號標示。`;
}

export function buildCallLogPrompt(customerName: string, rawNote: string): string {
  return `以下是理專與客戶「${customerName}」通話後輸入的原始筆記，請整理成結構化的通聯紀錄。

<通話筆記>
${rawNote}
</通話筆記>

摘要要保留關鍵數字與客戶原話的語氣。needs 使用金融業常見的需求分類用語。`;
}
