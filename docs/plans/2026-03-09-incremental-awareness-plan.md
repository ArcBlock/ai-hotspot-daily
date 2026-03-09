# 热点日报增量感知 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让管线感知前几天已报道过的话题，确保持续发酵话题被再次选中时产出增量内容而非重复内容。

**Architecture:** Ranker 扫描最近 7 天历史 selected.json 标注 `previousCoverage`，Analyst 据此聚焦增量写作，QC Gate 检查增量充分性，Builder 渲染"持续追踪"标签。

**Tech Stack:** TypeScript (Bun), Markdown prompt 文件, HTML 模板

---

### Task 1: Ranker 增加历史覆盖检测

**Files:**
- Modify: `.claude/skills/hotspot-daily/references/ranker.md`

**Step 1: 在 ranker.md 的"语义去重"步骤之后、"打分"步骤之前，插入新步骤"历史覆盖检测"**

在 `### 3. 语义去重` 和 `### 4. 对每条候选打分` 之间，插入：

```markdown
### 3.5 历史覆盖检测

检查当前候选是否与最近 7 天内已选中的话题重复：

1. 扫描 `hotspot-daily/ai/` 目录，找到最近 7 天内存在的日期子目录（排除今天）
2. 读取每个日期目录下的 `selected.json`（如果存在）
3. 提取所有历史 primary 和 alternates 的标题和摘要
4. 对当前每条候选，检查是否与历史已选话题描述同一事件（标题相似 + 核心实体重叠）
5. 如果命中，在候选上附加 `previousCoverage` 字段：

```json
{
  "previousCoverage": {
    "dates": ["2026-03-03"],
    "latestPagePath": "hotspot-daily/ai/2026-03-03/page.json",
    "latestTitle": "Claude 记忆免费开放并上线迁移工具",
    "coveredSources": ["TechCrunch 2026-03-02", "Anthropic 2026-03-01"]
  }
}
```

- `dates`：该话题曾在哪些日期被选为 primary 或 alternate
- `latestPagePath`：最近一次作为 primary 时的 page.json 路径（如果只做过 alternate 则不填此字段）
- `latestTitle`：最近一次的标题
- `coveredSources`：前次 page.json 中 `sources` 数组的 `publisher + publishedAt` 列表

**注意**：`previousCoverage` 不影响打分，仅作为元数据传递给 Analyst。候选仍按原有 5 维度打分。
```

**Step 2: 更新步骤编号**

将原来的 `### 4. 对每条候选打分` 改为 `### 4.`，`### 5.` 改为 `### 5.`，`### 6.` 改为 `### 6.`（编号不变，因为插入的是 3.5）。

**Step 3: 在输出格式中体现 previousCoverage**

在 `### 6. 写入结果` 的 JSON 示例中，在 primary 对象里增加可选字段注释：

```markdown
在 primary 和 alternates 中，如果候选有 `previousCoverage`，原样保留该字段。
```

**Step 4: 验证**

手动阅读修改后的 ranker.md，确认步骤连贯、编号正确。

**Step 5: Commit**

```bash
git add .claude/skills/hotspot-daily/references/ranker.md
git commit -m "feat(ranker): add historical coverage detection step"
```

---

### Task 2: Analyst 增加增量感知写作逻辑

**Files:**
- Modify: `.claude/skills/hotspot-daily/references/analyst.md`

**Step 1: 在"读取输入"步骤中增加历史覆盖感知**

在 `### 1. 读取输入` 末尾追加：

```markdown
如果主选包含 `previousCoverage` 字段，读取 `previousCoverage.latestPagePath` 指向的前次 page.json，提取：
- 前次的 `whatHappened`、`whyItMatters`、`whatToDo` 内容
- 前次的 `sources` 列表（用于识别已用过的来源）

将这些信息作为"已报道内容"参考，后续步骤中优先产出增量信息。
```

**Step 2: 修改"深入调研"步骤**

在 `### 2. 深入调研` 中追加：

