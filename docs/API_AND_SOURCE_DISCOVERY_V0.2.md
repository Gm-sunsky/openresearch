# API 与来源发现设计 V0.2

## 目标

来源发现 Agent 负责为每个信息项目主动寻找长期稳定、可验证的信息入口。它不会直接信任模型输出，也不会在默认设置下自动订阅来源。

每次发现都以当前项目 ID、名称、目标和关注范围作为唯一上下文，并替换该项目上一次尚未处理的候选，避免项目之间或多次运行之间残留旧主题。

流程如下：

```text
项目目标
  → 检查现有网页声明的 RSS/Atom
  → 调用 AI 搜索候选来源
  → 校验返回 JSON 与 URL
  → 阻止本机、私有网络和危险重定向
  → 探测来源是否可访问
  → 保存为待确认候选
  → 用户接受后写入 sources 并生成来源卡片
```

## 桌面 API

React 界面只能通过 preload 暴露的白名单接口访问主进程：

```ts
discovery.list(projectId)
discovery.run(projectId)
discovery.accept({ projectId, candidateIds })
discovery.dismiss(candidateId)

settings.get()
settings.save(input)
settings.test(input)
```

`settings.get()` 只返回 `apiKeyConfigured` 和末四位提示，不返回密钥。密钥由 Electron 主进程调用 Windows 安全存储加密后保存到 SQLite。

## AI Provider

支持两种配置：

- OpenAI：固定使用 `https://api.openai.com/v1` 与 Responses API；来源发现启用 `web_search` 工具。
- OpenAI-compatible：可配置 HTTPS 地址，或使用 `localhost` 的 HTTP 地址；支持 Responses 与 Chat Completions 协议。

请求默认包含随机 `X-Client-Request-Id`，便于排查请求；错误信息经过裁剪后才返回界面。
桌面版通过 Electron `net.fetch` 使用 Chromium 网络栈发送请求，以继承 Windows 系统代理和 PAC 配置；连接失败时会返回可操作的网络或代理提示。

## 候选来源数据

`source_candidates` 与正式 `sources` 分表保存。主要字段：

```ts
{
  type: "rss" | "web";
  name: string;
  url: string;
  rationale: string;
  confidence: number;
  verified: boolean;
  discoveredBy: "ai" | "page";
  status: "pending" | "accepted" | "dismissed";
}
```

默认仅生成候选。只有用户点击“添加来源”，或明确开启“自动添加高可信来源”后，候选才会转为正式来源。

## 安全边界

- 模型输出按不可信输入处理，只接受有限字段与最多 12 个候选。
- 自动访问前解析 DNS，拒绝 localhost、环回、链路本地和私有网络地址。
- 重定向逐跳校验，最多三次。
- 清理追踪参数、URL 片段和多余斜线后再去重。
- OpenAI API 密钥不进入 React 状态、preload 返回值或日志。
- 远程兼容 API 必须使用 HTTPS；只有本机模型允许 HTTP。
