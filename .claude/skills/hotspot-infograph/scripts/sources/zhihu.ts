import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { TrendingItem } from "../lib/types";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://www.zhihu.com/",
};

interface ZhihuHotItem {
  target?: {
    id?: number | string;
    title?: string;
    excerpt?: string;
    url?: string;
  };
  title?: string;
  detail_text?: string;
  feed_specific?: {
    answer_count?: number;
  };
  children?: Array<{
    thumbnail?: string;
  }>;
}

async function fetchFromAPI(): Promise<{ items: ZhihuHotItem[]; error?: string }> {
  const res = await fetchWithTimeout(
    "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50",
    { headers: BROWSER_HEADERS }
  );

  if (!res.ok) {
    return { items: [], error: `Zhihu API returned ${res.status}` };
  }

  const json = await res.json();
  const data = json?.data;
  if (!Array.isArray(data)) {
    return { items: [], error: "Zhihu API: data is not an array" };
  }

  return { items: data };
}

async function fetchFromPage(): Promise<{ items: ZhihuHotItem[]; error?: string }> {
  const res = await fetchWithTimeout("https://www.zhihu.com/hot", {
    headers: {
      ...BROWSER_HEADERS,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    return { items: [], error: `Zhihu page returned ${res.status}` };
  }

  const html = await res.text();

  // Try to extract initial data from the page
  const jsonMatch = html.match(/initialData"?\s*[=:]\s*({.*?})\s*[;<]/s);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const hotList = data?.initialState?.topstory?.hotList;
      if (Array.isArray(hotList)) {
        return { items: hotList };
      }
    } catch {
      // JSON parse failed
    }
  }

  // Fallback: parse HTML with cheerio
  const $ = cheerio.load(html);
  const items: ZhihuHotItem[] = [];

  $("[class*='HotItem']").each((_i, el) => {
    const titleEl = $(el).find("[class*='HotItem-title']");
    const title = titleEl.text().trim();
    const link = $(el).find("a").first().attr("href");
    const excerpt = $(el).find("[class*='HotItem-excerpt']").text().trim();
    const metrics = $(el).find("[class*='HotItem-metrics']").text().trim();

    if (title) {
      const idMatch = link?.match(/question\/(\d+)/);
      items.push({
        target: {
          id: idMatch ? idMatch[1] : undefined,
          title,
          excerpt: excerpt || undefined,
        },
        detail_text: metrics || undefined,
      });
    }
  });

  if (items.length === 0) {
    return { items: [], error: "Could not extract items from Zhihu page" };
  }

  return { items };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/zhihu.json";
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
      const title = item.target?.title || item.title;
      if (!title) continue;

      const targetId = item.target?.id;
      const url = targetId
        ? `https://www.zhihu.com/question/${targetId}`
        : `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(title)}`;

      let hotScore = 0;
      if (item.detail_text) {
        const numStr = item.detail_text.replace(/[^\d]/g, "");
        hotScore = numStr ? parseInt(numStr, 10) : 0;
      }

      items.push({
        id: `zhihu-${targetId || i}`,
        title,
        url,
        source: "zhihu",
        category: "trending",
        hotScore,
        extra: {
          excerpt: item.target?.excerpt,
          answerCount: item.feed_specific?.answer_count,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch Zhihu hot list: ${err}`);
  }

  const output = createSourceOutput("zhihu", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Zhihu`);
}

main();
