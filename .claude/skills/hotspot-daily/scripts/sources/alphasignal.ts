import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const ALPHASIGNAL_RSS = "https://alphasignalai.substack.com/feed";

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/alphasignal.json";
  const limit = parseInt(args.limit || "10", 10);

  const errors: string[] = [];
  let items: SourceItem[] = [];

  try {
    const res = await fetchWithTimeout(ALPHASIGNAL_RSS);
    if (!res.ok) throw new Error(`RSS feed returned ${res.status}`);

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

        let category: "paper" | "news" | "project" = "news";
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes("paper") || lowerTitle.includes("research") || lowerTitle.includes("arxiv")) category = "paper";
        else if (lowerTitle.includes("repo") || lowerTitle.includes("github") || lowerTitle.includes("code")) category = "project";

        items.push({
          id: `alphasignal-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`,
          title,
          url: link,
          source: "alphasignal",
          category,
          score: 50,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          summary: cleanDescription,
          extra: { newsletterType: category },
        });
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch AlphaSignal: ${err}`);
  }

  const seen = new Set<string>();
  items = items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, limit);

  const output = createSourceOutput("alphasignal", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from AlphaSignal`);
}

main();
