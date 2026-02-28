import { parseArgs, writeOutput, createSourceOutput, fetchWithTimeout } from "../lib/utils";
import type { SourceItem } from "../lib/types";

// --- API backends ---
const X_API_BASE = "https://api.x.com/2";
const COMPOSIO_API = "https://backend.composio.dev/api";
const COMPOSIO_ACTIONS = `${COMPOSIO_API}/v2/actions`;

type Backend = "composio" | "x-api";

// Auto-detect Twitter connection ID from Composio account
async function resolveConnectionId(apiKey: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${COMPOSIO_API}/v1/connectedAccounts?appNames=twitter&status=ACTIVE`,
    { headers: { "x-api-key": apiKey } },
    10000
  );
  if (!res.ok) {
    throw new Error(`Failed to list Composio connections: ${res.status}`);
  }
  const data = await res.json();
  const items = data?.items || data?.connectedAccounts || [];
  if (items.length === 0) {
    throw new Error("No Twitter account connected in Composio.");
  }
  return items[0].id;
}

// AI-related search queries (recent search supports max 512 chars)
const SEARCH_QUERIES = [
  '(ChatGPT OR OpenAI OR Claude OR Anthropic OR Gemini OR DeepSeek OR Cursor OR Copilot OR LLaMA OR Mistral) -is:retweet -is:reply lang:en',
  '(LLM OR "language model" OR "AI agent" OR multimodal OR reasoning OR "open source AI") -is:retweet -is:reply lang:en',
];

// Minimum likes to include a tweet from keyword search (client-side filter)
const MIN_LIKES_SEARCH = 50;

// Key AI accounts to monitor
const MONITOR_ACCOUNTS = [
  // --- AI Companies & Labs ---
  "OpenAI", "AnthropicAI", "GoogleDeepMind", "GoogleAI", "AIatMeta",
  "xai", "MistralAI", "huggingface", "cohere", "StabilityAI",
  "perplexity_ai", "GroqInc",
  // --- AI Dev Tools ---
  "cursor_ai", "Replit", "vercel",
  // --- Researchers & Leaders ---
  "sama", "karpathy", "ylecun", "AndrewYNg", "DrJimFan",
  "demishassabis", "fchollet", "ilyasut", "jeremyphoward",
  "hardmaru", "EMostaque", "AravSrinivas", "kevinweil", "swyx", "aidangomez",
];

interface TweetV2 {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  entities?: {
    urls?: { expanded_url: string; display_url: string }[];
    hashtags?: { tag: string }[];
    mentions?: { username: string }[];
  };
}

interface UserV2 {
  id: string;
  name: string;
  username: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

interface SearchResponseV2 {
  data?: TweetV2[];
  includes?: { users?: UserV2[] };
  meta?: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  errors?: { message: string; type: string }[];
}

type SearchResult = { tweets: TweetV2[]; users: Map<string, UserV2>; error?: string };

// --- Search via X official API v2 (Bearer Token) ---
async function searchViaXApi(
  query: string,
  bearerToken: string,
  maxResults: number = 20
): Promise<SearchResult> {
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    sort_order: "relevancy",
    "tweet.fields": "created_at,public_metrics,author_id,entities",
    expansions: "author_id",
    "user.fields": "name,username,public_metrics",
  });

  try {
    const res = await fetchWithTimeout(`${X_API_BASE}/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
    }, 15000);

    if (res.status === 401) return { tweets: [], users: new Map(), error: "Invalid Bearer Token (401)" };
    if (res.status === 403) return { tweets: [], users: new Map(), error: "Forbidden (403)" };
    if (res.status === 429) return { tweets: [], users: new Map(), error: `Rate limited (429)` };
    if (!res.ok) {
      const text = await res.text();
      return { tweets: [], users: new Map(), error: `X API error ${res.status}: ${text}` };
    }

    return parseSearchResponse(await res.json());
  } catch (err) {
    return { tweets: [], users: new Map(), error: `Request failed: ${err}` };
  }
}

