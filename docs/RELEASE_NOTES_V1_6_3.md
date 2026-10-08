# OpenResearch 1.6.3

## 简体中文

修补自启动开关一直空框、状态不明确的问题。

- 开关下始终显示“未开启”“正在开启”“已开启”“正在关闭”、系统审批或读取失败状态。保存由系统读回确认，失败时显示具体原因与“重新读取”；无法读回时不会沿用过期的开启状态。
- 侧栏与设置页同步。保存期间关闭设置窗口，侧栏仍会重新读取结果。系统审批显示半选状态，点击可取消请求，不误报为已开启。
- Windows 开发启动方式在完整构建后也能设置自启动。登录项包含当前程序、明确的项目路径及登录启动标记；登录启动使用构建后的本地界面，不依赖预览服务器或项目工作目录。
- 构建是否就绪会重新检测；缺少构建、网页预览或不支持的平台会明确说明。开发方式需保留项目目录及依赖，普通使用建议安装正式版。Mac 开发启动方式仍不注册通用 Electron 程序。

排查时发现当前运行的是开发版，旧逻辑将其开关禁用，而且成功的开启/关闭操作没有文字反馈。当前用户的 OpenResearch 登录项当时不存在。此次没有替用户开启正式自启动。

验证：275项自动测试、代码检查、类型检查与构建通过。使用隔离登录项，从系统目录执行真实 Windows 登录命令，验证本地界面启动、开启/关闭、写入失败与重试、侧栏/设置同步；验证项已移除，未重启用户电脑。Mac 登录启动未实机验证，安装包未签名或公证。

## English

Fix ambiguous empty launch-at-login checkboxes and missing feedback.

- Always show disabled, enabling, enabled, disabling, approval, or read-failure status. Read the OS back after writes; show errors and a retry action. Failed reads do not retain a stale enabled indication.
- Sidebar and Settings stay synchronized, including when Settings closes before a write finishes. Pending OS approval is mixed, not enabled, and can be canceled.
- Compiled Windows development launches can register a complete command with the app path and login marker. Login uses the built local renderer, independent of Vite or the project working directory.
- Build availability is checked again on reads. Browser previews, missing builds, and unsupported platforms explain their limitations. Development registration requires keeping the project and dependencies; installers are recommended for regular use. Unpackaged macOS does not register the generic Electron executable.

The inspected app was running in development mode, where the old switch was disabled. Its current-user OpenResearch login entry did not exist. The user's real startup preference was not enabled automatically.

Validation: 275 tests, lint, type checks, and builds passed. An isolated Windows login item launched the real compiled app from a system directory and exercised enable/disable, failure/retry, and both controls. The entry was removed and the computer was not restarted. Physical macOS login was not tested; installers remain unsigned/not notarized.
