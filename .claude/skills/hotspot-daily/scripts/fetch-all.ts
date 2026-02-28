import { parseArgs, loadConfig, getToday, findSkillRoot, findProjectRoot } from "./lib/utils";
import type { Candidate, SourceOutput } from "./lib/types";
import { $ } from "bun";
import { resolve } from "path";

function convertToCandidate(item: any, sourceName: string, fetchedAt: string): Candidate {
  return {
    id: item.id || `${sourceName}-${Date.now()}`,
    title: item.title || "",
    url: item.url || "",
    source: sourceName,
    sourceType: "script",
    summary: item.summary || "",
    keyQuotes: [],
    publishedAt: item.publishedAt || fetchedAt,
    fetchedAt,
    rawScore: item.score || 0,
    metadata: {
      category: item.category,
      comments: item.comments,
      ...(item.extra || {}),
    },
  };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const skillRoot = findSkillRoot();
  const projectRoot = findProjectRoot();
  const configPath = args.config || resolve(skillRoot, "sources/ai.yaml");
  const date = args.date || getToday();
  const scriptsDir = import.meta.dir;

  const config = await loadConfig(configPath);
  const dataDir = resolve(projectRoot, `hotspot-daily/ai/${date}/data`);
  const outputFile = resolve(projectRoot, `hotspot-daily/ai/${date}/candidates.json`);

  // Ensure directories exist
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
    // Scripts are at {scriptsDir}/sources/{name}.ts
    const scriptPath = resolve(scriptsDir, sourceConfig.script);

    console.log(`[FETCH] ${sourceName}...`);

    try {
      // Build args from params
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
        console.log(`  ✓ ${stdout.trim()}`);
        results.push({ source: sourceName, success: true });
      } else {
        console.log(`  ✗ Failed (exit ${exitCode})`);
        if (stderr) console.log(`    ${stderr.trim().split("\n")[0]}`);
        results.push({ source: sourceName, success: false, error: stderr });
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err}`);
      results.push({ source: sourceName, success: false, error: String(err) });
    }
  }

  // Phase 2: Merge all source outputs into candidates.json
  console.log("\n[MERGE] Reading source outputs...");
  const allCandidates: Candidate[] = [];
  const fetchedAt = new Date().toISOString();
  const seenUrls = new Set<string>();

  for (const result of results) {
    if (!result.success) continue;

    const filePath = resolve(dataDir, `${result.source}.json`);
    try {
      const data: SourceOutput = JSON.parse(
        await Bun.file(filePath).text()
      );

      for (const item of data.items) {
        // URL dedup
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);

        // Time filter: maxAgeHours
        if (item.publishedAt && config.settings.maxAgeHours) {
          const publishedTime = new Date(item.publishedAt).getTime();
          const cutoff = Date.now() - config.settings.maxAgeHours * 60 * 60 * 1000;
          if (publishedTime < cutoff) continue;
        }

        allCandidates.push(convertToCandidate(item, result.source, data.fetchedAt || fetchedAt));
      }
    } catch (err) {
      console.log(`  Warning: Could not read ${filePath}: ${err}`);
    }
  }

  // Sort by rawScore descending
  allCandidates.sort((a, b) => b.rawScore - a.rawScore);

  // Atomic write: write to temp file then rename
  const tmpFile = outputFile + ".tmp";
  await Bun.write(tmpFile, JSON.stringify(allCandidates, null, 2));
  await $`mv ${tmpFile} ${outputFile}`;

  // Summary
  console.log("\n=== Summary ===");
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = Object.values(config.sources).filter((s) => !s.enabled).length;
  console.log(`Sources: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped`);
  console.log(`Candidates: ${allCandidates.length} (after dedup + time filter)`);
  console.log(`Output: ${outputFile}`);

  if (failed > 0) {
    console.log(`Failed: ${results.filter((r) => !r.success).map((r) => r.source).join(", ")}`);
  }
}

main();
