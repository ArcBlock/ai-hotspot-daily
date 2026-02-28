#!/usr/bin/env bun
/**
 * build-html.ts - Deterministic HTML builder for hotspot-daily pages.
 *
 * Replaces the LLM Builder agent with a fast bun script (~<1s vs 5.7min).
 *
 * Usage:
 *   bun .claude/skills/hotspot-daily/scripts/build-html.ts --date 2026-02-12
 */

import { resolve } from "path";
import { $ } from "bun";
import { parseArgs, getToday, findSkillRoot, findProjectRoot } from "./lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricRow {
  metric: string;
  values: string[];
  unit: string;
  note?: string;
}

interface KeyMetrics {
  subject: string;
  competitors: string[];
  rows: MetricRow[];
  footnote?: string;
}

interface WhatToDo {
  immediate: string[];
  thisWeek: string[];
  watchAndWait: string[];
}

interface AffectedGroup {
  name: string;
  impact: "high" | "medium" | "low";
  description: string;
}

interface WhoIsAffected {
  groups: AffectedGroup[];
}

interface Option {
  name: string;
  description: string;
  suitableFor: string;
  cost: string;
  risk: string;
}

interface Risk {
  title: string;
  description: string;
}

interface Source {
  title: string;
  url: string;
  publisher: string;
  tier: "official" | "media" | "community" | string;
  excerpt: string;
  publishedAt: string;
}

interface LangContent {
  title: string;
  subtitle: string;
  tldr: string;
  keyMetrics?: KeyMetrics;
  whatHappened: string;
  whyItMatters: string;
  whoIsAffected: WhoIsAffected;
  whatToDo: WhatToDo;
  options?: Option[];
  risks: Risk[];
  sources: Source[];
}

interface PageMeta {
  date: string;
  slug: string;
  generatedAt: string;
  timezone: string;
  confidence: number;
  sourceCount: number;
  language: string;
}

interface PageJson {
  meta: PageMeta;
  zh: LangContent;
  en: LangContent;
}

// ─── HTML Escaping ──────────────────────────────────────────────────────────

/** Escape text for safe HTML content insertion */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape text for HTML attribute values */
function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Markdown Rendering (simple subset) ─────────────────────────────────────

/**
 * Render simple markdown to HTML.
 * IMPORTANT: Input text should already be HTML-escaped. This function
 * converts markdown syntax into HTML tags AFTER escaping, so the generated
 * HTML tags are not escaped.
 */
