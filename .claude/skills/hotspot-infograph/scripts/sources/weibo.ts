import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { TrendingItem } from "../lib/types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://weibo.com/",
};

interface WeiboHotItem {
  word?: string;
  note?: string;
  num?: number;
  raw_hot?: number;
  label_name?: string;
  icon_desc?: string;
  icon_desc_color?: string;
  subject_querys?: string;
  subject_label?: string;
}

async function fetchPrimary(): Promise<{ items: WeiboHotItem[]; error?: string }> {
  const res = await fetchWithTimeout("https://weibo.com/ajax/side/hotSearch", {
    headers: BROWSER_HEADERS,
  });

  if (!res.ok) {
    return { items: [], error: `Primary API returned ${res.status}` };
  }

  const json = await res.json();
  const realtime = json?.data?.realtime;
  if (!Array.isArray(realtime)) {
    return { items: [], error: "Primary API: data.realtime is not an array" };
  }
  return { items: realtime };
}

async function fetchBackup(): Promise<{ items: WeiboHotItem[]; error?: string }> {
  const res = await fetchWithTimeout("https://weibo.com/ajax/statuses/hot_band", {
    headers: BROWSER_HEADERS,
  });

  if (!res.ok) {
    return { items: [], error: `Backup API returned ${res.status}` };
  }

  const json = await res.json();
  const band = json?.data?.band_list;
  if (!Array.isArray(band)) {
    return { items: [], error: "Backup API: data.band_list is not an array" };
  }
  return { items: band };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/weibo.json";
  const limit = parseInt(args.limit || "30", 10);
  const errors: string[] = [];
  const items: TrendingItem[] = [];

  try {
    let result = await fetchPrimary();
    if (result.error) {
      errors.push(result.error);
      console.warn(`Primary API failed: ${result.error}, trying backup...`);
      result = await fetchBackup();
      if (result.error) {
        errors.push(result.error);
      }
    }

    for (let i = 0; i < result.items.length && items.length < limit; i++) {
      const item = result.items[i];
      const word = item.word || item.note;
      if (!word) continue;

      items.push({
        id: `weibo-${i}`,
        title: word,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(word)}`,
        source: "weibo",
        category: "trending",
        hotScore: item.num || item.raw_hot || 0,
        extra: {
          rank: i + 1,
          tag: item.label_name,
          icon_desc: item.icon_desc,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch Weibo hot search: ${err}`);
  }

  const output = createSourceOutput("weibo", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Weibo`);
}

main();
