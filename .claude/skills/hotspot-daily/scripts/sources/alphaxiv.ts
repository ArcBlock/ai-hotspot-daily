import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const ALPHAXIV_BASE = "https://www.alphaxiv.org";

async function fetchTrendingPapers(limit: number): Promise<SourceItem[]> {
  const items: SourceItem[] = [];

  try {
    const res = await fetchWithTimeout(`${ALPHAXIV_BASE}/explore`, {
      headers: { Accept: "text/html" },
    });

    if (!res.ok) throw new Error(`alphaXiv returned ${res.status}`);

    const html = await res.text();

    // Try embedded JSON
    const jsonMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const papers = data.papers || data.trending || [];

        for (const paper of papers.slice(0, limit)) {
          items.push({
            id: `alphaxiv-${paper.arxiv_id}`,
            title: paper.title,
            url: `${ALPHAXIV_BASE}/abs/${paper.arxiv_id}`,
            source: "alphaxiv",
            category: "paper",
            score: 40 + (paper.comments_count || 0) * 2,
            publishedAt: paper.published_date,
            summary: paper.abstract?.slice(0, 300),
            extra: {
              arxivId: paper.arxiv_id,
              authors: paper.authors?.slice(0, 5),
              comments: paper.comments_count,
              views: paper.views,
            },
          });
        }
      } catch { /* fallback */ }
    }

    // Fallback: extract from HTML
    if (items.length === 0) {
      const paperMatches = html.matchAll(/<a[^>]*href="\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?)"[^>]*>([\s\S]*?)<\/a>/g);
      for (const match of paperMatches) {
        if (items.length >= limit) break;
        const [, arxivId, titleHtml] = match;
        const title = titleHtml.replace(/<[^>]*>/g, "").trim();
        if (arxivId && title && title.length > 10) {
          items.push({
            id: `alphaxiv-${arxivId}`,
            title,
            url: `${ALPHAXIV_BASE}/abs/${arxivId}`,
            source: "alphaxiv",
            category: "paper",
            score: 40,
            publishedAt: new Date().toISOString(),
            extra: { arxivId, fromScrape: true },
          });
        }
      }
    }
  } catch (err) {
    console.log(`Failed to fetch alphaXiv: ${err}`);
  }

  return items;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/alphaxiv.json";
  const limit = parseInt(args.limit || "15", 10);

  const errors: string[] = [];
  let items: SourceItem[] = [];

  try {
    items = await fetchTrendingPapers(limit);
  } catch (err) {
    errors.push(`Failed to fetch alphaXiv: ${err}`);
  }

  const seen = new Set<string>();
  items = items.filter(item => {
    const arxivId = item.extra?.arxivId as string;
    if (!arxivId) return true;
    if (seen.has(arxivId)) return false;
    seen.add(arxivId);
    return true;
  });

  const output = createSourceOutput("alphaxiv", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} papers from alphaXiv`);
}

main();
