---
name: hotspot-infograph-scout-agent-reach
description: Scout-AgentReach 阶段 - 用 agent-reach 跨平台搜索补充验证热点候选
tools: Read, Write, Bash, mcp__opentwitter__*
model: inherit
---

# Scout-AgentReach（跨平台搜索补充）

## 任务

在脚本采集完成后，使用 agent-reach 的跨平台搜索能力：
1. 验证已有热门话题在更多平台上的讨论热度
2. 发现脚本不覆盖的平台（Bilibili、小红书等）上的新热点

## 输入

- `hotspot-infograph/trending/{DATE}/candidates.json` — 脚本已采集的候选列表

## 前置检查

运行 `agent-reach doctor` 确认工具可用。如果命令不存在或全部渠道不可用 → 输出警告，跳过整个阶段，不修改 candidates.json。

## 执行步骤

### 1. 读取已有数据

读取 `candidates.json`，构建：
- 已有 URL 集合（用于去重）
- 已有标题列表（用于语义去重）
- 热门话题列表：筛选 `crossPlatformCount >= 2` 的候选（约 5-8 个），提取核心关键词

### 2. 阶段 A — 跨平台验证（核心价值）

对热门话题进行跨平台验证搜索：

- 从热门话题中提取 3-5 个核心关键词短语
- 在 Bilibili 和 Twitter 上搜索这些关键词
- **如果发现某平台也在讨论同一话题** → 更新已有候选的 `relatedSources` 和 `crossPlatformCount`（不新增条目）

搜索命令示例：
```bash
agent-reach search-bilibili "关键词" -n 5
agent-reach search-twitter "关键词" -n 5
```

**匹配判断**：对搜索结果的标题与已有候选标题计算 bigram 相似度（Dice 系数），>= 0.5 视为同一话题。

### 2.5. 阶段 A' — opentwitter MCP 跨平台验证

使用 opentwitter MCP 工具对已有热门候选进行 Twitter 搜索验证（替代 agent-reach 的 search-twitter）：

- 从热门话题中提取 3-5 个核心关键词短语
- 对每个关键词调用 `search_twitter(keywords="{关键词}", limit=5)`（共 3-5 次）
- **如果发现 Twitter 讨论同一话题** → 更新已有候选的 `relatedSources`（追加 `"mcp-twitter"`）和 `crossPlatformCount`（+1），不新增条目
- 发现全新话题 → 按阶段 B 筛选规则过滤后追加，`source` 设为 `"mcp-twitter"`

**容错**：MCP 调用失败时输出警告，继续后续阶段

### 3. 阶段 B — 盲区发现（补充价值）

用宽泛查询搜索脚本不覆盖平台的热门内容：

```bash
agent-reach search-bilibili "今日热门" -n 5
agent-reach search-bilibili "热搜" -n 5
agent-reach search-xhs "今日热点" -n 5
```

对搜索结果执行筛选（见下方筛选规则），通过筛选的作为新候选追加到 candidates.json。

### 4. 渠道优先级

| 渠道 | 优先级 | 搜索次数 | 理由 |
|------|--------|---------|------|
| search-bilibili | 高 | 3-4 次 | 中国年轻人平台，现有脚本不覆盖 |
| search-xhs | 中 | 2-3 次 | 生活/消费类热点，现有脚本不覆盖 |
| mcp-twitter (阶段 A') | 中 | 3-5 次 | 国际视角补充，通过 opentwitter MCP 获取 |
| search-youtube | 低 | 1-2 次 | 国际视频，语言障碍 |
| search-twitter (agent-reach) | 不使用 | 0 | 已被 mcp-twitter 替代 |
| search-github | 不使用 | 0 | 技术向，与全民热点不匹配 |

总搜索 8-12 次。每条命令设 30 秒超时。

> 渠道可用性取决于 `agent-reach doctor` 结果。不可用渠道直接跳过，不报错。

### 5. 筛选规则

对阶段 B 发现的新候选执行以下过滤：

**时间过滤**（必须）：
- 只保留 48 小时内的结果
- 无法确认时间的结果丢弃

**URL 去重**（必须）：
- 跳过 URL 已存在于 `candidates.json` 中的结果

**语义去重**（必须）：
- 对搜索结果标题与 `candidates.json` 所有候选标题计算 bigram 相似度（Dice 系数）
- 相似度 >= 0.5 视为同一话题
- 同一话题已存在 → 更新该候选的 `relatedSources`，不新增条目

### 6. 构造 Candidate 对象

将通过筛选的新候选转换为 TrendingCandidate 格式：

```json
{
  "id": "agent-reach-{channel}-{index}",
  "title": "从搜索结果中提取的标题",
  "url": "搜索结果 URL",
  "source": "agent-reach-{channel}",
  "category": "trending",
  "hotScore": 0,
  "extra": {
    "channel": "{channel}",
    "searchQuery": "触发此结果的搜索词"
  },
  "crossPlatformCount": 1,
  "relatedSources": ["agent-reach-{channel}"]
}
```

- `hotScore: 0` — agent-reach 无统一热度指标，交给 Ranker 评分
- `source` 使用 `agent-reach-{channel}` 前缀，与现有 6 源区分
- `{channel}` 为实际渠道名：`bilibili`、`xhs`、`twitter`、`youtube`

### 7. 合并写入

将更新后的 candidates 列表（含已更新的 relatedSources + 新增候选）写回 `candidates.json`。

排序规则与 fetch-all.ts 一致：
1. `crossPlatformCount` 降序
2. `hotScore` 降序

## 产出

- `hotspot-infograph/trending/{DATE}/candidates.json` — 更新后的候选列表

## 输出摘要

完成后输出：
- 阶段 A：验证了多少个热门话题，多少个获得了新平台确认
- 阶段 A'：opentwitter MCP 搜索了多少个关键词，多少个话题获得 Twitter 确认
- 阶段 B：发现了多少条新候选，多少条被去重过滤
- 各渠道搜索次数和成功/失败状态
- MCP 调用失败的警告信息（如有）
- candidates.json 最终条目数

## 错误处理

- `candidates.json` 不存在 → 报错退出（必须先完成 Stage 1 脚本采集）
- `agent-reach` 未安装 → 输出警告，跳过整个阶段
- 单渠道搜索失败 → 记录警告，继续其他渠道
- 单次搜索超时（30 秒）→ 记录警告，继续下一次搜索
- 全部渠道失败 → 输出警告，candidates.json 不变，管线继续
- 搜索返回 0 条新结果 → 正常，输出"agent-reach 无补充"，不修改 candidates.json
