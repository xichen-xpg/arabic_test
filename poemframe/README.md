# 每日古诗文海报

从原 `poemframe` 工程整合而来，网页入口为 `poemframe/index.html`。

- 当前题库统一读取 `../games/daily-poems.js`，正文按汉字计算，不计标点、空白，最多60字。
- 网页练习和生成脚本共用 `../games/poem-schedule.js`，以迪拜日期、2026-05-20为起点轮换，每天一篇。
- `materials/works`、原有维护脚本及PNG为迁入的历史资料；不参与当前每日选篇。修改活动题库请编辑 `games/daily-poems.js`。
- `每日古诗词.png` 是水墨海报；`daily-poem.json` 记录该图对应的日期、作品和正文。页面只有在记录与今日题目完全一致时才显示该图，否则展示可打印的今日原文。

本地检查选篇（不会调用API）：

```powershell
cd poemframe
npm run generate:daily-poem -- --dry-run
```

生成海报：先运行 `npm ci`，通过环境变量设置 `OPENAI_API_KEY`，再运行 `npm run generate:daily-poem`。原有按作品名生成的参数仍可使用，例如 `--work=春晓`。手动生成某篇时，默认不覆盖每日海报。

根目录 `.github/workflows/daily-poem.yml` 在迪拜时间每天00:00触发，使用当前仓库的 `OPENAI_API_KEY` Secret。生成成功后提交PNG及记录，并触发静态网页部署。GitHub定时任务可能延迟，页面会根据实际生成记录决定是否显示水墨图。

迁入的旧海报不代表当前日期；首次运行成功后会得到匹配当前题库的新海报。原工程保持不变。
