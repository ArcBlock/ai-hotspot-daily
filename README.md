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
| `X_BEARER_TOKEN` | Yes | X (Twitter) API v2 Bearer Token |
| `COMPOSIO_API_KEY` | Yes | Composio API key for agent-reach |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for claude CLI |

## Output

```
hotspot-daily/ai/{DATE}/dist/index.html        # AI decision page
hotspot-infograph/trending/{DATE}/dist/         # Trending infographic
logs/{DATE}.log                                 # Execution log
```

## License

MIT
