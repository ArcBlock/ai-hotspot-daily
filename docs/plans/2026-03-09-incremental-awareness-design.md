# 热点日报增量感知设计

## 问题

管线中没有环节感知"前几天已报道过什么"，导致持续发酵的话题被再次选中时，产出内容与前次高度重复，缺乏增量信息。

典型案例：3/3 已报道"ChatGPT 用户大迁移"，3/9 再次选中同一话题但内容几乎完全重复，引用的信源仍是 3/2-3/3 的旧数据。

## 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 产出形式 | 完整决策页，标注增量 vs 背景 | 读者一眼看出新信息在哪 |
| 职责分工 | Ranker 标注历史覆盖，Analyst 据此写增量内容 | Ranker 已做语义去重，历史检测是自然延伸 |
| 回看窗口 | 7 天 | 与 seen-urls.json 生命周期对齐 |
| 增量不足时 | 降低 confidence，由 QC Gate 决定换备选 | 复用现有 FAIL → 换备选机制 |

## 改动范围

### 1. Ranker（references/ranker.md）

新增"历史覆盖检测"步骤，插在"语义去重"之后、"打分"之前：

- 扫描 `hotspot-daily/ai/` 下最近 7 天的 `selected.json`
- 对每条候选，检查是否与历史主选/备选描述同一事件（标题相似 + 核心实体重叠）
- 如果命中，在候选上附加 `previousCoverage` 字段：

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

- 打分时不自动降分，但 `previousCoverage` 会传递给 Analyst

### 2. Analyst（references/analyst.md）

新增"增量感知写作"逻辑：

- 如果主选包含 `previousCoverage`，读取 `latestPagePath` 指向的前次 page.json
- 深入调研时，排除 `coveredSources` 中已用过的来源，优先寻找新来源
- 生成 page.json 时：
  - `whatHappened` 分为"最新进展"和"背景回顾"两部分，最新进展在前
  - `sources` 中标注 `isNew: true/false`，区分新来源和背景来源
  - 如果新来源 < 2 且无新数据点，将 `confidence` 压到 50 以下
- 在 `meta` 中增加 `previousCoverage` 字段，供 Builder 渲染时标注

### 3. QC Gate（scripts/qc-gate.ts）

新增检查维度：

- 如果 `meta.previousCoverage` 存在，检查 `sources` 中 `isNew: true` 的数量
- 新来源 < 2 → FAIL（增量不足）
- 复用现有的 FAIL → 换备选逻辑

### 4. Builder（scripts/build-html.ts + 模板）

- 如果 `meta.previousCoverage` 存在，在页面顶部渲染"持续追踪"标签
- `whatHappened` 中的"背景回顾"部分用视觉上可区分的样式（如浅色/折叠）
- `sources` 列表中新来源标注"NEW"徽标

## 不改动的部分

- Scout / Scout-WebSearch：采集阶段不变
- prerank.ts：确定性预排序不变
- seen-urls.json：URL 去重机制不变（话题级重复和 URL 级去重是不同层次）
- ranking.md 评分维度和权重：不变

## 数据流变化

```
之前：candidates → Ranker(打分) → selected → Analyst(写作) → page.json
之后：candidates → Ranker(打分 + 标注历史覆盖) → selected(含 previousCoverage)
      → Analyst(读前次 page.json + 增量写作) → page.json(含增量标注)
      → QC Gate(增量充分性检查) → Builder(渲染增量标签)
```
