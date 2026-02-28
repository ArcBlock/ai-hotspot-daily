---
name: hotspot-daily-qc-gate
description: QC Gate - 质量门禁检查，PASS 则继续，FAIL 则换备选
tools: Read, Write
model: inherit
---

# QC Gate（质量门禁）

## 任务

检查 page.json 是否满足质量标准。PASS 则继续到 Builder；FAIL 则报告原因。

## 输入

- `hotspot-daily/ai/{DATE}/page.json` — 待检查的决策页内容

## 检查项

### 必过项（全部通过才算 PASS）

| 检查项 | 标准 | 如何检查 |
|--------|------|----------|
| 来源数量 | `zh.sources.length >= 3` | 计数 |
| 行动清单 | `immediate + thisWeek + watchAndWait >= 3` | 计数 |
| 风险数量 | `zh.risks.length >= 2` | 计数 |
| 结论式标题 | `title`（短标题）不以"某某发布了""某某宣布"开头，中文 ≤20 字 / 英文 ≤10 词 | 模式匹配 + 长度检查 |
| 副标题非空 | `zh.subtitle` 和 `en.subtitle` 非空 | 字段检查 |
| 置信度 | `meta.confidence >= 60` | 数值比较 |
| 中文完整 | zh 所有必填字段非空 | 字段检查 |
| 英文完整 | en 所有必填字段非空 | 字段检查 |
| slug 有效 | `meta.slug` 是 URL 友好的 | 格式检查 |

### 加分项（不影响 PASS/FAIL，但记录）

| 加分项 | 标准 |
|--------|------|
| 策略对比 | options 非空且 ≥2 |
| TL;DR | tldr 非空 |
| 受影响群体 | whoIsAffected.groups ≥2 |
| 来源多样性 | sources 来自 ≥2 个不同 publisher |
| 价格口径完整 | 如果 keyMetrics 中包含价格行（metric 名含"价格"或"price"），则 input 和 output 必须分别为独立行，且至少一行有 note 字段 |

## 执行步骤

1. 读取 `hotspot-daily/ai/{DATE}/page.json`
2. 逐项检查必过项
3. 记录加分项
4. 生成检查结果

## 产出

将结果写入 `hotspot-daily/ai/{DATE}/qc-result.json`：

```json
{
  "result": "PASS" | "FAIL",
  "checkedAt": "ISO时间",
  "checks": {
    "sourceCount": { "pass": true, "value": 5, "required": 3 },
    "actionCount": { "pass": true, "value": 4, "required": 3 },
    "riskCount": { "pass": true, "value": 2, "required": 2 },
    "conclusionTitle": { "pass": true },
    "subtitlePresent": { "pass": true },
    "confidence": { "pass": true, "value": 75, "required": 60 },
    "zhComplete": { "pass": true },
    "enComplete": { "pass": true },
    "slugValid": { "pass": true }
  },
  "bonuses": {
    "hasOptions": true,
    "hasTldr": true,
    "hasAffectedGroups": true,
    "sourceDiversity": true
  },
  "failReasons": []
}
```

## 结果处理

- **PASS** → 输出 "QC PASS" + 检查详情，流程继续
- **FAIL** → 输出 "QC FAIL" + 具体失败原因列表，流程需要处理失败
