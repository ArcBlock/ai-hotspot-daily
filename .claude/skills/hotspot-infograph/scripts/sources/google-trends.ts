import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { TrendingItem } from "../lib/types";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/xml, text/xml, */*",
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
};

interface GoogleTrendItem {
  title: string;
  link?: string;
  traffic?: string;
  pubDate?: string;
  relatedQueries?: string[];
  newsItems?: Array<{ title: string; url: string; source: string }>;
}

/**
 * Parse Google Trends RSS feed using cheerio (which can handle XML).
 */
function parseRSSFeed(xml: string): GoogleTrendItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: GoogleTrendItem[] = [];

  $("item").each((_i, el) => {
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").first().text().trim()
      || $(el).find("link").first().attr("href")
      || "";
    const traffic = $(el).find("ht\\:approx_traffic, approx_traffic").first().text().trim();
    const pubDate = $(el).find("pubDate").first().text().trim();

    // Parse related news items
    const newsItems: Array<{ title: string; url: string; source: string }> = [];
    $(el).find("ht\\:news_item, news_item").each((_j, newsEl) => {
      const newsTitle = $(newsEl).find("ht\\:news_item_title, news_item_title").text().trim();
      const newsUrl = $(newsEl).find("ht\\:news_item_url, news_item_url").text().trim();
      const newsSource = $(newsEl).find("ht\\:news_item_source, news_item_source").text().trim();
      if (newsTitle) {
        newsItems.push({ title: newsTitle, url: newsUrl, source: newsSource });
      }
    });

    if (title) {
      items.push({
        title,
        link: link || undefined,
        traffic: traffic || undefined,
        pubDate: pubDate || undefined,
        newsItems: newsItems.length > 0 ? newsItems : undefined,
      });
    }
  });

  return items;
}

/**
 * Fallback: parse using simple regex if cheerio XML mode doesn't work well.
 */
function parseRSSFeedRegex(xml: string): GoogleTrendItem[] {
  const items: GoogleTrendItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];

    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
    const trafficMatch = block.match(/<(?:ht:)?approx_traffic>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/(?:ht:)?approx_traffic>/);
    const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);

    const title = titleMatch?.[1]?.trim();
    if (!title) continue;

    items.push({
      title,
      link: linkMatch?.[1]?.trim() || undefined,
      traffic: trafficMatch?.[1]?.trim() || undefined,
      pubDate: pubDateMatch?.[1]?.trim() || undefined,
    });
  }

  return items;
}

async function fetchFromRSS(geo: string): Promise<{ items: GoogleTrendItem[]; error?: string }> {
  const url = `https://trends.google.com/trending/rss?geo=${geo}`;
  const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS });

  if (!res.ok) {
    return { items: [], error: `Google Trends RSS returned ${res.status} for geo=${geo}` };
  }

  const xml = await res.text();

  // Try cheerio XML parse first
  let items = parseRSSFeed(xml);

  // Fallback to regex parse if cheerio found nothing
  if (items.length === 0) {
    items = parseRSSFeedRegex(xml);
  }

  if (items.length === 0) {
    return { items: [], error: `Could not parse any items from Google Trends RSS (geo=${geo})` };
  }

  return { items };
}

function parseTrafficToNumber(traffic: string | undefined): number {
  if (!traffic) return 0;
  // Traffic format: "200,000+", "2M+", "500K+", etc.
  const cleaned = traffic.replace(/[,+\s]/g, "").toUpperCase();
  if (cleaned.endsWith("M")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000_000;
  }
  if (cleaned.endsWith("K")) {
    return parseFloat(cleaned.slice(0, -1)) * 1_000;
  }
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/google-trends.json";
  const limit = parseInt(args.limit || "30", 10);
  const geo = args.geo || "CN";
  const errors: string[] = [];
  const items: TrendingItem[] = [];

  try {
    // Try primary geo first
    let result = await fetchFromRSS(geo);
    if (result.error) {
      errors.push(result.error);
    }

    // If primary geo returned no items and it was CN, try US as fallback
    if (result.items.length === 0 && geo === "CN") {
      console.warn(`No results for geo=${geo}, trying US as fallback...`);
      const usResult = await fetchFromRSS("US");
      if (usResult.error) {
        errors.push(usResult.error);
      }
      if (usResult.items.length > 0) {
        result = usResult;
      }
    }

    for (let i = 0; i < result.items.length && items.length < limit; i++) {
      const item = result.items[i];
      if (!item.title) continue;

      const relatedQueries: string[] = [];
      if (item.newsItems) {
        for (const news of item.newsItems) {
          if (news.title && news.title !== item.title) {
            relatedQueries.push(news.title);
          }
        }
      }

      items.push({
        id: `gtrends-${i}`,
        title: item.title,
        url: item.link || `https://trends.google.com/trending?q=${encodeURIComponent(item.title)}&geo=${geo}`,
        source: "google-trends",
        category: "trending",
        hotScore: parseTrafficToNumber(item.traffic),
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
        extra: {
          traffic: item.traffic,
          relatedQueries: relatedQueries.length > 0 ? relatedQueries : undefined,
          newsItems: item.newsItems,
          geo,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch Google Trends: ${err}`);
  }

  const output = createSourceOutput("google-trends", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Google Trends`);
}

main();
