---
name: hotspot-daily-publisher
description: Publisher 阶段 - 发布 HTML 并生成分享文案
tools: Read, Write, Bash, Skill
model: inherit
---

# Publisher（发布分发）

## 任务

1. 调用 /myvibe-publish 发布
2. 生成社交分享文案

## 输入

- `hotspot-daily/ai/{DATE}/dist/index.html` — 渲染后的 HTML
- `hotspot-daily/ai/{DATE}/page.json` — 决策内容（用于生成文案）

## 执行步骤

### 1. 调用 /myvibe-publish

使用 Skill 工具调用 myvibe-publish，直接发布 runs 目录下的产物：

```
/myvibe-publish hotspot-daily/ai/{DATE}/dist
```

记录发布后的 URL。

### 2. 生成分享文案

读取 page.json 的 zh 和 en 内容，生成 `hotspot-daily/ai/{DATE}/share.md`：

```markdown
# Share - {DATE} {title}

## Published URL

{发布URL}

## X/Twitter (中文, ≤140汉字)

> Twitter 中文每字占 2 字符，140 汉字 = 280 字符上限。优先使用短标题 `title`，如空间允许再拼上 `subtitle`。格式：标题 + 一句话要点 + 链接。不展开行动清单。

{zh.title}

{zh.tldr 精简到一句}

{URL}

#AI热点

## X/Twitter (English, ≤280 chars)

> 格式：优先使用短标题 `title`，如空间允许再拼上 `subtitle`。保持紧凑。

{en.title}

{en.tldr 精简到一句}

{URL}

#AI

## Reddit

**Title:** {en.title}

**Body:**

{en.tldr}

Key takeaways:
{whatToDo.immediate + thisWeek 前3条}

Read more: {URL}

## 社区/群聊 (中文)

> 用口语化风格，像真人在群里分享链接。不用结构化格式，不用粗体，简短直接。

今天值得看的：{zh.title 口语化缩写}

{一句话说明为什么值得看}

{URL}

## LinkedIn

> 专业语调，面向技术管理者和决策者。200-300 字，结构化但不刻板。

{en.title}

{2-3 句话概述事件的商业影响和战略意义，参考 whyItMatters 中的要点}

Key implications:
{从 whatToDo 中提取 2-3 条最具商业价值的行动建议}

Full analysis: {URL}

#AI #Technology #OpenSource

## X/Twitter Thread (中文, 5条)

> 把决策页内容拆解为 5 条推文的 Thread。第 1 条抓眼球，中间 3 条展开核心信息，最后 1 条给出行动建议 + 链接。每条 ≤140 汉字（280 字符）。

1/ {zh.title} 🧵

{一句话勾起兴趣，用数据说话}

2/ 发生了什么

{whatHappened 精简为 2-3 句}

3/ 为什么重要

{whyItMatters 精简为 2-3 个要点}

4/ 关键对比

{从 keyMetrics 中提取最引人注目的对比数据}

5/ 你该怎么做

{whatToDo.immediate 的 1-2 条}

详细分析和完整行动清单 👇
{URL}

#AIHotspotDaily

## 微信友好格式 (纯文本)

> 纯文本，无 markdown，无粗体，无链接语法。适合直接复制粘贴到微信对话或朋友圈。

{zh.title}

{zh.tldr 用口语改写，去掉所有英文术语的首次出现时加中文解释}

要点：
{whatToDo.immediate 每条一行，去掉技术细节，保留核心建议}

详细分析：{URL}
```

### 3. 验证 Twitter 文案字符数

生成完 share.md 后，必须验证 Twitter 文案是否符合 280 字符限制。

**Twitter 字符计数规则**（基于 Twitter 的 weighted length）：
- CJK 字符（中日韩）：每字算 2 个字符
- Latin 字母、数字、空格、标点：每个算 1 个字符
- URL：无论实际长度，每条 URL 固定算 23 个字符（t.co 短链）
- hashtag 中的 # 和后续文字：按普通字符规则计算
- 换行符：每个算 1 个字符

**验证步骤**：
1. 分别提取中文和英文 Twitter 文案的完整文本（包括标题、要点、URL、hashtag）
2. 按上述规则计算加权字符数
3. 如果超过 280 字符：
   - 先尝试精简 tldr 句子（去掉修饰词、缩短数据引用）
   - 如果仍然超出，去掉 subtitle 部分，仅保留 title + 一句话 + URL + hashtag
   - 修改后重新计数确认 ≤280
4. 在 share.md 的每个 Twitter 区块末尾附加字符数注释：`<!-- chars: 247/280 -->`

### 4. 输出总结

输出：
- 发布 URL
- 分享文案文件路径
- 每个 Twitter 文案的字符数（如 "中文 247/280, 英文 231/280"）
- 提醒用户手动分享（不自动发布到社交媒体）

## 产出

- `hotspot-daily/ai/{DATE}/share.md` — 社交分享文案

## 失败处理

- /myvibe-publish 失败 → 记录错误，但保留 HTML 和 share.md
- 发布 URL 获取失败 → share.md 中 URL 留空，提示用户手动补充
