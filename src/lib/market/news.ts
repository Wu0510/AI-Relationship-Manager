import 'server-only';

export interface MarketNewsArticle {
  title: string;
  description: string | null;
  source: string;
  publishedAt: string;
  url: string;
}

export interface MarketNewsSnapshot {
  source: string;
  fetchedAt: string;
  query: string;
  articles: MarketNewsArticle[];
}

interface RawNewsArticle {
  title?: unknown;
  description?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  source?: {
    name?: unknown;
  };
}

interface RawNewsResponse {
  articles?: RawNewsArticle[];
}

function toStringOrNull(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

/**
 * GNews 的 q 最多 200 字元。
 * 這版故意壓很短，先求穩定。
 */
const MARKET_QUERY =
  'Fed OR Nasdaq OR "S&P 500" OR inflation OR Nvidia';

function getNewsFromTime() {
  const date = new Date();

  date.setHours(
    date.getHours() - 36,
  );

  return date.toISOString();
}

export async function getMarketNewsSnapshot():
  Promise<MarketNewsSnapshot> {
  const apiKey =
    process.env.GNEWS_API_KEY;

  if (!apiKey) {
    throw new Error(
      '缺少 GNEWS_API_KEY，請先在 .env.local 設定。',
    );
  }

  const params =
    new URLSearchParams({
      q: MARKET_QUERY,
      lang: 'en',
      country: 'us',
      max: '10',
      sortby: 'publishedAt',
      from: getNewsFromTime(),
      apikey: apiKey,
    });

  const url =
    `https://gnews.io/api/v4/search?${params.toString()}`;

  console.log(
    '[market] GNews query',
    MARKET_QUERY,
  );

  const response =
    await fetch(url, {
      next: {
        revalidate: 300,
      },

      headers: {
        Accept: 'application/json',
      },
    });

  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(() => '');

    throw new Error(
      `GNews request failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const json =
    (await response.json()) as RawNewsResponse;

  const parsedArticles =
    (json.articles ?? [])
      .map(
        (
          article,
        ): MarketNewsArticle | null => {
          const title =
            toStringOrNull(
              article.title,
            );

          const url =
            toStringOrNull(
              article.url,
            );

          const publishedAt =
            toStringOrNull(
              article.publishedAt,
            );

          if (
            !title ||
            !url ||
            !publishedAt
          ) {
            return null;
          }

          return {
            title,

            description:
              toStringOrNull(
                article.description,
              ),

            source:
              toStringOrNull(
                article.source?.name,
              ) ?? 'Unknown',

            publishedAt,

            url,
          };
        },
      )
      .filter(
        (
          article,
        ): article is MarketNewsArticle =>
          article !== null,
      );

  const seen =
    new Set<string>();

  const articles =
    parsedArticles.filter(
      (article) => {
        const key =
          article.title
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      },
    );

  console.log(
    '[market] News loaded',
    {
      count:
        articles.length,

      query:
        MARKET_QUERY,

      top:
        articles
          .slice(0, 5)
          .map(
            (article) => ({
              source:
                article.source,

              title:
                article.title,

              publishedAt:
                article.publishedAt,
            }),
          ),
    },
  );

  return {
    source: 'GNews',

    fetchedAt:
      new Date()
        .toISOString(),

    query:
      MARKET_QUERY,

    articles,
  };
}