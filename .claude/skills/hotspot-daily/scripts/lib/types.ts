// Internal source output format (matches ai-digest)
export interface SourceItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: "discussion" | "news" | "paper" | "release" | "project";
  score?: number;
  comments?: number;
  summary?: string;
  publishedAt?: string;
  extra?: Record<string, unknown>;
}

export interface SourceOutput {
  source: string;
  fetchedAt: string;
  items: SourceItem[];
  errors?: string[];
}

// Candidate interface from INTENT.md (LOCKED data contract)
export interface Candidate {
  id: string;
  title: string;
  url: string;
  source: string;
  sourceType: string;       // rss | script | websearch
  summary: string;
  keyQuotes: string[];
  publishedAt: string;
  fetchedAt: string;
  rawScore: number;
  metadata: Record<string, any>;
}

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
    priorities: {
      high: string[];
      medium: string[];
      low: string[];
    };
  };
  sources: Record<string, SourceConfig>;
}
