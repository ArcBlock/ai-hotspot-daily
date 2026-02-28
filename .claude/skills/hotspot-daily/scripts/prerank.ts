#!/usr/bin/env bun
import { resolve } from "path";
import { parse as parseYaml } from "yaml";
import { findProjectRoot, findSkillRoot, parseArgs, getToday } from "./lib/utils";

/**
 * Pre-rank candidates using deterministic heuristics to reduce the candidate pool
 * from ~183 to ~35 before the LLM Ranker Agent.
 *
 * 4 scoring dimensions (0-25 each, total 0-100):
 *   1. Timeliness — based on publishedAt
 *   2. Source Heat — intra-source normalized popularity
 *   3. Keywords  — match against ai.yaml priorities
 *   4. Credibility — fixed per-source score
 *
 * Safety buffers: top-3 per source, top-2 per category, dynamic threshold.
 *
 * Usage: bun prerank.ts --date YYYY-MM-DD
 */

// ── Scoring tables ──────────────────────────────────────────────────

const SOURCE_CREDIBILITY: Record<string, number> = {
  hackernews: 22,
  arxiv: 20,
  github: 18,
  rss: 17,
  "papers-with-code": 19,
  "deep-learning-monitor": 16,
  alphaxiv: 18,
  alphasignal: 17,
  quantumbit: 15,
  huggingface: 18,
  replicate: 14,
  "product-hunt": 12,
  "semantic-scholar": 19,
  "x-twitter": 10,
  websearch: 13,
};

const ACTIONABILITY_WORDS = [
  "release", "released", "launches", "launched", "launch",
  "发布", "开源", "open source", "open-source",
  "API", "available", "now available",
  "sdk", "framework", "library", "tool",
];

const CN_HIGH_FREQ = ["模型", "大模型", "发布", "融资", "开源", "训练", "推理"];

// ── Dimension scorers ───────────────────────────────────────────────

function scoreTimeliness(publishedAt: string | undefined, now: Date): number {
  if (!publishedAt) return 5; // unknown → low but not zero
  const diffMs = now.getTime() - new Date(publishedAt).getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours <= 6) return 25;
  if (hours <= 12) return 20;
  if (hours <= 24) return 15;
  if (hours <= 36) return 10;
  if (hours <= 48) return 5;
  return 0;
}

function scoreSourceHeat(c: any): number {
  const source = c.source;
  if (source === "github") {
    const stars = c.starsToday ?? 0;
    const ai = c.aiRelated ? 5 : 0;
    // starsToday: 0→0, 50→8, 200→15, 500+→25
    const starScore = Math.min(25, Math.round(Math.sqrt(stars) * 1.1));
    return Math.min(25, starScore + ai);
  }
  if (source === "hackernews") {
    const raw = c.rawScore ?? 0;
    const comments = c.comments ?? 0;
    const combined = raw + comments * 2;
    // combined: 0→0, 100→10, 400→20, 600+→25
    return Math.min(25, Math.round(Math.sqrt(combined) * 1.0));
  }
  // Fixed-base sources — use rawScore as relative signal
  const raw = c.rawScore ?? 0;
  if (raw === 0) return 5;
  if (raw <= 10) return 8;
  if (raw <= 30) return 12;
  if (raw <= 50) return 16;
  return 20;
}

function normalizeText(s: string): string {
  // Normalize Unicode dashes/hyphens to ASCII hyphen for keyword matching
  return s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\uFE58\uFE63\uFF0D]/g, "-");
}

function scoreKeywords(c: any, priorities: { high: string[]; medium: string[]; low: string[] }): number {
  const text = normalizeText(`${c.title ?? ""} ${c.summary ?? ""}`).toLowerCase();
  let score = 0;

  for (const kw of priorities.high) {
    if (text.includes(kw.toLowerCase())) { score += 15; break; }
  }
  for (const kw of priorities.medium) {
    if (text.includes(kw.toLowerCase())) { score += 10; break; }
  }
  for (const kw of priorities.low) {
    if (text.includes(kw.toLowerCase())) { score += 5; break; }
  }

  // Actionability signal words
  for (const w of ACTIONABILITY_WORDS) {
    if (text.includes(w.toLowerCase())) { score += 5; break; }
  }

  // Chinese high-frequency words
  for (const w of CN_HIGH_FREQ) {
    if (text.includes(w)) { score += 5; break; }
  }

  return Math.min(25, score);
}

