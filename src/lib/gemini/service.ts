import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getGenAI, MODELS } from '@/lib/gemini/client';

import {
  ADVISOR_SUGGESTION_SCHEMA,
  CALL_LOG_SCHEMA,
  SYSTEM_INSTRUCTION,
  buildAnalysisPrompt,
  buildCallLogPrompt,
  buildChatPrompt,
} from '@/lib/gemini/prompt';

import {
  getTaiwanMarketSnapshot,
  type TaiwanMarketSnapshot,
} from '@/lib/market/service';

import {
  getUsMarketSnapshot,
  type UsMarketSnapshot,
} from '@/lib/market/usMarket';

import {
  getMarketNewsSnapshot,
  type MarketNewsSnapshot,
} from '@/lib/market/news';

import {
  getFxSnapshot,
  type FxSnapshot,
} from '@/lib/market/fx';

import {
  getTreasurySnapshot,
  type TreasurySnapshot,
} from '@/lib/market/treasury';

import type {
  AdvisorSuggestion,
  AnalysisType,
  CallLogAnalysis,
  CustomerAiContext,
} from '@/types/domain';


/* ==========================================================================
 * Customer Context
 * ========================================================================== */

export async function loadCustomerContext(
  supabase: SupabaseClient,
  customerId: string,
  logLimit = 8,
): Promise<CustomerAiContext> {
  const { data, error } = await supabase.rpc(
    'get_customer_ai_context',
    {
      p_customer_id: customerId,
      p_log_limit: logLimit,
    },
  );

  if (error) {
    throw new Error(
      `載入客戶上下文失敗：${error.message}`,
    );
  }

  if (!data?.customer) {
    const err =
      new Error('CUSTOMER_NOT_FOUND');

    err.name =
      'NotFoundError';

    throw err;
  }

  return data as CustomerAiContext;
}


/* ==========================================================================
 * Customer Analysis
 * ========================================================================== */

export async function generateAnalysis(
  ctx: CustomerAiContext,
  type: AnalysisType,
): Promise<AdvisorSuggestion> {
  const ai =
    getGenAI();

  const useProModel =
    type === 'analyze' ||
    type === 'allocation';

  const response =
    await ai.models.generateContent({
      model:
        useProModel
          ? MODELS.pro()
          : MODELS.fast(),

      contents:
        buildAnalysisPrompt(
          ctx,
          type,
        ),

      config: {
        systemInstruction:
          SYSTEM_INSTRUCTION,

        temperature:
          0.7,

        maxOutputTokens:
          4096,

        responseMimeType:
          'application/json',

        responseSchema:
          ADVISOR_SUGGESTION_SCHEMA,
      },
    });

  const text =
    response.text;

  if (!text) {
    throw new Error(
      'Gemini 未回傳內容',
    );
  }

  return JSON.parse(
    text,
  ) as AdvisorSuggestion;
}


/* ==========================================================================
 * Chat Types
 * ========================================================================== */

export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}


/* ==========================================================================
 * Retry Helpers
 * ========================================================================== */

const RETRYABLE_STATUS =
  new Set([
    429,
    500,
    502,
    503,
    504,
  ]);


function isRetryableGeminiError(
  error: unknown,
) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error
  ) {
    const status =
      Number(
        (
          error as {
            status?: unknown;
          }
        ).status,
      );

    if (
      Number.isFinite(status) &&
      RETRYABLE_STATUS.has(
        status,
      )
    ) {
      return true;
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return (
    message.includes('UNAVAILABLE') ||
    message.includes('high demand') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('INTERNAL') ||
    message.includes('503') ||
    message.includes('429')
  );
}


function sleep(
  ms: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        ms,
      );
    },
  );
}


