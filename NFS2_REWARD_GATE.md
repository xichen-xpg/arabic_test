# NFS2 学习奖励外层方案

目标不是把《极品飞车 2》改造成教育游戏，而是把原版游戏时间变成学习奖励：

1. 孩子先在外层程序完成一组阿语题。
2. 程序按正确率授予 30、60 或 90 秒驾驶时间。
3. 程序启动或恢复 NFSIISE 等开源移植版，让孩子直接玩原版资源。
4. 时间耗尽后，程序暂停 NFS 进程并回到答题界面。
5. 下一轮通过后恢复同一个进程，因此车辆会从刚才的位置继续。

## 最小原型

本仓库新增了一个 Windows 桌面控制器：

```powershell
python tools\nfs2_reward_gate.py
```

默认会寻找：

```text
C:\Games\NFSIISE\nfs2se.exe
```

也可以用环境变量指定实际位置：

```powershell
$env:NFS_EXE="D:\Games\NFSIISE\nfs2se.exe"
$env:NFS_WORKDIR="D:\Games\NFSIISE"
python tools\nfs2_reward_gate.py
```

如果 NFSIISE 或你选择的移植版支持命令行参数选择赛道，可以把 Himalayas 相关参数放进 `NFS_ARGS`：

```powershell
$env:NFS_ARGS="这里填移植版实际支持的赛道参数"
python tools\nfs2_reward_gate.py
```

这里没有硬编码 Himalayas 参数，因为不同 NFSIISE 构建的命令行支持可能不同。没有可靠参数时，仍可让游戏进入默认菜单，由孩子或家长先选 Himalayas；之后暂停/恢复会保持进程状态。

## 技术边界

- 不修改 NFS2 资源或游戏逻辑。
- 不读取游戏内存，不做存档注入。
- 暂停/恢复只针对外层启动的进程。
- 题库、计时和奖励规则都在外层程序里，便于低成本替换。
- 原版游戏资源需要用户自行合法提供。

## 后续可加但不必一开始做

- 把现有 `games/arabic-test.html` 的题库导出为 JSON，让桌面控制器复用同一份题库。
- 增加家长设置页：每轮题数、正确率阈值、最长连续游戏时间。
- 增加“只奖励 Himalayas”模式：如果移植版支持稳定的赛道启动参数，就把参数固化到配置里。
- 增加进程看门狗：如果孩子手动关闭游戏，下一轮奖励时自动重新启动。
