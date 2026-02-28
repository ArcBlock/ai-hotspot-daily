import { XMLParser } from "fast-xml-parser";
import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

interface RSSFeed {
  name: string;
  url: string;
  category?: "news" | "paper" | "discussion" | "release";
  language?: "en" | "zh";
}

function extractText(val: string | { "#text": string } | undefined): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  return val["#text"] || "";
}

function extractLink(link: any): string {
  if (Array.isArray(link)) {
    const alternate = link.find((l: any) => l["@_rel"] === "alternate");
    return alternate ? alternate["@_href"] : link[0]["@_href"];
  }
  return link["@_href"];
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DEFAULT_FEEDS: RSSFeed[] = [
  { name: "OpenAI Blog", url: "https://openai.com/blog/rss.xml", category: "news" },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "news" },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", category: "news" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed/", category: "news" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "news" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "news" },
  { name: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", category: "news" },
  { name: "Import AI", url: "https://importai.substack.com/feed", category: "news" },
  { name: "Last Week in AI", url: "https://lastweekin.ai/feed", category: "news" },
  { name: "Ahead of AI", url: "https://magazine.sebastianraschka.com/feed", category: "paper" },
  { name: "Lobste.rs AI", url: "https://lobste.rs/t/ai.rss", category: "discussion" },
  { name: "Dev.to AI", url: "https://dev.to/feed/tag/ai", category: "discussion" },
  { name: "机器之心", url: "https://www.jiqizhixin.com/rss", category: "news", language: "zh" },
];

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/rss.json";
  const feeds = DEFAULT_FEEDS;

  const errors: string[] = [];
  const items: SourceItem[] = [];

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  for (const feed of feeds) {
    try {
      const res = await fetchWithTimeout(feed.url, {
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
        redirect: "follow",
      });

      if (!res.ok) {
        errors.push(`Failed to fetch ${feed.name}: ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const data = parser.parse(xml);

      // RSS 2.0
      if (data.rss?.channel) {
        const rssItems = data.rss.channel.item;
        if (!rssItems) continue;
        const itemList = Array.isArray(rssItems) ? rssItems : [rssItems];

        for (const item of itemList.slice(0, 10)) {
          const guid = typeof item.guid === "string" ? item.guid : item.guid?.["#text"] || item.link;
          const content = item["content:encoded"] || item.description || "";
          const summary = stripHtml(content).slice(0, 500);

          items.push({
            id: `rss-${feed.name}-${guid}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100),
            title: stripHtml(item.title),
            url: item.link,
            source: `rss:${feed.name}`,
            category: feed.category || "news",
            summary,
            publishedAt: item.pubDate || item["dc:date"],
            extra: { feedName: feed.name, language: feed.language || "en" },
          });
        }
      }
      // Atom
      else if (data.feed?.entry) {
        const entries = data.feed.entry;
        const entryList = Array.isArray(entries) ? entries : [entries];

        for (const entry of entryList.slice(0, 10)) {
          const title = extractText(entry.title);
          const link = extractLink(entry.link);
          const rawContent = entry.content || entry.summary || "";
          const content = extractText(rawContent);
          const summary = stripHtml(content).slice(0, 500);

          items.push({
            id: `rss-${feed.name}-${entry.id || link}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100),
            title: stripHtml(title),
            url: link,
            source: `rss:${feed.name}`,
            category: feed.category || "news",
            summary,
            publishedAt: entry.published || entry.updated,
            extra: { feedName: feed.name, language: feed.language || "en" },
          });
        }
      }
      // RDF (RSS 1.0)
      else if (data["rdf:RDF"]?.item) {
        const rdfItems = data["rdf:RDF"].item;
        const itemList = Array.isArray(rdfItems) ? rdfItems : [rdfItems];

        for (const item of itemList.slice(0, 10)) {
          const content = item["content:encoded"] || item.description || "";
          const summary = stripHtml(content).slice(0, 500);

          items.push({
            id: `rss-${feed.name}-${item.link}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100),
            title: stripHtml(item.title),
            url: item.link,
            source: `rss:${feed.name}`,
            category: feed.category || "news",
            summary,
            publishedAt: item["dc:date"],
            extra: { feedName: feed.name, language: feed.language || "en" },
          });
        }
      }
    } catch (err) {
      errors.push(`Failed to parse ${feed.name}: ${err}`);
    }
  }

  const output = createSourceOutput("rss", items, errors);
  await writeOutput(output, outputPath);
  console.log(`Fetched ${items.length} items from ${feeds.length - errors.length} RSS feeds`);
}

main();