async function createRetryableTextStream(
  params: {
    history: ChatTurn[];
    systemInstruction: string;
    message: string;
    temperature: number;
  },
): Promise<AsyncGenerator<string>> {
  const {
    history,
    systemInstruction,
    message,
    temperature,
  } = params;

  const ai =
    getGenAI();


  async function* run():
    AsyncGenerator<string> {
    const maxAttempts =
      3;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt++
    ) {
      let hasYieldedText =
        false;

      try {
        const chat =
          ai.chats.create({
            model:
              MODELS.fast(),

            history:
              history.map(
                (turn) => ({
                  role:
                    turn.role,

                  parts: [
                    {
                      text:
                        turn.content,
                    },
                  ],
                }),
              ),

            config: {
              systemInstruction,

              temperature,

              maxOutputTokens:
                4096,
            },
          });

        const stream =
          await chat.sendMessageStream({
            message,
          });

        for await (
          const chunk
          of stream
        ) {
          const text =
            chunk.text;

          if (text) {
            hasYieldedText =
              true;

            yield text;
          }
        }

        return;
      } catch (error) {
        console.error(
          `[gemini] attempt ${attempt}/${maxAttempts}`,
          error,
        );

        if (
          hasYieldedText
        ) {
          throw error;
        }

        if (
          !isRetryableGeminiError(
            error,
          )
        ) {
          throw error;
        }

        if (
          attempt ===
          maxAttempts
        ) {
          throw error;
        }

        await sleep(
          attempt * 1000,
        );
      }
    }
  }

  return run();
}


/* ==========================================================================
 * Common Helpers
 * ========================================================================== */

function formatNumber(
  value: number | null,
  digits = 2,
) {
  if (
    value === null
  ) {
    return '無資料';
  }

  return value.toLocaleString(
    'zh-TW',
    {
      minimumFractionDigits:
        digits,

      maximumFractionDigits:
        digits,
    },
  );
}


function directionText(
  direction:
    | 'up'
    | 'down'
    | 'flat',
) {
  if (
    direction === 'up'
  ) {
    return '上漲';
  }

  if (
    direction === 'down'
  ) {
    return '下跌';
  }

  return '持平';
}


/* ==========================================================================
 * TWSE Formatter
 * ========================================================================== */

function formatTaiwanMarket(
  market:
    TaiwanMarketSnapshot,
) {
  const sectors =
    market.sectors
      .map(
        (sector) =>
          `- ${sector.name}
  收盤：${formatNumber(
    sector.close,
  )}
  漲跌幅：${formatNumber(
    sector.changePercent,
  )}%
  方向：${directionText(
    sector.direction,
  )}`,
      )
      .join('\n');

  return `
## 台股 TWSE

資料來源：
${market.sourceName}

資料日期：
${market.date}

加權指數收盤：
${formatNumber(
  market.taiex.close,
)}

漲跌點數：
${formatNumber(
  market.taiex.change,
)}

漲跌幅：
${formatNumber(
  market.taiex.changePercent,
)}%

方向：
${directionText(
  market.taiex.direction,
)}

### 重要產業

${sectors}
`;
}


/* ==========================================================================
 * US Market Formatter
 * ========================================================================== */

function formatUsMarket(
  market:
    UsMarketSnapshot,
) {
  return `
## 美國股市

資料來源：
${market.source}

資料取得時間：
${market.fetchedAt}

${market.indices
  .map(
    (index) =>
      `### ${index.name}

代號：
${index.symbol}

市場時間：
${index.marketTime ?? '無資料'}

最新價格：
${formatNumber(
  index.price,
)}

前一交易日：
${formatNumber(
  index.previousClose,
)}

漲跌點數：
${formatNumber(
  index.change,
)}

漲跌幅：
${formatNumber(
  index.changePercent,
)}%

方向：
${directionText(
  index.direction,
)}
`,
  )
  .join('\n')}
`;
}


/* ==========================================================================
 * FX Formatter
 * ========================================================================== */

function getFxMeaning(
  fx:
    FxSnapshot,
) {
  if (
    fx.usdTwd.direction ===
    'up'
  ) {
    return 'USD/TWD 上升，代表美元相對新台幣走強、新台幣相對走弱。';
  }

  if (
    fx.usdTwd.direction ===
    'down'
  ) {
    return 'USD/TWD 下跌，代表美元相對新台幣走弱、新台幣相對升值。';
  }

  return 'USD/TWD 與前一比較基準大致持平。';
}


