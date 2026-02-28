#!/usr/bin/env bun

/**
 * QC Gate - Quality Control validator for page.json
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

interface PageMeta {
  date: string;
  slug: string;
  generatedAt: string;
  timezone: string;
  confidence: number;
  sourceCount: number;
  language: string;
}

interface Source {
  title: string;
  url: string;
  publisher: string;
  tier: string;
  excerpt: string;
  publishedAt: string;
}

interface Risk {
  title: string;
  description: string;
}

interface Action {
  immediate: string[];
  thisWeek: string[];
  watchAndWait: string[];
}

interface Group {
  name: string;
  impact: string;
  description: string;
}

interface WhoIsAffected {
  groups: Group[];
}

interface Content {
  title: string;
  subtitle: string;
  tldr: string;
  whatHappened: string;
  whyItMatters: string;
  whoIsAffected: WhoIsAffected;
  whatToDo: Action;
  options?: any[];
  risks: Risk[];
  sources: Source[];
}

interface PageData {
  meta: PageMeta;
  zh: Content;
  en: Content;
}

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
  bonuses: Record<string, boolean>;
  failReasons: string[];
}

/**
 * Count words in English text (split by whitespace)
 */
function countEnglishWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Count characters in Chinese text (excluding whitespace)
 */
function countChineseChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/**
 * Check if title starts with forbidden announcement verbs
 */
function startsWithAnnouncementVerb(title: string): boolean {
  const forbiddenStarts = [
    "发布了", "宣布了", "推出了",
    "announced", "released", "launched"
  ];
  const lower = title.toLowerCase().trim();
  return forbiddenStarts.some(verb => lower.startsWith(verb.toLowerCase()));
}

/**
 * Validate slug format (lowercase alphanumeric + hyphens only)
 */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Check if all required fields in content are non-empty
 */
function isContentComplete(content: Content): boolean {
  const requiredFields = [
    "title", "subtitle", "tldr", "whatHappened", "whyItMatters",
    "whatToDo", "risks", "sources"
  ];

  for (const field of requiredFields) {
    const value = (content as any)[field];

    // Check for null/undefined/empty string
    if (value == null || value === "") {
      return false;
    }

    // For objects, check they're not empty
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        if (value.length === 0) return false;
      } else if (Object.keys(value).length === 0) {
        return false;
      }
    }
  }

  // Check whoIsAffected has groups
  if (!content.whoIsAffected?.groups || content.whoIsAffected.groups.length === 0) {
    return false;
  }

  // Check whatToDo has all three action lists
  if (!content.whatToDo?.immediate || !content.whatToDo?.thisWeek || !content.whatToDo?.watchAndWait) {
    return false;
  }

  return true;
}

/**
 * Count unique publishers in sources
 */
function countUniquePublishers(sources: Source[]): number {
  const publishers = new Set(sources.map(s => s.publisher.toLowerCase()));
  return publishers.size;
}

/**
 * Run all QC checks on page data
 */
