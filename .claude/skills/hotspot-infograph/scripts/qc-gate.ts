#!/usr/bin/env bun

/**
 * QC Gate - Quality Control validator for infograph page.json
 *
 * Performs deterministic rule checks on generated page.json to ensure quality standards.
 * All checks are pass/fail - no AI/subjective evaluation.
 *
 * Exit codes:
 * - 0: All required checks passed
 * - 1: One or more required checks failed
 */

import { resolve } from "path";
import { findProjectRoot, parseArgs, getToday } from "./lib/utils";
import type { DailyPage, HeroChartType } from "./lib/types";

interface CheckResult {
  pass: boolean;
  value?: any;
  required?: any;
  message?: string;
}

interface QCResult {
  result: "PASS" | "FAIL";
  checkedAt: string;
  checks: Record<string, CheckResult>;
  failReasons: string[];
}

const VALID_CHART_TYPES: HeroChartType[] = ["bar", "line", "ring", "timeline", "versus", "heatmap"];

/**
 * Count characters in Chinese text (excluding whitespace).
 * For Chinese text, each character is 1 char in JavaScript, so this is appropriate.
 */
function countChineseChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Validate slug format (lowercase alphanumeric + hyphens only)
 */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Run all QC checks on infograph page data
 */
function runQCChecks(data: DailyPage): QCResult {
  const checks: Record<string, CheckResult> = {};
  const failReasons: string[] = [];

  // Check 1: heroTitle — hero.title ≤ 20 Chinese characters
  const heroTitleLen = countChineseChars(data.hero?.title || "");
  checks.heroTitle = {
    pass: heroTitleLen <= 20,
    value: heroTitleLen,
    required: "≤ 20",
    message: `"${(data.hero?.title || "").slice(0, 30)}"`
  };
  if (!checks.heroTitle.pass) {
    failReasons.push(`heroTitle: 标题不超过 20 字，实际 ${heroTitleLen} 字`);
  }

  // Check 2: heroKeyNumbers — hero.keyNumbers.length === 3
  const keyNumbersLen = data.hero?.keyNumbers?.length || 0;
  checks.heroKeyNumbers = {
    pass: keyNumbersLen === 3,
    value: keyNumbersLen,
    required: 3
  };
  if (!checks.heroKeyNumbers.pass) {
    failReasons.push(`heroKeyNumbers: 需要恰好 3 个关键数字，实际 ${keyNumbersLen}`);
  }

  // Check 3: heroChartData — hero.chart.data.length >= 2
  const chartDataLen = data.hero?.chart?.data?.length || 0;
  checks.heroChartData = {
    pass: chartDataLen >= 2,
    value: chartDataLen,
    required: "≥ 2"
  };
  if (!checks.heroChartData.pass) {
    failReasons.push(`heroChartData: 图表数据至少 2 项，实际 ${chartDataLen}`);
  }

  // Check 4: heroChartType — hero.chart.type is one of the valid types
  const chartType = data.hero?.chart?.type || "";
  const chartTypeValid = VALID_CHART_TYPES.includes(chartType as HeroChartType);
  checks.heroChartType = {
    pass: chartTypeValid,
    value: chartType,
    required: VALID_CHART_TYPES.join(" | ")
  };
  if (!checks.heroChartType.pass) {
    failReasons.push(`heroChartType: 图表类型 "${chartType}" 不在允许列表中 (${VALID_CHART_TYPES.join(", ")})`);
  }

  // Check 5: heroTakeaway — hero.takeaway ≤ 30 Chinese characters
  const takeawayLen = countChineseChars(data.hero?.takeaway || "");
  checks.heroTakeaway = {
    pass: takeawayLen <= 30,
    value: takeawayLen,
    required: "≤ 30"
  };
  if (!checks.heroTakeaway.pass) {
    failReasons.push(`heroTakeaway: takeaway 不超过 30 字，实际 ${takeawayLen} 字`);
  }

  // Check 6: heroSources — hero.sources.length >= 1
  const sourcesLen = data.hero?.sources?.length || 0;
  checks.heroSources = {
    pass: sourcesLen >= 1,
    value: sourcesLen,
    required: "≥ 1"
  };
  if (!checks.heroSources.pass) {
    failReasons.push(`heroSources: 至少需要 1 个来源，实际 ${sourcesLen}`);
  }

  // Check 7: cardsCount — cards.length >= 4 && cards.length <= 6
  const cardsLen = data.cards?.length || 0;
  checks.cardsCount = {
    pass: cardsLen >= 4 && cardsLen <= 6,
    value: cardsLen,
    required: "4–6"
  };
  if (!checks.cardsCount.pass) {
    failReasons.push(`cardsCount: 卡片数量需要 4–6 张，实际 ${cardsLen}`);
  }

  // Check 8: cardsDiversity — unique categories in cards >= 3
  const uniqueCategories = new Set((data.cards || []).map(c => c.category));
  const uniqueCategoryCount = uniqueCategories.size;
  checks.cardsDiversity = {
    pass: uniqueCategoryCount >= 3,
    value: uniqueCategoryCount,
    required: "≥ 3",
    message: `分类: ${[...uniqueCategories].join(", ")}`
  };
  if (!checks.cardsDiversity.pass) {
    failReasons.push(`cardsDiversity: 卡片分类至少 3 种，实际 ${uniqueCategoryCount} 种`);
  }

  // Check 9: cardTitles — every card.title ≤ 15 Chinese characters
  const cardTitleResults = (data.cards || []).map((card, i) => {
    const len = countChineseChars(card.title || "");
    return { index: i, title: card.title, len, pass: len <= 15 };
  });
  const allCardTitlesPass = cardTitleResults.every(r => r.pass);
  checks.cardTitles = {
    pass: allCardTitlesPass,
    value: cardTitleResults.map(r => r.len),
    required: "每张 ≤ 15"
  };
  if (!checks.cardTitles.pass) {
    const failures = cardTitleResults.filter(r => !r.pass);
    for (const f of failures) {
      failReasons.push(`cardTitles: 卡片[${f.index}] 标题 ${f.len} 字超过 15 字上限 ("${f.title}")`);
    }
  }

  // Check 10: cardInsights — every card.insight ≤ 20 Chinese characters
  const cardInsightResults = (data.cards || []).map((card, i) => {
    const len = countChineseChars(card.insight || "");
    return { index: i, insight: card.insight, len, pass: len <= 20 };
  });
  const allCardInsightsPass = cardInsightResults.every(r => r.pass);
  checks.cardInsights = {
    pass: allCardInsightsPass,
    value: cardInsightResults.map(r => r.len),
    required: "每张 ≤ 20"
  };
  if (!checks.cardInsights.pass) {
    const failures = cardInsightResults.filter(r => !r.pass);
    for (const f of failures) {
      failReasons.push(`cardInsights: 卡片[${f.index}] insight ${f.len} 字超过 20 字上限 ("${f.insight}")`);
    }
  }

  // Check 11: slugValid — meta.slug matches /^[a-z0-9-]+$/
  const slug = data.meta?.slug || "";
  checks.slugValid = {
    pass: isValidSlug(slug),
    value: slug
  };
  if (!checks.slugValid.pass) {
    failReasons.push(`slugValid: slug 格式不正确 "${slug}" (仅允许小写字母、数字和连字符)`);
  }

  // Overall result (only core checks affect pass/fail)
  const allPassed = Object.values(checks).every(check => check.pass);

  return {
    result: allPassed ? "PASS" : "FAIL",
    checkedAt: new Date().toISOString(),
    checks,
    failReasons
  };
}

