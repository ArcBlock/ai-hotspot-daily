import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { TrendingItem } from "../lib/types";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://www.douyin.com/",
};

interface DouyinHotItem {
  word?: string;
  sentence_tag?: string;
  sentence_id?: number | string;
  hot_value?: number;
  label?: number | string;
  video_count?: number;
  event_time?: number;
}

async function fetchFromAPI(): Promise<{ items: DouyinHotItem[]; error?: string }> {
  const res = await fetchWithTimeout(
    "https://www.douyin.com/aweme/v1/web/hot/search/list/",
    { headers: BROWSER_HEADERS }
  );

  if (!res.ok) {
    return { items: [], error: `Douyin API returned ${res.status}` };
  }

  const json = await res.json();
  const wordList = json?.data?.word_list;
  if (!Array.isArray(wordList)) {
    // Try alternative structure
    const trendingList = json?.data?.trending_list;
    if (Array.isArray(trendingList)) {
      return { items: trendingList };
    }
    return { items: [], error: "Douyin API: no word_list or trending_list found in response" };
  }

  return { items: wordList };
}

async function fetchFromPage(): Promise<{ items: DouyinHotItem[]; error?: string }> {
  const res = await fetchWithTimeout("https://www.douyin.com/hot", {
    headers: {
      ...BROWSER_HEADERS,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    return { items: [], error: `Douyin page returned ${res.status}` };
  }

  const html = await res.text();

  // Try to extract SSR data from the page
  const renderMatch = html.match(/self\.__pace_f\.push\(\[.*?"(.*?)"\]\)/s);
  const stateMatch = html.match(/<script[^>]*id="RENDER_DATA"[^>]*>(.*?)<\/script>/s);

  if (stateMatch) {
    try {
      const decoded = decodeURIComponent(stateMatch[1]);
      const data = JSON.parse(decoded);
      // Navigate the data structure to find hot items
      for (const key of Object.keys(data)) {
        const section = data[key];
        if (section?.hotList || section?.wordList || section?.data?.word_list) {
          const list = section.hotList || section.wordList || section.data.word_list;
          if (Array.isArray(list)) {
            return { items: list };
          }
        }
      }
    } catch {
      // decode/parse failed
    }
  }

  // Fallback: parse HTML
  const $ = cheerio.load(html);
  const items: DouyinHotItem[] = [];

  $("[class*='hot-item'], [class*='HotItem']").each((_i, el) => {
    const title = $(el).find("[class*='title'], [class*='text']").first().text().trim();
    const hotText = $(el).find("[class*='hot-value'], [class*='count']").text().trim();

    if (title) {
      items.push({
        word: title,
        hot_value: hotText ? parseInt(hotText.replace(/[^\d]/g, ""), 10) : 0,
      });
    }
  });

  if (items.length === 0) {
    return { items: [], error: "Could not extract items from Douyin page" };
  }

  return { items };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/douyin.json";
  const limit = parseInt(args.limit || "30", 10);
  const errors: string[] = [];
  const items: TrendingItem[] = [];

  try {
    let result = await fetchFromAPI();
    if (result.error || result.items.length === 0) {
      if (result.error) errors.push(result.error);
      console.warn("API fetch failed or empty, trying page scrape...");
      const pageResult = await fetchFromPage();
      if (pageResult.error) {
        errors.push(pageResult.error);
      }
      if (pageResult.items.length > 0) {
        result = pageResult;
      }
    }

    for (let i = 0; i < result.items.length && items.length < limit; i++) {
      const item = result.items[i];
      const word = item.word || item.sentence_tag;
      if (!word) continue;

      items.push({
        id: `douyin-${i}`,
        title: word,
        url: `https://www.douyin.com/search/${encodeURIComponent(word)}`,
        source: "douyin",
        category: "trending",
        hotScore: item.hot_value || 0,
        extra: {
          label: item.label,
          videoCount: item.video_count,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch Douyin hot list: ${err}`);
  }

  const output = createSourceOutput("douyin", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Douyin`);
}

main();
