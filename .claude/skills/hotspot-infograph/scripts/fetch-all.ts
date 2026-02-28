import { parseArgs, loadConfig, getToday, findSkillRoot, findProjectRoot } from "./lib/utils";
import type { TrendingItem, TrendingCandidate, SourceOutput, Config } from "./lib/types";
import { $ } from "bun";
import { resolve } from "path";

/**
 * Compute title similarity between two strings using bigram overlap.
 * Returns a value between 0 and 1.
 */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}]/gu, "");
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  // Check substring containment (one title contains the other)
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Bigram overlap (Dice coefficient)
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const biA = bigrams(na);
  const biB = bigrams(nb);
  let intersection = 0;
  for (const b of biA) {
    if (biB.has(b)) intersection++;
  }

  return (2 * intersection) / (biA.size + biB.size);
}

const SIMILARITY_THRESHOLD = 0.5;

/**
 * Convert a TrendingItem to a TrendingCandidate (cross-platform fields added later).
 */
function convertToCandidate(item: TrendingItem, fetchedAt: string): TrendingCandidate {
  return {
    ...item,
    crossPlatformCount: 1,
    relatedSources: [item.source],
    mergedTitles: [],
  };
}

/**
 * Annotate candidates with cross-platform dedup information.
 * For each candidate, count how many distinct sources have a similar title and
 * record which platforms those are. When duplicates are found, keep the one with
 * the higher hotScore and merge information from the others.
 */
function annotateCrossPlatform(candidates: TrendingCandidate[]): TrendingCandidate[] {
  const merged: TrendingCandidate[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (consumed.has(i)) continue;

    const current = { ...candidates[i] };
    const relatedSources = new Set<string>(current.relatedSources);
    const mergedTitles: string[] = [...(current.mergedTitles || [])];

    for (let j = i + 1; j < candidates.length; j++) {
      if (consumed.has(j)) continue;

      const other = candidates[j];
      // Skip if same source (cross-platform only)
      if (other.source === current.source) continue;

      const sim = titleSimilarity(current.title, other.title);
      if (sim >= SIMILARITY_THRESHOLD) {
        relatedSources.add(other.source);
        mergedTitles.push(other.title);

        // Keep the higher-scoring item's core data
        if (other.hotScore > current.hotScore) {
          current.id = other.id;
          current.title = other.title;
          current.url = other.url;
          current.source = other.source;
          current.category = other.category;
          current.hotScore = other.hotScore;
          current.publishedAt = other.publishedAt;
          current.extra = other.extra;
        }

        consumed.add(j);
      }
    }

    current.relatedSources = Array.from(relatedSources);
    current.crossPlatformCount = relatedSources.size;
    current.mergedTitles = mergedTitles.length > 0 ? mergedTitles : undefined;

    merged.push(current);
  }

  return merged;
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const skillRoot = findSkillRoot();
  const projectRoot = findProjectRoot();
  const configPath = args.config || resolve(skillRoot, "sources/trending.yaml");
  const date = args.date || getToday();
  const scriptsDir = import.meta.dir;

  const config = await loadConfig(configPath);
  const dataDir = resolve(projectRoot, `hotspot-infograph/trending/${date}/data`);
  const outputFile = resolve(projectRoot, `hotspot-infograph/trending/${date}/candidates.json`);

  await $`mkdir -p ${dataDir}`;

  console.log(`[fetch-all] Date: ${date}`);
  console.log(`[fetch-all] Project root: ${projectRoot}`);
  console.log(`[fetch-all] Data dir: ${dataDir}`);
  console.log("");

  const results: { source: string; success: boolean; error?: string }[] = [];

  for (const [sourceName, sourceConfig] of Object.entries(config.sources)) {
    if (!sourceConfig.enabled) {
      console.log(`[SKIP] ${sourceName} (disabled)`);
      continue;
    }

    const outputPath = resolve(dataDir, `${sourceName}.json`);
    const scriptPath = resolve(scriptsDir, sourceConfig.script);

    console.log(`[FETCH] ${sourceName}...`);

    try {
      const paramArgs: string[] = [];
      if (sourceConfig.params) {
        for (const [key, value] of Object.entries(sourceConfig.params)) {
          if (Array.isArray(value)) {
            paramArgs.push(`--${key}`, value.join(","));
          } else if (typeof value === "object") {
            paramArgs.push(`--${key}`, JSON.stringify(value));
          } else {
            paramArgs.push(`--${key}`, String(value));
          }
        }
      }

      const proc = Bun.spawn(
        ["bun", "run", scriptPath, "--output", outputPath, ...paramArgs],
        {
          cwd: projectRoot,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
        }
      );

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode === 0) {
        console.log(`  OK ${stdout.trim()}`);
        results.push({ source: sourceName, success: true });
      } else {
        console.log(`  FAIL (exit ${exitCode})`);
        if (stderr) console.log(`    ${stderr.trim().split("\n")[0]}`);
        results.push({ source: sourceName, success: false, error: stderr });
      }
    } catch (err) {
      console.log(`  ERROR: ${err}`);
      results.push({ source: sourceName, success: false, error: String(err) });
    }
  }

  // Merge + dedup
  console.log("\n[MERGE] Reading source outputs...");
  const allCandidates: TrendingCandidate[] = [];
  const fetchedAt = new Date().toISOString();
  const seenUrls = new Set<string>();

  for (const result of results) {
    if (!result.success) continue;

    const filePath = resolve(dataDir, `${result.source}.json`);
    try {
      const data: SourceOutput = JSON.parse(await Bun.file(filePath).text());

      for (const item of data.items) {
        // URL exact-match dedup
        if (config.settings.deduplication.urlExactMatch && seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        // Time filter
        if (item.publishedAt && config.settings.maxAgeHours) {
          const publishedTime = new Date(item.publishedAt).getTime();
          const cutoff = Date.now() - config.settings.maxAgeHours * 60 * 60 * 1000;
          if (publishedTime < cutoff) continue;
        }

        allCandidates.push(convertToCandidate(item, data.fetchedAt || fetchedAt));
      }
    } catch (err) {
      console.log(`  Warning: Could not read ${filePath}: ${err}`);
    }
  }

  // Cross-platform dedup: annotate with crossPlatformCount and relatedSources
  console.log("[MERGE] Running cross-platform dedup...");
  const mergedCandidates = annotateCrossPlatform(allCandidates);

  // Sort: cross-platform items first, then by hotScore
  mergedCandidates.sort((a, b) => {
    if (b.crossPlatformCount !== a.crossPlatformCount) {
      return b.crossPlatformCount - a.crossPlatformCount;
    }
    return b.hotScore - a.hotScore;
  });

  const tmpFile = outputFile + ".tmp";
  await Bun.write(tmpFile, JSON.stringify(mergedCandidates, null, 2));
  await $`mv ${tmpFile} ${outputFile}`;

  // Summary
  console.log("\n=== Summary ===");
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = Object.values(config.sources).filter((s) => !s.enabled).length;
  const crossPlatform = mergedCandidates.filter((c) => c.crossPlatformCount > 1).length;
  console.log(`Sources: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`);
  console.log(`Candidates: ${mergedCandidates.length} (after dedup + time filter)`);
  console.log(`Cross-platform topics: ${crossPlatform}`);
  console.log(`Output: ${outputFile}`);

  if (failed > 0) {
    console.log(`Failed: ${results.filter((r) => !r.success).map((r) => r.source).join(", ")}`);
  }
}

main();
