---
name: hotspot-infograph-publisher
description: Publisher 阶段 - 发布 HTML 并生成分享文案（热点速览）
tools: Read, Write, Bash, Skill
model: inherit
---

# Publisher（发布分发）

## 任务

1. 调用 /myvibe-publish 发布
2. 生成社交分享文案

## 输入

- `hotspot-infograph/trending/{DATE}/dist/index.html` — 渲染后的 HTML
- `hotspot-infograph/trending/{DATE}/page.json` — 内容数据（用于生成文案）

## 执行步骤

### 1. 调用 /myvibe-publish

使用 Skill 工具调用 myvibe-publish，直接发布产物目录：

```
/myvibe-publish hotspot-infograph/trending/{DATE}/dist
```

记录发布后的 URL。

### 2. 生成分享文案

读取 page.json 的内容，生成 `hotspot-infograph/trending/{DATE}/share.md`。

page.json 结构参考：
- `meta.date`, `meta.slug`
- `hero.title`（≤20字）, `hero.category`, `hero.color`, `hero.chart`, `hero.keyNumbers`(3个), `hero.takeaway`, `hero.sources`
- `cards[]`：每个包含 `title`, `category`, `color`, `miniChart`, `insight`, `needsDetail?`, `detailSlug?`

卡片分层规则（与 build-html.ts 一致）：
- **featured**（最多2张）: `needsDetail=true` 且 `miniChart.type` 是 "versus" 或 "bigNumber"
- **medium**: `needsDetail=true` 但未入选 featured
- **ticker**: `needsDetail=false`

文案生成模板：

```markdown
# Share - {DATE} {hero.title}

## Published URL

{发布URL}

## 微信/朋友圈

> 纯文本，口语化，≤120 字。用 hero 数据 + featured 标题构造信息密度高的文案。

{hero.title}，{hero.takeaway}。深度聚焦：{featured[0].title}、{featured[1].title}。今日共{cards.length+1}个热点速览 👉 {URL}

## X/Twitter (中文, ≤140汉字)

> 用竖线分隔 hero 和 featured 亮点，突出数据冲击力。从 hero.keyNumbers 中取最醒目的 1 个数据。

{hero.title}｜{hero.keyNumbers[0].value} {hero.keyNumbers[0].label}
🔥 {featured[0].title} · {featured[1].title}
{URL}
#热点速览 #每日热点

## X/Twitter (English, ≤280 chars)

> 翻译 hero.title + 1 个 featured 标题。

Today's trending visual: {hero.title translated} + {featured[0].title translated}
{URL}
#DailyHotspot

## 小红书

标题: {hero.title} | 今日热点速览
正文: {hero.takeaway}。🔥 深度聚焦：{featured[0].title}、{featured[1].title}。还有{medium+ticker数量}个热点速览，滑动查看
标签: #热点速览 #今日热点 #涨知识 #每日速览
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
   - 先尝试精简 takeaway 句子（去掉修饰词、缩短描述）
   - 如果仍然超出，去掉 takeaway 部分，仅保留 hero.title + 热点数 + URL + hashtag
   - 修改后重新计数确认 ≤280
4. 在 share.md 的每个 Twitter 区块末尾附加字符数注释：`<!-- chars: 247/280 -->`

### 4. 输出总结

输出：
- 发布 URL
- 分享文案文件路径
- 每个 Twitter 文案的字符数（如 "中文 247/280, 英文 231/280"）
- 提醒用户手动分享（不自动发布到社交媒体）

## 产出

- `hotspot-infograph/trending/{DATE}/share.md` — 社交分享文案

## 失败处理

- /myvibe-publish 失败 → 记录错误，但保留 HTML 和 share.md
- 发布 URL 获取失败 → share.md 中 URL 留空，提示用户手动补充