```markdown
**增量优先策略（当存在 previousCoverage 时）：**
- WebSearch 时优先搜索该事件的**最新进展**，使用时间限定词如 "past 24 hours"、"today"
- 排除 `previousCoverage.coveredSources` 中已用过的来源，优先寻找新来源
- 重点关注：新数据点、后续反应、政策变化、市场影响等前次未覆盖的维度
- 至少找到 2 个前次未使用的新来源，否则增量可能不足
```

**Step 3: 修改"生成 page.json"步骤中的写作规范**

在 `### 3. 生成 page.json` 中追加：

```markdown
**增量内容结构（当存在 previousCoverage 时）：**

`whatHappened` 字段分为两部分，用 Markdown 分隔：
- 第一部分"**最新进展**"：仅包含前次报道之后的新事实、新数据、新反应
- 第二部分"**背景回顾**"：用 2-3 句话概括前次已报道的核心事实，不重复展开

示例格式：
```
**最新进展**

[新信息内容...]

**背景回顾**

[简短回顾前次核心事实，1-2 句话]
```

`sources` 字段中每个来源增加 `isNew` 布尔字段：
- `isNew: true`：本次新发现的来源
- `isNew: false`：前次已使用的背景来源（仅保留最关键的 1-2 个作为上下文）

`meta` 中增加 `previousCoverage` 字段（从 selected.json 透传）。

**增量不足时的 confidence 降级：**
如果新来源（`isNew: true`）少于 2 个且没有发现实质性新数据点，将 `confidence` 设为 45（低于 QC Gate 的 60 分门槛），让 QC Gate 自动触发备选切换。
```

**Step 4: 验证**

手动阅读修改后的 analyst.md，确认增量逻辑清晰、与现有步骤不冲突。

**Step 5: Commit**

```bash
git add .claude/skills/hotspot-daily/references/analyst.md
git commit -m "feat(analyst): add incremental-aware writing for recurring topics"
```

---

### Task 3: QC Gate 增加增量充分性检查

**Files:**
- Modify: `.claude/skills/hotspot-daily/scripts/qc-gate.ts`

**Step 1: 更新 Source 接口**

在 `interface Source` 中增加可选字段：

```typescript
interface Source {
  title: string;
  url: string;
  publisher: string;
  tier: string;
  excerpt: string;
  publishedAt: string;
  isNew?: boolean;  // 新增：标识是否为本次新来源
}
```

**Step 2: 更新 PageMeta 接口**

在 `interface PageMeta` 中增加可选字段：

```typescript
interface PageMeta {
  date: string;
  slug: string;
  generatedAt: string;
  timezone: string;
  confidence: number;
  sourceCount: number;
  language: string;
  previousCoverage?: {  // 新增
    dates: string[];
    latestPagePath: string;
    latestTitle: string;
    coveredSources: string[];
  };
}
```

**Step 3: 在 runQCChecks 中增加增量充分性检查**

在 Required Check 9 (slugValid) 之后、Bonus checks 之前，插入：

```typescript
  // Required Check 10: incrementSufficiency (only when previousCoverage exists)
  if (data.meta.previousCoverage) {
    const newSourceCount = data.zh.sources.filter(s => s.isNew === true).length;
    checks.incrementSufficiency = {
      pass: newSourceCount >= 2,
      value: newSourceCount,
      required: 2,
      message: `recurring topic (prev: ${data.meta.previousCoverage.dates.join(", ")}), new sources: ${newSourceCount}`
    };
    if (!checks.incrementSufficiency.pass) {
      failReasons.push(`incrementSufficiency: 持续话题需要至少 2 个新来源，实际 ${newSourceCount}`);
    }
  }
```

**Step 4: 运行脚本验证语法**

```bash
cd .claude/skills/hotspot-daily/scripts && bun build qc-gate.ts --no-bundle 2>&1 | head -5
```

Expected: 无语法错误

**Step 5: 用今天的 page.json 验证不影响现有逻辑**

```bash
bun .claude/skills/hotspot-daily/scripts/qc-gate.ts --date 2026-03-08
```

Expected: 与之前结果一致（因为 2026-03-08 的 page.json 没有 `previousCoverage`，新检查不触发）

**Step 6: Commit**

