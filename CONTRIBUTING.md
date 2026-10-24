# 贡献指南

感谢你愿意帮助改进 PDF Ping Wheel。当前项目处于公开测试准备阶段，欢迎提交问题报告、兼容性反馈和功能建议。

## 提交问题前

- 先搜索已有 Issues，避免重复报告。
- 说明操作系统、浏览器及版本、PDF 类型和复现步骤。
- 描述预期行为与实际行为；如有控制台报错，请删除个人信息后再贴出。
- 不要上传含个人信息、未公开论文、合同或其他敏感内容的 PDF。
- 不要把 Riot Games 或其他第三方的原版素材上传到 Issues、PR 或仓库。

## 本地开发

要求 Node.js 22+：

```bash
npm install
npm run build
npm run verify
npm run verify:static
npm run verify:pdf
```

如果修改了交互流程，请在 Chrome/Edge 中加载 `dist/`，验证相关快捷键、保存和重新打开行为。

## Pull Request

- 一次 PR 尽量只处理一个问题或功能。
- 说明变更原因、实现方式和测试结果。
- 不提交 `dist/`、`node_modules/`、个人 PDF、视频录屏或本地游戏素材。
- 不引入未说明许可证的第三方代码或素材。
- 目前项目采用 MIT 许可证，但不覆盖第三方依赖或用户导入的素材。
