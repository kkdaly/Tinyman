# Tinyman / AI Agent 平台

> **花一天搭起来，花一周调 prompt，然后它就跑好几个月。**
>
> Build it in a day. Tune it for a week. It runs for months.

一套通用 AI Agent 基础设施。**不依赖 RAG、不依赖编排框架、不依赖向量数据库。** 生产验证过——在实际业务中稳定运行数月，人工介入率极低。

A production-proven, general-purpose AI agent infrastructure. **No RAG. No orchestration frameworks. No vector databases.** Just tmux + Node.js + prompts. Cross-platform (macOS/Linux/Windows). Battle-tested in production for months.

## 为什么选这个 / Why This

| 你可能会想用... | 但这个项目... |
|----------------|-------------|
| LangChain / Dify / Coze | 太重，要 Python、要 Docker、要配置平台 |
| 自建 RAG 方案 | 数据维护成本高，检索噪声大，幻觉来源多 |
| 买商业 SaaS 平台 | 贵、不灵活、和你的代码仓库脱节 |
| 自己从零写 | 这个项目已经踩完了所有坑 |

**核心哲学：prompt 是最好的代码。** 改场景不改代码，改身份不改变架构。一份配置 + 一套 prompt = 一个新 Agent。

**Core philosophy: prompts > code.** One config file + one prompt = one new agent. Switch from Q&A to code review to security audit without touching JavaScript.

## 这是什么 / What It Does

多个 AI Agent 作为常驻 tmux 会话运行。消息落入目录 → watcher 唤醒 gateway agent → gateway AI 判断后自己回答或委托给后台专业 agent → 通过 JSON 文件传递任务。

Runs multiple AI agents as long-lived tmux sessions. Messages land in a directory → watcher wakes the gateway → AI routes to specialist agents via file-based IPC.

```
消息/Message → messages/ → watcher.js → gateway-agent (AI 路由/dispatcher)
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              直接回复/Direct            code-analyzer              code-review
              查知识库+代码              深度代码分析               PR 审查
                                        deploy-monitor            (可扩展/extensible)
                                        发布巡检
```

## 快速开始 / Quick Start

| 步骤 | 做什么 | 时间 |
|------|--------|------|
| 1. 装依赖 | `brew install tmux` + `npm install -g claude-code` | 5 min |
| 2. API Key | `export ANTHROPIC_API_KEY=sk-xxx` | 1 min |
| 3. 部署 | `node scripts/deploy.js` 一条命令 | 1 min |
| 4. 绑飞书 | 创建应用 → 启动订阅 | 5 min |
| 5. 发消息 | 给 Bot 发第一条消息，自动配置完成 | 1 min |

### 第 1 步：装依赖 / Install

```bash
# macOS
brew install tmux

# Linux
sudo apt install tmux

# Windows
# 下载 itmux (https://github.com/...)，解压即用，内置 tmux

# AI CLI（选一个）
npm install -g @anthropic-ai/claude-code   # Claude Code（推荐）
```

### 第 2 步：配置 / Configure

```bash
# Claude Code 需要环境变量
export ANTHROPIC_API_KEY=sk-xxx
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic  # 如用中转

# 编辑 tinyman.config.json，填项目信息、选择 harness
```

### 第 3 步：部署 / Deploy

```bash
git clone https://github.com/kkdaly/Tinyman.git
cd Tinyman
node scripts/deploy.js
```

看到 "部署完成" 即成功。自动完成：依赖检查、条款接受、session 创建、身份注入、watcher 启动。

### 第 4 步：绑定飞书 / Bind Lark

