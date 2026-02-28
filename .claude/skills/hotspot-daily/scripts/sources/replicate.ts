import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const REPLICATE_EXPLORE = "https://replicate.com/explore";

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/replicate.json";
  const limit = parseInt(args.limit || "15", 10);

  const errors: string[] = [];
  const items: SourceItem[] = [];

  try {
    const res = await fetchWithTimeout(REPLICATE_EXPLORE, {
      headers: { Accept: "text/html" },
    });

    if (!res.ok) throw new Error(`Explore page returned ${res.status}`);

    const html = await res.text();

    // Try __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const models = data?.props?.pageProps?.models || data?.props?.pageProps?.featuredModels || [];

        for (const model of models.slice(0, limit)) {
          const fullName = `${model.owner}/${model.name}`;
          items.push({
            id: `replicate-${fullName.replace("/", "-")}`,
            title: model.name || fullName,
            url: `https://replicate.com/${fullName}`,
            source: "replicate",
            category: "release",
            score: Math.log10((model.run_count || 1) + 1) * 10,
            publishedAt: model.created_at || new Date().toISOString(),
            summary: model.description?.slice(0, 300),
            extra: { owner: model.owner, runCount: model.run_count },
          });
        }
      } catch { /* fallback */ }
    }

    // Fallback: parse HTML
    if (items.length === 0) {
      const modelMatches = html.matchAll(/href="\/([a-z0-9_-]+\/[a-z0-9_-]+)"[^>]*>/gi);
      const seen = new Set<string>();

      for (const match of modelMatches) {
        if (items.length >= limit) break;
        const modelPath = match[1];
        if (!modelPath || !modelPath.includes("/") || modelPath.startsWith("docs/") ||
            modelPath.startsWith("about/") || modelPath.startsWith("pricing") || seen.has(modelPath)) continue;

        seen.add(modelPath);
        items.push({
          id: `replicate-${modelPath.replace("/", "-")}`,
          title: modelPath,
          url: `https://replicate.com/${modelPath}`,
          source: "replicate",
          category: "release",
          score: 30,
          publishedAt: new Date().toISOString(),
          extra: { fromScrape: true },
        });
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch Replicate: ${err}`);
  }

  const output = createSourceOutput("replicate", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} models from Replicate`);
}

main();
