import 'server-only';

/* ==========================================================================
 *  Yahoo Finance — US Market Snapshot
 *
 *  注意：
 *  這是 Yahoo Finance 的非官方 chart endpoint。
 *  適合作品 MVP，但正式商用應改用有授權的市場資料供應商。
 * ========================================================================== */

const YAHOO_BASE_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart';


/* ==========================================================================
 *  Types
 * ========================================================================== */

export interface UsIndexSnapshot {
  symbol: string;
  name: string;

  price: number | null;
  previousClose: number | null;

  change: number | null;
  changePercent: number | null;

  currency: string | null;

  marketTime: string | null;

  direction:
    | 'up'
    | 'down'
    | 'flat';
}


export interface UsMarketSnapshot {
  source: 'Yahoo Finance';
  fetchedAt: string;

  indices: UsIndexSnapshot[];
}


/* ==========================================================================
 *  Yahoo Response
 * ========================================================================== */

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;

        currency?: string;

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
 *  Helpers
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
        'America/New_York',

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
 *  抓單一指數
 * ========================================================================== */

async function fetchYahooIndex(
  symbol: string,
  name: string,
): Promise<UsIndexSnapshot> {

  const url =
    `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}` +
    '?range=5d&interval=1d';


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
         * 避免 AI 每問一次就重打 Yahoo。
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
      `Yahoo Finance ${symbol} API 錯誤：HTTP ${response.status}`,
    );
  }


  const json =
    (await response.json()) as YahooChartResponse;


  const meta =
    json.chart
      ?.result
      ?.[0]
      ?.meta;


  if (!meta) {
    throw new Error(
      `Yahoo Finance 找不到 ${symbol} 市場資料`,
    );
  }


  const price =
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
    price !== null &&
    previousClose !== null &&
    previousClose !== 0
  ) {

    change =
      price -
      previousClose;


    changePercent =
      (change /
        previousClose) *
      100;
  }


  return {
    symbol,

    name,

    price,

    previousClose,

    change,

    changePercent,

    currency:
      meta.currency ??
      null,

    marketTime:
      toMarketTime(
        meta.regularMarketTime,
      ),

    direction:
      getDirection(
        change ?? 0,
      ),
  };
}


/* ==========================================================================
 *  抓美股主要指數
 * ========================================================================== */

export async function getUsMarketSnapshot():
  Promise<UsMarketSnapshot> {

  const [
    sp500,
    nasdaq,
    dow,
  ] =
    await Promise.all([
      fetchYahooIndex(
        '^GSPC',
        'S&P 500',
      ),

      fetchYahooIndex(
        '^IXIC',
        'Nasdaq Composite',
      ),

      fetchYahooIndex(
        '^DJI',
        'Dow Jones',
      ),
    ]);


  return {
    source:
      'Yahoo Finance',

    fetchedAt:
      new Date()
        .toISOString(),

    indices: [
      sp500,
      nasdaq,
      dow,
    ],
  };
}