function renderMarkdown(escapedText: string): string {
  let result = escapedText;

  // Bold: **text** → <strong>text</strong>
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Links: [text](url) → <a href="url">text</a>
  // The URL was escaped, so we need to un-escape &amp; back to & in href
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text, url) => {
      const cleanUrl = url.replace(/&amp;/g, "&");
      // Only allow http/https protocols
      if (/^https?:\/\//i.test(cleanUrl)) {
        return `<a href="${escapeAttr(cleanUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return text; // Strip link if not http(s)
    }
  );

  // Unordered list items: lines starting with "- "
  // Process line by line
  const lines = result.split("\n");
  const processedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (!inList) {
        processedLines.push("<ul>");
        inList = true;
      }
      processedLines.push(`<li>${trimmed.slice(2)}</li>`);
    } else {
      if (inList) {
        processedLines.push("</ul>");
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) {
    processedLines.push("</ul>");
  }
  result = processedLines.join("\n");

  // Line breaks: \n\n → </p><p>, single \n → <br>
  // First handle double newlines as paragraph breaks
  result = result.replace(/\n\n+/g, "</p><p>");
  // Then single newlines as <br>
  result = result.replace(/\n/g, "<br>");

  // Wrap in <p> if we added paragraph breaks
  if (result.includes("</p><p>")) {
    result = "<p>" + result + "</p>";
  }

  return result;
}

// ─── Rendering Functions ────────────────────────────────────────────────────

/** Generate tldr_short: first 100 chars, truncated at nearest sentence/comma boundary */
function makeTldrShort(tldr: string): string {
  if (tldr.length <= 100) return tldr;
  const sub = tldr.slice(0, 100);
  // Find last sentence-ending punctuation or comma
  const lastBreak = Math.max(
    sub.lastIndexOf("。"),
    sub.lastIndexOf("，"),
    sub.lastIndexOf("."),
    sub.lastIndexOf(","),
  );
  if (lastBreak > 30) {
    return tldr.slice(0, lastBreak + 1);
  }
  return sub;
}

/** Generate heroMetrics from keyMetrics: first 2 rows, subject column values */
function renderHeroMetrics(keyMetrics?: KeyMetrics): string {
  if (!keyMetrics || !keyMetrics.rows || keyMetrics.rows.length === 0) return "";
  const rows = keyMetrics.rows.slice(0, 2);
  const subjectIdx = 0; // subject is always first in values
  const compIdx = 1; // first competitor for comparison

  return rows
    .map((row) => {
      const subjectVal = escapeHtml(row.values[subjectIdx] || "");
      const unit = row.unit ? " " + escapeHtml(row.unit) : "";
      // Show "vs" first competitor if available
      const compVal = row.values[compIdx] ? escapeHtml(row.values[compIdx]) : "";
      const compLabel = compVal
        ? ` <span class="mini-label">vs ${compVal}${unit}</span>`
        : "";
      return `<div class="mini-row"><span class="mini-val">${subjectVal}${unit}</span>${compLabel}</div>`;
    })
    .join("\n");
}

/** Render keyMetrics as a <table class="metrics-table"> */
function renderMetricsTable(keyMetrics: KeyMetrics): string {
  const { subject, competitors, rows, footnote } = keyMetrics;

  // Header row
  const headers = [
    `<th></th>`,
    `<th class="subject-col">${escapeHtml(subject)}</th>`,
    ...competitors.map((c) => `<th>${escapeHtml(c)}</th>`),
  ];

  // Data rows
  const bodyRows: string[] = [];
  for (const row of rows) {
    const cells = [
      `<td>${escapeHtml(row.metric)}${row.unit ? " (" + escapeHtml(row.unit) + ")" : ""}</td>`,
      `<td class="subject-col">${escapeHtml(row.values[0] || "")}</td>`,
      ...row.values.slice(1).map((v) => `<td>${escapeHtml(v)}</td>`),
    ];
    bodyRows.push(`<tr>${cells.join("")}</tr>`);

    // Note row
    if (row.note) {
      const colspan = 1 + 1 + competitors.length;
      bodyRows.push(
        `<tr class="metric-note"><td colspan="${colspan}">${renderMarkdown(escapeHtml(row.note))}</td></tr>`
      );
    }
  }

  let html = `<table class="metrics-table">
<thead><tr>${headers.join("")}</tr></thead>
<tbody>${bodyRows.join("\n")}</tbody>
</table>`;

  if (footnote) {
    html += `\n<p class="metrics-footnote">${renderMarkdown(escapeHtml(footnote))}</p>`;
  }

  return html;
}

/** Render full metrics section (bilingual) or empty string */
function renderMetricsSection(zh: LangContent, en: LangContent): string {
  if (!zh.keyMetrics && !en.keyMetrics) return "";

  const zhTable = zh.keyMetrics ? renderMetricsTable(zh.keyMetrics) : "";
  const enTable = en.keyMetrics ? renderMetricsTable(en.keyMetrics) : "";

  return `<div class="section">
    <div class="section-title" data-content="zh">关键指标</div>
    <div class="section-title" data-content="en">Key Metrics</div>
    <div class="card">
      <div data-content="zh">${zhTable}</div>
      <div data-content="en">${enTable}</div>
    </div>
  </div>`;
}

/** Render whatToDo as grouped action items */
function renderWhatToDo(whatToDo: WhatToDo, lang: "zh" | "en"): string {
  const groups: { key: string; label: string; cssClass: string; items: string[] }[] = [
    {
      key: "immediate",
      label: lang === "zh" ? "立即行动" : "Immediate",
      cssClass: "immediate",
      items: whatToDo.immediate || [],
    },
    {
      key: "thisWeek",
      label: lang === "zh" ? "本周内" : "This Week",
      cssClass: "this-week",
      items: whatToDo.thisWeek || [],
    },
    {
      key: "watchAndWait",
      label: lang === "zh" ? "观望等待" : "Watch & Wait",
      cssClass: "watch",
      items: whatToDo.watchAndWait || [],
    },
  ];

  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const items = g.items
        .map(
          (item) =>
            `<div class="action-item"><span class="action-check">\u2610</span><span class="action-text">${renderMarkdown(escapeHtml(item))}</span></div>`
        )
        .join("\n");
      return `<div class="action-group">
<div class="action-label ${g.cssClass}">${escapeHtml(g.label)}</div>
<div class="action-list">${items}</div>
</div>`;
    })
    .join("\n");
}

/** Render risks */
function renderRisks(risks: Risk[]): string {
  return risks
    .map(
      (r) =>
        `<div class="risk-item"><div class="risk-title">${renderMarkdown(escapeHtml(r.title))}</div><div class="risk-desc">${renderMarkdown(escapeHtml(r.description))}</div></div>`
    )
    .join("\n");
}

/** Render sources with links; official tier gets (Official) badge */
function renderSources(sources: Source[]): string {
  return sources
    .map((s) => {
      // Validate URL protocol
      const url = /^https?:\/\//i.test(s.url) ? s.url : "";
      const titleHtml = url
        ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a>`
        : escapeHtml(s.title);
      const officialBadge = s.tier === "official" ? " (Official)" : "";
      const excerptHtml = s.excerpt
        ? `<div class="source-excerpt">${escapeHtml(s.excerpt)}</div>`
        : "";

      return `<div class="source-item">
<div class="source-title">${titleHtml}${officialBadge}</div>
<div class="source-meta">${escapeHtml(s.publisher)} &middot; ${escapeHtml(s.publishedAt || "")}</div>
${excerptHtml}
</div>`;
    })
    .join("\n");
}

