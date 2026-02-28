#!/usr/bin/env bash
set -euo pipefail

# AI Hotspot Daily - 自动执行脚本
# 用法: ./run-daily.sh [YYYY-MM-DD]
# 默认使用今天的日期

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DATE="${1:-$(date +%Y-%m-%d)}"
MAX_BUDGET="${MAX_BUDGET:-5}"

# 创建日志目录
mkdir -p logs

LOG_FILE="logs/${DATE}.log"

echo "=== AI Hotspot Daily - ${DATE} ===" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"

# 加载环境变量
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
else
  echo "ERROR: .env.local not found. Copy .env.example to .env.local and fill in your keys." | tee -a "$LOG_FILE"
  exit 1
fi

# 安装依赖
echo "--- Installing dependencies ---" | tee -a "$LOG_FILE"
(cd .claude/skills/hotspot-daily/scripts && bun install --frozen-lockfile 2>&1 || bun install 2>&1) | tee -a "$LOG_FILE"
(cd .claude/skills/hotspot-infograph/scripts && bun install --frozen-lockfile 2>&1 || bun install 2>&1) | tee -a "$LOG_FILE"

# 运行 hotspot-daily
echo "--- Running hotspot-daily ---" | tee -a "$LOG_FILE"
claude -p "/hotspot-daily --date $DATE" \
  --dangerously-skip-permissions \
  --max-budget-usd "$MAX_BUDGET" \
  2>&1 | tee -a "$LOG_FILE"

# 运行 hotspot-infograph
echo "--- Running hotspot-infograph ---" | tee -a "$LOG_FILE"
claude -p "/hotspot-infograph --date $DATE" \
  --dangerously-skip-permissions \
  --max-budget-usd "$MAX_BUDGET" \
  2>&1 | tee -a "$LOG_FILE"

echo "=== Completed at: $(date) ===" | tee -a "$LOG_FILE"
