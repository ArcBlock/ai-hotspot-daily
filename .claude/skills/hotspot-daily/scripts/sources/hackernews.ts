import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

const HN_API_BASE = "https://hacker-news.firebaseio.com/v0";

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  time?: number;
  type?: string;
}

async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetchWithTimeout(`${HN_API_BASE}/item/${id}.json`);
    return res.json();
  } catch {
    return null;
  }
}

function matchesKeywords(title: string, keywords: string[]): boolean {
  const lowerTitle = title.toLowerCase();
  return keywords.some((kw) => lowerTitle.includes(kw.toLowerCase()));
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/hackernews.json";

  const minScore = parseInt(args.minScore || "50", 10);
  const limit = parseInt(args.limit || "30", 10);
  const keywords = (args.keywords || "AI,LLM,GPT,Claude,machine learning,neural").split(",");

  const errors: string[] = [];
  const items: SourceItem[] = [];

  try {
    const topStoriesRes = await fetchWithTimeout(`${HN_API_BASE}/topstories.json`);
    const topStoryIds: number[] = await topStoriesRes.json();

    const storiesToFetch = topStoryIds.slice(0, 100);
    const storyPromises = storiesToFetch.map((id) => fetchItem(id));
    const stories = await Promise.all(storyPromises);

    for (const story of stories) {
      if (!story || !story.title) continue;
      if (story.score && story.score < minScore) continue;
      if (!matchesKeywords(story.title, keywords)) continue;
      if (items.length >= limit) break;

      items.push({
        id: `hn-${story.id}`,
        title: story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        source: "hackernews",
        category: "discussion",
        score: story.score,
        comments: story.descendants,
        publishedAt: story.time ? new Date(story.time * 1000).toISOString() : undefined,
        extra: {
          hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
        },
      });
    }
  } catch (err) {
    errors.push(`Failed to fetch HN stories: ${err}`);
  }

  const output = createSourceOutput("hackernews", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from Hacker News`);
}

main();
