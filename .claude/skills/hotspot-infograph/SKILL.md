---
name: hotspot-infograph
description: |
  每日热点速览。全自动管线：Scout → Ranker → Analyst → QC Gate → Builder → Publisher。
  面向全民的热点可视化速览页，发布在 MyVibe。
user-invocable: true
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task, Skill
---

# 热点速览 — 每日热点可视化速览

> 全自动 Agent 管线，每天产出 1 个面向全民的热点可视化速览页。

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
解析参数 → 确定 DATE 和工作目录 hotspot-infograph/trending/{DATE}/
     ↓
┌─ if NOT --skip-scout AND NOT --build-only ─┐
│  Stage 1: Scout（脚本采集）                   │
│  - 运行 bun scripts/fetch-all.ts --date DATE│
│  - 产出: hotspot-infograph/trending/{DATE}/candidates.json
│  - if --scout-only → 结束                    │
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --skip-scout AND NOT --build-only ─┐
│  Stage 1.5: Scout-AgentReach（补充采集）     │
│  - 使用 Task 工具调用                        │
│    references/scout-agent-reach.md          │
│  - 输入: candidates.json                    │
│  - agent-reach 搜索补充跨平台验证            │
│  - opentwitter MCP 获取 Twitter 热点（补充） │
│  - 产出: candidates.json（更新）             │
│  - 失败时警告但继续                          │
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 2: Ranker（排序）                      │
│  - 使用 Task 工具调用 references/ranker.md    │
│  - 输入: candidates.json + sources/ranking.md │
│  - 产出: hotspot-infograph/trending/{DATE}/selected.json
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 3: Analyst（分析）                     │
│  - 使用 Task 工具调用 references/analyst.md   │
│  - 输入: selected.json + sources/style-guide.md
│  - 产出: hotspot-infograph/trending/{DATE}/page.json
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 3.5: DetailWriter（深度调研）           │
│  - 读取 page.json 中 needsDetail 的话题       │
│  - 使用 Task 工具调用 references/detail-writer.md
│  - 对每个话题进行 3-5 次 WebSearch 深度调研    │
│  - 产出: hotspot-infograph/trending/{DATE}/details/*.json
│  - 如果没有 needsDetail 的话题 → 跳过         │
└──────────────────────────────────────────────┘
     ↓
┌─ if NOT --build-only ────────────────────────┐
│  Stage 4: QC Gate（质量门禁，脚本）             │
│  - 运行 bun scripts/qc-gate.ts --date DATE   │
│  - 输入: page.json                            │
│  - PASS (exit 0) → 继续                      │
│  - FAIL (exit 1) → 报错                      │
│  - 产出: hotspot-infograph/trending/{DATE}/qc-result.json
└──────────────────────────────────────────────┘
     ↓
  Stage 5: Builder（渲染，脚本）
  - 运行 bun scripts/build-html.ts --date DATE
  - 输入: page.json + templates/infograph-page.html
  - 产出: hotspot-infograph/trending/{DATE}/dist/index.html
     ↓
  Stage 6: Publisher（发布）
  - 使用 Task 工具调用 references/publisher.md
  - 调用 /myvibe-publish
  - 产出: hotspot-infograph/trending/{DATE}/share.md
```

## 关键路径

> 策略文件路径相对于此 SKILL.md 所在目录（即 Skill 根目录）。
> 产物目录路径相对于项目根目录。

### 策略文件位置

- 信源配置: `sources/trending.yaml`
- 排序规则: `sources/ranking.md`
- 写作规范: `sources/style-guide.md`

### 产物目录

- 每日工作目录: `hotspot-infograph/trending/{DATE}/`
- 详情页数据: `hotspot-infograph/trending/{DATE}/details/*.json`
- 发布产物: `hotspot-infograph/trending/{DATE}/dist/index.html`
- 详情页 HTML: `hotspot-infograph/trending/{DATE}/dist/detail-*.html`

## 错误处理

1. Scout 失败（无候选）→ 报错退出
1.5. Scout-AgentReach 失败 → 警告但继续（脚本数据已足够）
2. Ranker/Analyst 失败 → 报错退出
3. QC Gate FAIL → 报错退出
4. Builder 失败 → 报错退出（page.json 保留）
5. Publisher 失败 → 警告但不丢失 HTML
