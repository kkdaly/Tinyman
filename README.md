# Tinyman / AI Agent 平台

> **花一天搭起来，花一周调 prompt，然后它就跑好几个月。**
>
> Build it in a day. Tune it for a week. It runs for months.
>
> 一套通用 AI Agent 基础设施。不依赖 RAG、不依赖编排框架、不依赖向量数据库。生产验证过——已在实际业务中稳定运行数月，每天处理大量技术问题，人工介入率极低。
>
> A production-proven, general-purpose AI agent infrastructure. **No RAG. No orchestration frameworks. No vector databases.** Just tmux + bash + prompts. Battle-tested in production for months with minimal human escalation.

## 为什么选这个 / Why This

| 你可能会想用... | 但这个项目... |
|----------------|-------------|
| LangChain / Dify / Coze | 太重，要 Python、要 Docker、要配置平台 |
| 自建 RAG 方案 | 数据维护成本高，检索噪声大，幻觉来源多 |
| 买商业 SaaS 平台 | 贵、不灵活、和你的代码仓库脱节 |
| 自己从零写 | 这个项目已经踩完了所有坑 |

**核心哲学：prompt 是最好的代码。** 改场景不改代码，改身份不改变架构。一份知识库 + 一套 prompt = 一个新 Agent。

**Core philosophy: prompts > code.** Switch from Q&A to code review to personal assistant without touching a line of shell. One knowledge base + one set of prompts = one new agent.

## 这是什么 / What It Does

把多个 AI Agent 作为常驻 tmux 会话运行。消息（飞书、Slack、webhook 等）落入目录，watcher 唤醒 gateway agent，gateway 智能判断后自己回答或委托给后台专业 agent，通过文件传递任务。

Runs multiple AI agents as long-lived tmux sessions. Messages land in a directory, a watcher wakes the gateway agent, which intelligently routes tasks to specialist agents via file-based IPC.

```
消息/Message → messages/ → msg-watcher → gateway-agent (AI 路由/dispatcher)
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              直接回复/Direct            code-analyzer              code-review
              查知识库+代码              深度代码分析               PR 审查
                                        deploy-monitor            (可扩展/extensible)
                                        发布巡检
```

## 快速开始 / Quick Start

### 1. 装依赖 / Install

```bash
brew install tmux          # macOS
sudo apt install tmux      # Linux
npm install -g @anthropic-ai/claude-code   # 或 codex/trae
```

### 2. 一键部署 / Deploy

```bash
git clone https://github.com/kkdaly/Tinyman.git
cd Tinyman
./scripts/deploy.sh
```

部署完成后去飞书给 Bot 发第一条消息，Bot 会自动问你"想让我做什么"，一句回答完成配置。 / After deploy, send the first message to your bot — it automatically asks what type of agent you need. One reply completes setup.

### 3. 绑定飞书 Bot / Bind Lark Bot

**创建飞书应用：**

