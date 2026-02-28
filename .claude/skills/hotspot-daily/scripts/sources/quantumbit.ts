import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const QBITAI_RSS = "https://rsshub.app/qbitai/category/news";
const ALTERNATIVE_RSS = ["https://www.qbitai.com/feed", "https://rsshub.app/qbitai"];

async function fetchFromRSS(): Promise<SourceItem[]> {
  const items: SourceItem[] = [];
  const rssUrls = [QBITAI_RSS, ...ALTERNATIVE_RSS];

  for (const rssUrl of rssUrls) {
    if (items.length > 0) break;

    try {
      const res = await fetchWithTimeout(rssUrl, {}, 15000);
      if (!res.ok) continue;

      const xml = await res.text();
      const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

      for (const match of itemMatches) {
        const itemXml = match[1];
        const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                      itemXml.match(/<title>(.*?)<\/title>/)?.[1] || "";
        const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || "";
        const description = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
                            itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
        const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";

        if (title && link) {
          const cleanDescription = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);

          items.push({
            id: `qbitai-${title.slice(0, 30).replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")}`,
            title,
            url: link,
            source: "quantumbit",
            category: "news",
            score: 35,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            summary: cleanDescription,
            extra: { language: "zh" },
          });
        }
      }
    } catch {
      // Try next URL
    }
  }

  return items;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/quantumbit.json";
  const limit = parseInt(args.limit || "10", 10);

  const errors: string[] = [];
  let items: SourceItem[] = [];

  try {
    items = await fetchFromRSS();
  } catch (err) {
    errors.push(`Failed to fetch 量子位: ${err}`);
  }

  const seen = new Set<string>();
  items = items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, limit);

  const output = createSourceOutput("quantumbit", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} articles from 量子位`);
}

main();
