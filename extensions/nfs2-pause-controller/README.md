# NFS2 Pause Controller Extension

这个扩展只做一件事：Arabic Test 到时间发出锁定命令时，在 Retro Online 的 NFS2 页面点击自带 `Pause`；答题解锁时点击 `Play` / `Resume`。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启开发者模式。
3. 选择“加载已解压的扩展”。
4. 选择这个文件夹：

   ```text
   extensions\nfs2-pause-controller
   ```

如果你是直接用本地 `index.html` 打开 Arabic Test，需要在扩展详情里打开“允许访问文件网址”。

## 使用

1. 打开 Arabic Test。
2. 选择 `极品飞车2`。
3. 完成一题解锁。
4. 到时间后扩展会尝试点击 Retro Online 页面里的 `Pause` 按钮。
5. 再完成一题后扩展会尝试点击 `Play` 或 `Resume`。

如果 Retro Online 改了按钮文字或结构，扩展可能找不到按钮；这种情况下页面锁仍会挡住操作，但不会自动暂停游戏。
