// Source item from trending APIs (weibo, baidu, zhihu, etc.)
export interface TrendingItem {
  id: string;
  title: string;
  url: string;
  source: string;          // "weibo" | "baidu" | "zhihu" | "douyin" | "x-trending" | "google-trends"
  category: string;        // "科技" | "娱乐" | "体育" | "社会" | "财经" | "生活" | "国际" | "文化"
  hotScore: number;        // platform-specific popularity score
  publishedAt?: string;
  extra?: Record<string, unknown>;
}

export interface SourceOutput {
  source: string;
  fetchedAt: string;
  items: TrendingItem[];
  errors?: string[];
}

// Candidate after cross-platform merge
export interface TrendingCandidate extends TrendingItem {
  crossPlatformCount: number;   // how many platforms mention this topic
  relatedSources: string[];     // which platforms
  mergedTitles?: string[];      // titles from other platforms
}

// Chart types for hero section
export type HeroChartType = "bar" | "line" | "ring" | "timeline" | "versus" | "heatmap";

// Mini chart types for cards
export type MiniChartType = "miniBar" | "trend" | "progress" | "bigNumber" | "versus" | "tags";

export interface ChartDataItem {
  label: string;
  value: number;
  unit?: string;
}

// The main page data structure
export interface DailyPage {
  meta: {
    date: string;              // "2026-02-13"
    slug: string;              // URL-friendly short name
    generatedAt: string;       // ISO time
    language: "zh";
  };

  hero: {
    title: string;             // ≤20 chars (Chinese)
    category: string;          // domain tag
    color: string;             // theme color hex

    chart: {
      type: HeroChartType;
      data: ChartDataItem[];
      highlight?: string;
    };

    keyNumbers: Array<{
      value: string;
      label: string;
    }>;                        // exactly 3

    takeaway: string;          // ≤30 chars (Chinese)

    sources: Array<{
      name: string;
      url?: string;
    }>;
  };

  cards: Array<{
    title: string;             // ≤15 chars (Chinese)
    category: string;
    color: string;

    miniChart: {
      type: MiniChartType;
      data: any;
    };

    insight: string;           // ≤20 chars (Chinese)
  }>;
}

// Config interfaces
export interface SourceConfig {
  enabled: boolean;
  script: string;
  params?: Record<string, unknown>;
}

export interface Config {
  settings: {
    timezone: string;
    maxAgeHours: number;
    deduplication: {
      urlExactMatch: boolean;
      preferHigherScore: boolean;
    };
  };
  sources: Record<string, SourceConfig>;
}

// ─── v2: Detail Page Types ──────────────────────────────────────────────────

export type DetailTemplate = "data-story" | "event-timeline" | "geo-explainer" | "tech-breakdown" | "ranking-visual";

export interface CardWithDetail {
  title: string;
  category: string;
  color: string;
  miniChart: {
    type: MiniChartType;
    data: any;
  };
  insight: string;
  needsDetail?: boolean;
  detailTemplate?: DetailTemplate;
  detailSlug?: string;
}

export interface DetailPage {
  slug: string;
  title: string;
  category: string;
  color: string;
  template: DetailTemplate;
  sections: DetailSection[];
  sources: Array<{ name: string; url?: string }>;
  generatedAt: string;
}

export interface DetailSection {
  type: "text" | "chart" | "timeline" | "comparison" | "key-facts" | "quote";
  heading?: string;
  content: any;
}

export interface DailyPageV2 extends Omit<DailyPage, "cards"> {
  cards: CardWithDetail[];
  details?: DetailPage[];
}