function scoreCredibility(source: string): number {
  return SOURCE_CREDIBILITY[source] ?? 10;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || getToday();

  const projectRoot = findProjectRoot(import.meta.dir);
  const skillRoot = findSkillRoot(import.meta.dir);
  const inputPath = resolve(projectRoot, `hotspot-daily/ai/${date}/candidates-slim.json`);
  const outputPath = resolve(projectRoot, `hotspot-daily/ai/${date}/candidates-preranked.json`);

  console.log(`📥 读取: ${inputPath}`);

  const candidates: any[] = await Bun.file(inputPath).json();
  console.log(`✅ 已加载 ${candidates.length} 条候选`);

  // Load priorities from ai.yaml
  const configPath = resolve(skillRoot, "sources/ai.yaml");
  const config = parseYaml(await Bun.file(configPath).text()) as any;
  const priorities = config.settings?.priorities ?? { high: [], medium: [], low: [] };

  const now = new Date();

  // ── Score all candidates ──────────────────────────────────────

  const scored = candidates.map((c) => {
    const timeliness = scoreTimeliness(c.publishedAt, now);
    const sourceHeat = scoreSourceHeat(c);
    const keywords = scoreKeywords(c, priorities);
    const credibility = scoreCredibility(c.source);
    const prerankScore = timeliness + sourceHeat + keywords + credibility;

    return {
      ...c,
      prerankScore,
      prerankBreakdown: { timeliness, sourceHeat, keywords, credibility },
    };
  });

  // ── Apply safety buffers ──────────────────────────────────────

  // Phase 1: Guaranteed items (per-source top 3 + per-category top 2)
  // These ALWAYS make it into the output regardless of global cap.
  const guaranteed = new Set<string>();

  // Per-source top 3 (sorted by sourceHeat to preserve intra-source diversity)
  const bySource = new Map<string, typeof scored>();
  for (const c of scored) {
    if (!bySource.has(c.source)) bySource.set(c.source, []);
    bySource.get(c.source)!.push(c);
  }
  for (const [, items] of bySource) {
    items.sort((a, b) => b.prerankBreakdown.sourceHeat - a.prerankBreakdown.sourceHeat
      || b.prerankScore - a.prerankScore);
    for (const c of items.slice(0, 3)) guaranteed.add(c.id);
  }

  // Per-category top 2
  const byCategory = new Map<string, typeof scored>();
  for (const c of scored) {
    const cat = c.category || "unknown";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(c);
  }
  for (const [, items] of byCategory) {
    items.sort((a, b) => b.prerankScore - a.prerankScore);
    for (const c of items.slice(0, 2)) guaranteed.add(c.id);
  }

  // Phase 2: Threshold items (fill remaining slots up to 40)
  const guaranteedItems = scored
    .filter((c) => guaranteed.has(c.id))
    .sort((a, b) => b.prerankScore - a.prerankScore);

  const remainingSlots = Math.max(0, 40 - guaranteedItems.length);
  const thresholdItems = scored
    .filter((c) => !guaranteed.has(c.id) && c.prerankScore >= 50)
    .sort((a, b) => b.prerankScore - a.prerankScore)
    .slice(0, remainingSlots);

  // ── Build output ──────────────────────────────────────────────

  const output = [...guaranteedItems, ...thresholdItems]
    .sort((a, b) => b.prerankScore - a.prerankScore);

  await Bun.write(outputPath, JSON.stringify(output, null, 2));

  const outputSize = Bun.file(outputPath).size;
  const inputSize = Bun.file(inputPath).size;
  const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);

  console.log(`📦 输出: ${outputPath}`);
  console.log(`📊 结果: ${candidates.length} → ${output.length} 条 (减少 ${reduction}%)`);
  console.log(`   保底项: ${guaranteedItems.length} 条 (${bySource.size} 源 × top3 + ${byCategory.size} 类别 × top2)`);
  console.log(`   阈值补充: ${thresholdItems.length} 条 (prerankScore ≥ 50)`);

  // Show top 5
  console.log(`\n🏆 Top 5:`);
  for (const c of output.slice(0, 5)) {
    const b = c.prerankBreakdown;
    console.log(`   [${c.prerankScore}] ${c.source}/${c.id.slice(0, 40)} — T:${b.timeliness} H:${b.sourceHeat} K:${b.keywords} C:${b.credibility}`);
  }
}

main().catch((error) => {
  console.error("❌ 错误:", error.message);
  process.exit(1);
});
