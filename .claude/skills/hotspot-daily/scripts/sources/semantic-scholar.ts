import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const S2_API = "https://api.semanticscholar.org/graph/v1";

const AI_KEYWORDS = [
  "large language model",
  "LLM",
  "GPT",
  "transformer",
  "diffusion model",
  "neural network",
  "deep learning",
  "reinforcement learning",
  "multimodal",
  "reasoning",
  "AI agent",
];

async function searchPapers(query: string, limit: number, apiKey?: string) {
  const fields = "paperId,title,abstract,url,year,citationCount,influentialCitationCount,publicationDate,venue,authors,openAccessPdf";
  const url = `${S2_API}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}&year=2025-2026`;

  const headers: Record<string, string> = {};
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetchWithTimeout(url, { headers }, 30000);
  if (res.status === 429) return { papers: [], error: "Rate limited" };
  if (!res.ok) return { papers: [], error: `API error ${res.status}` };

  const data = await res.json();
  return { papers: data.data || [] };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/semantic-scholar.json";
  const limit = parseInt(args.limit || "20", 10);
  const apiKey = args.apiKey || process.env.S2_API_KEY;

  const errors: string[] = [];
  const items: SourceItem[] = [];
  const seenIds = new Set<string>();

  const keywordsToSearch = apiKey ? AI_KEYWORDS.slice(0, 5) : AI_KEYWORDS.slice(0, 2);

  for (const keyword of keywordsToSearch) {
    if (items.length >= limit) break;
    if (items.length > 0) await new Promise((r) => setTimeout(r, apiKey ? 500 : 2000));

    const { papers, error } = await searchPapers(keyword, Math.ceil(limit / keywordsToSearch.length), apiKey);
    if (error) { errors.push(`${keyword}: ${error}`); continue; }

    for (const paper of papers) {
      if (seenIds.has(paper.paperId)) continue;
      if (items.length >= limit) break;
      seenIds.add(paper.paperId);

      const citations = paper.citationCount || 0;
      const influential = paper.influentialCitationCount || 0;

      items.push({
        id: `s2-${paper.paperId}`,
        title: paper.title,
        url: paper.openAccessPdf?.url || paper.url,
        source: "semantic-scholar",
        category: "paper",
        score: citations + influential * 5,
        summary: paper.abstract?.slice(0, 500),
        publishedAt: paper.publicationDate,
        extra: {
          venue: paper.venue,
          year: paper.year,
          citations,
          influentialCitations: influential,
          authors: paper.authors?.map((a: any) => a.name).slice(0, 5),
          hasOpenAccess: !!paper.openAccessPdf,
        },
      });
    }
  }

  items.sort((a, b) => (b.score || 0) - (a.score || 0));

  const output = createSourceOutput("semantic-scholar", items.slice(0, limit), errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} papers from Semantic Scholar`);
}

main();
