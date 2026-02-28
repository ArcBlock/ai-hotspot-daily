import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const HF_PAPERS_TRENDING = "https://huggingface.co/papers";

async function fetchTrendingPapers(limit: number): Promise<SourceItem[]> {
  const items: SourceItem[] = [];

  const res = await fetchWithTimeout(HF_PAPERS_TRENDING, {
    headers: { Accept: "text/html" },
  });

  if (!res.ok) throw new Error(`HF Papers page returned ${res.status}`);

  const html = await res.text();

  // Try __NEXT_DATA__ first
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const data = JSON.parse(nextDataMatch[1]);
      const papers = data?.props?.pageProps?.dailyPapers || data?.props?.pageProps?.papers || [];

      for (const paper of papers.slice(0, limit)) {
        const arxivId = paper.paper?.id || paper.id;
        items.push({
          id: `pwc-${arxivId}`,
          title: paper.paper?.title || paper.title,
          url: `https://huggingface.co/papers/${arxivId}`,
          source: "papers-with-code",
          category: "paper",
          score: (paper.paper?.upvotes || paper.upvotes || 0) * 0.5 + 45,
          publishedAt: paper.publishedAt || new Date().toISOString(),
          summary: (paper.paper?.summary || paper.summary || "").slice(0, 300),
          extra: {
            arxivId,
            upvotes: paper.paper?.upvotes || paper.upvotes,
            authors: (paper.paper?.authors || paper.authors || []).slice(0, 5).map((a: any) => a.name || a),
          },
        });
      }
    } catch { /* fallback below */ }
  }

  // Fallback: extract from HTML
  if (items.length === 0) {
    const paperIds = [...html.matchAll(/href="\/papers\/(\d{4}\.\d{4,5})"/g)]
      .map(m => m[1])
      .filter((id, idx, arr) => arr.indexOf(id) === idx);

    for (const arxivId of paperIds.slice(0, limit)) {
      items.push({
        id: `pwc-${arxivId}`,
        title: `Paper ${arxivId}`,
        url: `https://huggingface.co/papers/${arxivId}`,
        source: "papers-with-code",
        category: "paper",
        score: 45,
        publishedAt: new Date().toISOString(),
        extra: { arxivId, fromScrape: true },
      });
    }
  }

  return items;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/papers-with-code.json";
  const limit = parseInt(args.limit || "20", 10);

  const errors: string[] = [];
  let items: SourceItem[] = [];

  try {
    items = await fetchTrendingPapers(limit);
  } catch (err) {
    errors.push(`Failed to fetch Papers With Code: ${err}`);
  }

  const output = createSourceOutput("papers-with-code", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Papers With Code`);
}

main();