function runQCChecks(data: PageData): QCResult {
  const checks: Record<string, CheckResult> = {};
  const bonuses: Record<string, boolean> = {};
  const failReasons: string[] = [];

  // Required Check 1: sourceCount >= 3
  const sourceCount = data.zh.sources.length;
  checks.sourceCount = {
    pass: sourceCount >= 3,
    value: sourceCount,
    required: 3
  };
  if (!checks.sourceCount.pass) {
    failReasons.push(`sourceCount: 需要至少 3 个来源，实际 ${sourceCount}`);
  }

  // Required Check 2: actionCount (immediate + thisWeek + watchAndWait) >= 3
  const immediateCount = data.zh.whatToDo.immediate?.length || 0;
  const thisWeekCount = data.zh.whatToDo.thisWeek?.length || 0;
  const watchAndWaitCount = data.zh.whatToDo.watchAndWait?.length || 0;
  const actionCount = immediateCount + thisWeekCount + watchAndWaitCount;

  checks.actionCount = {
    pass: actionCount >= 3,
    value: actionCount,
    required: 3,
    message: `immediate(${immediateCount}) + thisWeek(${thisWeekCount}) + watchAndWait(${watchAndWaitCount})`
  };
  if (!checks.actionCount.pass) {
    failReasons.push(`actionCount: 需要至少 3 个行动建议，实际 ${actionCount}`);
  }

  // Required Check 3: riskCount >= 2
  const riskCount = data.zh.risks.length;
  checks.riskCount = {
    pass: riskCount >= 2,
    value: riskCount,
    required: 2
  };
  if (!checks.riskCount.pass) {
    failReasons.push(`riskCount: 需要至少 2 个风险提示，实际 ${riskCount}`);
  }

  // Required Check 4: conclusionTitle validation
  const zhTitle = data.zh.title;
  const enTitle = data.en.title;

  const zhTitleValid = !startsWithAnnouncementVerb(zhTitle) && countChineseChars(zhTitle) <= 20;
  const enTitleValid = !startsWithAnnouncementVerb(enTitle) && countEnglishWords(enTitle) <= 10;

  checks.conclusionTitle = {
    pass: zhTitleValid && enTitleValid,
    message: `zh(${countChineseChars(zhTitle)}字): "${zhTitle.slice(0, 30)}..." | en(${countEnglishWords(enTitle)}词): "${enTitle.slice(0, 50)}..."`
  };
  if (!checks.conclusionTitle.pass) {
    if (!zhTitleValid) {
      failReasons.push(`conclusionTitle: 中文标题不符合要求 (${countChineseChars(zhTitle)}字 或 以禁用词开头)`);
    }
    if (!enTitleValid) {
      failReasons.push(`conclusionTitle: 英文标题不符合要求 (${countEnglishWords(enTitle)}词 或 以禁用词开头)`);
    }
  }

  // Required Check 5: subtitlePresent
  const zhSubtitle = data.zh.subtitle?.trim() || "";
  const enSubtitle = data.en.subtitle?.trim() || "";

  checks.subtitlePresent = {
    pass: zhSubtitle.length > 0 && enSubtitle.length > 0,
    value: { zh: zhSubtitle.length > 0, en: enSubtitle.length > 0 }
  };
  if (!checks.subtitlePresent.pass) {
    failReasons.push("subtitlePresent: subtitle 不能为空");
  }

  // Required Check 6: confidence >= 60
  const confidence = data.meta.confidence;
  checks.confidence = {
    pass: confidence >= 60,
    value: confidence,
    required: 60
  };
  if (!checks.confidence.pass) {
    failReasons.push(`confidence: 需要至少 60，实际 ${confidence}`);
  }

  // Required Check 7: zhComplete
  const zhComplete = isContentComplete(data.zh);
  checks.zhComplete = {
    pass: zhComplete
  };
  if (!checks.zhComplete.pass) {
    failReasons.push("zhComplete: 中文内容不完整，缺少必填字段");
  }

  // Required Check 8: enComplete
  const enComplete = isContentComplete(data.en);
  checks.enComplete = {
    pass: enComplete
  };
  if (!checks.enComplete.pass) {
    failReasons.push("enComplete: 英文内容不完整，缺少必填字段");
  }

  // Required Check 9: slugValid
  const slugValid = isValidSlug(data.meta.slug);
  checks.slugValid = {
    pass: slugValid,
    value: data.meta.slug
  };
  if (!checks.slugValid.pass) {
    failReasons.push(`slugValid: slug 格式不正确 "${data.meta.slug}" (仅允许小写字母、数字和连字符)`);
  }

  // Bonus checks (不影响 PASS/FAIL)
  bonuses.hasOptions = (data.zh.options?.length || 0) >= 2;
  bonuses.hasTldr = (data.zh.tldr?.trim().length || 0) > 0;
  bonuses.hasAffectedGroups = (data.zh.whoIsAffected?.groups?.length || 0) >= 2;
  bonuses.sourceDiversity = countUniquePublishers(data.zh.sources) >= 2;

  // Overall result
  const allPassed = Object.values(checks).every(check => check.pass);

  return {
    result: allPassed ? "PASS" : "FAIL",
    checkedAt: new Date().toISOString(),
    checks,
    bonuses,
    failReasons
  };
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || getToday();

  const projectRoot = findProjectRoot();
  const aiDir = resolve(projectRoot, "hotspot-daily/ai", date);
  const pageJsonPath = resolve(aiDir, "page.json");
  const qcResultPath = resolve(aiDir, "qc-result.json");

  // Load page.json
  const pageFile = Bun.file(pageJsonPath);
  if (!(await pageFile.exists())) {
    console.error(`❌ Error: page.json not found at ${pageJsonPath}`);
    process.exit(1);
  }

  let pageData: PageData;
  try {
    pageData = await pageFile.json();
  } catch (error) {
    console.error(`❌ Error: Failed to parse page.json: ${error}`);
    process.exit(1);
  }

  // Run QC checks
  console.log(`🔍 Running QC checks for ${date}...\n`);
  const result = runQCChecks(pageData);

  // Write result
  await Bun.write(qcResultPath, JSON.stringify(result, null, 2));
  console.log(`📝 QC result written to ${qcResultPath}\n`);

  // Display results
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`QC Result: ${result.result === "PASS" ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  console.log("📋 Required Checks:");
  for (const [name, check] of Object.entries(result.checks)) {
    const status = check.pass ? "✅" : "❌";
    let detail = "";

    if (check.value !== undefined && check.required !== undefined) {
      detail = ` (${check.value} / ${check.required})`;
    } else if (check.message) {
      detail = ` - ${check.message}`;
    }

    console.log(`  ${status} ${name}${detail}`);
  }

  console.log("\n🎁 Bonus Checks:");
  for (const [name, passed] of Object.entries(result.bonuses)) {
    const status = passed ? "✅" : "➖";
    console.log(`  ${status} ${name}`);
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
