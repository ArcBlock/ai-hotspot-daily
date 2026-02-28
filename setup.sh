#!/usr/bin/env bash
set -euo pipefail

# AI Hotspot Daily - 一次性初始化脚本

echo "=== AI Hotspot Daily Setup ==="

# 检查 bun
if ! command -v bun &> /dev/null; then
  echo "ERROR: bun is not installed."
  echo "Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo "[OK] bun $(bun --version)"

# 检查 claude
if ! command -v claude &> /dev/null; then
  echo "ERROR: claude CLI is not installed."
  echo "Install: npm install -g @anthropic-ai/claude-code"
  exit 1
fi
echo "[OK] claude CLI found"

# 检查 .env.local
if [ ! -f .env.local ]; then
  echo "[WARN] .env.local not found. Copying from .env.example..."
  cp .env.example .env.local
  echo "Please edit .env.local and fill in your API keys."
fi

# 安装依赖
echo "--- Installing dependencies ---"
(cd .claude/skills/hotspot-daily/scripts && bun install)
(cd .claude/skills/hotspot-infograph/scripts && bun install)

# 创建运行时目录
mkdir -p hotspot-daily/ai hotspot-infograph/trending logs

echo ""
echo "=== Setup complete! ==="
echo "1. Edit .env.local with your API keys"
echo "2. Run: ./run-daily.sh"
