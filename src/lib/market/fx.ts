import 'server-only';


/* ==========================================================================
 * Types
 * ========================================================================== */

export interface FxSnapshot {
  source: 'Yahoo Finance';
  fetchedAt: string;

  usdTwd: {
    symbol: string;
    name: string;

    rate: number | null;
    previousClose: number | null;

    change: number | null;
    changePercent: number | null;

    marketTime: string | null;

    direction:
      | 'up'
      | 'down'
      | 'flat';
  };
}


/* ==========================================================================
 * Yahoo Finance Raw Types
 * ========================================================================== */

interface YahooFxResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;

        regularMarketPrice?: number;

        chartPreviousClose?: number;

        previousClose?: number;

        regularMarketTime?: number;
      };
    }>;

    error?: unknown;
  };
}


/* ==========================================================================
 * Helpers
 * ========================================================================== */

function getDirection(
  change: number,
):
  | 'up'
  | 'down'
  | 'flat' {

  if (change > 0) {
    return 'up';
  }

  if (change < 0) {
    return 'down';
  }

  return 'flat';
}


function toMarketTime(
  unixTime:
    number | undefined,
): string | null {

  if (!unixTime) {
    return null;
  }

  return new Intl.DateTimeFormat(
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

      hour:
        '2-digit',

      minute:
        '2-digit',

      hour12:
        false,
    },
  ).format(
    new Date(
      unixTime * 1000,
    ),
  );
}


/* ==========================================================================
 * Get USD/TWD
 *
 * Yahoo symbol:
 * TWD=X
 *
 * 意義：
 * 1 USD = ? TWD
 *
 * 例如：
 * 30.50
 * = 1 美元約等於 30.50 新台幣
 * ========================================================================== */

export async function getFxSnapshot():
  Promise<FxSnapshot> {

  const symbol =
    'TWD=X';


  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?range=5d&interval=1d`;


  const response =
    await fetch(
      url,
      {
        method:
          'GET',

        headers: {
          Accept:
            'application/json',
        },

        /*
         * 匯率變化較快，
         * 先 cache 5 分鐘。
         */
        next: {
          revalidate:
            300,
        },
      },
    );


  if (!response.ok) {
    throw new Error(
      `Yahoo Finance FX API 錯誤：HTTP ${response.status}`,
    );
  }


  const json =
    (await response.json()) as YahooFxResponse;


  const meta =
    json.chart
      ?.result
      ?.[0]
      ?.meta;


  if (!meta) {
    throw new Error(
      'Yahoo Finance 找不到 USD/TWD 匯率資料',
    );
  }


  const rate =
    typeof meta.regularMarketPrice ===
    'number'
      ? meta.regularMarketPrice
      : null;


  const previousClose =
    typeof meta.chartPreviousClose ===
    'number'
      ? meta.chartPreviousClose

      : typeof meta.previousClose ===
        'number'
        ? meta.previousClose
        : null;


  let change:
    number | null =
    null;


  let changePercent:
    number | null =
    null;


  if (
    rate !== null &&
    previousClose !== null &&
    previousClose !== 0
  ) {

    change =
      rate -
      previousClose;


    changePercent =
      (change /
        previousClose) *
      100;
  }


  const snapshot:
    FxSnapshot = {

    source:
      'Yahoo Finance',

    fetchedAt:
      new Date()
        .toISOString(),

    usdTwd: {

      symbol,

      name:
        'USD/TWD',

      rate,

      previousClose,

      change,

      changePercent,

      marketTime:
        toMarketTime(
          meta.regularMarketTime,
        ),

      direction:
        getDirection(
          change ?? 0,
        ),
    },
  };


  console.log(
    '[market] FX loaded',
    {
      rate:
        snapshot.usdTwd.rate,

      previousClose:
        snapshot.usdTwd.previousClose,

      change:
        snapshot.usdTwd.change,

      changePercent:
        snapshot.usdTwd.changePercent,

      marketTime:
        snapshot.usdTwd.marketTime,
    },
  );


  return snapshot;
}