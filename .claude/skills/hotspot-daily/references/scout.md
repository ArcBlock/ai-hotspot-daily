---
name: hotspot-daily-scout
description: Scout 阶段 - 执行数据采集脚本，收集候选热点
tools: Bash, Read
model: inherit
---

# Scout（热点侦察）

## 任务

执行 `bun run scripts/fetch-all.ts` 采集候选热点数据。

## 输入

- `--date {DATE}`: 目标日期（YYYY-MM-DD 格式）

## 执行步骤

1. 运行采集脚本:
   ```bash
   bun run scripts/fetch-all.ts --date {DATE}
   ```

2. 验证产出:
   - 检查 `hotspot-daily/ai/{DATE}/candidates.json` 是否存在
   - 检查候选数量 ≥5
   - 如果候选数 = 0，报错退出

3. 输出简报:
   - 总候选数
   - 各信源成功/失败状态
   - 分数最高的 5 条候选标题

## 产出

- `hotspot-daily/ai/{DATE}/candidates.json` — 候选热点列表
- `hotspot-daily/ai/{DATE}/data/*.json` — 各信源原始数据

## 失败处理

- 如果所有信源都失败 → 报错退出
- 如果部分信源失败但候选数 ≥5 → 继续（记录警告）
- 如果候选数 <5 → 报错退出（数据不足以进行有意义的排序）
