# PDF Ping Wheel

**PDF Ping Wheel** 是一个面向 Chrome / Edge 的本地 PDF 标注扩展。它把游戏式快捷操作带入 PDF 阅读：快速放置信号、表情、亮牌和聊天式备注，并将标记保存为 PDF 原生 `/Stamp` 注释。

> 当前源码版本：**v1.6.0 · 阅读峡谷**。这是独立的玩家风格工具，不是 Riot Games 官方产品，也未获 Riot Games 背书。

## 战利品与阅读成长

点击工具栏的 **◇ 战利品**，进入独立的游戏风格界面：

- **2,423 个表情**：完整目录快照，包含英雄联盟与云顶之弈系列；支持中英文、编号搜索，以及已拥有/未解锁/收藏/已装备筛选。
- **自定义九格轮盘**：先选位置，再点击装备；也可把卡片拖到轮盘上。中心位对应轻点 T，外圈八格对应按住 T 选择，配置自动保存。
- **研究宝箱**：完成任务或升级获得宝箱，打开后从三个未拥有的表情中任选一个。也能用 100 研究精粹定向兑换喜欢的表情。
- **阅读任务**：有效阅读 10/25 分钟、在三个不同页面保存标记、写下三条不同笔记，均有奖励；另有长期里程碑。后台、休眠、长时间无操作和查看战利品时暂停计时。
- **本地成长存档**：初始九表情、300 精粹和一个宝箱；支持存档导出/导入。自由模式可直接装备全部表情，任务进度照常保留。

任务的奖励、计时与去重规则，以及对 LOL 客户端的设计参考，见 [阅读峡谷设计](GAMEPLAY_DESIGN.md)。计时只能反映本地活动，不会判断是否理解论文。当前表情库为构建时快照，后续新增表情需更新安装包。

## 功能

- **信号轮盘**：按住 `Alt` 并移动鼠标选择信号；`G` 放置普通信号，`V` 放置危险／撤退信号，`H` 放置敌方有视野标记。
- **表情轮盘**：按住 `T` 并移动鼠标选择表情；轻点 `T` 可放置中心表情。
- **亮牌**：`Ctrl+6`；如果浏览器拦截快捷键，可使用工具栏按钮。
- **聊天式备注**：按 `Enter` 打开，按 `Enter` 发送，`Shift+Enter` 换行，`Esc` 关闭。
- **原生 PDF 注释**：标记可移动、删除；备注可双击编辑。保存后重新打开 PDF，仍可读取标记及备注。
- **本地处理**：PDF 内容在本机处理，扩展不会主动上传用户的 PDF。
- **游戏素材**：v1.6.0 完整素材包包含 9 种游戏信号图标与提示音、2,423 个表情和 1 个亮牌图标；源码仓库不直接提交这些游戏资产。未安装素材时，初始九表情仍有回退图标，新表情在藏品库提示需安装完整素材。

## 安装和运行

### 方式 A：使用预构建扩展

1. 从项目的 **Releases** 下载 Chrome / Edge 扩展 ZIP（如果尚无 Release，请使用方式 B 本地构建）。
2. 解压文件。
3. 打开 `chrome://extensions` 或 `edge://extensions`，启用“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的 `dist/` 文件夹。

### 方式 B：从源码构建

要求 Node.js 22 或更高版本。克隆仓库后运行：

```bash
npm install
npm run assets:install # 可选：下载完整离线素材，约 161 MB 表情图片
npm run build
npm run verify
npm run verify:static
npm run verify:pdf
npm run verify:progression
```

构建完成后，在浏览器扩展管理页加载项目根目录下生成的 `dist/` 文件夹。

## 快捷键

| 操作 | 快捷键 |
|---|---|
| 普通信号 | `G` |
| 危险／撤退信号 | `V` |
| 敌方有视野标记 | `H` |
| 信号轮盘 | 按住 `Alt` 并移动鼠标 |
| 表情轮盘 | 按住 `T` 并移动鼠标 |
| 亮牌 | `Ctrl+6`（可能被浏览器拦截） |
| 打开／发送备注 | `Enter` |
| 备注换行 | `Shift+Enter` |
| 关闭备注框 | `Esc` |
| 删除选中标记 | `Delete` |
| 撤销 | `Ctrl+Z` |

问号信号位于信号轮盘中，不设置额外的独立默认热键。

## 自定义素材