function formatFx(
  fx:
    FxSnapshot,
) {
  return `
## 外匯市場

資料來源：
${fx.source}

資料取得時間：
${fx.fetchedAt}

### USD/TWD

市場時間：
${fx.usdTwd.marketTime ?? '無資料'}

目前匯率：
${formatNumber(
  fx.usdTwd.rate,
  4,
)}

前值：
${formatNumber(
  fx.usdTwd.previousClose,
  4,
)}

變動：
${formatNumber(
  fx.usdTwd.change,
  4,
)}

變動幅度：
${formatNumber(
  fx.usdTwd.changePercent,
)}%

方向：
${directionText(
  fx.usdTwd.direction,
)}

解讀：
${getFxMeaning(
  fx,
)}
`;
}


/* ==========================================================================
 * Treasury Formatter
 * ========================================================================== */

function formatTreasury(
  treasury:
    TreasurySnapshot,
) {
  const curveMeaning =
    treasury.spread10y2y === null
      ? '目前無法判斷 10Y / 2Y 利差。'
      : treasury.spread10y2y < 0
        ? `10Y - 2Y 利差為 ${formatNumber(
            treasury.spread10y2y,
          )} 個百分點，殖利率曲線呈倒掛。`
        : `10Y - 2Y 利差為 +${formatNumber(
            treasury.spread10y2y,
          )} 個百分點，10 年期殖利率高於 2 年期。`;


  return `
## 美國公債市場

資料來源：
${treasury.source}

資料日期：
${treasury.date}

資料取得時間：
${treasury.fetchedAt}

### 美國 2 年期公債殖利率

${formatNumber(
  treasury.twoYear.yield,
)}%

### 美國 10 年期公債殖利率

${formatNumber(
  treasury.tenYear.yield,
)}%

### 10Y - 2Y 利差

${
  treasury.spread10y2y ===
  null
    ? '無資料'
    : `${formatNumber(
        treasury.spread10y2y,
      )} 個百分點`
}

期限結構解讀：

${curveMeaning}

注意：

殖利率為市場利率資料，
不等同於債券投資報酬率。

殖利率上升通常代表債券價格承受下行壓力；
殖利率下降通常對既有固定利率債券價格較有利。

實際基金或債券價格仍受久期、信用風險、匯率與其他因素影響。
`;
}


/* ==========================================================================
 * News Formatter
 * ========================================================================== */

function formatMarketNews(
  news:
    MarketNewsSnapshot,
) {
  if (
    news.articles.length ===
    0
  ) {
    return `
## 最新財經新聞

目前沒有取得近期財經新聞。
`;
  }

  return `
## 最新財經新聞

資料來源：
${news.source}

資料取得時間：
${news.fetchedAt}

${news.articles
  .slice(0, 10)
  .map(
    (
      article,
      index,
    ) =>
      `${index + 1}. ${article.title}

來源：
${article.source}

發布時間：
${article.publishedAt}

摘要：
${article.description ?? '無摘要'}
`,
  )
  .join('\n')}
`;
}


/* ==========================================================================
 * Customer Assistant
 * ========================================================================== */