```bash
git add .claude/skills/hotspot-daily/scripts/qc-gate.ts
git commit -m "feat(qc-gate): add increment sufficiency check for recurring topics"
```

---

### Task 4: Builder 渲染"持续追踪"标签和增量视觉区分

**Files:**
- Modify: `.claude/skills/hotspot-daily/scripts/build-html.ts`
- Modify: `.claude/skills/hotspot-daily/templates/hotspot-page.html`

**Step 1: 在模板 CSS 中增加持续追踪标签和背景回顾样式**

在模板的 `<style>` 中（`.source-meta` 之后），追加：

```css
/* Recurring topic badge */
.tracking-badge {
  display: inline-block;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  margin-bottom: 12px;
}

/* NEW badge for sources */
.source-new-badge {
  display: inline-block;
  background: var(--success-light);
  color: var(--success);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  vertical-align: middle;
  text-transform: uppercase;
}
```

**Step 2: 在模板 hero 区域增加追踪标签占位符**

在模板中 `{{zh.title}}` 所在 `<h1>` 标签之前，插入：

```html
{{tracking_badge}}
```

**Step 3: 在 build-html.ts 中更新 Source 接口**

```typescript
interface Source {
  title: string;
  url: string;
  publisher: string;
  tier: "official" | "media" | "community" | string;
  excerpt: string;
  publishedAt: string;
  isNew?: boolean;  // 新增
}
```

**Step 4: 在 build-html.ts 中更新 PageMeta 接口**

```typescript
interface PageMeta {
  date: string;
  slug: string;
  generatedAt: string;
  timezone: string;
  confidence: number;
  sourceCount: number;
  language: string;
  previousCoverage?: {  // 新增
    dates: string[];
    latestPagePath: string;
    latestTitle: string;
    coveredSources: string[];
  };
}
```

**Step 5: 在 build-html.ts 的 renderSources 函数中增加 NEW 徽标**

修改 `renderSources` 函数，在 `officialBadge` 之后增加：

```typescript
const newBadge = s.isNew === true ? '<span class="source-new-badge">NEW</span>' : "";
```

并将 `${officialBadge}` 改为 `${officialBadge}${newBadge}`。

**Step 6: 在 build-html.ts 的 replacements 中增加 tracking_badge**

在 replacements 对象中增加：

```typescript
"{{tracking_badge}}": page.meta.previousCoverage
  ? `<div data-content="zh"><span class="tracking-badge">持续追踪</span></div><div data-content="en"><span class="tracking-badge">Ongoing Story</span></div>`
  : "",
```

**Step 7: 验证构建**

```bash
bun .claude/skills/hotspot-daily/scripts/build-html.ts --date 2026-03-08
```

Expected: 构建成功，无 unreplaced placeholders。2026-03-08 没有 previousCoverage，tracking_badge 为空。

**Step 8: Commit**

```bash
git add .claude/skills/hotspot-daily/scripts/build-html.ts .claude/skills/hotspot-daily/templates/hotspot-page.html
git commit -m "feat(builder): render tracking badge and NEW source labels for recurring topics"
```

---

### Task 5: 端到端验证

**Files:**
- 无新文件，验证现有产物

**Step 1: 用 2026-03-09 数据重新运行 Ranker → Analyst → QC Gate → Builder**

由于 Ranker 和 Analyst 是 Agent prompt，无法单独脚本测试。验证方式：

1. 手动检查 ranker.md 的步骤 3.5 是否会正确识别 3/3 和 3/9 的 ChatGPT exodus 话题重叠
2. 确认 analyst.md 的增量写作指引是否足够明确
3. 运行 QC Gate 和 Builder 脚本确认代码改动无回归

```bash
bun .claude/skills/hotspot-daily/scripts/qc-gate.ts --date 2026-03-08
bun .claude/skills/hotspot-daily/scripts/build-html.ts --date 2026-03-08
```

Expected: 两个脚本均正常通过（无 previousCoverage 场景无影响）

**Step 2: Commit 设计文档**

```bash
git add docs/plans/
git commit -m "docs: add incremental awareness design and implementation plan"
```
