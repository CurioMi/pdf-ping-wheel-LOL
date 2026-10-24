# v1.5.2 发布检查清单

## 源码仓库

- [x] 核心源码、构建脚本、图标源文件、第三方依赖许可证与测试已整理。
- [x] `dist/` 作为构建产物，不纳入源码仓库。
- [x] 公开源码不包含 Riot Games 原版 PNG/WAV、下载器脚本或个人 PDF。
- [x] 增加贡献指南、Bug 模板、功能建议模板和 PR 模板。
- [x] 项目级 `LICENSE` 已采用 MIT；适用范围仅为原创代码与原创图标。
- [x] 已确定公开仓库 `CurioMi/pdf-ping-wheel-LOL`。

## 构建和自动化检查

- [x] `node scripts/verify-static.mjs`：通过。
- [x] `node scripts/verify-pdf.mjs`：通过。
- [ ] 在可联网环境运行 `npm install && npm run build && npm run verify`。
- [ ] 在 Chrome 与 Edge 中手动验证快捷键和完整 UI 交互。

## 发布前人工验证

- [ ] 不导入自定义素材时，信号、表情和亮牌回退图标可用。
- [ ] `Alt` 信号轮盘、`T` 表情轮盘、`G`、`V`、`H` 均符合预期。
- [ ] `Ctrl+6` 被浏览器拦截时，工具栏备用按钮可用。
- [ ] `Enter` 打开备注框，Enter 发送，Shift+Enter 换行，Esc 关闭。
- [ ] 中文备注保存后重新打开仍可恢复；双击编辑、拖动、删除和撤销正常。
- [ ] PDF 中的原生 Stamp 注释在 Chrome、Edge 和 Acrobat 中显示与打印正常。
- [ ] 使用旧版本 PDF 进行迁移兼容测试。

## 发布安装包

1. 在干净的源码目录执行 `npm install` 和 `npm run build`。
2. 压缩 `dist/` 文件夹为 Chrome / Edge 安装 ZIP。
3. 在 GitHub Release 附上安装 ZIP、更新日志、安装步骤和已知限制。
4. 不要在 Release 或源码仓库中上传未经授权的 Riot Games 原版素材。

## 已知限制

当前自动化检查覆盖标准 npm 构建、静态代码和 PDF 注释结构；完整浏览器交互、`Ctrl+6` 的浏览器快捷键冲突，以及不同 PDF 阅读器的视觉/打印兼容仍需人工验证。
