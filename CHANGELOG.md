## v1.5.2 — 2026-10-24 (icon refresh)

- Replace the extension icon with the selected minimal, text-free navy radar + document + yellow question-mark artwork.
- Export transparent Chrome icons at 16, 32, 48, and 128 px, plus branding previews at 256 and 512 px.
- Sync source assets, packaged extension manifest, and version documentation. No product behavior changed.

## v1.5.1 — Original game-inspired visual identity

- Replaced browser extension icons with an original navy/gold compass + PDF + ping symbol (16/32/48/128).
- Added scalable `branding/icon.svg`, PNG exports, and reproducible icon copying script.
- Updated demo presentation assets. No Riot logos, characters, or game art are included in the new icon.

## v1.5.0 — 2026-10-24

- 新增 LoL 聊天式备注输入：按 Enter 呼出输入框，Enter 发送、Shift+Enter 换行、Esc 关闭；备注放在鼠标指向的 PDF 页面位置。
- 备注作为独立原生 Stamp 注释保存，包含文字外观 PNG、注释 `/Contents`、唯一 ID 和自定义元数据；重新打开 PDF 可恢复原文和位置。
- 支持拖动、删除、Ctrl+Z 撤销新增/删除/编辑；双击已有备注可重新编辑。
- 备注图片由本地文本生成，不需要下载 Riot 素材，也不增加游戏素材许可依赖。
- 更新 PDF Info 索引至 v4，并保留 v1–v3 旧文档读取兼容。

## v1.4.1 — 2026-10-24

- 修复 Windows / macOS/Linux 素材安装脚本中亮牌图标的 404：将 CommunityDragon 的 `latest` 路径改为已验证的版本固定路径 `/14.9/game/assets/ux/mastery/mastery_icon_7.png`。
- 同步更新 `public/riot/ASSET_MAP.json`，使素材目录清单与安装脚本一致。
- 此为安装脚本热修复；已成功下载的 27 个素材无需重新下载，重新运行安装脚本时会跳过有效文件，只补齐缺失的亮牌 PNG。

## v1.4.0 — 2026-10-24

- Align shortcuts with League of Legends defaults: `T` emote wheel, `Ctrl+6` mastery emote, `Alt` ping wheel, `G` generic ping, and `V` caution/retreat ping, `H` enemy-vision ping, and Ctrl+left-click quick danger / drag-to-open ping wheel. The question-mark ping remains a wheel selection rather than inventing a non-default key.
- Add a nine-slot emote system: tap `T` for the center emote; hold and move to select one of eight outer emotes.
- Add user-installed sample emote PNGs and a mastery icon from CommunityDragon; no Riot media is bundled in the public source or release ZIP.
- Extend native Stamp annotations to emotes/mastery, preserve dimensions, and store one base64 image per stamp type in the document index so custom art can be restored when reopening the PDF.
- Add a visible `亮牌 Ctrl+6` fallback button because Chrome may reserve `Ctrl+6` for switching tabs.

# Changelog

## v1.3.0 — 2026-10-24

- 将新标记从页面内容流中的烘焙 PNG 改为标准 PDF `/Stamp` 注释。
- 每个注释使用独立 `/AP /N` 外观流和嵌入的 PNG，普通 PDF 阅读器可显示与打印。
- 在注释对象上保存 `/PDFPingWheel` 自定义元数据，使用 `/NM` 唯一名称；重新读取时以原生注释的 `/Rect` 作为位置真值。
- 清理工作副本时只移除本插件的注释和旧版标记流，保留用户原有 PDF 注释和页面内容。
- 保留 v1.0–v1.2 的旧版 Info JSON + 标记内容流迁移读取。
- 增加原生注释外观、移动坐标、九种标记类型、空标记文档和旧版兼容测试。

## v1.2.0 — 2026-10-23

- 把先前仅补丁式修改的 v1.1.0 恢复到**可维护源码结构**，新增 `src/ping-assets.js`。
- 增加 LoL 八向轮盘、九套原版 PNG/WAV 可选映射，以及 SVG / 合成音回退。
- PDF 输出优先嵌入用户安装的 PNG，仅嵌入文档实际使用的素材。
- 保留旧版 PDF 标记 ID 和可编辑元数据读取兼容。
- 增加素材状态提示、离线构建与静态验证、版权说明。
- 原版 Riot 图标与音效不分发；用户通过明确运行脚本才能获得本地素材。
