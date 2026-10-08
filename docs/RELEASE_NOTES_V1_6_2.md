# OpenResearch 1.6.2

## 简体中文

修复白板滚动时左侧更新节点（例如“最新”）覆盖顶部工具栏的问题。节点现在位于工具栏下方，滚到工具栏区域后被遮住；工具栏也阻挡对隐藏节点的误点击。工具栏下方可见的节点仍能正常跳转。

真实 Electron 验证覆盖深浅色遮挡、工具栏空白区域的点击层级以及可见节点的鼠标点击。264项测试、代码检查、类型检查与构建通过。安装包仍未签名或 Apple 公证；Mac 安装未实机验证。

## English

Fix update-navigation labels, such as “Latest,” drawing over the sticky board toolbar. The navigation now sits below the toolbar and is covered when scrolled beneath it. The toolbar also intercepts clicks over hidden nodes. Visible nodes below the toolbar retain normal navigation.

Native Electron checks cover both themes, toolbar padding hit-testing, and mouse navigation. All 264 tests, lint, type checks, and builds passed. Installers remain unsigned/not notarized; physical macOS installation has not been tested.
