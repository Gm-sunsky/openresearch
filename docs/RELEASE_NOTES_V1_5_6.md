# OpenResearch 1.5.6

## 简体中文

此版本完善 1.5.5 的图片、概述、完整资料与输入稳定性改进。

- 普通卡片保留简短概述；大卡片按实际可用高度展示更多正文，避免固定行数留下大片空白。标题、图片、尺寸变化会重新计算，正文不覆盖底部来源信息。
- 鼠标位于卡包时，滚轮只翻页，包括连续、反向及微小滚轮输入；鼠标位于卡包之外仍正常滚动画布。
- 无可靠文字说明或无法确定核心相关性的图片仅保留在完整资料窗口。双击卡片查看全部已保存正文和图片；支持滚轮、↑/↓ 滚动及卡包翻页。
- 已确认并修复后台刷新覆盖输入草稿、失焦后残留缩放监听的问题。真实 Electron 验证覆盖新项目中文输入、刷新时保留草稿，以及关闭资料窗口和取消删除后的继续输入。原生确认框导致的偶发焦点异常尚未复现，改用应用内确认属于预防性修补。

验证：230 项自动测试、代码检查、类型检查及构建通过；另以真实 Electron 滚轮和键盘验证卡片布局、阅读与输入。安装包未签名或 Apple 公证；未实机验证 macOS 安装。

关于图片证据、数据库迁移及历史材料限制，参见 [1.5.5 说明](RELEASE_NOTES_V1_5_5.md)。

## English

This release refines the image, overview, reader, and input-stability improvements in 1.5.5.

- Regular cards retain concise overviews. Large cards use measured available height to display more body text without overlapping sources. Title, image, and size changes trigger recalculation.
- Wheel input over a card pack only changes pages, including consecutive, reversed, and small packets. Wheel input outside packs continues scrolling the board.
- Images without reliable captions or confirmed core relevance remain in the full reader. Double-click a card to read all saved text and images, with wheel/arrow scrolling and pack pagination.
- Confirmed fixes preserve drafts during background refresh and remove stale resize listeners after blur. Native Electron checks cover Chinese project input, draft retention, and continued input after closing the reader or canceling deletion. The intermittent native-dialog focus failure was not reproduced; in-app confirmation is preventive.

Validation: all 230 automated tests, lint, type checks, and builds passed, plus native Electron layout, wheel, keyboard, reader, and input checks. Installers remain unsigned/not notarized. macOS installation has not been tested on a physical Mac.

See [1.5.5 notes](RELEASE_NOTES_V1_5_5.md) for image evidence, migration, and historical-material limitations.