1. [飞书开放平台](https://open.feishu.cn) → 创建企业自建应用
2. 开启机器人 → 添加权限 `im:message`、`im:message:send_as_bot`、`im:message.group_at_msg`
3. 订阅事件 `im.message.receive_v1` → 发布上线

```bash
lark-cli config init          # 输入 App ID + Secret
lark-cli auth login --recommend
lark-cli event +subscribe --output-dir ./messages/
```

任何能把消息写入 `messages/` 的机制都能用：webhook、MQ consumer、定时任务、IM SDK。

### 第 5 步：发消息 / Send Message

在飞书找到 Bot，发第一条消息。Bot 自动启动配置向导，一句话完成设置。

## 管理 Agent / Manage Agents

```bash
node scripts/agent.js --list              # 列出所有 agent
node scripts/agent.js --add               # 交互式新增 agent
node scripts/agent.js --edit <session>    # 修改 agent 配置
node scripts/agent.js --remove <session>  # 删除 agent
```

或直接编辑 `tinyman.config.json` 的 `agents` 数组，重新部署即可。

## 切换 Harness / Switch Harness

```bash
node scripts/deploy.js --harness codex     # Codex CLI
node scripts/deploy.js --harness trae      # Trae CLI
node scripts/deploy.js --harness openclaw  # OpenClaw
# 默认 Claude Code
```

自定义 harness：编辑 `scripts/harness-presets.js` 加一项。详见 `scripts/HARNESS.md`。

## 架构 / Architecture

| 层/Layer | 做什么/What | 怎么做/How |
|-----------|-------------|------------|
| 调度/Scheduling | tmux 会话 | 5 个常驻 session，每个 agent 一个 |
| 事件/Event loop | Node.js watcher | 轮询目录 → 检测 agent 空闲 → 唤醒 |
| 路由/Routing | AI 判断 | Gateway 读 agent 描述，判断自己答还是委托 |
| 通信/IPC | JSON 文件 | `tasks/{identity}-req-{id}.json` → `tasks/{identity}-res-{id}.json` |
| 监控/Supervision | supervisor.js | 60s 巡检：session 存活、卡死检测、循环检测、消息积压 |

## 内置 Agent / Built-in Agents

| Agent | Session | 触发 | 职责 |
|-------|---------|------|------|
| Gateway | `gateway-agent` | watcher.js | 消息入口，AI 智能路由 |
| Code Analyzer | `code-analyzer` | watcher.js | 深度代码分析，调用链追踪 |
| Code Review | `code-review-agent` | watcher.js | PR 审查，输出 blocker/suggestion |
| Deploy Monitor | `deploy-monitor` | watcher.js | 发布巡检，判断上线安全 |
| Supervisor | `supervisor` | 定时循环 | 健康监控，异常告警 |

## 定制 / Customize

1. **改 Agent 身份** — 编辑 `agents/<name>/IDENTITY.md` + `AGENTS.md`
2. **加新 Agent** — `node scripts/agent.js --add` 或编辑 `tinyman.config.json`
3. **填知识库** — 编辑 `knowledge-base/` 写项目文档（只写"为什么"和"踩过的坑"）
4. **关联代码** — `ln -s /your/repo repos/` 让 agent 能读源码
5. **换 IM** — 改 `agents/gateway-agent/AGENTS.md` 中的回复命令
6. **切换 Harness** — `node scripts/deploy.js --harness codex`

## 项目结构 / Project Structure

```
.
├── README.md
├── tinyman.config.json            ← 配置文件（agent 列表、目录、harness）
├── CONVENTIONS.md                 ← Agent 共享底座 prompt
├── AGENTS.md                      ← AI 指令总览
├── agents/                        ← 各 agent 身份 + 操作指令
├── knowledge-base/                ← 项目知识库
├── scripts/
│   ├── deploy.js                  ← 一键部署
│   ├── agent.js                   ← 交互式 agent 管理
│   ├── watcher.js                 ← 通用消息/任务唤醒
│   ├── supervisor.js              ← 健康监控
│   ├── harness-presets.js         ← Harness 预设
│   ├── lib/
│   │   ├── tmux-utils.js          ← tmux 交互
│   │   ├── config.js              ← 配置加载 + 校验
│   │   └── cli-args.js            ← CLI 参数解析
│   ├── HARNESS.md                 ← Harness 切换指南
│   └── im-setup.md                ← IM 部署教程
├── repos/                         ← 代码仓库 symlink
├── messages/                      ← IM 消息落地
├── tasks/                         ← Agent 间任务传递
└── worklogs/                      ← 问答记录
```

## 亮点 / Highlights

- **一条命令部署。** `node scripts/deploy.js`，依赖检查、条款接受、session 创建、身份注入全自动。
- **不绑任何模型。** 默认 Claude Code，`--harness codex` 切 Codex，3 行配置支持任意 CLI。
- **多 Agent 真协同。** 独立 session，文件级 IPC，互不干扰，随时 tmux attach 查看。
- **配置驱动。** 新增 agent 改 JSON 就行，不改代码。交互式 CLI 容错。
- **安全内置。** 防 prompt 注入、禁止危险命令、禁止泄露敏感信息。
- **上下文持久。** tmux 长驻，不需要每轮重建上下文。
- **跨平台。** macOS/Linux 原生 tmux，Windows 用 itmux。
- **生产验证。** 真实业务场景稳定运行数月。

## 谁适合用 / Who Is This For

- 想用 AI 接管技术问答、但不想买商业平台的团队
- 想做代码审查 / 发布巡检 / 编译排障自动化的人
- 需要一个不依赖任何框架、完全可控的 AI Agent 底座的开发者
- 被 LangChain/Dify/Coze 的复杂度劝退、想回归极简的人

## License

MIT