export async function streamAdvisorChat(
  params: {
    ctx: CustomerAiContext;
    question: string;
    history: ChatTurn[];
    historySummary?: string | null;
  },
): Promise<AsyncGenerator<string>> {
  const {
    ctx,
    question,
    history,
    historySummary,
  } = params;


  const [
    taiwanResult,
    usResult,
    newsResult,
    fxResult,
    treasuryResult,
  ] =
    await Promise.allSettled([
      getTaiwanMarketSnapshot(),
      getUsMarketSnapshot(),
      getMarketNewsSnapshot(),
      getFxSnapshot(),
      getTreasurySnapshot(),
    ]);


  const taiwanMarket =
    taiwanResult.status ===
    'fulfilled'
      ? taiwanResult.value
      : null;


  const usMarket =
    usResult.status ===
    'fulfilled'
      ? usResult.value
      : null;


  const marketNews =
    newsResult.status ===
    'fulfilled'
      ? newsResult.value
      : null;


  const fx =
    fxResult.status ===
    'fulfilled'
      ? fxResult.value
      : null;


  const treasury =
    treasuryResult.status ===
    'fulfilled'
      ? treasuryResult.value
      : null;


  console.log(
    '[customer-ai] context',
    {
      twse:
        taiwanMarket
          ? 'ok'
          : 'failed',

      us:
        usMarket
          ? 'ok'
          : 'failed',

      fx:
        fx
          ? fx.usdTwd.rate
          : 'failed',

      treasury:
        treasury
          ? {
              twoYear:
                treasury
                  .twoYear
                  .yield,

              tenYear:
                treasury
                  .tenYear
                  .yield,

              spread:
                treasury
                  .spread10y2y,
            }
          : 'failed',

      news:
        marketNews
          ? marketNews
              .articles
              .length
          : 'failed',
    },
  );


  const marketContext = `
# 最新市場背景

${
  taiwanMarket
    ? formatTaiwanMarket(
        taiwanMarket,
      )
    : `
## 台股

目前無法取得台股資料。
`
}

${
  usMarket
    ? formatUsMarket(
        usMarket,
      )
    : `
## 美國股市

目前無法取得美股資料。
`
}

${
  fx
    ? formatFx(
        fx,
      )
    : `
## USD/TWD

目前無法取得 USD/TWD 匯率資料。
`
}

${
  treasury
    ? formatTreasury(
        treasury,
      )
    : `
## 美國公債

目前無法取得美國 2Y / 10Y 公債殖利率。
`
}

${
  marketNews
    ? formatMarketNews(
        marketNews,
      )
    : `
## 最新財經新聞

目前無法取得新聞資料。
`
}

## 資料使用規則

- 行情數字只能引用系統提供的資料。
- 匯率不可反向解讀。
- 殖利率不可直接等同於債券投資報酬率。
- 新聞只能作為市場事件與可能相關因素。
- 沒有明確證據時，不得把相關性寫成確定因果。
- 不得虛構任何未提供資料。
`;


  const customerPrompt =
    buildChatPrompt(
      ctx,
      question,
    );


  const isFirstTurn =
    history.length ===
    0;


  const userMessage =
    isFirstTurn
      ? `${customerPrompt}

${marketContext}

請將以下資訊整合分析：

1. 客戶基本資料
2. 客戶持有部位
3. 通聯紀錄
4. Follow Up / 待辦
5. 最新台股行情
6. 最新美股行情
7. USD/TWD 匯率
8. 美國 2Y / 10Y 公債殖利率
9. 最新財經新聞

請判斷：

1. 客戶目前持有資產是否與近期股市、匯率或利率變化有關。

2. 如果客戶持有：
- 債券基金
- 投資級債
- 高收益債
- 長天期債券
- 美國公債相關產品

請評估 2Y / 10Y 殖利率是否值得作為溝通背景。

3. 如果客戶持有美元資產、海外基金或外幣保單，
請評估 USD/TWD 是否值得作為溝通主題。

4. 最新財經新聞是否與客戶資產或過去關注主題相關。

5. 今天是否值得主動聯絡。

6. 若值得，具體說明原因。

7. 提供自然、不過度推銷的聯絡話術。

8. 市場、匯率、殖利率或新聞若與客戶無直接關係，不要硬湊。

9. 不得因單日市場變化直接建議客戶買進或賣出。

10. 若資料不足，直接說明。`
      : `${question}

${marketContext}

請繼續結合客戶資料與最新市場背景回答。`;


  const customerSystemInstruction = `
${SYSTEM_INSTRUCTION}

你是一位銀行理財專員的 AI 客戶關係助理。

系統會提供：

- 客戶基本資料
- 資產部位
- 通聯紀錄
- Follow Up
- 台股行情
- 美股行情
- USD/TWD
- 美國 2Y / 10Y 公債殖利率
- 財經新聞

你的任務是判斷：

「市場正在發生的事情是否真的與這位客戶相關，以及今天是否值得主動聯絡。」

回答時優先思考：

- 客戶持有哪些資產？
- 風險屬性？
- 是否持有美元資產？
- 是否持有債券或固定收益商品？
- 客戶過去關心什麼？
- 上次聯絡時間？
- 是否有待追蹤事項？
- 台美股目前表現？
- USD/TWD 是否值得關注？
- 2Y / 10Y 殖利率是否與客戶債券部位相關？
- 新聞是否真的和客戶有關？

匯率規則：

USD/TWD 上升
=
美元相對台幣走強
=
台幣相對美元走弱。

USD/TWD 下跌
=
美元相對台幣走弱
=
台幣相對美元升值。

債券規則：

殖利率上升通常使既有固定利率債券價格承受壓力。

殖利率下降通常對既有固定利率債券價格較有利。

但：

- 實際影響取決於久期
- 信用品質
- 匯率
- 基金持倉
- 市場流動性

不得僅因殖利率高就推薦買債。

不得把殖利率直接稱為投資人的實際報酬率。

新聞規則：

新聞只能作為可能相關市場因素。

沒有充分證據時，
不得說某則新聞確定造成市場漲跌。

重要：

- 不得虛構客戶資料
- 不得虛構行情
- 不得虛構匯率
- 不得虛構殖利率
- 不得虛構新聞
- 不得保證獲利
- 不得直接做強制買賣建議
- 使用繁體中文
- 不構成投資建議
`;


  const systemInstruction =
    historySummary
      ? `${customerSystemInstruction}

## 先前對話摘要

${historySummary}`
      : customerSystemInstruction;


  return createRetryableTextStream({
    history,

    systemInstruction,

    message:
      userMessage,

    temperature:
      0.5,
  });
}


