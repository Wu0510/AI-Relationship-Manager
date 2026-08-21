import 'server-only';


/* ==========================================================================
 * Types
 * ========================================================================== */

export interface TreasurySnapshot {
  source: 'U.S. Department of the Treasury';

  fetchedAt: string;

  date: string;

  twoYear: {
    name: string;
    yield: number | null;
  };

  tenYear: {
    name: string;
    yield: number | null;
  };

  spread10y2y: number | null;
}


/* ==========================================================================
 * Helpers
 * ========================================================================== */

function extractValue(
  xml: string,
  field: string,
): string | null {
  const regex =
    new RegExp(
      `<d:${field}[^>]*>([^<]+)</d:${field}>`,
      'i',
    );

  const match =
    xml.match(regex);

  return match?.[1]?.trim() ?? null;
}


function parseNumber(
  value: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function parseDate(
  value: string | null,
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date;
}


/* ==========================================================================
 * Find Latest Treasury Entry
 * ========================================================================== */

function findLatestEntry(
  xml: string,
): string | null {
  const entries =
    xml.match(
      /<entry[\s\S]*?<\/entry>/gi,
    );

  if (
    !entries ||
    entries.length === 0
  ) {
    return null;
  }


  let latestEntry:
    string | null =
    null;

  let latestTime =
    -Infinity;


  for (
    const entry
    of entries
  ) {
    const rawDate =
      extractValue(
        entry,
        'NEW_DATE',
      );

    const date =
      parseDate(
        rawDate,
      );

    if (!date) {
      continue;
    }

    const time =
      date.getTime();

    if (
      time > latestTime
    ) {
      latestTime =
        time;

      latestEntry =
        entry;
    }
  }


  return latestEntry;
}


/* ==========================================================================
 * Get Treasury Snapshot
 * ========================================================================== */

export async function getTreasurySnapshot():
  Promise<TreasurySnapshot> {

  const year =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'America/New_York',

        year:
          'numeric',
      },
    ).format(
      new Date(),
    );


  const url =
    `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;


  const response =
    await fetch(
      url,
      {
        method:
          'GET',

        headers: {
          Accept:
            'application/xml,text/xml',
        },

        next: {
          revalidate:
            1800,
        },
      },
    );


  if (!response.ok) {
    throw new Error(
      `U.S. Treasury API 錯誤：HTTP ${response.status}`,
    );
  }


  const xml =
    await response.text();


  if (!xml) {
    throw new Error(
      'U.S. Treasury 未回傳資料',
    );
  }


  /* ------------------------------------------------------------------------
   * 找最新日期，不再拿第一筆
   * ---------------------------------------------------------------------- */

  const latestEntry =
    findLatestEntry(
      xml,
    );


  if (!latestEntry) {
    throw new Error(
      'U.S. Treasury XML 中找不到有效殖利率資料',
    );
  }


  const rawDate =
    extractValue(
      latestEntry,
      'NEW_DATE',
    );


  const twoYear =
    parseNumber(
      extractValue(
        latestEntry,
        'BC_2YEAR',
      ),
    );


  const tenYear =
    parseNumber(
      extractValue(
        latestEntry,
        'BC_10YEAR',
      ),
    );


  if (
    twoYear === null &&
    tenYear === null
  ) {
    throw new Error(
      'U.S. Treasury 最新資料中找不到 2Y / 10Y 殖利率',
    );
  }


  const spread10y2y =
    twoYear !== null &&
    tenYear !== null
      ? tenYear -
        twoYear
      : null;


  const snapshot:
    TreasurySnapshot = {

    source:
      'U.S. Department of the Treasury',

    fetchedAt:
      new Date()
        .toISOString(),

    date:
      rawDate ??
      'Unknown',

    twoYear: {
      name:
        'U.S. Treasury 2-Year',

      yield:
        twoYear,
    },

    tenYear: {
      name:
        'U.S. Treasury 10-Year',

      yield:
        tenYear,
    },

    spread10y2y,
  };


  console.log(
    '[market] Treasury loaded',
    {
      date:
        snapshot.date,

      twoYear:
        snapshot
          .twoYear
          .yield,

      tenYear:
        snapshot
          .tenYear
          .yield,

      spread10y2y:
        snapshot
          .spread10y2y,
    },
  );


  return snapshot;
}