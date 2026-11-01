## v1.9.1 — 2026-11-01 · 阶段冻结

- 保存前核对原件的实际内容。同一篇文献在两个窗口中编辑时，来自旧内容的保存会生成阅读副本，原件保留另一处的改动。
- 下载副本时，本机先保留已导出的标记和手记。取消下载后打开同一原件仍能恢复；打开确切的输出副本后清理对应恢复记录。

## v1.9.0 — 2026-11-01 · 同行伙伴

- 阅读栏加入原创的同行徽记与三枚今日任务标识。标识对应阅读、保存标记、回访疑问，点开可查看进度。
- 可选择小火龙、铸星龙王、黑暗收割或原有巡灯。伙伴通过已有的阅读时间、新页面标记和解疑记录自动成长，形态分四阶段。
- 新存档默认小火龙，旧存档保留巡灯。选中的伙伴随战利品存档导出，重复保存、换伙伴或中断阅读都不会额外结算层数。

## v1.8.1 — 2026-11-01 · 简洁阅读

- 阅读时常驻打开、保存、论文笔记、巡灯和工具五个入口。窄屏将文件名与操作分行，长文件名按可用空间缩短显示。
- 缩放、标记大小、页面备注、文献疑问、静读与战利品集中在「工具」。按 Esc 或点菜单外可收起工具。选择页面备注或亮牌时会使用当前阅读位置。
- 默认视图随阅读区域宽度调整纸张，并保留当前页的位置。手动放大后会保持所选倍率，再点「适应宽度」可恢复。
- 首页提供一个打开 PDF 的主按钮。保存状态与草稿提醒跟随文件名，新奖励在小灯旁留下提示点。

## v1.8.0 — 2026-11-01 · 论文笔记

- 新增空白的整篇心得和按页记录的个人笔记。每条页边笔记都可回到原来读到的位置，可以修改或删除，扫描件也可使用。
- 文字自动记入对应文献的本机草稿，保存 PDF 后可在另一台设备的扩展中继续编辑。
- 支持将心得和带页码的记录导出为纯文本。正文保持原样，笔记填写没有字数或奖励门槛。

## v1.7.0 — 2026-11-01 · 峡谷巡灯

- 有效阅读每累计 10 分钟自动点亮一处地标，四处组成一程。三条原创路线依次轮换，完成的地图可以回看，旧存档的时间自动计入。
- 已结算的疑问回访显示为地图上的星光。每个问号只计一次，已完成的地点手记可回看。
- 新增可选的十分钟静读。前台看公式时无需移动鼠标，离开或打开战利品自动暂停。已记录的进度跨文献和日期保留。
- 阅读界面收起快捷键说明。任务奖励自动到账，通过战利品入口的静态提示点提醒。
- GAMEPLAY_DESIGN.md 记录了 Forest、Study Bunny、Focus Friend、Spirit City 和 Finch 的参考机制与本版取舍。

## v1.6.1 — 2026-11-01 · 问号回访

- 点击问号在页边展开疑问、记录理解或标为已解决，再次点击即可收起。备注和解决状态随图章保存在 PDF 中。
- 新增小、中、大三档图标尺寸，默认小号。可调整选中图标，旧文件的标记保留原尺寸。
- 本地草稿保护未写入 PDF 的标注和正在输入的备注，切换文件前提示，重新打开文献恢复阅读位置。
- 新增疑问回访每日任务，保存已解决的疑问可领取 25 XP，重复保存或再次解决同一问号不会重复奖励。

## v1.6.0 — 2026-10-31 · 阅读峡谷

- 新增独立战利品界面：表情藏品、研究宝箱、阅读任务，支持键盘操作、窄屏与减少动态效果。
- 将固定九表情扩展为 2,423 个有效表情目录，支持中文/英文/编号搜索、系列和拥有状态筛选、收藏。
- 九格轮盘支持点击装备和拖拽替换，重复位置自动交换，配置自动保存在本机。
- 新增经验等级、研究精粹、永久表情解锁及宝箱三选一；候选结果持久保存，重开不重抽。
- 新增四个每日任务和五个长期里程碑，奖励有效阅读、保存新标记和不同笔记。后台/空闲/休眠不计时，重复保存不重复发奖。
- 保留初始九表情，赠送初始精粹与宝箱，提供自由模式和存档导出/导入。
- 完整素材在构建阶段下载，运行时保持离线。新表情可随 PDF 保存，并可在没有本地素材的设备上恢复显示。
- 新增任务/存储回归测试和浏览器端到端测试。完整设计见 GAMEPLAY_DESIGN.md。

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
