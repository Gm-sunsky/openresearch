# OpenResearch 1.6.4

## 简体中文

- 更新节点导航固定在白板可见区域左侧的垂直中间位置，独立于画布滚动，上下或左右滚动画布都不带动导航。
- 节点按真实更新时间从旧到新排列：较老节点在上，最新节点在下，“最新”标记保留在最下方的最新批次上。
- 移除节点圆点之间的连接直线，保留时间文字、当前批次高亮和点击跳转。
- 白板工具栏与画布滚动区分开，保持操作入口可见。小窗口或节点很多时，导航内部可独立滚动；既有卡片位置和批次排列不改动。

277项测试、代码检查、类型检查与构建通过。真实 Electron 验证覆盖深浅色、双轴滚动位置不变、垂直居中、旧上新下、节点点击、小窗口和多节点容量；卡包滚轮、完整资料与中文输入也已回归。Mac 安装未实机验证；安装包未签名或公证。

## English

- Update navigation is anchored to the vertical center of the visible board's left edge, independently of both canvas scroll axes.
- Nodes use oldest-first chronological order, with newer updates below older ones and the Latest label on the newest last node.
- Remove the connecting line while retaining dates, active-batch highlighting, and click navigation.
- Separate the fixed toolbar from the canvas scroller. Narrow windows and long node lists support independent navigation scrolling. Existing card coordinates and canvas batch arrangements remain unchanged.

All 277 tests, lint, type checks, and builds passed. Native Electron checks cover both themes, stable position across both scroll axes, centering, chronological order, mouse navigation, small windows, and long node lists. Pack wheel handling, full materials, and Chinese input were also checked. Physical macOS installation was not tested; installers remain unsigned/not notarized.
