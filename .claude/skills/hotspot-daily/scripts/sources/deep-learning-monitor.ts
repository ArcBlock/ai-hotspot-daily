import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const DLM_SITE = "https://deeplearn.org";

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/deep-learning-monitor.json";
  const limit = parseInt(args.limit || "15", 10);

  const errors: string[] = [];
  const items: SourceItem[] = [];

  try {
    const res = await fetchWithTimeout(DLM_SITE, {
      headers: { Accept: "text/html" },
    });

    if (!res.ok) throw new Error(`Site returned ${res.status}`);

    const html = await res.text();
    const seen = new Set<string>();

    // Try embedded JSON
    const jsonMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const papers = data?.props?.pageProps?.papers || data?.props?.pageProps?.initialPapers || [];

        for (const paper of papers.slice(0, limit)) {
          items.push({
            id: `dlm-${paper.arxiv_id || paper.id || paper.title?.slice(0, 30).replace(/\W+/g, "-")}`,
            title: paper.title,
            url: paper.url || `https://arxiv.org/abs/${paper.arxiv_id}`,
            source: "deep-learning-monitor",
            category: "paper",
            score: 45 + (paper.score || 0) * 0.1,
            publishedAt: paper.published || new Date().toISOString(),
            summary: paper.abstract?.slice(0, 300),
            extra: { arxivId: paper.arxiv_id, authors: paper.authors?.slice(0, 5) },
          });
        }
      } catch { /* fallback */ }
    }

    // Fallback: parse HTML
    if (items.length === 0) {
      const titleMatches = html.matchAll(/<div class="title"><a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/div>/g);
      for (const match of titleMatches) {
        if (items.length >= limit) break;
        const [, href, title] = match;
        const arxivIdMatch = href.match(/(\d{4}\.\d{4,5})/);
        const arxivId = arxivIdMatch?.[1];

        if (title && !seen.has(title)) {
          seen.add(title);
          items.push({
            id: `dlm-${arxivId || title.slice(0, 30).replace(/\W+/g, "-")}`,
            title: title.trim(),
            url: arxivId ? `https://arxiv.org/abs/${arxivId}` : `${DLM_SITE}${href}`,
            source: "deep-learning-monitor",
            category: "paper",
            score: 45,
            publishedAt: new Date().toISOString(),
            extra: { arxivId, fromScrape: true },
          });
        }
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch Deep Learning Monitor: ${err}`);
  }

  const output = createSourceOutput("deep-learning-monitor", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} papers from Deep Learning Monitor`);
}

main();
