import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { TrendingItem } from "../lib/types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

interface XTrendItem {
  name?: string;
  query?: string;
  tweet_volume?: number | null;
  url?: string;
  description?: string;
  domain_context?: string;
}

/**
 * Attempt to fetch from publicly available trending aggregator APIs.
 * Since X/Twitter's API requires OAuth, we try several public mirror/proxy endpoints.
 */
async function fetchFromAggregator(): Promise<{ items: XTrendItem[]; error?: string }> {
  // Try trending aggregator endpoints that mirror X/Twitter trends
  const endpoints = [
    {
      url: "https://trends24.in/united-states/",
      type: "html" as const,
    },
    {
      url: "https://getdaytrends.com/united-states/",
      type: "html" as const,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint.url, {
        headers: {
          ...BROWSER_HEADERS,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const items = parseTrendsFromHTML(html);
      if (items.length > 0) {
        return { items };
      }
    } catch {
      continue;
    }
  }

  return { items: [], error: "All X/Twitter trending aggregator endpoints failed" };
}

/**
 * Parse trending topics from aggregator HTML pages.
 * These pages typically list hashtags and trending terms.
 */
function parseTrendsFromHTML(html: string): XTrendItem[] {
  const items: XTrendItem[] = [];
  const seen = new Set<string>();

  // Pattern 1: Look for trend items in common aggregator formats
  // Matches hashtags and trending phrases in anchor tags
  const patterns = [
    // trends24.in style: <a href="/united-states/...">trend name</a>
    /<a[^>]*class="[^"]*trend-link[^"]*"[^>]*>([^<]+)<\/a>/gi,
    // getdaytrends style: <a href="..." class="...)">trend name</a>
    /<a[^>]*href="https?:\/\/(?:twitter|x)\.com\/search[^"]*"[^>]*>([^<]+)<\/a>/gi,
    // Generic: trend name in list items with specific classes
    /<li[^>]*class="[^"]*trend[^"]*"[^>]*>.*?<a[^>]*>([^<]+)<\/a>/gi,
    // Another common pattern: span or div with trend text
    /<span[^>]*class="[^"]*trend-name[^"]*"[^>]*>([^<]+)<\/span>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].trim();
      if (name && name.length > 1 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        items.push({ name });
      }
    }
  }

  // If patterns above didn't work, try a broader approach
  if (items.length === 0) {
    // Extract anything that looks like a hashtag
    const hashtagPattern = /#[\w\u4e00-\u9fff]+/g;
    let match;
    while ((match = hashtagPattern.exec(html)) !== null) {
      const name = match[0];
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        items.push({ name });
      }
    }
  }

  return items;
}

/**
 * Fallback: use X's guest API for explore/trending.
 * This may require a guest token which we try to obtain first.
 */
async function fetchFromXGuestAPI(): Promise<{ items: XTrendItem[]; error?: string }> {
  try {
    // Try to get a guest token
    const bearerToken =
      "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

    const guestRes = await fetchWithTimeout("https://api.x.com/1.1/guest/activate.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!guestRes.ok) {
      return { items: [], error: `X guest token request returned ${guestRes.status}` };
    }

    const guestData = await guestRes.json();
    const guestToken = guestData?.guest_token;
    if (!guestToken) {
      return { items: [], error: "Could not obtain X guest token" };
    }

    // Fetch trends using guest token
    const trendsRes = await fetchWithTimeout(
      "https://api.x.com/1.1/trends/place.json?id=1",
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "x-guest-token": guestToken,
        },
      }
    );

    if (!trendsRes.ok) {
      return { items: [], error: `X trends API returned ${trendsRes.status}` };
    }

    const trendsData = await trendsRes.json();
    const trends = trendsData?.[0]?.trends;
    if (!Array.isArray(trends)) {
      return { items: [], error: "X trends API: unexpected response structure" };
    }

    return {
      items: trends.map((t: any) => ({
        name: t.name,
        query: t.query,
        tweet_volume: t.tweet_volume,
        url: t.url,
      })),
    };
  } catch (err) {
    return { items: [], error: `X guest API failed: ${err}` };
  }
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/x-trending.json";
  const limit = parseInt(args.limit || "30", 10);
  const location = args.location || "worldwide";
  const errors: string[] = [];
  const items: TrendingItem[] = [];

  try {
    // Try X guest API first
    let result = await fetchFromXGuestAPI();
    if (result.error || result.items.length === 0) {
      if (result.error) errors.push(result.error);
      console.warn("X guest API failed, trying aggregators...");

      // Fallback to aggregator sites
      const aggResult = await fetchFromAggregator();
      if (aggResult.error) {
        errors.push(aggResult.error);
      }
      if (aggResult.items.length > 0) {
        result = aggResult;
      }
    }

    for (let i = 0; i < result.items.length && items.length < limit; i++) {
      const item = result.items[i];
      const trendName = item.name || item.query;
      if (!trendName) continue;

      items.push({
        id: `x-trending-${i}`,
        title: trendName,
        url: item.url || `https://x.com/search?q=${encodeURIComponent(trendName)}`,
        source: "x-trending",
        category: "trending",
        hotScore: item.tweet_volume || 0,
        extra: {
          tweetVolume: item.tweet_volume,
          location,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch X/Twitter trending: ${err}`);
  }

  const output = createSourceOutput("x-trending", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from X/Twitter trending`);
}

main();
