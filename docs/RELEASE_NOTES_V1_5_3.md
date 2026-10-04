# OpenResearch 1.5.3

## 简体中文

本次版本完善四项日常使用功能：

- **项目搜索**：按名称、简介、目标和关注项筛选，支持多关键词、清空、空结果提示、Ctrl/Cmd+K、Escape 和回车选择。筛选不会改变当前项目或更新勾选。
- **数据目录**：右栏“工作状态 → 数据位置 → 此设备”可打开 Windows 资源管理器或 macOS Finder；失败会明确提示并允许重试。
- **系统主题**：所有卡片统一配色，跟随系统浅色或深色实时切换；右栏、输入框及对话框同步适配。
- **时间线**：白板与时间线可切换。时间线包含卡包内所有匹配卡片，沿用类型筛选和搜索，按事件日期分组并支持最新/最早优先；没有事件日期时使用创建日期，无法识别的日期单独列出。
- **日期编辑与定位**：卡片详情支持设置或清空事件日期。时间线条目可以定位并打开卡包中的对应页面。

使用现有数据目录和数据库，无需迁移。安装包未签名或 Apple 公证。DeepSeek 联网搜索适配暂不在本次范围内。

## English

This release improves four everyday workflows:

- **Project search:** filter by name, description, goal, and focus, with multiple keywords, clear and empty states, Ctrl/Cmd+K, Escape, and Enter. Filtering preserves the current project and update selection.
- **Data folder:** the device link under Work status opens Windows Explorer or macOS Finder, with actionable error feedback and retry.
- **System appearance:** all card types share consistent surfaces that switch live with the system's light or dark appearance. Panels, fields, and dialogs also adapt.
- **Timeline:** switch between board and chronological views. All matching cards, including packed members, appear in day groups with newest/oldest ordering. Filters and search apply; creation dates are used when event dates are unavailable, with unknown dates grouped separately.
- **Event dates and navigation:** edit or clear an event date in card details; timeline entries locate and open the correct page inside a card bundle.

Existing profiles and databases are retained without migration. Builds remain unsigned and not notarized. DeepSeek web-search adaptation is outside this release.
