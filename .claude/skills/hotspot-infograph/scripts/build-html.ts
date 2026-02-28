#!/usr/bin/env bun
/**
 * build-html.ts - Deterministic HTML builder for hotspot-infograph pages.
 *
 * Reads page.json (DailyPage schema) and the HTML template, renders all
 * charts/numbers/cards, replaces placeholders, and outputs dist/index.html.
 *
 * Usage:
 *   bun .claude/skills/hotspot-infograph/scripts/build-html.ts --date 2026-02-13
 */

import { resolve } from "path";
import { $ } from "bun";
import { parseArgs, getToday, findSkillRoot, findProjectRoot } from "./lib/utils";
import type { DailyPage, ChartDataItem } from "./lib/types";

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

// ─── Hero Chart Renderers ───────────────────────────────────────────────────

/** 1. Bar Chart — horizontal bars, sorted by value descending */
function renderBarChart(data: ChartDataItem[], highlight?: string): string {
  if (!data || data.length === 0) return '<div class="chart-bar"></div>';

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const maxVal = sorted[0].value || 1;

  const items = sorted.map((item) => {
    const pct = ((item.value / maxVal) * 100).toFixed(1);
    const isHighlight = highlight && item.label === highlight;
    const valueStr = escapeHtml(String(item.value) + (item.unit ? item.unit : ""));
    return `<div class="chart-bar-item">
    <span class="chart-bar-label">${escapeHtml(item.label)}</span>
    <div class="chart-bar-track">
      <div class="chart-bar-fill" style="width: ${pct}%;"${isHighlight ? ' data-highlight="true"' : ""}></div>
    </div>
    <span class="chart-bar-value">${valueStr}</span>
  </div>`;
  });

  return `<div class="chart-bar">\n${items.join("\n")}\n</div>`;
}