GitHub 源码仓库不直接保存原版游戏素材。运行 `npm run assets:install` 可按已提交目录快照下载并校验信号、音效、完整表情和亮牌；维护者可用 `npm run assets:sync` 刷新表情目录并下载新增图片，再重新构建。也可将有权使用的替换文件放入 `public/riot/` 对应目录。

- `textures/`：信号 PNG 图像
- `sounds/`：信号 WAV 音效
- `emotes/`：表情 PNG 图像
- `mastery/`：亮牌 PNG 图像

素材文件名可参考 `src/pings.js` 和 `public/riot/ASSET_MAP.json`。扩展运行时不会从远程网站加载游戏素材；所有已打包素材均从本地文件读取。

完整表情目录及来源校验信息见 `src/emote-catalog.json`。`public/riot/emotes/catalog-index.json` 由完整下载校验后生成。表情素材采用按需加载，PDF 只嵌入实际用到的图片。

浏览器回归测试：安装 Playwright 的 Chromium（`npx playwright install chromium`）后运行 `npm run verify:ui`。也可设置 `BROWSER_BIN` 使用本机 Chromium 系浏览器。测试在独立资料目录运行，不使用日常浏览器存档。

## PDF 保存格式

- 每个标记以标准 PDF `/Subtype /Stamp` 注释保存，并带有 `/AP /N` 外观流。
- 插件使用自定义注释元数据和唯一 ID 恢复编辑状态；位置和删除状态以 PDF 注释对象为准。
- 备注正文写入注释 `/Contents` 与插件元数据，并由本地文字渲染为可见外观。标准阅读器可以显示和打印备注，但备注的可见文字目前不是 PDF 正文中可直接选择的文本。
- 仍支持读取部分旧版本 PDF 标记格式。对重要文档操作前请备份原文件。

不同 PDF 阅读器对注释选择、移动、打印和自定义字段的保留行为可能不同。发布前建议在 Chrome、Edge 和 Adobe Acrobat 中进行实际验证。

## 隐私和权限

- PDF 文件由用户在本地打开并在本地处理；扩展不主动上传文档。
- 扩展运行时不从外部网站加载游戏素材。
- Release 安装包中的 Riot Games 游戏素材归 Riot Games 及／或其相应权利人所有，不属于本项目 MIT 源码许可证；本地替换素材前请确认你有权使用和分享。
- 加密或需要密码才能打开的 PDF 暂不支持。

## 反馈与贡献

欢迎通过 GitHub Issues 提交问题、兼容性报告和功能建议。提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并避免上传包含个人信息或敏感内容的 PDF。

## 许可证与第三方声明

本项目原创源码与原创图标采用 [MIT License](LICENSE)。该许可证不涵盖第三方依赖、第三方运行时文件或用户自行导入的素材；它们仍分别受各自许可证或权利人条款约束。第三方依赖由 npm 按锁定版本安装；其许可证随对应依赖包分发。

Riot Games、League of Legends 及相关游戏资产属于其各自权利人。本项目为非官方独立工具，不代表 Riot Games，也不声称拥有游戏资产权利。项目名称和快捷键描述仅用于说明功能与兼容性。

本项目不是 Riot Games 官方产品，未声称获得 Riot Games 授权、认可或赞助。Riot 的 [Legal Jibber Jabber](https://www.riotgames.com/en/legal) 第 3 条限制未经授权在游戏或应用中使用其 IP；免费或附加非官方声明不能替代使用许可。公开分发含游戏素材的版本前，应先确认适用授权。

This project is unofficial and does not claim authorization, endorsement or sponsorship from Riot Games. Section 3 of Riot's [Legal Jibber Jabber](https://www.riotgames.com/en/legal) restricts unauthorized use of its IP in games and apps. Being free or including a disclaimer is not a substitute for permission. Confirm applicable authorization before publicly distributing a build containing game assets.

游戏素材不属于本项目的 MIT 源码许可证。本项目按免费、非商业的独立粉丝项目形式分享；商业使用前请取得相关权利人的许可。

## 目录结构

```text
src/                    核心业务逻辑
public/                 扩展 manifest、图标与素材占位目录
scripts/                构建、检查和 PDF 回归测试
branding/               原创应用图标源文件和多尺寸图标
dist/                   本地构建输出（不提交到源码仓库）
.github/workflows/      CI 构建与验证
```

后续开发请优先修改 `src/`、`public/` 和 `scripts/`，不要直接修改生成后的 `dist/assets/viewer.js`。版本记录见 [CHANGELOG.md](CHANGELOG.md)。
