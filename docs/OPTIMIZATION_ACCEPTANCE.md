# 软件优化验收记录

验收日期：2026-10-04。项目版本：1.5.2 源码工作区。

## 目标与证据

| 目标 | 已实现行为 | 验证证据 |
| --- | --- | --- |
| 接近 Agent 的信息整理 | 保留更完整原文，按对象和关注项检索，跨来源一次综合；严格核验来源索引、对象、任务和覆盖；事实不足明确说明 | `ai-client` 52、`research-skill` 8、`research-workflow` 11、`feed-agent` 9 项回归；本地质量用例覆盖真实核心时间、依据、背景与无关信息排除 |
| 显著加速搜索整理 | 直接读取、账号搜索和研究矩阵并行；公开搜索/探测最多4并发；保持结果次序和工作量；同项目重复发现复用正在运行任务 | 12次搜索+12次验证：600→150ms；8网页+17账号+矩阵共26条证据：660→120ms，综合仍仅调用一次 |
| 项目独立、只更新选中项目 | 勾选与查看分离；手动入口拒绝未选项目；调度只处理选中且启用项目；跨项目异步响应隔离 | `project-ui` 11 项真实DOM交互；存储重启/迁移、IPC、调度回归；实际Electron记录见 `verification/project-ui.json` |
| 原图比例完整显示 | 使用自然尺寸和contain适配；小卡保留图片；换图/失败独立恢复 | 4项尺寸+2项组件回归；六种图片实际渲染全部完整且不越界，见 `verification/image-fit.json` / `image-fit.png` |
| 信息需求层级 | 创建/设置可选核心事实、相关背景、深入关联；贯穿检索、AI正常/修复/本地重建与无AI降级；新卡片尺寸随层级变化 | 本地12项回归：低档只保留时间，中档增加有依据原因/同期事项，高档再介绍关联事项；正文预算与12/16对象覆盖、长名称不混淆均通过 |

## 最终验证

- `npm run lint`：通过，无警告。
- `npm run build`：通过，包括前后端类型检查、22个文件共166项测试、Vite生产构建、Electron编译。
- `node node_modules/electron/cli.js scripts/verify-images.cjs`：通过，6/6图片可见、contain、位于图片框和卡片内，控制台错误0。
- `node node_modules/electron/cli.js scripts/verify-project-ui.cjs`：通过；创建深入项目、仅勾选新项目、查看另一个项目时更新、仅勾选项目任务历史变化、改为核心层级保存。
- 上述界面验收脚本需先启动 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178`。
- 图片视觉检查95分通过，记录在 `.omx/state/research-optimization/ralph-progress.json`。

## 主要文件与简化

- `electron/main/feed-service.ts`：受限并发、完整证据保留、本地层级、完整对象覆盖及任务异常收尾。
- `electron/main/source-discovery.ts` / `concurrency.ts`：公共搜索和链接验证并发、稳定次序、重复发现复用。
- `electron/main/ai-client.ts` / `research-workflow.ts` / `research-skill.ts`：统一层级策略和引用校验；删除重复来源分类分支。
- `electron/main/database.ts` / `ipc.ts` / `scheduler.ts` / `electron/preload/index.ts`：选择保存、旧数据迁移、后台范围隔离；修复sql.js导出后外键关闭，避免已删除项目被在途任务重新写入。
- `src/shared/contracts.ts` / `information-depth.ts`：共享层级与接口，避免前后端采用不同策略。
- `src/App.tsx` / `src/api.ts`：逐项目运行状态、异步回写隔离、选择保存及浏览器预览一致性。
- `src/components/ProjectSidebar.tsx` / `CreateProjectDialog.tsx` / `ProjectSettingsDialog.tsx`：独立勾选与层级设置。
- `src/components/ResearchCard.tsx` / `src/lib/card-resize.ts` / `src/styles.css`：自然尺寸适配，移除cover裁剪和小卡隐藏图片规则。
- `tests/`：补充性能、选择隔离、图片生命周期、层级语义与证据质量回归。
- `scripts/qa/`、两个`verify-*.cjs`脚本、`docs/verification/`：可复现界面检查与截图。

## 使用与边界

- 先在侧栏勾选更新项目；点击名称只查看，不改变更新范围。勾选同时用于定时更新；暂停的项目不参加定时更新。
- 新项目及旧版迁移项目默认未勾选。修改层级从下一次更新生效；历史卡片内容保留。
- 三档正文预算约480/1100/2200字；多对象长名称时优先完整核心覆盖，来源、截止时间等必要说明另外保留。
- 4倍和5.5倍为相同工作量的固定网络延迟基准，未将其宣称为外部网络/模型服务的实际端到端速度。
- AI回归使用可重复响应，实际外部模型的表达质量和延迟取决于用户的API配置。未以人工Agent的主观评分作无条件等价保证。
- 构建产物已更新至`dist/`和`dist-electron/`；本轮未重新生成安装包。工作区没有Git元数据，源码基线保存在`tmp/optimization-baseline/`。
