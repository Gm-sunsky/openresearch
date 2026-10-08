# OpenResearch 1.5.7

## 简体中文

- **开机自启动**：设置 → 自动化 → 开机自启动。开关立即读写系统登录项，与 API 配置独立；读取系统实际状态，包括 Windows 系统设置中的禁用状态。默认不自动开启，开发版和网页预览不能注册自启动。
- **项目自动更新**：侧栏勾选更新项目，在项目设置中选择每小时、每天或每周。只处理已勾选且未暂停的项目；按最近一次更新尝试计时，手动更新和失败尝试也会重置计时。每分钟检查到期项目，软件启动约5秒后及休眠恢复时补查；不会重复补跑所有错过的周期。
- **完整更新流程**：信息源读取、主动研究搜索、整理与新卡片保存共用手动更新流程。没有已保存来源的项目也会执行研究检索；后台完成后当前白板和任务记录自动刷新。多个实例不会重复启动后台调度。
- **设置窗口**：限制窗口高度，内容可滚动，标题和底部保存按钮在较小屏幕上仍可见。

软件必须运行才能自动更新；Windows 关闭最后一个窗口会退出软件，macOS 关闭窗口后按系统惯例继续运行，使用“退出”后停止。开机自启动在用户登录系统后启动应用，不是未登录时的系统服务。暂停或取消勾选项目会停止后续自动任务，不取消已经在网络中执行的任务。

验证：261项自动测试、代码与类型检查、完整构建通过；桌面设置窗口在标准及最小尺寸下验证通过。

Windows 已使用独立验证项实际测试系统登录项的开启、读取及移除，并立即清理验证项。没有替用户开启正式自启动，也没有重启用户电脑。三档频率通过真实数据库及采集服务、模拟时间验证；无须等待一整周。macOS 原生安装及重启登录未实机验证；安装包未签名或公证，系统可能要求登录项批准，若系统未应用会明确提示失败，详见 [Electron 登录项文档](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)。

## English

- **Launch at login:** Settings → Automation → Launch at login. The switch saves immediately and independently of API configuration. The OS is authoritative, including Windows startup disabling. Startup is not enabled automatically; development and browser preview builds cannot register it.
- **Project scheduling:** select active projects in the sidebar and choose hourly, daily, or weekly in project settings. Scheduling uses the latest update attempt, including manual or failed attempts. Due projects are checked every minute, about five seconds after startup, and after wake. Missed periods produce one catch-up update, not repeated historical runs.
- **Complete updates:** automatic runs reuse source collection, proactive research, synthesis, and card persistence. Sourceless projects can still search. Completion refreshes the board and task history. A single-instance lock prevents duplicate app schedulers.
- **Settings layout:** the body scrolls while the header and save actions remain visible at small window sizes.

Automatic updates require the app to be running. Closing the last Windows window quits; macOS follows its usual background-running behavior until Quit. Launch at login runs after signing into the OS, not as a pre-login system service. Pausing or deselecting prevents future work but does not cancel network work already in progress.

Validation: all 261 automated tests, lint, type checks, builds, and native settings UI checks passed.

Windows native registration/read/removal was verified with an isolated test entry and cleaned up immediately. The user's real startup preference was not enabled and the computer was not restarted. Real database/feed integration with simulated time validates all three frequencies. Physical macOS installation and login were not tested. Installers remain unsigned/not notarized; approval may be required, and failure to apply is reported rather than silently accepted. See [Electron login-item documentation](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows).