/**
 * Run optional detail page QC checks (do not affect overall PASS/FAIL)
 */
function runDetailQCChecks(
  data: any,
  detailsDir: string,
  checks: Record<string, CheckResult>,
  warnings: string[],
) {
  const fs = require("fs");
  const path = require("path");

  if (!fs.existsSync(detailsDir)) return;

  const detailFiles = fs.readdirSync(detailsDir).filter((f: string) => f.endsWith(".json"));
  if (detailFiles.length === 0) return;

  // Collect expected slugs from cards with needsDetail
  const expectedSlugs = new Set<string>();
  for (const card of data.cards || []) {
    if (card.needsDetail && card.detailSlug) {
      expectedSlugs.add(card.detailSlug);
    }
  }

  // Check: detail slugs match
  const actualSlugs = new Set(detailFiles.map((f: string) => f.replace(/\.json$/, "")));
  const missingSlugs = [...expectedSlugs].filter(s => !actualSlugs.has(s));
  checks.detailSlugsMatch = {
    pass: missingSlugs.length === 0,
    value: `expected: ${expectedSlugs.size}, found: ${actualSlugs.size}`,
    required: "all match",
    message: missingSlugs.length > 0 ? `missing: ${missingSlugs.join(", ")}` : undefined
  };
  if (!checks.detailSlugsMatch.pass) {
    warnings.push(`detailSlugsMatch: 缺少详情页文件 ${missingSlugs.join(", ")}`);
  }

  // Check each detail file
  for (const file of detailFiles) {
    const slug = file.replace(/\.json$/, "");
    const detail = JSON.parse(fs.readFileSync(path.resolve(detailsDir, file), "utf-8"));

    // detailSections: at least 3 sections
    const sectionsCount = detail.sections?.length || 0;
    if (sectionsCount < 3) {
      warnings.push(`detail[${slug}]: sections 数量 ${sectionsCount} < 3`);
    }

    // detailSources: at least 2 sources
    const sourcesCount = detail.sources?.length || 0;
    if (sourcesCount < 2) {
      warnings.push(`detail[${slug}]: sources 数量 ${sourcesCount} < 2`);
    }

    // detailTitle: ≤ 30 chars
    const titleLen = (detail.title || "").replace(/\s+/g, "").length;
    if (titleLen > 30) {
      warnings.push(`detail[${slug}]: title ${titleLen} 字超过 30 字上限`);
    }
  }

  checks.detailPages = {
    pass: warnings.length === 0,
    value: detailFiles.length,
    required: "quality checks",
    message: warnings.length > 0 ? `${warnings.length} warning(s)` : "all good"
  };
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || getToday();

  const projectRoot = findProjectRoot();
  const trendingDir = resolve(projectRoot, "hotspot-infograph/trending", date);
  const pageJsonPath = resolve(trendingDir, "page.json");
  const qcResultPath = resolve(trendingDir, "qc-result.json");

  // Load page.json
  const pageFile = Bun.file(pageJsonPath);
  if (!(await pageFile.exists())) {
    console.error(`❌ Error: page.json not found at ${pageJsonPath}`);
    process.exit(1);
  }

  let pageData: DailyPage;
  try {
    pageData = await pageFile.json();
  } catch (error) {
    console.error(`❌ Error: Failed to parse page.json: ${error}`);
    process.exit(1);
  }

  // Run QC checks
  console.log(`🔍 Running QC checks for ${date}...\n`);
  const result = runQCChecks(pageData);

  // Run optional detail page checks
  const detailsDir = resolve(trendingDir, "details");
  const detailWarnings: string[] = [];
  runDetailQCChecks(pageData, detailsDir, result.checks, detailWarnings);
  if (detailWarnings.length > 0) {
    console.log(`\n⚠️  Detail page warnings (non-blocking):`);
    for (const w of detailWarnings) {
      console.log(`  • ${w}`);
    }
  }

  // Write result
  await Bun.write(qcResultPath, JSON.stringify(result, null, 2));
  console.log(`📝 QC result written to ${qcResultPath}\n`);

  // Display results
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`QC Result: ${result.result === "PASS" ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  console.log("📋 Checks (11 total):");
  for (const [name, check] of Object.entries(result.checks)) {
    const status = check.pass ? "✅" : "❌";
    let detail = "";

    if (check.value !== undefined && check.required !== undefined) {
      const valueStr = Array.isArray(check.value) ? `[${check.value.join(", ")}]` : check.value;
      detail = ` (${valueStr} / ${check.required})`;
    }
    if (check.message) {
      detail += ` - ${check.message}`;
    }

    console.log(`  ${status} ${name}${detail}`);
  }

  if (result.failReasons.length > 0) {
    console.log("\n❌ Fail Reasons:");
    for (const reason of result.failReasons) {
      console.log(`  • ${reason}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");

  // Exit with appropriate code
  process.exit(result.result === "PASS" ? 0 : 1);
}

main();
