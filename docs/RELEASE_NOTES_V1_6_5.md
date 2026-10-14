# OpenResearch 1.6.5

## 简体中文

- 未确认信息显示“未知”；混合结果保留有效事实和冲突。旧版自动整理的固定缺证据文案在读取时精简，保留数据库原文和手写笔记。
- 网页、RSS 和来源探测的 GET/HEAD 请求增加有限重试，每次尝试使用新超时信号，正文读取也纳入超时。中断和超时显示清晰原因；付费模型 POST 不自动重试。
- 官方 DeepSeek 配置使用同一密钥与模型调用 Anthropic 兼容服务端搜索，普通 Chat/Responses 配置保持不变。只有实际工具返回的链接可作为搜索证据；支持搜索续接和受限格式修复。
- 自启动状态文字更醒目，提供重新读取入口，系统未应用设置时明确报错。

302 项测试、代码检查、类型检查与构建通过；深浅色完整资料窗口已实测。真实 DeepSeek 联网及搜索型来源更新已验证；Windows 自启动使用独立测试项验证，未改动现有偏好。搜索可产生额外模型 Token 费用；服务故障或未收录内容仍可能返回未知。macOS 安装尚未实机验证，安装包未签名或公证。

DeepSeek 官方依据：[Responses 兼容能力](https://api-docs.deepseek.com/zh-cn/guides/responses_api/)、[Anthropic 兼容接口](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api/)、[原生搜索说明](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/claude_code/)。

## English

- Show Unknown for missing evidence while retaining established facts and conflicting reports. Compact legacy generated boilerplate on read without rewriting stored text or hand-written notes.
- Retry interrupted GET/HEAD source reads with fresh per-attempt deadlines covering the response body. Explain timeouts clearly. Billable model POST requests are not automatically retried.
- Official DeepSeek configurations use the same key/model on its Anthropic-compatible server search endpoint, independently of the regular Chat/Responses protocol. Accept only tool-backed URLs, with bounded search continuation and format repair.
- Make launch-at-login status readable, offer explicit refresh, and report unapplied system changes.

All 302 tests, lint, type checks, and builds passed. Native reader checks covered both themes. Real DeepSeek search and monitored-source updates were verified. Native Windows login-item checks used an isolated test entry without changing the user's preference. Search may incur extra model token costs; unavailable services and unindexed content may still yield Unknown. Physical macOS installation was not tested; installers remain unsigned/not notarized.

Official references: [Responses compatibility](https://api-docs.deepseek.com/guides/responses_api/), [Anthropic compatibility](https://api-docs.deepseek.com/guides/anthropic_api/), [native search](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/).
