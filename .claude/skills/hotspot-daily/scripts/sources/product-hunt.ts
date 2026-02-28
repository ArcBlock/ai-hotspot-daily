import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const PH_RSS = "https://www.producthunt.com/feed";

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/product-hunt.json";
  const limit = parseInt(args.limit || "10", 10);

  const errors: string[] = [];
  let items: SourceItem[] = [];

  try {
    const res = await fetchWithTimeout(PH_RSS);
    if (!res.ok) throw new Error(`Atom feed returned ${res.status}`);

    const xml = await res.text();
    const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);

    for (const match of entryMatches) {
      const entryXml = match[1];
      const title = entryXml.match(/<title[^>]*>(.*?)<\/title>/)?.[1] || "";
      const link = entryXml.match(/<link[^>]*href="([^"]+)"[^>]*\/>/)?.[1] ||
                   entryXml.match(/<link[^>]*href="([^"]+)"[^>]*>/)?.[1] || "";
      const content = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ||
                      entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] || "";
      const published = entryXml.match(/<published>(.*?)<\/published>/)?.[1] ||
                        entryXml.match(/<updated>(.*?)<\/updated>/)?.[1] || "";

      if (title && link) {
        const cleanTitle = title.replace(/<[^>]*>/g, "").trim();
        const cleanContent = content.replace(/<[^>]*>/g, "").trim();

        items.push({
          id: `ph-${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`,
          title: cleanTitle,
          url: link,
          source: "product-hunt",
          category: "release",
          score: 25,
          publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
          summary: cleanContent.slice(0, 300),
        });
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch Product Hunt: ${err}`);
  }

  // Filter AI-related
  const aiKeywords = ["ai", "gpt", "llm", "machine learning", "neural", "chatbot", "copilot", "assistant", "automation"];
  items = items.filter(item => {
    const text = `${item.title} ${item.summary || ""}`.toLowerCase();
    return aiKeywords.some(kw => text.includes(kw));
  });

  const seen = new Set<string>();
  items = items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, limit);

  const output = createSourceOutput("product-hunt", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} AI products from Product Hunt`);
}

main();