// --- Search via Composio proxy (free tier) ---
async function searchViaComposio(
  query: string,
  apiKey: string,
  connectionId: string,
  maxResults: number = 20
): Promise<SearchResult> {
  try {
    const res = await fetchWithTimeout(`${COMPOSIO_ACTIONS}/TWITTER_RECENT_SEARCH/execute`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        connectedAccountId: connectionId,
        input: {
          query,
          max_results: Math.min(Math.max(maxResults, 10), 100),
          sort_order: "relevancy",
          "tweet.fields": "created_at,public_metrics,author_id,entities",
          expansions: "author_id",
          "user.fields": "name,username,public_metrics",
        },
      }),
    }, 30000);

    if (res.status === 401) return { tweets: [], users: new Map(), error: "Invalid Composio API key (401)" };
    if (res.status === 429) return { tweets: [], users: new Map(), error: "Composio rate limited (429)" };
    if (!res.ok) {
      const text = await res.text();
      return { tweets: [], users: new Map(), error: `Composio API error ${res.status}: ${text}` };
    }

    const result = await res.json();
    // Composio wraps the X API response in response_data
    const raw = result?.response_data || result?.data || result;
    return parseSearchResponse(raw);
  } catch (err) {
    return { tweets: [], users: new Map(), error: `Request failed: ${err}` };
  }
}

// --- Shared response parser ---
function parseSearchResponse(data: any): SearchResult {
  const response: SearchResponseV2 = {
    data: data?.data || [],
    includes: data?.includes,
    meta: data?.meta,
    errors: data?.errors,
  };

  if (response.errors?.length) {
    console.warn("  API warnings:", response.errors.map(e => e.message).join("; "));
  }

  const userMap = new Map<string, UserV2>();
  for (const user of response.includes?.users || []) {
    userMap.set(user.id, user);
  }

  return { tweets: response.data || [], users: userMap };
}

// --- Unified search function ---
function createSearchFn(backend: Backend, credentials: { bearerToken?: string; apiKey?: string; connectionId?: string }) {
  return (query: string, maxResults: number = 20): Promise<SearchResult> => {
    if (backend === "composio") {
      return searchViaComposio(query, credentials.apiKey!, credentials.connectionId!, maxResults);
    }
    return searchViaXApi(query, credentials.bearerToken!, maxResults);
  };
}

