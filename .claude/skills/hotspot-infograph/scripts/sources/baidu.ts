import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { TrendingItem } from "../lib/types";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

interface BaiduItem {
  word?: string;
  query?: string;
  desc?: string;
  url?: string;
  img?: string;
  hotScore?: string | number;
  index?: number;
}

async function fetchFromPage(): Promise<{ items: BaiduItem[]; error?: string }> {
  const res = await fetchWithTimeout("https://top.baidu.com/board?tab=realtime", {
    headers: BROWSER_HEADERS,
  });

  if (!res.ok) {
    return { items: [], error: `Baidu page returned ${res.status}` };
  }

  const html = await res.text();

  // Try to extract JSON data embedded in the HTML page
  // Baidu embeds data in a script tag as window.__INITIAL_STATE__ or similar
  const jsonMatch = html.match(/<!--s-data:(.*?)-->/s);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const cards = data?.data?.cards;
      if (Array.isArray(cards)) {
        const items: BaiduItem[] = [];
        for (const card of cards) {
          if (card.content) {
            for (const c of card.content) {
              items.push({
                word: c.word || c.query,
                desc: c.desc,
                url: c.url || c.rawUrl,
                img: c.img,
                hotScore: c.hotScore,
              });
            }
          }
        }
        if (items.length > 0) return { items };
      }
    } catch {
      // JSON parse failed, try other methods
    }
  }

  // Fallback: try to parse from HTML structure using cheerio
  const $ = cheerio.load(html);
  const items: BaiduItem[] = [];

  $("[class*='category-wrap']").each((_i, el) => {
    const title = $(el).find("[class*='c-single-text-ellipsis']").first().text().trim();
    const desc = $(el).find("[class*='hot-desc']").text().trim();
    const link = $(el).find("a").first().attr("href");
    const scoreText = $(el).find("[class*='hot-index']").text().trim();

    if (title) {
      items.push({
        word: title,
        desc: desc || undefined,
        url: link || undefined,
        hotScore: scoreText || "0",
      });
    }
  });

  if (items.length > 0) return { items };

  // Second fallback: try even simpler selectors
  $("a[href*='rsv_dl=fyb']").each((_i, el) => {
    const title = $(el).text().trim();
    const link = $(el).attr("href");
    if (title) {
      items.push({ word: title, url: link || undefined });
    }
  });

  if (items.length === 0) {
    return { items: [], error: "Could not extract items from Baidu page HTML" };
  }

  return { items };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/baidu.json";
  const limit = parseInt(args.limit || "30", 10);
  const errors: string[] = [];
  const items: TrendingItem[] = [];

  try {
    const result = await fetchFromPage();
    if (result.error) {
      errors.push(result.error);
    }

    for (let i = 0; i < result.items.length && items.length < limit; i++) {
      const item = result.items[i];
      const word = item.word || item.query;
      if (!word) continue;

      items.push({
        id: `baidu-${i}`,
        title: word,
        url: item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(word)}`,
        source: "baidu",
        category: "trending",
        hotScore: parseInt(String(item.hotScore || "0"), 10) || 0,
        extra: {
          desc: item.desc,
          img: item.img,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch Baidu hot search: ${err}`);
  }

  const output = createSourceOutput("baidu", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Baidu`);
}

main();
