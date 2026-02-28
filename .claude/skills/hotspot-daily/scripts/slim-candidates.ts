#!/usr/bin/env bun
import { resolve } from "path";
import { findProjectRoot, parseArgs, getToday } from "./lib/utils";

/**
 * Slim down candidates.json by extracting only the minimal fields needed by Ranker.
 * Reduces file size by removing verbose fields like keyQuotes, detailed metadata, etc.
 *
 * Usage: bun slim-candidates.ts --date YYYY-MM-DD
 */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || getToday();

  const projectRoot = findProjectRoot(import.meta.dir);
  const inputPath = resolve(projectRoot, `hotspot-daily/ai/${date}/candidates.json`);
  const outputPath = resolve(projectRoot, `hotspot-daily/ai/${date}/candidates-slim.json`);

  console.log(`📥 读取: ${inputPath}`);

  // Read input file
  const inputFile = Bun.file(inputPath);
  const inputSize = inputFile.size;
  const candidates = await inputFile.json();

  if (!Array.isArray(candidates)) {
    throw new Error("candidates.json 格式错误: 预期为数组");
  }

  console.log(`✅ 已加载 ${candidates.length} 条候选内容`);

  // Extract minimal fields for Ranker
  const slim = candidates.map((c: any) => ({
    id: c.id,
    title: c.title,
    url: c.url,
    source: c.source,
    sourceType: c.sourceType,
    summary: (c.summary || "").slice(0, 200),
    publishedAt: c.publishedAt,
    rawScore: c.rawScore,
    category: c.metadata?.category,
    starsToday: c.metadata?.starsToday,
    aiRelated: c.metadata?.aiRelated,
    comments: c.metadata?.comments,
  }));

  // Write output
  await Bun.write(outputPath, JSON.stringify(slim, null, 2));

  const outputFile = Bun.file(outputPath);
  const outputSize = outputFile.size;

  // Calculate size reduction
  const reduction = ((inputSize - outputSize) / inputSize * 100).toFixed(1);
  const inputKB = (inputSize / 1024).toFixed(1);
  const outputKB = (outputSize / 1024).toFixed(1);

  console.log(`📦 输出: ${outputPath}`);
  console.log(`📊 文件大小对比:`);
  console.log(`   输入:  ${inputKB} KB`);
  console.log(`   输出:  ${outputKB} KB`);
  console.log(`   精简:  ${reduction}% (减少 ${(inputSize - outputSize) / 1024} KB)`);
}

main().catch((error) => {
  console.error("❌ 错误:", error.message);
  process.exit(1);
});
