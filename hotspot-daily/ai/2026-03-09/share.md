# Share - 2026-03-09 12 课从零手写 AI Agent

## Published URL
https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market

## X/Twitter (中文, ≤140汉字)
> shareAI-lab 开源 learn-claude-code，12 节课从零拆解 Claude Code 核心架构。16 行 Bash 写出最小 Agent，550 行实现完整多代理系统。24000+ Stars，单日涨 566。想理解 AI Agent 怎么运作？从这里开始。 https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market #AI热点
<!-- chars: 223/280 -->

## X/Twitter (English, ≤280 chars)
> 12 lessons to build an AI agent from scratch. learn-claude-code deconstructs Claude Code's architecture into runnable modules — agent loop, subagents, context compression, multi-agent coordination. 24K+ stars. https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market #AI
<!-- chars: 237/280 -->

## Reddit
**Title:** Build a Claude Code-like AI Agent from Scratch in 12 Lessons — Open Source Tutorial (24K+ Stars)

**Body:**
shareAI-lab released [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code), a progressive tutorial that deconstructs Claude Code's internal architecture into 12 standalone, runnable lessons.

**Key takeaways:**
- Starts with a 16-line Bash agent loop, builds up to 550-line full agent with 12 mechanisms
- Covers: Agent Loop, Tool Dispatch, Task Planning, Subagents, Skill Loading, Context Compression (3-layer strategy), Multi-Agent Coordination (JSONL mailbox), Git Worktree Isolation
- Core philosophy: "The model IS the agent — our job is to give it tools and stay out of the way"
- Docs in English, Chinese, Japanese + interactive web learning platform
- 24,000+ stars, 4,400+ forks, +566 stars in one day
- Related production-grade project: Kode-CLI (4,500 stars)

**Caveat:** This is a teaching project — it intentionally omits production concerns like permission governance, session lifecycle management, and audit logging. Don't deploy the teaching code directly.

Interactive analysis: https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market

## 社区/群聊 (中文)
> 推荐一个学 Agent 开发的宝藏项目——shareAI-lab 的 learn-claude-code，12 节课带你从零手写一个类 Claude Code 的 AI Agent。第一课 16 行代码就能跑起来一个 Agent Loop，到最后一课整合了 12 种机制也才 550 行。涵盖工具调度、子代理、上下文压缩、多代理协作这些核心概念，每课都是独立可运行的 Python 文件。GitHub 24000+ Stars，适合想搞懂 Agent 到底怎么工作的同学。详细分析看这里：https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market

## LinkedIn
> The AI agent development space faces a paradox: tools like Claude Code and Cursor have proven that AI agents dramatically boost productivity, yet most developers treat them as black boxes. shareAI-lab's newly released learn-claude-code project addresses this gap head-on with a beautifully structured 12-lesson tutorial that rebuilds Claude Code's core architecture from scratch.
>
> What sets this project apart is its progressive design philosophy. Lesson 1 implements a working agent loop in just 16 lines of Bash. By lesson 12, learners have built a complete system with tool dispatch, task planning, subagents, context compression (a sophisticated 3-layer strategy), multi-agent coordination via JSONL mailbox protocol, and Git worktree isolation — all in approximately 550 lines of Python.
>
> The project's rapid growth (24,000+ stars, 566 new stars in a single day) signals a broader industry shift: understanding how agents work is becoming more valuable than merely using them. Developers who can deconstruct, debug, and customize agent architectures will hold a significant competitive advantage in the AI-native development era.
>
> Full interactive analysis: https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market

## X Long Post (中文)
> 今天聊一个让我眼前一亮的开源项目：shareAI-lab 的 learn-claude-code。
>
> 先说结论：如果你每天用 Claude Code / Cursor 写代码但不理解它们内部怎么工作，这个项目就是你的「X 光机」。
>
> 它做了一件很巧妙的事——把 Claude Code 的核心架构拆成了 12 节课，每节对应一个可独立运行的 Python 文件。从最简单的 Agent Loop 开始（v0 版本只有 16 行 Bash），逐步叠加工具调度、任务规划、子代理、技能加载、上下文压缩、多代理协作、Git Worktree 隔离等机制。全部 12 种机制整合在一起也才约 550 行代码。
>
> 几个让我印象深刻的设计：
>
> 第一，上下文压缩用了 3 层策略。这直接解释了为什么 Claude Code 在长会话中不容易丢失关键信息——不是模型记忆力好，是工程上做了精细的压缩管理。理解这个之后，你会知道怎么更好地管理自己的长对话。
>
> 第二，多代理通信用了 JSONL 邮箱协议。这是一种非常轻量的进程间通信方案——每个 Agent 有自己的邮箱文件，通过追加 JSONL 记录来交换消息。简单但有效，教学目的达到了。
>
> 第三，核心理念是「模型就是 Agent，我们的工作只是给它工具然后让路」。这话听起来极简，但确实抓住了当前 Agent 架构的本质——复杂的不是 Agent 框架本身，而是如何给模型提供正确的工具集和上下文。
>
> 项目已经 24000+ Stars、4400+ Forks，单日涨星 566。配套项目 Kode-CLI（4500 Stars）是生产级实现，形成了从教学到实战的闭环。
>
> 不过要清醒认识到：教学代码省略了权限治理、会话生命周期、审计日志等生产级功能。学完之后想投产，还需要补齐这些工程细节。
>
> 详细分析：https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market

