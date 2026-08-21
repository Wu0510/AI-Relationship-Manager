import 'server-only';

/* ==========================================================================
 * TWSE 官方市場資料
 * ========================================================================== */

const TWSE_BASE_URL = 'https://openapi.twse.com.tw/v1';

/* ==========================================================================
 * Types
 * ========================================================================== */

interface TwseIndexRow {
  日期: string;
  指數: string;
  收盤指數: string;
  漲跌: string;
  漲跌點數: string;
  漲跌百分比: string;
  特殊處理註記?: string;
}

export interface TaiwanMarketSnapshot {
  source: 'TWSE';
  sourceName: '臺灣證券交易所';
  date: string;

  taiex: {
    name: string;
    close: number | null;
    change: number | null;
    changePercent: number | null;
    direction: 'up' | 'down' | 'flat';
  };

  sectors: {
    name: string;
    close: number | null;
    changePercent: number | null;
    direction: 'up' | 'down' | 'flat';
  }[];
}

/* ==========================================================================
 * Helpers
 * ========================================================================== */

function parseNumber(
  value: string | undefined,
): number | null {
  if (!value) return null;

  const cleaned = value
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : null;
}

function getDirection(
  sign: string | undefined,
): 'up' | 'down' | 'flat' {
  if (sign === '+') return 'up';

  if (sign === '-') return 'down';

  return 'flat';
}

/* ==========================================================================
 * 抓 TWSE 每日大盤資料
 * ========================================================================== */

export async function getTaiwanMarketSnapshot():
  Promise<TaiwanMarketSnapshot> {

  const response = await fetch(
    `${TWSE_BASE_URL}/exchangeReport/MI_INDEX`,
    {
      method: 'GET',

      headers: {
        Accept: 'application/json',
      },

      /*
       * Next.js：
       * 5 分鐘內可以使用 cache，
       * 避免每個 AI 問題都狂打 TWSE。
       */
      next: {
        revalidate: 300,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `TWSE API 錯誤：HTTP ${response.status}`,
    );
  }

  const rows =
    (await response.json()) as TwseIndexRow[];

  if (!Array.isArray(rows)) {
    throw new Error(
      'TWSE API 回傳格式不正確',
    );
  }

  /* ------------------------------------------------------------------------
   * 找加權指數
   * ---------------------------------------------------------------------- */

  const taiex = rows.find(
    (row) =>
      row.指數 ===
      '發行量加權股價指數',
  );

  if (!taiex) {
    throw new Error(
      'TWSE 資料中找不到發行量加權股價指數',
    );
  }

  /* ------------------------------------------------------------------------
   * 我們先抓幾個理專比較有用的產業指數
   * ---------------------------------------------------------------------- */

  const sectorNames = [
    '電子工業類指數',
    '半導體類指數',
    '金融保險類指數',
    '航運類指數',
  ];

  const sectors = sectorNames
    .map((name) => {
      const row = rows.find(
        (item) =>
          item.指數 === name,
      );

      if (!row) return null;

      return {
        name,

        close:
          parseNumber(
            row.收盤指數,
          ),

        changePercent:
          parseNumber(
            row.漲跌百分比,
          ),

        direction:
          getDirection(
            row.漲跌,
          ),
      };
    })
    .filter(
      (
        item,
      ): item is NonNullable<
        typeof item
      > => item !== null,
    );

  /* ------------------------------------------------------------------------
   * 組成我們自己的乾淨格式
   * ---------------------------------------------------------------------- */

  return {
    source: 'TWSE',

    sourceName:
      '臺灣證券交易所',

    date:
      taiex.日期,

    taiex: {
      name:
        taiex.指數,

      close:
        parseNumber(
          taiex.收盤指數,
        ),

      change:
        parseNumber(
          taiex.漲跌點數,
        ),

      changePercent:
        parseNumber(
          taiex.漲跌百分比,
        ),

      direction:
        getDirection(
          taiex.漲跌,
        ),
    },

    sectors,
  };
}