/** Render whoIsAffected groups with impact badge */
function renderWhoIsAffected(whoIsAffected: WhoIsAffected): string {
  return whoIsAffected.groups
    .map((g) => {
      const impactLabel =
        g.impact === "high" ? "HIGH" : g.impact === "medium" ? "MEDIUM" : "LOW";
      return `<div class="group-item">
<span class="impact-badge ${escapeAttr(g.impact)}">${impactLabel}</span>
<div class="group-info">
<div class="group-name">${escapeHtml(g.name)}</div>
<div class="group-desc">${renderMarkdown(escapeHtml(g.description))}</div>
</div>
</div>`;
    })
    .join("\n");
}

/** Render options as option-card list */
function renderOptions(options: Option[], lang: "zh" | "en"): string {
  const suitableLabel = lang === "zh" ? "适合" : "Suitable for";
  const costLabel = lang === "zh" ? "成本" : "Cost";
  const riskLabel = lang === "zh" ? "风险" : "Risk";

  return options
    .map(
      (o) => `<div class="option-card">
<div class="option-name">${escapeHtml(o.name)}</div>
<div class="option-desc">${renderMarkdown(escapeHtml(o.description))}</div>
<div class="option-meta">
<span class="option-tag">${escapeHtml(suitableLabel)}: ${escapeHtml(o.suitableFor)}</span>
<span class="option-tag">${escapeHtml(costLabel)}: ${escapeHtml(o.cost)}</span>
<span class="option-tag">${escapeHtml(riskLabel)}: ${escapeHtml(o.risk)}</span>
</div>
</div>`
    )
    .join("\n");
}

/** Render full options section (bilingual) or empty string */
function renderOptionsSection(zh: LangContent, en: LangContent): string {
  if (!zh.options?.length && !en.options?.length) return "";

  const zhOptions = zh.options ? renderOptions(zh.options, "zh") : "";
  const enOptions = en.options ? renderOptions(en.options, "en") : "";

  return `<div class="section">
    <div class="section-title" data-content="zh">决策选项</div>
    <div class="section-title" data-content="en">Decision Options</div>
    <div class="options-grid" data-content="zh">${zhOptions}</div>
    <div class="options-grid" data-content="en">${enOptions}</div>
  </div>`;
}