/* ==========================================================================
 * Market Assistant
 * ========================================================================== */

const MARKET_SYSTEM_INSTRUCTION = `
你是一位服務銀行理財專員的市場研究助理。

系統目前提供：

- TWSE 台股市場資料
- Yahoo Finance 美股市場資料
- Yahoo Finance USD/TWD
- U.S. Department of the Treasury 2Y / 10Y 殖利率
- GNews 最新財經新聞

你的任務：

1. 整理台股市場。
2. 整理美股市場。
3. 整理 USD/TWD。
4. 整理美國 2Y / 10Y 公債殖利率。
5. 整理重要財經新聞。
6. 找出不同資產之間可能相關的市場焦點。
7. 提供理專可以使用的客戶溝通方向。

重要：

市場數字只能引用 MARKET DATA。

不得：
- 修改數字
- 虛構市場行情
- 虛構匯率
- 虛構殖利率
- 虛構新聞
- 把推測描述成事實

匯率：

USD/TWD 上升
=
美元強 / 台幣弱。

USD/TWD 下跌
=
美元弱 / 台幣強。

債券：

殖利率上升通常對既有固定利率債券價格形成壓力。

殖利率下降通常對既有固定利率債券價格較有利。

但不得把殖利率直接視為投資人實際報酬。

10Y - 2Y：

負值代表殖利率曲線倒掛。

正值代表 10 年期殖利率高於 2 年期。

新聞：

只能用 MARKET DATA 中出現的新聞。

如果沒有充分因果證據，
使用：

- 可能相關
- 市場可能關注
- 投資人可能正在評估

不要使用：

- 就是因為
- 一定導致
- 確定造成

使用繁體中文。

內容僅供資訊整理，
不構成投資建議。
`;


/* ==========================================================================
 * Market Prompt
 * ========================================================================== */

