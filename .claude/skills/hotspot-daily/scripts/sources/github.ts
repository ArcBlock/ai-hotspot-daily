import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";
import * as cheerio from "cheerio";

const GITHUB_TRENDING_URL = "https://github.com/trending";

async function fetchTrendingRepos(since: "daily" | "weekly" = "daily") {
  const url = `${GITHUB_TRENDING_URL}?since=${since}`;
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "text/html" },
  });

  if (!res.ok) throw new Error(`GitHub Trending fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const repos: any[] = [];

  $("article.Box-row").each((_, el) => {
    const $el = $(el);
    const repoLink = $el.find("h2 a").attr("href");
    if (!repoLink) return;

    const fullName = repoLink.slice(1);
    const description = $el.find("p.col-9").text().trim();
    const language = $el.find('[itemprop="programmingLanguage"]').text().trim();
    const starsText = $el.find('a[href$="/stargazers"]').text().trim().replace(/,/g, "");
    const stars = parseInt(starsText, 10) || 0;
    const forksText = $el.find('a[href$="/forks"]').text().trim().replace(/,/g, "");
    const forks = parseInt(forksText, 10) || 0;
    const starsTodayText = $el.find("span.d-inline-block.float-sm-right").text().trim();
    const starsTodayMatch = starsTodayText.match(/([\d,]+)\s+stars?\s+(today|this week)/i);
    const starsToday = starsTodayMatch ? parseInt(starsTodayMatch[1].replace(/,/g, ""), 10) : 0;

    repos.push({ fullName, url: `https://github.com${repoLink}`, description, language, stars, starsToday, forks });
  });

  return repos;
}

function isAIRelated(repo: any): boolean {
  const text = `${repo.fullName} ${repo.description}`.toLowerCase();
  const aiKeywords = [
    "ai", "ml", "llm", "gpt", "claude", "gemini", "transformer", "neural",
    "deep-learning", "machine-learning", "nlp", "diffusion", "embedding",
    "langchain", "openai", "anthropic", "huggingface", "pytorch", "tensorflow",
    "model", "agent", "rag", "vector", "chatbot", "inference",
  ];
  return aiKeywords.some((kw) => text.includes(kw));
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/github.json";
  const limit = parseInt(args.limit || "20", 10);
  const since = (args.since as "daily" | "weekly") || "daily";

  const errors: string[] = [];
  const items: SourceItem[] = [];

  try {
    const repos = await fetchTrendingRepos(since);

    for (const repo of repos) {
      if (items.length >= limit) break;
      const aiRelated = isAIRelated(repo);

      items.push({
        id: `gh-${repo.fullName.replace("/", "-")}`,
        title: repo.fullName,
        url: repo.url,
        source: "github",
        category: "project",
        score: repo.stars,
        summary: repo.description || undefined,
        publishedAt: new Date().toISOString(),
        extra: { language: repo.language, forks: repo.forks, starsToday: repo.starsToday, aiRelated, trending: since },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch GitHub Trending: ${err}`);
  }

  const output = createSourceOutput("github", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} trending repos from GitHub`);
}

main();
