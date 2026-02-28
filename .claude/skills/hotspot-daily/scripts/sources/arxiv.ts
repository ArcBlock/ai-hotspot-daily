import { XMLParser } from "fast-xml-parser";
import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const ARXIV_API = "http://export.arxiv.org/api/query";

function extractUrl(links: any): string {
  if (Array.isArray(links)) {
    const pdfLink = links.find((l: any) => l["@_type"] === "application/pdf");
    if (pdfLink) return pdfLink["@_href"];
    return links[0]["@_href"];
  }
  return links["@_href"];
}

function extractAuthors(author: any): string {
  if (Array.isArray(author)) return author.map((a: any) => a.name).join(", ");
  return author.name;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/arxiv.json";
  const categories = (args.categories || "cs.AI,cs.CL,cs.LG").split(",");
  const maxResults = parseInt(args.maxResults || "20", 10);

  const errors: string[] = [];
  const items: SourceItem[] = [];
  const seenIds = new Set<string>();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  for (const category of categories) {
    try {
      const query = `cat:${category}`;
      const url = `${ARXIV_API}?search_query=${encodeURIComponent(query)}&start=0&max_results=${Math.ceil(maxResults / categories.length)}&sortBy=submittedDate&sortOrder=descending`;

      const res = await fetchWithTimeout(url);
      const xml = await res.text();
      const data = parser.parse(xml);
      const entries = data.feed?.entry;
      if (!entries) continue;

      const entryList = Array.isArray(entries) ? entries : [entries];
      for (const entry of entryList) {
        const arxivId = entry.id.split("/abs/")[1] || entry.id;
        if (seenIds.has(arxivId)) continue;
        seenIds.add(arxivId);

        const title = entry.title.replace(/\s+/g, " ").trim();
        const summary = entry.summary.replace(/\s+/g, " ").trim();

        items.push({
          id: `arxiv-${arxivId}`,
          title,
          url: extractUrl(entry.link),
          source: "arxiv",
          category: "paper",
          summary: summary.slice(0, 500) + (summary.length > 500 ? "..." : ""),
          publishedAt: entry.published,
          extra: {
            authors: extractAuthors(entry.author),
            primaryCategory: entry["arxiv:primary_category"]?.["@_term"],
            arxivId,
          },
        });
      }
    } catch (err) {
      errors.push(`Failed to fetch arXiv ${category}: ${err}`);
    }
  }

  const output = createSourceOutput("arxiv", items.slice(0, maxResults), errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} papers from arXiv`);
}

main();
