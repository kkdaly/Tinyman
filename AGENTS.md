# AI Agent 基础设施项目

## 项目是什么

这是一套**通用 AI Agent 基础设施**——通过 tmux + CLI 工具 + bash 脚本 + prompt 驱动的架构，快速搭建各类 AI Agent。当前部署的是小说阅读平台的 Oncall Agent。

**核心理念：** 不用 RAG，不用编排框架。可信知识库 + 直接读代码 + 外部轮询唤醒 + 人工可随时介入。

## 架构

```
Lark/IM 消息 → messages/ 目录 → msg-watcher.sh (1s 轮询) → tmux send-keys → Agent 唤醒
                                    ↑
                              监工 supervisor.sh (60s 巡检，异常告警)
```

**三个 tmux 会话：**

| 会话 | 职责 | Effort |
|------|------|--------|
| oncall-agent | 消费消息、回答用户问题、查知识库+代码 | 高 |
| supervisor | 监控所有 session、检测卡死/循环/积压、异常告警 | 低 |
| code-analyzer | 独立分析复杂代码，不污染主 Agent 上下文 | 高（阶段二启用） |

## 文件结构

```
.
├── AGENTS.md                    ← 你正在读的文件（项目总览）
├── .claude/
│   ├── CLAUDE.md                ← Agent 核心 prompt（角色定义 + 核心原则）
│   └── settings.local.json      ← compaction 15% 等 Harness 配置
├── agents/
│   ├── oncall-agent/AGENTS.md   ← 主 Agent 操作指令（消息消费/批量处理/升级规则）
│   ├── supervisor-agent/AGENTS.md ← 监工 Agent 指令
│   └── code-analyzer/AGENTS.md  ← 代码分析 Agent 指令
├── knowledge-base/
│   ├── README.md                ← 知识库索引（仓库+领域知识+组件背景）
│   └── *.md                     ← 各领域知识文档
├── scripts/
│   ├── deploy.sh                ← 一键部署（安装依赖+创建tmux会话+启动所有进程）
│   ├── switch-agent.sh          ← 角色切换（oncall/code-review/deploy-monitor）
│   ├── msg-watcher.sh           ← 消息流水线（轮询messages/→检测agent状态→唤醒）
│   ├── supervisor.sh            ← 监工脚本（卡死检测/循环检测/积压告警）
│   └── im-setup.md              ← 部署指南（架构/首次部署/重新部署/验证/日常操作）
├── roles/                       ← 角色配置目录
│   ├── oncall-novels/           ← 小说平台 Oncall Agent 配置
│   ├── code-review/             ← Code Review Agent 模板
│   └── deploy-monitor/          ← 发布巡检 Agent 模板
├── repos/                       ← 代码仓库 symlink（Agent 读代码用）
├── messages/                    ← IM 消息落地目录
└── worklogs/                    ← Agent 问答记录（每天一个文件，跨天压缩）
```

## 如何修改

### 切换 Agent 角色

```bash
./scripts/switch-agent.sh list                # 查看可用角色
./scripts/switch-agent.sh code-review         # 切换到 Code Review Agent
./scripts/switch-agent.sh deploy-monitor      # 切换到发布巡检 Agent
./scripts/switch-agent.sh oncall-novels       # 切回 Oncall Agent
```

### 添加新角色

1. 在 `roles/` 下创建新目录（如 `roles/my-agent/`）
2. 编写 `CLAUDE.md`（身份+核心原则+工作流程）
3. 编写 `AGENTS.md`（操作指令+升级规则+禁止行为）
4. 编写 `knowledge-base/` 下的知识文档
5. 执行 `./scripts/switch-agent.sh my-agent`

### 修改 prompt

- **CLAUDE.md** — Agent 的身份、核心原则、工作流程、平台概况。保持精简，这是 keep/cut/merge/move 原则中 "keep" 层级。
- **AGENTS.md** — 操作层面的指令：消息消费方式、批量处理、升级规则、禁止行为。这是 "merge" 层级。
- **supervisor-agent/AGENTS.md** — 监工检查周期和判断规则。基本不需要改。
- **code-analyzer/AGENTS.md** — 代码分析的输出格式。按需改。

### 更新知识库

- `knowledge-base/README.md` — 索引文件，Agent 第一个读的文件。每次加新文档都要更新。
- 每个领域独立一个 `.md` 文件，只写"为什么"和"踩过的坑"，代码能读出的内容不写。

## 如何部署

详见 `scripts/im-setup.md`。快速版：

```bash
# 清理旧进程 + 重新部署
pkill -f msg-watcher.sh
tmux kill-session -t oncall-agent 2>/dev/null
tmux kill-session -t supervisor 2>/dev/null
tmux kill-session -t code-analyzer 2>/dev/null
./scripts/deploy.sh
```

## 关键设计决策

1. **不依赖 /loop 轮询** — /loop 长时间无消息会空耗 token。改用外部 msg-watcher.sh 轮询，只在有新消息时才通过 tmux send-keys 注入唤醒指令。

2. **不依赖 RAG** — RAG 数据更新无法保证，topN 检索可能变成投毒源。用可信知识库（人工校对）+ 直接读代码。

3. **人工可随时介入** — tmux attach 即可查看 Agent 实时输出，Ctrl+C 中断，send-keys 给指令。msg-watcher 检测到有人 attach 就不发唤醒键。

4. **Harness 不重要** — Bash 工具就够了（Agent 不需要改代码）。换 Claude Code → Codex CLI → Trae CLI，脚本不改一行。

5. **Compaction 15%** — 上下文使用率超过 20% 后质量下降很快。保守设 15%，宁可频繁 compaction 也不接近满载。

6. **角色即配置** — Agent 功能由 prompt + 知识库决定，基础设施（tmux/脚本/Lark 订阅）完全复用。换角色就是换配置文件。