1. 打开 [飞书开放平台](https://open.feishu.cn) → 创建企业自建应用
2. **添加能力** → 开启"机器人" / Enable "Bot"
3. **权限管理** → 添加 `im:message`、`im:message:send_as_bot`、`im:message.group_at_msg`
4. **事件订阅** → 订阅 `接收消息` / `im.message.receive_v1`
5. **发布上线** → 创建版本并发布（需管理员审批）

**启动订阅：**

```bash
lark-cli config init
lark-cli auth login --recommend
lark-cli event +subscribe --output-dir ./messages/
```

### 其他 IM / Other IM

任何能把消息写入 `messages/` 的机制都能用：webhook、MQ consumer、定时任务、IM SDK。回复命令在 `agents/gateway-agent/AGENTS.md` 中改。

Any mechanism that writes to `messages/` works. Switch the reply command in `agents/gateway-agent/AGENTS.md` for your platform.

## 切换 Harness / Switch Harness

```bash
HARNESS=codex ./scripts/deploy.sh     # Codex CLI
HARNESS=trae ./scripts/deploy.sh      # Trae CLI
HARNESS=openclaw ./scripts/deploy.sh  # OpenClaw
# 默认 Claude Code / Defaults to Claude Code
```

详见 / See `scripts/HARNESS.md`.

## 架构 / Architecture

| 层/Layer | 做什么/What | 怎么做/How |
|-----------|-------------|------------|
| 调度/Scheduling | tmux 会话 | 5 个常驻 session，每个 agent 一个 |
| 事件/Event loop | bash watcher | 轮询 `messages/` 和 `tasks/`，agent 空闲时唤醒 |
| 路由/Routing | AI 判断 | Gateway 读消息，判断：自己答还是委托 |
| 通信/IPC | JSON 文件 | `tasks/{type}-req-{id}.json` → `tasks/{type}-res-{id}.json` |
| 监控/Supervision | supervisor.sh | 60s 巡检：session 存活、未卡死、未循环 |

## 内置 Agent / Built-in Agents

| Agent | Session | 触发/Trigger | 职责/Role |
|-------|---------|-------------|-----------|
| Gateway | `gateway-agent` | msg-watcher | 消息入口，AI 路由 / Message entry, dispatcher |
| Code Analyzer | `code-analyzer` | code-watcher | 深度代码分析 / Deep code analysis |
| Code Review | `code-review-agent` | review-watcher | PR 审查 / PR review |
| Deploy Monitor | `deploy-monitor` | deploy-watcher | 发布巡检 / Release inspection |
| Supervisor | `supervisor` | 定时循环 | 健康监控 / Health monitoring |

## 可扩展场景 / Extensible Scenarios

改 prompt 就能切换，不写代码：

| 场景 | 消息来源 | 做什么 |
|------|---------|--------|
| 技术问答 | IM 群聊 / 私聊 | 查知识库+代码，自动回复用户问题 |
| 代码审查 | Git webhook → `messages/` | 读 diff，输出 blocker/suggestion |
| 发布巡检 | CI/CD webhook → `messages/` | 检查构建日志，判断是否安全上线 |
| 编译排障 | 用户贴构建日志 | 匹配错误模式，给出修复建议 |
| 私人助理 | 个人 IM | 记住偏好，定时查询，执行重复任务 |
| 客服机器人 | 多渠道 → `messages/` | FAQ 匹配，复杂问题升级人工 |
| 每日报告 | Cron 任务写 `messages/` | 读 git log/指标，生成日报发群 |

消息流：Webhook / IM SDK / Cron / MQ / 数据库 → `messages/` → Agent 处理

## 单用户 vs 多用户 / Single vs Multi-User

**单用户（当前默认）：** 一个 gateway-agent session 处理所有消息。上下文会自然关联同一用户的连续对话。适合团队内部使用（几十人）。

**多用户 / 对外：**
```
         Webhook
            │
      ┌─────┴─────┐
      ▼           ▼
   MQ / Queue   用户分片
      │           │
      ▼           ▼
  gateway-1   gateway-2   ...    ← 每个用户/群独立的 tmux session
      │           │
      └─────┬─────┘
            ▼
      共享 specialist       ← code-analyzer 等可复用
```

多用户部署额外需要：
- 按 `open_id` 或 `chat_id` 路由消息到独立 session，避免上下文混杂
- 不同 session 用不同的 worklog 目录
- 共享 specialist agent（code-analyzer 等）可复用，省钱

详见 `scripts/HARNESS.md` 中的扩展方案。

## 定制 / Customize

1. **换场景 / Change scenario** — 编辑 `agents/gateway-agent/IDENTITY.md`（身份）和 `AGENTS.md`（操作）
2. **加 Agent / Add agent** — 在 `agents/<name>/` 下创建 IDENTITY.md + AGENTS.md，deploy.sh 加 session 和 watcher
3. **填知识库 / Fill knowledge** — 编辑 `knowledge-base/` 写项目文档
4. **关联代码 / Link code** — `ln -s /your/repo repos/` 让 agent 能读源码
5. **换 IM / Switch IM** — 改 `agents/gateway-agent/AGENTS.md` 中的回复命令

## 项目结构 / Project Structure

```
.
├── README.md
├── CONVENTIONS.md                ← Agent 底座 prompt
├── AGENTS.md                     ← AI 指令
├── .env.example                  ← 配置模板
├── agents/                       ← Agent 身份(IDENTITY.md) + 操作(AGENTS.md)
├── knowledge-base/               ← 项目知识库
├── scripts/
│   ├── deploy.sh                 ← 一键部署
│   ├── harness-presets.sh        ← Harness 预设
│   ├── *-watcher.sh              ← 消息 + 任务唤醒
│   └── supervisor.sh             ← 健康监控
├── repos/                        ← 代码仓库 symlink
├── messages/                     ← IM 消息落地
├── tasks/                        ← Agent 间任务传递
└── worklogs/                     ← 问答记录
```

## 亮点 / Highlights

- **一条命令部署。** `./scripts/deploy.sh`，剩下的自动搞定。依赖检查、条款接受、session 创建、身份注入全自动。
- **不绑任何模型。** 默认 Claude Code，`HARNESS=codex` 就切 Codex，加 3 行配置支持任意 CLI 工具。
- **多 Agent 真协同。** 不是 demo 级——5 个 Agent 各自独立 session，文件级 IPC，互不干扰，可随时 attach 进去看它在想什么。
- **安全内置。** 三层防线：防 prompt 注入、禁止危险命令、禁止泄露敏感信息。配置只能管理员 tmux 直连改。
- **上下文持久。** tmux 长驻，不需要每轮请求重建上下文。lambda/webhook 模式的天生劣势，这里不存在。
- **生产验证。** 真实业务场景稳定运行数月，ROI "团队成立以来最高"。

> Daily deployment. No lock-in. Real multi-agent IPC. Built-in security. Persistent context. Production-proven.

## 谁适合用 / Who Is This For

- 想用 AI 接管技术问答、但不想买商业平台的团队
- 想做代码审查 / 发布巡检 / 编译排障自动化的人
- 需要一个不依赖任何框架、完全可控的 AI Agent 底座的开发者
- 被 LangChain/Dify/Coze 的复杂度劝退、想回归极简的人

## License

MIT