function buildMarketPrompt(
  params: {
    question: string;

    taiwanMarket:
      TaiwanMarketSnapshot | null;

    usMarket:
      UsMarketSnapshot | null;

    marketNews:
      MarketNewsSnapshot | null;

    fx:
      FxSnapshot | null;

    treasury:
      TreasurySnapshot | null;

    taiwanError:
      string | null;

    usError:
      string | null;

    newsError:
      string | null;

    fxError:
      string | null;

    treasuryError:
      string | null;
  },
) {
  const {
    question,
    taiwanMarket,
    usMarket,
    marketNews,
    fx,
    treasury,
    taiwanError,
    usError,
    newsError,
    fxError,
    treasuryError,
  } = params;


  const today =
    new Intl.DateTimeFormat(
      'zh-TW',
      {
        timeZone:
          'Asia/Taipei',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        weekday:
          'long',
      },
    ).format(
      new Date(),
    );


  return `
目前日期：
${today}

使用者問題：
${question}

================================
MARKET DATA
================================

${
  taiwanMarket
    ? formatTaiwanMarket(
        taiwanMarket,
      )
    : `
## 台股
取得失敗：
${taiwanError ?? 'Unknown error'}
`
}

${
  usMarket
    ? formatUsMarket(
        usMarket,
      )
    : `
## 美國股市
取得失敗：
${usError ?? 'Unknown error'}
`
}

${
  fx
    ? formatFx(
        fx,
      )
    : `
## USD/TWD
取得失敗：
${fxError ?? 'Unknown error'}
`
}

${
  treasury
    ? formatTreasury(
        treasury,
      )
    : `
## 美國公債
取得失敗：
${treasuryError ?? 'Unknown error'}
`
}

${
  marketNews
    ? formatMarketNews(
        marketNews,
      )
    : `
## 最新財經新聞
取得失敗：
${newsError ?? 'Unknown error'}
`
}

================================
END MARKET DATA
================================

請完全根據 MARKET DATA 回答。

如果使用者問「今日市場摘要」，
建議依以下結構：

## 今日市場摘要

請直接整理重點，不需要另外列出台股與美股指數的獨立章節。

台股與美股 MARKET DATA 仍可作為後續「跨市場解讀」與「理專可關注事項」的分析依據，
但除非與重要市場事件直接相關，否則不需要逐一列出加權指數、S&P 500、Nasdaq、Dow Jones 的完整數字。


### USD/TWD

說明：
- 最新匯率
- 漲跌幅
- 美元與台幣相對強弱

避免單憑單日匯率變化推測資金流向。
若沒有足夠資料，請明確說明。


### 美國公債

說明：
- 2Y
- 10Y
- 10Y - 2Y 利差
- 殖利率曲線是否倒掛

不要自行推測殖利率漲跌，
因為目前資料只有最新值，
除非 MARKET DATA 有提供前值。


### 最新財經新聞焦點

選出 3～5 則最值得關注的新聞。

不要只重複新聞標題。

每則新聞簡短說明：

- 發生什麼事
- 市場為什麼可能關注
- 可能與哪些資產或產業相關

避免過度延伸新聞內容。
若新聞本身沒有提供某項資訊，不得自行補充成確定事實。


### 跨市場解讀

綜合以下資料進行分析：

- 台股
- 美股
- 美國公債殖利率
- USD/TWD
- 最新財經新聞

台股與美股資料主要在此處使用，
不需要再次完整列出所有指數數字。

優先找出 2～4 個真正值得關注的市場主題，例如：

- 利率與通膨
- 科技股與 AI
- 美元與台幣
- 債券市場
- 能源價格
- 地緣政治
- 台美股市場連動

可以描述合理的市場關聯，
但不能把「相關性」直接寫成「確定因果」。

不得因為：
「美股下跌」
就直接宣稱：
「一定是某一則新聞造成」。

如果資料不足，
直接說：

「目前資料不足以確認單一主要原因。」


### 理專可關注事項

根據：

- 市場行情
- 匯率
- 美國公債殖利率
- 最新財經新聞

提供 2～4 個實際客戶溝通方向。

可以依不同客戶類型分類，例如：

- 美股基金客戶
- 科技基金客戶
- 美元資產客戶
- 外幣保單客戶
- 債券基金客戶
- 長天期債券客戶
- 台股 ETF 客戶

每個方向簡短說明：

1. 哪一類客戶值得關注
2. 為什麼現在值得聯絡
3. 可以從什麼話題切入

不得直接建議買進、賣出或預測特定資產一定上漲或下跌。

若資料不足以支持某項建議，
不要硬生成。

---

內容僅供資訊整理，不構成投資建議。

如果問題只問：

匯率
→ 優先回答 FX。

美債
→ 優先回答 Treasury。

美股
→ 優先回答美股與相關新聞。

新聞
→ 優先整理新聞。

禁止虛構 MARKET DATA 沒有提供的任何內容。
`;
}