/** Determine confidence CSS class */
function getConfidenceClass(confidence: number): string {
  if (confidence >= 80) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

// ─── Main Build Logic ───────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const skillRoot = findSkillRoot(import.meta.dir);
  const projectRoot = findProjectRoot(import.meta.dir);
  const date = args.date || getToday();

  const pageJsonPath = resolve(projectRoot, `hotspot-daily/ai/${date}/page.json`);
  const templatePath = resolve(skillRoot, "templates/hotspot-page.html");
  const distDir = resolve(projectRoot, `hotspot-daily/ai/${date}/dist`);
  const outputPath = resolve(distDir, "index.html");

  console.log(`[build-html] Date: ${date}`);
  console.log(`[build-html] Project root: ${projectRoot}`);
  console.log(`[build-html] Skill root: ${skillRoot}`);
  console.log(`[build-html] Template: ${templatePath}`);
  console.log(`[build-html] Page JSON: ${pageJsonPath}`);
  console.log(`[build-html] Output: ${outputPath}`);
  console.log("");

  // 1. Read page.json
  const pageJsonFile = Bun.file(pageJsonPath);
  if (!(await pageJsonFile.exists())) {
    console.error(`[build-html] ERROR: page.json not found at ${pageJsonPath}`);
    process.exit(1);
  }
  const page: PageJson = JSON.parse(await pageJsonFile.text());

  // 2. Read template
  const templateFile = Bun.file(templatePath);
  if (!(await templateFile.exists())) {
    console.error(`[build-html] ERROR: Template not found at ${templatePath}`);
    process.exit(1);
  }
  let html = await templateFile.text();

  // 3. Build replacement map
  const zhTldrShort = makeTldrShort(page.zh.tldr);
  const enTldrShort = makeTldrShort(page.en.tldr);
  const confidenceClass = getConfidenceClass(page.meta.confidence);

  // Simple string replacements (non-section placeholders)
  const replacements: Record<string, string> = {
    // Meta
    "{{meta.date}}": escapeHtml(page.meta.date),
    "{{meta.confidence}}": escapeHtml(String(page.meta.confidence)),
    "{{meta.sourceCount}}": escapeHtml(String(page.meta.sourceCount)),
    "{{meta.generatedAt}}": escapeHtml(page.meta.generatedAt),

    // Confidence class
    "{{confidence_class}}": escapeAttr(confidenceClass),

    // ZH fields
    "{{zh.title}}": escapeHtml(page.zh.title),
    "{{zh.subtitle}}": escapeHtml(page.zh.subtitle),
    "{{zh.tldr}}": renderMarkdown(escapeHtml(page.zh.tldr)),
    "{{zh.tldr_short}}": escapeAttr(zhTldrShort),
    "{{zh.whatHappened}}": renderMarkdown(escapeHtml(page.zh.whatHappened)),
    "{{zh.whyItMatters}}": renderMarkdown(escapeHtml(page.zh.whyItMatters)),
    "{{zh.heroMetrics}}": renderHeroMetrics(page.zh.keyMetrics),

    // ZH complex sections
    "{{zh.whoIsAffected}}": renderWhoIsAffected(page.zh.whoIsAffected),
    "{{zh.whatToDo}}": renderWhatToDo(page.zh.whatToDo, "zh"),
    "{{zh.risks}}": renderRisks(page.zh.risks),
    "{{zh.sources}}": renderSources(page.zh.sources),

    // EN fields
    "{{en.title}}": escapeHtml(page.en.title),
    "{{en.subtitle}}": escapeHtml(page.en.subtitle),
    "{{en.tldr}}": renderMarkdown(escapeHtml(page.en.tldr)),
    "{{en.tldr_short}}": escapeAttr(enTldrShort),
    "{{en.whatHappened}}": renderMarkdown(escapeHtml(page.en.whatHappened)),
    "{{en.whyItMatters}}": renderMarkdown(escapeHtml(page.en.whyItMatters)),
    "{{en.heroMetrics}}": renderHeroMetrics(page.en.keyMetrics),

    // EN complex sections
    "{{en.whoIsAffected}}": renderWhoIsAffected(page.en.whoIsAffected),
    "{{en.whatToDo}}": renderWhatToDo(page.en.whatToDo, "en"),
    "{{en.risks}}": renderRisks(page.en.risks),
    "{{en.sources}}": renderSources(page.en.sources),

    // Conditional sections
    "{{metrics_section}}": renderMetricsSection(page.zh, page.en),
    "{{options_section}}": renderOptionsSection(page.zh, page.en),
  };

  // OG meta tag values need attribute escaping (already done via escapeAttr for tldr_short)
  // The title in OG tags uses escapeHtml which also covers attribute contexts

  // 4. Perform all replacements
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  // 5. Validate: no unreplaced {{ }} placeholders
  const unreplaced = html.match(/\{\{[^}]+\}\}/g);
  if (unreplaced) {
    console.error(`[build-html] ERROR: Unreplaced placeholders found:`);
    const unique = [...new Set(unreplaced)];
    for (const p of unique) {
      console.error(`  - ${p}`);
    }
    process.exit(1);
  }

  // 6. Write output
  await $`mkdir -p ${distDir}`;
  await Bun.write(outputPath, html);

  const stats = Bun.file(outputPath);
  const size = (await stats.size) / 1024;
  console.log(`[build-html] Done! Output: ${outputPath} (${size.toFixed(1)} KB)`);
}

main();
