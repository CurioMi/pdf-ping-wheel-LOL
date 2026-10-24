# GitHub 发布流程

## 首次上传

1. 在目标 GitHub 账号下创建一个空仓库，例如 `pdf-ping-wheel`。不要勾选自动生成 README、`.gitignore` 或 License，因为这些文件已在项目中维护。
2. 在本地克隆仓库后，将项目文件复制到仓库目录。也可以从空仓库初始化并手动运行：

```bash
git init
git branch -M main
git add .
git status --short
git diff --cached --stat
```

3. 检查暂存区，确认没有 `dist/`、`node_modules/`、PDF 测试文件或任何原版游戏 PNG/WAV。
4. 提交并推送：

```bash
git commit -m "feat: publish PDF Ping Wheel v1.5.2 source"
git remote add origin https://github.com/<ACCOUNT>/pdf-ping-wheel.git
git push -u origin main
```

## 发布前检查

- `LICENSE` 使用 MIT License；确认该许可仅用于项目原创代码与原创图标，不覆盖第三方依赖或用户导入素材。
- 检查第三方依赖的许可证与声明；不要把第三方游戏素材纳入项目许可证。
- 项目采用 MIT 许可证，仅覆盖项目原创代码与原创图标，不覆盖第三方依赖或用户导入素材。
- 确认 `dist/`、`node_modules/`、个人 PDF、录屏和本地游戏素材均未提交。
- 运行 `npm install && npm run build && npm run verify && npm run verify:static && npm run verify:pdf`。
- 在 Chrome 和 Edge 中实际验证快捷键、备注保存和重新打开 PDF 的行为。

## 发布安装包

1. 在 CI 或本地执行 `npm run build`。
2. 将 `dist/` 文件夹压缩为安装 ZIP；ZIP 解压后应包含 `dist/manifest.json`，安装时加载 `dist/` 文件夹。
3. 在 GitHub 的 Releases 页面创建版本标签，例如 `v1.5.2`，上传扩展 ZIP，并列明已知限制与测试范围。

## 素材政策

公开源码不附带 Riot Games 原版图像、表情、亮牌或音效，也不包含自动下载这些素材的脚本。用户可自行导入其有权使用的本地素材。原版游戏素材不受项目自身代码许可证覆盖。