/* ==========================================================================
 * Market Chat
 * ========================================================================== */

export async function streamMarketChat(
  params: {
    question: string;
    history: ChatTurn[];
    historySummary?: string | null;
  },
): Promise<AsyncGenerator<string>> {
  const {
    question,
    history,
    historySummary,
  } = params;


  let taiwanMarket:
    TaiwanMarketSnapshot | null =
    null;

  let usMarket:
    UsMarketSnapshot | null =
    null;

  let marketNews:
    MarketNewsSnapshot | null =
    null;

  let fx:
    FxSnapshot | null =
    null;

  let treasury:
    TreasurySnapshot | null =
    null;


  let taiwanError:
    string | null =
    null;

  let usError:
    string | null =
    null;

  let newsError:
    string | null =
    null;

  let fxError:
    string | null =
    null;

  let treasuryError:
    string | null =
    null;


  const [
    taiwanResult,
    usResult,
    newsResult,
    fxResult,
    treasuryResult,
  ] =
    await Promise.allSettled([
      getTaiwanMarketSnapshot(),
      getUsMarketSnapshot(),
      getMarketNewsSnapshot(),
      getFxSnapshot(),
      getTreasurySnapshot(),
    ]);


  /* ------------------------------------------------------------------------
   * TWSE
   * ---------------------------------------------------------------------- */

  if (
    taiwanResult.status ===
    'fulfilled'
  ) {
    taiwanMarket =
      taiwanResult.value;

    console.log(
      '[market] TWSE loaded',
      {
        date:
          taiwanMarket.date,

        close:
          taiwanMarket
            .taiex.close,

        changePercent:
          taiwanMarket
            .taiex
            .changePercent,
      },
    );
  } else {
    taiwanError =
      taiwanResult.reason instanceof Error
        ? taiwanResult
            .reason
            .message
        : String(
            taiwanResult.reason,
          );

    console.error(
      '[market] TWSE failed',
      taiwanResult.reason,
    );
  }


  /* ------------------------------------------------------------------------
   * US Market
   * ---------------------------------------------------------------------- */

  if (
    usResult.status ===
    'fulfilled'
  ) {
    usMarket =
      usResult.value;

    console.log(
      '[market] US loaded',
      usMarket.indices.map(
        (index) => ({
          name:
            index.name,

          price:
            index.price,

          changePercent:
            index.changePercent,
        }),
      ),
    );
  } else {
    usError =
      usResult.reason instanceof Error
        ? usResult.reason.message
        : String(
            usResult.reason,
          );

    console.error(
      '[market] US failed',
      usResult.reason,
    );
  }


  /* ------------------------------------------------------------------------
   * FX
   * ---------------------------------------------------------------------- */

  if (
    fxResult.status ===
    'fulfilled'
  ) {
    fx =
      fxResult.value;

    console.log(
      '[market] FX loaded for Gemini',
      {
        rate:
          fx.usdTwd.rate,

        changePercent:
          fx.usdTwd
            .changePercent,

        direction:
          fx.usdTwd
            .direction,
      },
    );
  } else {
    fxError =
      fxResult.reason instanceof Error
        ? fxResult.reason.message
        : String(
            fxResult.reason,
          );

    console.error(
      '[market] FX failed',
      fxResult.reason,
    );
  }


  /* ------------------------------------------------------------------------
   * Treasury
   * ---------------------------------------------------------------------- */

  if (
    treasuryResult.status ===
    'fulfilled'
  ) {
    treasury =
      treasuryResult.value;

    console.log(
      '[market] Treasury loaded for Gemini',
      {
        date:
          treasury.date,

        twoYear:
          treasury
            .twoYear
            .yield,

        tenYear:
          treasury
            .tenYear
            .yield,

        spread10y2y:
          treasury
            .spread10y2y,
      },
    );
  } else {
    treasuryError =
      treasuryResult.reason instanceof Error
        ? treasuryResult
            .reason
            .message
        : String(
            treasuryResult.reason,
          );

    console.error(
      '[market] Treasury failed',
      treasuryResult.reason,
    );
  }


  /* ------------------------------------------------------------------------
   * News
   * ---------------------------------------------------------------------- */

  if (
    newsResult.status ===
    'fulfilled'
  ) {
    marketNews =
      newsResult.value;

    console.log(
      '[market] News loaded for Gemini',
      {
        count:
          marketNews
            .articles
            .length,

        top:
          marketNews
            .articles
            .slice(
              0,
              3,
            )
            .map(
              (article) => ({
                source:
                  article.source,

                title:
                  article.title,
              }),
            ),
      },
    );
  } else {
    newsError =
      newsResult.reason instanceof Error
        ? newsResult
            .reason
            .message
        : String(
            newsResult.reason,
          );

    console.error(
      '[market] News failed',
      newsResult.reason,
    );
  }


  const userMessage =
    buildMarketPrompt({
      question,

      taiwanMarket,

      usMarket,

      marketNews,

      fx,

      treasury,

      taiwanError,

      usError,

      newsError,

      fxError,

      treasuryError,
    });


  const systemInstruction =
    historySummary
      ? `${MARKET_SYSTEM_INSTRUCTION}

## 先前對話摘要

${historySummary}`
      : MARKET_SYSTEM_INSTRUCTION;


  return createRetryableTextStream({
    history,

    systemInstruction,

    message:
      userMessage,

    temperature:
      0.3,
  });
}