## X Long Post (English)
> I want to highlight an open-source project that does something remarkably well: teach you how AI coding agents actually work by having you build one from scratch.
>
> shareAI-lab's learn-claude-code is a 12-lesson progressive tutorial that deconstructs Claude Code's core architecture into standalone, runnable modules. The starting point is brilliant — a 16-line Bash script that implements a working agent loop. By the final lesson, you've built a complete system with tool dispatch, task planning, subagents, context compression, multi-agent coordination, and Git worktree isolation. The full capstone is roughly 550 lines of Python.
>
> Three design decisions stood out to me:
>
> The context compression module uses a 3-layer strategy. This is the engineering reason why Claude Code doesn't lose critical context in long sessions — it's not model memory, it's careful compression management. Understanding this changes how you approach long conversations with any AI coding tool.
>
> Multi-agent communication uses a JSONL mailbox protocol — each agent has a file-based inbox, messages are exchanged by appending JSONL records. It's lightweight, elegant, and perfectly demonstrates the concept without framework overhead.
>
> The core philosophy — "the model IS the agent, our job is to give it tools and stay out of the way" — captures something essential about current agent architecture. The complexity isn't in the orchestration framework; it's in providing the right tool surface and context management.
>
> The project has 24,000+ stars and gained 566 in a single day. The companion project Kode-CLI (4,500 stars) serves as the production-grade implementation, creating a complete learning-to-deployment pipeline.
>
> Important caveat: this is explicitly a teaching project. It omits permission governance, session lifecycle management, and audit logging. The jump from understanding to production requires filling in these engineering gaps.
>
> Full analysis: https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market

## X/Twitter Thread (中文, 5条)
> 1/5 shareAI-lab 开源了 learn-claude-code，用 12 节课从零构建类 Claude Code 的 AI Agent。24000+ Stars，单日涨 566。这可能是目前最好的 Agent 架构教程。为什么值得关注？
<!-- chars: 161/280 -->

> 2/5 起点极低：v0 版只有 16 行 Bash 就实现了 Agent Loop。然后逐步叠加工具调度、任务规划、子代理、技能加载，每节课一个独立 Python 文件，可以单独运行和理解。完整版整合 12 种机制也才 550 行。
<!-- chars: 183/280 -->

> 3/5 几个核心机制值得学：上下文压缩用 3 层策略，这就是 Claude Code 长对话不丢信息的秘密。多代理通信用 JSONL 邮箱协议，轻量但有效。Git Worktree 隔离执行，保证 Agent 操作不污染主分支。
<!-- chars: 177/280 -->

> 4/5 项目理念是「模型就是 Agent，我们的工作只是给它工具然后让路」。听起来简单，但这确实是当前 Agent 架构的本质——复杂的不是框架，而是工具集和上下文管理。配套的 Kode-CLI（4500 Stars）是生产级实现。
<!-- chars: 190/280 -->

> 5/5 注意：教学代码省略了权限治理、审计日志等生产功能，别直接搬到线上。但作为理解 Agent 内部机制的学习资源，这套课程没有对手。能拆解 Agent 的开发者在 AI 时代竞争力更强。详细分析 https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market #AI热点
<!-- chars: 204/280 -->

## 微信友好格式 (纯文本)
【AI 热点】12 课从零手写 AI Agent —— Claude Code 核心架构拆解教程

shareAI-lab 发布了开源项目 learn-claude-code，通过 12 节渐进式课程从零构建类 Claude Code 的 AI Agent。项目已获 24000+ Stars，单日涨星 566。

核心亮点：
- 从 16 行 Bash 代码的最小 Agent Loop 起步
- 12 节课覆盖：Agent Loop、工具调度、任务规划、子代理、技能加载、上下文压缩、多代理协作、Worktree 隔离
- 完整版整合全部机制也仅约 550 行 Python
- 中英日三语文档 + 交互式 Web 学习平台
- 配套生产级项目 Kode-CLI（4500 Stars）

核心理念："模型就是 Agent，我们的工作只是给它工具然后让路"

适合谁：
- AI Agent 开发者：系统掌握 Agent 核心架构
- Claude Code/Cursor 用户：理解底层机制，用得更好
- 技术教育者：现成的教学素材

注意事项：
- 这是教学项目，省略了权限治理、审计日志等生产功能
- 不要将教学代码直接用于生产环境
- 学习时注意 API Key 安全，不要提交到公开仓库

详细分析：https://www.myvibe.so/xiaoliang-2/ai-hotspot-daily-chatgpt-exodus-reshapes-ai-market
