# AI Hotspot Daily

Automated AI-powered daily hotspot content generation pipeline, built as [Claude Code](https://claude.com/claude-code) skills.

Two pipelines:
- **hotspot-daily** - AI industry decision page (Scout → WebSearch → Ranker → Analyst → QC → Builder → Publisher)
- **hotspot-infograph** - Trending topics infographic (Scout → AgentReach → Ranker → Analyst → QC → Builder → Publisher)

Published to [MyVibe](https://www.myvibe.one).

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.com/claude-code) CLI
- [myvibe-publish](https://www.myvibe.one) Claude Code skill (for publishing)
- MCP Servers (installed via Claude Code settings):
  - `opennews-mcp` — Crypto/AI news aggregation
  - `opentwitter-mcp` — Twitter/X search and user tweets

## Setup

```bash
git clone https://github.com/ArcBlock/ai-hotspot-daily.git
cd ai-hotspot-daily
./setup.sh
# Edit .env.local with your API keys
```

## Usage

### Automated (cron)

```bash
# Run both pipelines for today
./run-daily.sh

# Run for a specific date
./run-daily.sh 2026-02-28

# Set max budget per pipeline (default: $5)
MAX_BUDGET=3 ./run-daily.sh
```

### Manual (interactive)

```bash
claude
# Then use slash commands:
# /hotspot-daily --date 2026-02-28
# /hotspot-infograph --date 2026-02-28
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude CLI |

> **Note**: `X_BEARER_TOKEN` and `COMPOSIO_API_KEY` are no longer required. Twitter/X data is now fetched via opentwitter MCP, and news data via opennews MCP.

## Data Sources

### hotspot-daily (AI)

| Source | Type | Description |
|--------|------|-------------|
| HackerNews | Script | Top AI stories |
| arXiv | Script | AI/ML papers |
| GitHub | Script | Trending AI repos |
| HuggingFace | Script | Popular models |
| RSS | Script | AI blogs and news sites |
| Product Hunt | Script | AI products |
| Papers With Code | Script | ML papers with code |
| Replicate | Script | AI models |
| alphaXiv | Script | Paper discussions |
| AlphaSignal | Script | AI newsletter |
| opentwitter MCP | MCP | AI-related tweets (via scout-websearch) |
| opennews MCP | MCP | AI news aggregation (via scout-websearch) |
| WebSearch | Agent | Gap-filling web search |

### hotspot-infograph (Trending)

| Source | Type | Description |
|--------|------|-------------|
| Weibo | Script | Chinese social media trends |
| Baidu | Script | Baidu hot search |
| Zhihu | Script | Zhihu hot topics |
| Douyin | Script | Douyin trending |
| Google Trends | Script | Google search trends |
| opentwitter MCP | MCP | Twitter trends (via scout-agent-reach) |
| agent-reach | Agent | Cross-platform search (Bilibili, XHS, etc.) |

## Output

```
hotspot-daily/ai/{DATE}/dist/index.html        # AI decision page
hotspot-infograph/trending/{DATE}/dist/         # Trending infographic
logs/{DATE}.log                                 # Execution log
```

## License

MIT