function tweetToItem(tweet: TweetV2, user?: UserV2): SourceItem {
  const metrics = tweet.public_metrics;
  const score =
    (metrics?.like_count || 0) +
    (metrics?.retweet_count || 0) * 2 +
    (metrics?.reply_count || 0) +
    (metrics?.quote_count || 0) * 2;

  const urls = tweet.entities?.urls?.map(u => u.expanded_url) || [];
  const hashtags = tweet.entities?.hashtags?.map(h => h.tag) || [];
  const username = user?.username || "unknown";

  const cleanText = tweet.text
    .replace(/https:\/\/t\.co\/\w+/g, "")
    .trim();

  return {
    id: `x-${tweet.id}`,
    title: `@${username}: ${cleanText.slice(0, 100)}${cleanText.length > 100 ? "..." : ""}`,
    url: `https://x.com/${username}/status/${tweet.id}`,
    source: "x-twitter",
    category: "discussion",
    score,
    summary: cleanText,
    publishedAt: tweet.created_at,
    extra: {
      username,
      displayName: user?.name,
      followers: user?.public_metrics?.followers_count,
      likes: metrics?.like_count,
      retweets: metrics?.retweet_count,
      replies: metrics?.reply_count,
      quotes: metrics?.quote_count,
      impressions: metrics?.impression_count,
      hashtags,
      urls,
    },
  };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const outputPath = args.output || "data/x-twitter.json";
  const limit = parseInt(args.limit || "30", 10);

  // Resolve backend: prefer Composio (free), fallback to X API (paid)
  const composioApiKey = process.env.COMPOSIO_API_KEY;
  const bearerToken = process.env.X_BEARER_TOKEN;

  let backend: Backend;
  let credentials: { bearerToken?: string; apiKey?: string; connectionId?: string } = {};

  if (composioApiKey) {
    // Try Composio first
    let connectionId = process.env.COMPOSIO_CONNECTION_ID;
    if (!connectionId) {
      console.log("  Auto-detecting Twitter connection ID...");
      try {
        connectionId = await resolveConnectionId(composioApiKey);
        console.log(`  Found connection: ${connectionId.slice(0, 8)}...`);
      } catch (err) {
        console.warn(`  Composio connection failed: ${err}`);
        if (bearerToken) {
          console.log("  Falling back to X API v2 (Bearer Token)...");
        } else {
          console.error("Error: Composio has no Twitter connection and X_BEARER_TOKEN is not set.");
          process.exit(1);
        }
      }
    }
    if (connectionId) {
      backend = "composio";
      credentials = { apiKey: composioApiKey, connectionId };
      console.log("Fetching tweets from X via Composio API (free)...");
    } else {
      backend = "x-api";
      credentials = { bearerToken };
      console.log("Fetching tweets from X via official API v2...");
    }
  } else if (bearerToken) {
    backend = "x-api";
    credentials = { bearerToken };
    console.log("Fetching tweets from X via official API v2...");
  } else {
    console.error("Error: Set COMPOSIO_API_KEY (free) or X_BEARER_TOKEN (paid)");
    console.error("  Composio (free): https://composio.dev");
    console.error("  X API (paid):    https://console.x.com");
    process.exit(1);
  }

  const search = createSearchFn(backend!, credentials);
  const delay = backend! === "composio" ? 500 : 1000;

  const errors: string[] = [];
  const items: SourceItem[] = [];
  const seenIds = new Set<string>();

  // 1) Search AI-related tweets
  for (const query of SEARCH_QUERIES) {
    if (items.length >= limit) break;

    console.log(`  Searching: ${query.slice(0, 60)}...`);
    const remaining = limit - items.length;
    const { tweets, users, error } = await search(query, Math.min(remaining + 10, 30));

    if (error) {
      errors.push(`Search: ${error}`);
      if (error.toLowerCase().includes("rate limited")) {
        console.log("  Rate limited, pausing searches...");
        break;
      }
      continue;
    }

    for (const tweet of tweets) {
      if (seenIds.has(tweet.id)) continue;
      if (items.length >= limit) break;
      if ((tweet.public_metrics?.like_count || 0) < MIN_LIKES_SEARCH) continue;

      seenIds.add(tweet.id);
      const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
      items.push(tweetToItem(tweet, user));
    }

    await new Promise(r => setTimeout(r, delay));
  }

  // 2) Fetch from monitored AI accounts (if room left)
  if (items.length < limit) {
    const accountBatches: string[][] = [];
    for (let i = 0; i < MONITOR_ACCOUNTS.length; i += 10) {
      accountBatches.push(MONITOR_ACCOUNTS.slice(i, i + 10));
    }

    for (const batch of accountBatches) {
      if (items.length >= limit) break;

      const fromQuery = batch.map(a => `from:${a}`).join(" OR ");
      const query = `(${fromQuery}) -is:retweet`;

      console.log(`  Fetching accounts: ${batch.join(", ")}...`);
      const remaining = limit - items.length;
      const { tweets, users, error } = await search(query, Math.min(remaining + 5, 30));

      if (error) {
        errors.push(`Accounts ${batch.join(",")}: ${error}`);
        if (error.toLowerCase().includes("rate limited")) break;
        continue;
      }

      for (const tweet of tweets) {
        if (seenIds.has(tweet.id)) continue;
        if (items.length >= limit) break;

        seenIds.add(tweet.id);
        const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
        items.push(tweetToItem(tweet, user));
      }

      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Sort by engagement score
  items.sort((a, b) => (b.score || 0) - (a.score || 0));

  const output = createSourceOutput("x-twitter", items.slice(0, limit), errors);
  await writeOutput(output, outputPath);

  const via = backend! === "composio" ? "Composio" : "X API v2";
  console.log(`Fetched ${items.length} tweets from X (via ${via})`);
  if (errors.length) console.error("Errors:", errors);
}

main();
