# AI Research Board macOS 免安装版 V1.3

## 下载选择

- Apple Silicon：选择文件名中带 `arm64` 的 ZIP，适用于 M1、M2、M3、M4 及后续 Apple 芯片。
- Intel：选择文件名中带 `x64` 的 ZIP，适用于 Intel 处理器 Mac。

## 使用方法

1. 完整解压 ZIP。
2. 打开其中的 `AI Research Board.app`。
3. 可以直接运行，也可以把应用拖入“应用程序”文件夹。

此构建不写入系统级组件，不需要安装程序。项目数据库保存在当前 macOS 用户的应用数据目录，API 密钥通过 macOS 系统安全存储保护。

## 首次打开

当前测试版没有 Apple Developer ID 签名和公证。macOS 如果阻止首次打开：

1. 按住 Control 点击 `AI Research Board.app`。
2. 选择“打开”。
3. 在确认窗口中再次选择“打开”。

或者进入“系统设置 → 隐私与安全性”，在安全提示旁选择“仍要打开”。不要关闭整个系统的 Gatekeeper。

## 功能范围

macOS 版与 Windows V1.3 使用同一套项目、来源发现、API、自动检查、多语言、更新批次、重要锁定、变化冲突中心、核心信息提取、关键图片、卡片缩放和卡包功能。Windows 与 macOS 的数据目录不同，不会自动同步；如需迁移，可在设置中创建数据库备份后手动复制。

## 发布限制

- 当前产物未在真实 Mac 上完成启动测试。
- 当前产物未签名、未公证，因此不适合直接面向不受控用户公开分发。
- 当前 ZIP 使用官方 macOS Electron 运行时在 Windows 构建机上进行结构化封装，并验证了 Mach-O 架构、Unix 执行权限、框架符号链接、应用版本和内置 WASM；但这些检查不能替代真实 Mac 启动测试。
- 正式发布应在 macOS 构建机上重新构建，并使用 Apple Developer ID 完成签名与公证。