/* ==========================================================================
 * Call Log
 * ========================================================================== */

export async function analyzeCallLog(
  customerName: string,
  rawNote: string,
): Promise<CallLogAnalysis> {
  const ai =
    getGenAI();


  const response =
    await ai.models.generateContent({
      model:
        MODELS.fast(),

      contents:
        buildCallLogPrompt(
          customerName,
          rawNote,
        ),

      config: {
        systemInstruction:
          SYSTEM_INSTRUCTION,

        temperature:
          0.3,

        responseMimeType:
          'application/json',

        responseSchema:
          CALL_LOG_SCHEMA,
      },
    });


  const text =
    response.text;


  if (!text) {
    throw new Error(
      'Gemini 未回傳摘要內容',
    );
  }


  const parsed =
    JSON.parse(
      text,
    ) as CallLogAnalysis;


  return {
    ...parsed,

    suggested_follow_up:
      parsed
        .suggested_follow_up
        ?.trim() ||
      null,
  };
}


/* ==========================================================================
 * Conversation Summary
 * ========================================================================== */

export async function summarizeConversation(
  turns: ChatTurn[],
): Promise<string> {
  const ai =
    getGenAI();


  const transcript =
    turns
      .map(
        (turn) =>
          `${
            turn.role ===
            'user'
              ? '理專'
              : 'AI'
          }：${turn.content}`,
      )
      .join('\n');


  const response =
    await ai.models.generateContent({
      model:
        MODELS.fast(),

      contents:
        `請將以下理專與 AI 助理的對話壓縮成 200 字以內的重點摘要，保留已達成的結論、客戶偏好與待辦事項。

${transcript}`,

      config: {
        temperature:
          0.2,

        maxOutputTokens:
          512,
      },
    });


  return (
    response.text ??
    ''
  );
}