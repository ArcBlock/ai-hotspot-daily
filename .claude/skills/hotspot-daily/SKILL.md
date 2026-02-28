---
name: hotspot-daily
description: |
  Daily AI hotspot decision page generator. Fully automated 7-stage pipeline: Scout → Scout-WebSearch → Ranker → Analyst → QC Gate → Builder → Publisher.
user-invocable: true
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task, Skill
---

# Hotspot Daily - AI 热点决策页

> 全自动 Agent 管线，每天产出 1 个"我该怎么做"的 AI 热点决策页。

## 参数解析

从用户命令中提取参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--date YYYY-MM-DD` | 指定日期 | 今天 |
| `--scout-only` | 仅采集 | false |
| `--skip-scout` | 跳过采集 | false |
| `--build-only` | 仅渲染+发布 | false |

## 执行流程

```
解析参数 → 确定 DATE 和工作目录 hotspot-daily/ai/{DATE}/
     ↓
┌─ if NOT --skip-scout AND NOT --build-only ─┐
│  Stage 1: Scout（脚本采集）                   │
│  - 运行 bun scripts/fetch-all.ts --date DATE│
│  - 产出: hotspot-daily/ai/{DATE}/candidates.json         │
│  - if --scout-only → 结束                    │
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --skip-scout AND NOT --build-only ─┐
│  Stage 1.5: Scout-WebSearch（AI 补充采集）    │
│  - 使用 Task 工具调用                         │
│    references/scout-websearch.md             │
│  - 输入: candidates.json + hotspot-daily/ai/seen-urls.json│
│  - opentwitter MCP 获取 AI 推文（补充）       │
│  - opennews MCP 获取 AI 新闻（补充）          │
│  - WebSearch 发现脚本遗漏的热点               │
│  - 48h 时间过滤 + URL/语义去重 + 跨天去重     │
│  - 产出: candidates.json（追加）              │
│         hotspot-daily/ai/seen-urls.json（更新）           │
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 2a: 预处理（精简候选）                  │
│  - 运行 bun scripts/slim-candidates.ts       │
│    --date DATE                               │
│  - 产出: candidates-slim.json                │
│                                              │
│  Stage 2a': 预排序（prerank）                 │
│  - 运行 bun scripts/prerank.ts --date DATE   │
│  - 输入: candidates-slim.json                │
│  - 4 维度确定性评分 + 安全缓冲（每源 top3、  │
│    每类别 top2）                              │
│  - 产出: candidates-preranked.json (~35 条)  │
│                                              │
│  Stage 2b: Ranker（排序）                     │
│  - 使用 Task 工具调用 references/ranker.md    │
│  - 输入: candidates-preranked.json +         │
│          sources/ranking.md                  │
│  - 产出: hotspot-daily/ai/{DATE}/selected.json│
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 3: Analyst（分析）                     │
│  - 使用 Task 工具调用 references/analyst.md   │
│  - 输入: selected.json + sources/style-guide.md│
│  - 产出: hotspot-daily/ai/{DATE}/page.json                │
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 4: QC Gate（质量门禁，脚本）             │
│  - 运行 bun scripts/qc-gate.ts --date DATE   │
│  - 输入: page.json                            │
│  - 检查: ≥3 来源、≥3 行动清单、≥2 风险        │
│  - PASS (exit 0) → 继续                      │
│  - FAIL (exit 1) → 换 alternate 重试          │
│  - 全 FAIL → 跳过当天                         │
│  - 产出: hotspot-daily/ai/{DATE}/qc-result.json│
└──────────────────────────────────────────────┘
     ↓
  Stage 5: Builder（渲染，脚本）
  - 运行 bun scripts/build-html.ts --date DATE
  - 输入: page.json + templates/hotspot-page.html
  - 产出: hotspot-daily/ai/{DATE}/dist/index.html
     ↓
  Stage 6: Publisher（发布）
  - 使用 Task 工具调用 references/publisher.md
  - 调用 /myvibe-publish
  - 产出: hotspot-daily/ai/{DATE}/share.md
```

## 关键路径

> 策略文件路径相对于此 SKILL.md 所在目录（即 Skill 根目录）。
> 产物目录路径相对于项目根目录。

### 策略文件位置

- 信源配置: `sources/ai.yaml`
- 排序规则: `sources/ranking.md`
- 写作规范: `sources/style-guide.md`

### 产物目录

- 每日工作目录: `hotspot-daily/ai/{DATE}/`
- 发布产物: `hotspot-daily/ai/{DATE}/dist/index.html`

## 错误处理

1. Scout 失败（无候选）→ 报错退出
2. Scout-WebSearch 失败 → 警告但继续（脚本数据已足够）
3. Ranker/Analyst 失败 → 报错退出
4. QC Gate FAIL → 自动换备选，全部 FAIL 则跳过当天
5. Builder 失败 → 报错退出（page.json 保留）
6. Publisher 失败 → 警告但不丢失 HTML