/** 2. Line Chart — SVG polyline with area fill and dots */
function renderLineChart(data: ChartDataItem[]): string {
  if (!data || data.length === 0) return '<div class="chart-line"></div>';

  const n = data.length;
  const xMin = 30, xMax = 370;
  const yMin = 20, yMax = 170;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Compute points: higher value = lower y (closer to top)
  const points = data.map((d, i) => {
    const x = n === 1 ? (xMin + xMax) / 2 : xMin + (i / (n - 1)) * (xMax - xMin);
    const y = yMax - ((d.value - minVal) / range) * (yMax - yMin);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill polygon: line points + bottom-right + bottom-left
  const areaPoints = [
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${yMax}`,
    `${points[0].x},${yMax}`,
  ].join(" ");

  const dots = points
    .map((p) => `<circle class="chart-line-dot" cx="${p.x}" cy="${p.y}" r="4"/>`)
    .join("\n    ");

  // Value labels above dots
  const valueLabels = points
    .map((p, i) => {
      const val = data[i].value;
      const unit = data[i].unit || "";
      return `<text class="chart-line-value" x="${p.x}" y="${Math.max(p.y - 10, 12)}">${escapeHtml(String(val) + unit)}</text>`;
    })
    .join("\n    ");

  const labels = points
    .map((p, i) => `<text class="chart-line-label" x="${p.x}" y="192">${escapeHtml(data[i].label)}</text>`)
    .join("\n    ");

  return `<div class="chart-line">
  <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet">
    <polygon class="chart-line-area" points="${areaPoints}" opacity="0.1"/>
    <polyline class="chart-line-path" points="${polylinePoints}"/>
    ${dots}
    ${valueLabels}
    ${labels}
  </svg>
</div>`;
}

/** 3. Ring Chart — SVG donut with legend */
function renderRingChart(data: ChartDataItem[]): string {
  if (!data || data.length === 0) return '<div class="chart-ring"></div>';

  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const circumference = 2 * Math.PI * 70; // ~439.82
  const colors = generateRingColors(data.length);

  let offset = 0;
  const segments = data.map((d, i) => {
    const segLength = (d.value / total) * circumference;
    const dashArray = `${segLength.toFixed(2)} ${circumference.toFixed(2)}`;
    const dashOffset = (-offset).toFixed(2);
    offset += segLength;
    return `<circle class="chart-ring-segment" cx="100" cy="100" r="70" fill="none"
            stroke="${colors[i]}" stroke-width="30"
            stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
            transform="rotate(-90 100 100)"/>`;
  });

  const pctLabel = data.length > 0
    ? `${((data[0].value / total) * 100).toFixed(0)}%`
    : "";

  const legendItems = data.map((d, i) => {
    const pct = ((d.value / total) * 100).toFixed(1);
    const unit = d.unit || "";
    return `<div class="chart-ring-legend-item">
      <span class="chart-ring-legend-dot" style="background: ${colors[i]};"></span>
      <span>${escapeHtml(d.label)}</span>
      <span class="chart-ring-legend-value">${escapeHtml(String(d.value) + unit)} (${pct}%)</span>
    </div>`;
  });

  return `<div class="chart-ring">
  <svg viewBox="0 0 200 200" width="140" height="140">
    ${segments.join("\n    ")}
    <text class="chart-ring-label" x="100" y="96">${escapeHtml(pctLabel)}</text>
    <text class="chart-ring-sublabel" x="100" y="114">${escapeHtml(data[0]?.label || "")}</text>
  </svg>
  <div class="chart-ring-legend">
    ${legendItems.join("\n    ")}
  </div>
</div>`;
}

/** Generate colors for ring segments: accent for first, progressively lighter */
function generateRingColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      colors.push("var(--accent)");
    } else {
      // Progressively mix more white into accent
      const pct = Math.max(30, 80 - i * 15);
      colors.push(`color-mix(in srgb, var(--accent) ${pct}%, #cbd5e1)`);
    }
  }
  return colors;
}

/** 4. Timeline — vertical timeline */
function renderTimelineChart(data: ChartDataItem[]): string {
  if (!data || data.length === 0) return '<div class="chart-timeline"></div>';

  const items = data.map((d) => {
    const unit = d.unit || "";
    return `<div class="chart-timeline-item">
    <div class="chart-timeline-time">${escapeHtml(d.label)}</div>
    <div class="chart-timeline-text">${escapeHtml(String(d.value) + unit)}</div>
  </div>`;
  });

  return `<div class="chart-timeline">\n${items.join("\n")}\n</div>`;
}

/** 5. Versus — exactly 2 data items in left-right comparison */
function renderVersusChart(data: ChartDataItem[]): string {
  if (!data || data.length < 2) return '<div class="chart-versus"></div>';

  const left = data[0];
  const right = data[1];
  const leftUnit = left.unit || "";
  const rightUnit = right.unit || "";

  return `<div class="chart-versus">
  <div class="chart-versus-left">
    <div class="chart-versus-name">${escapeHtml(left.label)}</div>
    <div class="chart-versus-value">${escapeHtml(String(left.value))}</div>
    <div class="chart-versus-unit">${escapeHtml(leftUnit)}</div>
  </div>
  <div class="chart-versus-badge">VS</div>
  <div class="chart-versus-right">
    <div class="chart-versus-name">${escapeHtml(right.label)}</div>
    <div class="chart-versus-value">${escapeHtml(String(right.value))}</div>
    <div class="chart-versus-unit">${escapeHtml(rightUnit)}</div>
  </div>
</div>`;
}

/** 6. Heatmap — grid of colored cells, opacity proportional to value */
function renderHeatmapChart(data: ChartDataItem[]): string {
  if (!data || data.length === 0) return '<div class="chart-heatmap"></div>';

  const maxVal = Math.max(...data.map((d) => d.value)) || 1;
  const cols = Math.ceil(Math.sqrt(data.length));

  const cells = data.map((d) => {
    const opacity = Math.max(0.2, d.value / maxVal).toFixed(2);
    const unit = d.unit || "";
    return `<div class="chart-heatmap-cell" style="background: color-mix(in srgb, var(--accent) ${Math.round(Number(opacity) * 100)}%, transparent);">
    <div class="chart-heatmap-label">${escapeHtml(d.label)}</div>
    <div class="chart-heatmap-value">${escapeHtml(String(d.value) + unit)}</div>
  </div>`;
  });

  return `<div class="chart-heatmap" style="grid-template-columns: repeat(${cols}, 1fr);">\n${cells.join("\n")}\n</div>`;
}

/** Dispatch to the correct hero chart renderer based on type */
function renderHeroChart(
  type: string,
  data: ChartDataItem[],
  highlight?: string,
): string {
  switch (type) {
    case "bar":
      return renderBarChart(data, highlight);
    case "line":
      return renderLineChart(data);
    case "ring":
      return renderRingChart(data);
    case "timeline":
      return renderTimelineChart(data);
    case "versus":
      return renderVersusChart(data);
    case "heatmap":
      return renderHeatmapChart(data);
    default:
      console.warn(`[build-html] Unknown hero chart type: ${type}, falling back to bar`);
      return renderBarChart(data, highlight);
  }
}

// ─── Mini Chart Renderers (Cards) ───────────────────────────────────────────

/** miniBar — small horizontal bars */
function renderMiniBar(data: any, color: string): string {
  const items: Array<{ label: string; value: number; unit?: string }> = Array.isArray(data) ? data : [];
  if (items.length === 0) return '<div class="mini-bar"></div>';

  const maxVal = Math.max(...items.map((d) => d.value)) || 1;

  const rows = items.map((d) => {
    const pct = ((d.value / maxVal) * 100).toFixed(1);
    const unit = d.unit || "";
    return `<div class="mini-bar-item">
    <span class="mini-bar-label">${escapeHtml(d.label)}</span>
    <div class="mini-bar-track"><div class="mini-bar-fill" style="width: ${pct}%;"></div></div>
    <span class="mini-bar-value">${escapeHtml(String(d.value) + unit)}</span>
  </div>`;
  });

  return `<div class="mini-bar">\n${rows.join("\n")}\n</div>`;
}

/** trend — arrow + value + label */
function renderMiniTrend(data: any): string {
  if (!data) return '<div class="mini-trend"></div>';

  const direction: string = data.direction || "up";
  const value: string = data.value || "";
  const label: string = data.label || "";
  const arrow = direction === "up" ? "\u2191" : "\u2193";
  const arrowClass = direction === "up" ? "up" : "down";

  return `<div class="mini-trend">
  <span class="mini-trend-arrow ${arrowClass}">${arrow}</span>
  <span class="mini-trend-value">${escapeHtml(value)}</span>
  <span class="mini-trend-label">${escapeHtml(label)}</span>
</div>`;
}

/** progress — progress bar with label */
function renderMiniProgress(data: any, color: string): string {
  if (!data) return '<div class="mini-progress"></div>';

  const value: number = data.value || 0;
  const max: number = data.max || 100;
  const label: string = data.label || "";
  const pct = Math.min(100, Math.max(0, (value / max) * 100)).toFixed(0);

  return `<div class="mini-progress">
  <div class="mini-progress-header">
    <span class="mini-progress-label">${escapeHtml(label)}</span>
    <span class="mini-progress-value">${pct}%</span>
  </div>
  <div class="mini-progress-track"><div class="mini-progress-fill" style="width: ${pct}%;"></div></div>
</div>`;
}

/** bigNumber — prominent single number */
function renderMiniBigNumber(data: any): string {
  if (!data) return '<div class="mini-big-number"></div>';

  const value: string = data.value || "";
  const label: string = data.label || "";

  return `<div class="mini-big-number">
  <span class="mini-big-number-value">${escapeHtml(value)}</span>
  <span class="mini-big-number-label">${escapeHtml(label)}</span>
</div>`;
}

/** versus (mini) — compact left vs right */
function renderMiniVersus(data: any): string {
  if (!data) return '<div class="mini-versus"></div>';

  const left = data.left || { label: "", value: "" };
  const right = data.right || { label: "", value: "" };

  return `<div class="mini-versus">
  <div class="mini-versus-side mini-versus-left">
    <div class="mini-versus-name">${escapeHtml(left.label)}</div>
    <div class="mini-versus-value">${escapeHtml(left.value)}</div>
  </div>
  <div class="mini-versus-badge">vs</div>
  <div class="mini-versus-side mini-versus-right">
    <div class="mini-versus-name">${escapeHtml(right.label)}</div>
    <div class="mini-versus-value">${escapeHtml(right.value)}</div>
  </div>
</div>`;
}

/** tags — flex-wrapped tag pills */
function renderMiniTags(data: any, color: string): string {
  const tags: string[] = Array.isArray(data) ? data : [];
  if (tags.length === 0) return '<div class="mini-tags"></div>';

  const items = tags.map(
    (t) => `<span class="mini-tag">${escapeHtml(t)}</span>`,
  );

  return `<div class="mini-tags">\n${items.join("\n")}\n</div>`;
}

/** Dispatch to the correct mini chart renderer */
function renderMiniChart(type: string, data: any, color: string): string {
  switch (type) {
    case "miniBar":
      return renderMiniBar(data, color);
    case "trend":
      return renderMiniTrend(data);
    case "progress":
      return renderMiniProgress(data, color);
    case "bigNumber":
      return renderMiniBigNumber(data);
    case "versus":
      return renderMiniVersus(data);
    case "tags":
      return renderMiniTags(data, color);
    default:
      console.warn(`[build-html] Unknown mini chart type: ${type}`);
      return "";
  }
}

// ─── Section Renderers ──────────────────────────────────────────────────────

/** Render the 3 key number cards */
function renderKeyNumbers(keyNumbers: DailyPage["hero"]["keyNumbers"]): string {
  if (!keyNumbers || keyNumbers.length === 0) return "";

  return keyNumbers
    .slice(0, 3)
    .map(
      (kn) => `<div class="key-number">
  <div class="key-number-value" style="color: var(--accent);">${escapeHtml(kn.value)}</div>
  <div class="key-number-label">${escapeHtml(kn.label)}</div>
</div>`,
    )
    .join("\n");
}

/** Render sources as individual source-link elements */
function renderSources(sources: DailyPage["hero"]["sources"]): string {
  if (!sources || sources.length === 0) return "";

  return sources
    .map((s) => {
      if (s.url && /^https?:\/\//i.test(s.url)) {
        return `<a class="source-link" href="${escapeAttr(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.name)}</a>`;
      }
      return `<span class="source-link">${escapeHtml(s.name)}</span>`;
    })
    .join("\n");
}

/** Render all cards (v2: supports detail page links) */
function renderCards(cards: any[]): string {
  if (!cards || cards.length === 0) return "";

  return cards
    .map((card) => {
      const miniChartHtml = renderMiniChart(
        card.miniChart.type,
        card.miniChart.data,
        card.color,
      );

      const detailLink = card.detailSlug
        ? `<a class="card-detail-link" href="./detail-${escapeAttr(card.detailSlug)}.html">查看详情 ›</a>`
        : "";

      return `<div class="card" style="--card-color: ${escapeAttr(card.color)};"${card.detailSlug ? ` data-has-detail` : ""}>
  <div class="card-header">
    <div class="card-category" style="color: ${escapeAttr(card.color)}; background: ${escapeAttr(card.color)}15;">${escapeHtml(card.category)}</div>
    <div class="card-title">${escapeHtml(card.title)}</div>
  </div>
  <div class="card-chart">${miniChartHtml}</div>
  <div class="card-insight">${escapeHtml(card.insight)}</div>
  ${detailLink}
</div>`;
    })
    .join("\n");
}

// ─── Card Tiering & Enrichment (Magazine Layout) ────────────────────────────

interface TieredCard {
  tier: "featured" | "medium" | "ticker";
  card: any;
  excerpt?: string;
  inlineFacts?: Array<{ value: string; label: string }>;
}

/** Classify cards into featured / medium / ticker tiers */
function tierCards(cards: any[]): TieredCard[] {
  const result: TieredCard[] = [];
  let featuredCount = 0;
  for (const card of cards) {
    const isFeaturable = card.needsDetail &&
      (card.miniChart.type === "versus" || card.miniChart.type === "bigNumber");
    if (isFeaturable && featuredCount < 2) {
      result.push({ tier: "featured", card });
      featuredCount++;
    } else if (card.needsDetail) {
      result.push({ tier: "medium", card });
    } else {
      result.push({ tier: "ticker", card });
    }
  }
  return result;
}

/** Read detail JSON and extract excerpt + inline facts */
function enrichCard(tc: TieredCard, detailsDir: string, fs: any): TieredCard {
  if (tc.tier === "ticker" || !tc.card.detailSlug) return tc;
  const detailPath = resolve(detailsDir, `${tc.card.detailSlug}.json`);
  if (!fs.existsSync(detailPath)) return tc;

  const detail = JSON.parse(fs.readFileSync(detailPath, "utf-8"));

  // First text section → excerpt (80 chars)
  const textSection = detail.sections?.find((s: any) => s.type === "text");
  if (textSection?.content?.paragraphs?.[0]) {
    const full = textSection.content.paragraphs[0];
    tc.excerpt = full.length > 80 ? full.slice(0, 80) + "…" : full;
  }

  // key-facts → first 3 items
  const factsSection = detail.sections?.find((s: any) => s.type === "key-facts");
  if (factsSection?.content?.facts) {
    tc.inlineFacts = factsSection.content.facts.slice(0, 3);
  }

  return tc;
}

/** Render a featured (large) card with excerpt + inline facts */
function renderFeaturedCard(tc: TieredCard): string {
  const card = tc.card;
  const miniChartHtml = renderMiniChart(card.miniChart.type, card.miniChart.data, card.color);

  const excerptHtml = tc.excerpt
    ? `<p class="card-featured-excerpt">${escapeHtml(tc.excerpt)}</p>`
    : "";

  const factsHtml = tc.inlineFacts && tc.inlineFacts.length > 0
    ? `<div class="card-featured-facts">${tc.inlineFacts.map(f =>
        `<div class="card-featured-fact"><span class="card-featured-fact-value">${escapeHtml(f.value)}</span><span class="card-featured-fact-label">${escapeHtml(f.label)}</span></div>`
      ).join("\n")}</div>`
    : "";

  const detailLink = card.detailSlug
    ? `<a class="card-detail-link" href="./detail-${escapeAttr(card.detailSlug)}.html">查看详情 ›</a>`
    : "";

  return `<div class="card card-featured" style="--card-color: ${escapeAttr(card.color)};" data-has-detail>
  <div class="card-header">
    <div class="card-category" style="color: ${escapeAttr(card.color)}; background: ${escapeAttr(card.color)}15;">${escapeHtml(card.category)}</div>
    <div class="card-title">${escapeHtml(card.title)}</div>
  </div>
  <div class="card-chart">${miniChartHtml}</div>
  ${excerptHtml}
  ${factsHtml}
  <div class="card-insight">${escapeHtml(card.insight)}</div>
  ${detailLink}
</div>`;
}

/** Render a medium card (standard card with optional excerpt) */
function renderMediumCard(tc: TieredCard): string {
  const card = tc.card;
  const miniChartHtml = renderMiniChart(card.miniChart.type, card.miniChart.data, card.color);

  const excerptHtml = tc.excerpt
    ? `<p class="card-medium-excerpt">${escapeHtml(tc.excerpt)}</p>`
    : "";

  const detailLink = card.detailSlug
    ? `<a class="card-detail-link" href="./detail-${escapeAttr(card.detailSlug)}.html">查看详情 ›</a>`
    : "";

  return `<div class="card card-medium" style="--card-color: ${escapeAttr(card.color)};"${card.detailSlug ? ' data-has-detail' : ''}>
  <div class="card-header">
    <div class="card-category" style="color: ${escapeAttr(card.color)}; background: ${escapeAttr(card.color)}15;">${escapeHtml(card.category)}</div>
    <div class="card-title">${escapeHtml(card.title)}</div>
  </div>
  <div class="card-chart">${miniChartHtml}</div>
  ${excerptHtml}
  <div class="card-insight">${escapeHtml(card.insight)}</div>
  ${detailLink}
</div>`;
}

/** Render a ticker (compact horizontal bar) */
function renderTickerCard(tc: TieredCard): string {
  const card = tc.card;
  return `<div class="card card-ticker" style="--card-color: ${escapeAttr(card.color)};">
  <span class="card-ticker-category" style="color: ${escapeAttr(card.color)}; background: ${escapeAttr(card.color)}15;">${escapeHtml(card.category)}</span>
  <span class="card-ticker-title">${escapeHtml(card.title)}</span>
  <span class="card-ticker-insight">${escapeHtml(card.insight)}</span>
</div>`;
}

// ─── Share Text Builders ──────────────────────────────────────────────────

/** Build WeChat share text from page data. {{URL}} is resolved at runtime in the browser. */
function buildWechatText(page: DailyPage): string {
  const cards = (page as any).cards as Array<{ title: string; needsDetail?: boolean; miniChart?: { type: string } }>;
  const featured = cards.filter(
    (c) => c.needsDetail && (c.miniChart?.type === "versus" || c.miniChart?.type === "bigNumber"),
  );
  const totalCount = 1 + cards.length; // hero + cards
  const featuredTitles = featured.slice(0, 2).map((c) => c.title).join("、");
  const focusPart = featuredTitles ? `深度聚焦：${featuredTitles}。` : "";
  return `${page.hero.takeaway}。${focusPart}今日共${totalCount}个热点速览 👉 __PAGE_URL__`;
}

/** Build X/Twitter share text (Chinese) from page data. {{URL}} is resolved at runtime. */
function buildXText(page: DailyPage): string {
  const kn = page.hero.keyNumbers[0];
  const cards = (page as any).cards as Array<{ title: string; needsDetail?: boolean; miniChart?: { type: string } }>;
  const featured = cards.filter(
    (c) => c.needsDetail && (c.miniChart?.type === "versus" || c.miniChart?.type === "bigNumber"),
  );
  const highlights = featured.slice(0, 2).map((c) => c.title).join(" · ");
  const hotLine = highlights ? `\n🔥 ${highlights}` : "";
  return `${page.hero.title}｜${kn.value} ${kn.label}${hotLine}\n__PAGE_URL__\n#热点速览 #每日热点`;
}

/** Render the data strip (hero chart as standalone full-width block) */
function renderDataStrip(page: DailyPage): string {
  const chartHtml = renderHeroChart(
    page.hero.chart.type,
    page.hero.chart.data,
    page.hero.chart.highlight,
  );
  const sourcesHtml = renderSources(page.hero.sources);
  return `<div class="data-strip-chart">${chartHtml}</div>\n<div class="data-strip-sources">${sourcesHtml}</div>`;
}

// ─── Detail Page Section Renderers ──────────────────────────────────────────

function renderDetailSection(section: any): string {
  switch (section.type) {
    case "text": {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const paragraphs = (section.content?.paragraphs || [])
        .map((p: string) => `<p>${escapeHtml(p)}</p>`)
        .join("\n");
      return `<section class="detail-section detail-text">\n${heading}\n${paragraphs}\n</section>`;
    }
    case "chart": {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const chartHtml = renderHeroChart(
        section.content?.chartType || "bar",
        section.content?.data || [],
        section.content?.highlight,
      );
      const caption = section.content?.caption
        ? `<p class="detail-chart-caption">${escapeHtml(section.content.caption)}</p>`
        : "";
      return `<section class="detail-section detail-chart">\n${heading}\n<div class="detail-chart-container">${chartHtml}</div>\n${caption}\n</section>`;
    }
    case "timeline": {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const events = (section.content?.events || [])
        .map((e: any) => {
          const hl = e.highlight ? ' data-highlight="true"' : "";
          return `<div class="detail-timeline-event"${hl}>
    <div class="detail-timeline-time">${escapeHtml(e.time)}</div>
    <div class="detail-timeline-desc">${escapeHtml(e.text)}</div>
  </div>`;
        })
        .join("\n");
      return `<section class="detail-section detail-timeline">\n${heading}\n<div class="detail-timeline-track">\n${events}\n</div>\n</section>`;
    }
    case "comparison": {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const left = section.content?.left || { label: "", points: [] };
      const right = section.content?.right || { label: "", points: [] };
      const leftPoints = (left.points || []).map((p: string) => `<li>${escapeHtml(p)}</li>`).join("\n");
      const rightPoints = (right.points || []).map((p: string) => `<li>${escapeHtml(p)}</li>`).join("\n");
      return `<section class="detail-section detail-comparison">\n${heading}
<div class="detail-comparison-grid">
  <div class="detail-comparison-side"><h3>${escapeHtml(left.label)}</h3><ul>\n${leftPoints}\n</ul></div>
  <div class="detail-comparison-divider"></div>
  <div class="detail-comparison-side"><h3>${escapeHtml(right.label)}</h3><ul>\n${rightPoints}\n</ul></div>
</div>\n</section>`;
    }
    case "key-facts": {
      const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : "";
      const facts = (section.content?.facts || [])
        .map((f: any) => `<div class="detail-fact"><span class="detail-fact-value">${escapeHtml(f.value)}</span><span class="detail-fact-label">${escapeHtml(f.label)}</span></div>`)
        .join("\n");
      return `<section class="detail-section detail-key-facts">\n${heading}\n<div class="detail-facts-grid">\n${facts}\n</div>\n</section>`;
    }
    case "quote": {
      const text = section.content?.text || "";
      const source = section.content?.source || "";
      return `<section class="detail-section detail-quote">
  <blockquote>"${escapeHtml(text)}"<cite>— ${escapeHtml(source)}</cite></blockquote>
</section>`;
    }
    default:
      return "";
  }
}

// ─── Main Build Logic ───────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const skillRoot = findSkillRoot(import.meta.dir);
  const projectRoot = findProjectRoot(import.meta.dir);
  const date = args.date || getToday();

  const pageJsonPath = resolve(projectRoot, `hotspot-infograph/trending/${date}/page.json`);
  const templatePath = resolve(skillRoot, "templates/infograph-page.html");
  const distDir = resolve(projectRoot, `hotspot-infograph/trending/${date}/dist`);
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
  const page: DailyPage = JSON.parse(await pageJsonFile.text());

  // 2. Read template
  const templateFile = Bun.file(templatePath);
  if (!(await templateFile.exists())) {
    console.error(`[build-html] ERROR: Template not found at ${templatePath}`);
    process.exit(1);
  }
  let html = await templateFile.text();

  // 2.5. Card tiering & enrichment (magazine layout)
  const fs = await import("fs");
  const detailsDir = resolve(projectRoot, `hotspot-infograph/trending/${date}/details`);

  const tiered = tierCards(page.cards as any[]);
  if (fs.existsSync(detailsDir)) {
    for (let i = 0; i < tiered.length; i++) {
      tiered[i] = enrichCard(tiered[i], detailsDir, fs);
    }
  }

  const featured = tiered.filter(tc => tc.tier === "featured");
  const medium = tiered.filter(tc => tc.tier === "medium");
  const tickers = tiered.filter(tc => tc.tier === "ticker");

  const featuredCardsHtml = featured.map(renderFeaturedCard).join("\n");
  const mediumCardsHtml = medium.map(renderMediumCard).join("\n");
  const tickerCardsHtml = tickers.map(renderTickerCard).join("\n");
  const restZoneHtml = [mediumCardsHtml, tickerCardsHtml].filter(Boolean).join("\n");
  const dataStripHtml = renderDataStrip(page);

  const heroAny = page.hero as any;
  const heroDetailLink = heroAny.detailSlug
    ? `<a class="hero-detail-link" href="./detail-${escapeAttr(heroAny.detailSlug)}.html">查看详情 ›</a>`
    : "";

  // Build zone HTML blocks
  const featuredZone = featured.length > 0
    ? `  <!-- ===== Zone 2: Deep Dive ===== -->\n  <div class="section-divider">\n    <span class="section-divider-text">深度聚焦</span>\n  </div>\n  <div class="zone-featured">\n    ${featuredCardsHtml}\n  </div>`
    : "";

  const dataStripZone = `  <!-- ===== Zone 3: Data Strip ===== -->\n  <div class="section-divider">\n    <span class="section-divider-text">数据全景</span>\n  </div>\n  <div class="data-strip">\n    ${dataStripHtml}\n  </div>`;

  const restZone = restZoneHtml
    ? `  <!-- ===== Zone 4: Speed Scan ===== -->\n  <div class="section-divider">\n    <span class="section-divider-text">速览</span>\n  </div>\n  <div class="zone-rest">\n    ${restZoneHtml}\n  </div>`
    : "";

  console.log(`[build-html] Card tiers: ${featured.length} featured, ${medium.length} medium, ${tickers.length} ticker`);

  // 2.8. Try to read published URL from share.md (for iframe share-url meta)
  const shareMdPath = resolve(projectRoot, `hotspot-infograph/trending/${date}/share.md`);
  let sharePageUrl = "";
  try {
    const shareMdFile = Bun.file(shareMdPath);
    if (await shareMdFile.exists()) {
      const shareMd = await shareMdFile.text();
      const urlMatch = shareMd.match(/## Published URL\s*\n\s*\n(https?:\/\/[^\s]+)/);
      if (urlMatch) sharePageUrl = urlMatch[1];
    }
  } catch (_) { /* ignore */ }
  if (sharePageUrl) {
    console.log(`[build-html] Share URL (from share.md): ${sharePageUrl}`);
  }

  // 3. Build replacement map
  const ogTitle = `${page.hero.title} | \u70ED\u70B9\u901F\u89C8`;

  const replacements: Record<string, string> = {
    // OG / meta
    "{{OG_TITLE}}": escapeAttr(ogTitle),
    "{{OG_DESCRIPTION}}": escapeAttr(page.hero.takeaway),
    "{{META_DATE}}": escapeHtml(page.meta.date),

    // Hero (compact — chart moved to data strip)
    "{{HERO_COLOR}}": escapeAttr(page.hero.color),
    "{{HERO_CATEGORY}}": escapeHtml(page.hero.category),
    "{{HERO_TITLE}}": escapeHtml(page.hero.title),
    "{{HERO_KEY_NUMBERS}}": renderKeyNumbers(page.hero.keyNumbers),
    "{{HERO_TAKEAWAY}}": escapeHtml(page.hero.takeaway),
    "{{HERO_DETAIL_LINK}}": heroDetailLink,

    // Magazine zones
    "{{FEATURED_ZONE}}": featuredZone,
    "{{DATA_STRIP_ZONE}}": dataStripZone,
    "{{REST_ZONE}}": restZone,

    // Share URL (from share.md, for iframe embed)
    "{{SHARE_PAGE_URL}}": escapeAttr(sharePageUrl),

    // Share texts — built from page.json, __PAGE_URL__ placeholder resolved at runtime
    "{{SHARE_WECHAT_TEXT}}": escapeAttr(buildWechatText(page)),
    "{{SHARE_X_TEXT}}": escapeAttr(buildXText(page)),
  };

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
  console.log(`[build-html] ✓ index.html (${size.toFixed(1)} KB)`);

  // 7. Build detail pages (if any)
  const detailTemplatePath = resolve(skillRoot, "templates/detail-page.html");
  const detailTemplateFile = Bun.file(detailTemplatePath);
  const hasDetailTemplate = await detailTemplateFile.exists();

  const detailFiles: string[] = [];
  if (fs.existsSync(detailsDir)) {
    const files = fs.readdirSync(detailsDir).filter((f: string) => f.endsWith(".json"));
    detailFiles.push(...files);
  }

  if (hasDetailTemplate && detailFiles.length > 0) {
    const detailTemplate = await detailTemplateFile.text();
    console.log(`\n[build-html] Building ${detailFiles.length} detail page(s)...`);

    for (const file of detailFiles) {
      const detailData = JSON.parse(fs.readFileSync(resolve(detailsDir, file), "utf-8"));
      let detailHtml = detailTemplate;

      const detailOgTitle = `${detailData.title} | 热点速览`;
      const sectionsHtml = (detailData.sections || [])
        .map(renderDetailSection)
        .join("\n");
      const detailSourcesHtml = renderSources(detailData.sources || []);

      const detailReplacements: Record<string, string> = {
        "{{OG_TITLE}}": escapeAttr(detailOgTitle),
        "{{OG_DESCRIPTION}}": escapeAttr(detailData.title),
        "{{META_DATE}}": escapeHtml(page.meta.date),
        "{{DETAIL_COLOR}}": escapeAttr(detailData.color),
        "{{DETAIL_CATEGORY}}": escapeHtml(detailData.category),
        "{{DETAIL_TITLE}}": escapeHtml(detailData.title),
        "{{DETAIL_SECTIONS}}": sectionsHtml,
        "{{DETAIL_SOURCES}}": detailSourcesHtml,
        "{{INDEX_URL}}": "./index.html",
      };

      for (const [placeholder, value] of Object.entries(detailReplacements)) {
        detailHtml = detailHtml.replaceAll(placeholder, value);
      }

      const outputFile = resolve(distDir, `detail-${detailData.slug}.html`);
      await Bun.write(outputFile, detailHtml);
      const detailSize = (await Bun.file(outputFile).size) / 1024;
      console.log(`  ✓ detail-${detailData.slug}.html (${detailSize.toFixed(1)} KB)`);
    }
  }

  console.log(`\n[build-html] Done!`);
}

main();
