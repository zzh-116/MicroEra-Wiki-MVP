
# SHA 失效说明

## 原因

2026-10-30 为清理 `analysis-output/` 目录中的客户敏感数据，对仓库执行了 `git filter-repo --path analysis-output/ --invert-paths` 历史重写。

## 影响

`docs/parity/` 目录下所有引用旧提交 SHA 的文件均已失效，包括但不限于：

- `docs/parity/state.json`
- `docs/parity/report.json`
- `docs/parity/commit-ledger.md`
- `docs/parity/final-report.md`

这些文件中出现的任何旧 SHA（例如 `d2e0f30...`、`01343a2...` 等）都不再指向当前历史中的有效提交。

## 当前有效 HEAD

```
5797e7fd9ee30d6f535c784280b9fdfee8182e51
```

## 建议

若需要引用提交，请以本文件发布后的 `git log` 输出为准，或重新生成相关验收报告。
