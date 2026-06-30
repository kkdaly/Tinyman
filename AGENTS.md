# AI Agent 平台

一套通用 AI Agent 基础设施：tmux + CLI 工具 + bash 脚本 + prompt 驱动。不依赖 RAG，不依赖编排框架。可信知识库 + 直接读代码 + 外部轮询唤醒 + 人工可随时介入。事件驱动的多 Agent 调度平台，不局限于任何特定场景。

## 快速开始

```bash
# 1. 配置你的项目信息
# 编辑 tide.config.json，填入项目名称、IM 平台、agent 列表等

# 2. 填写知识库
# 编辑 knowledge-base/ 下的文档，填项目信息

# 3. 关联代码仓库
ln -s /path/to/your/repo repos/your-project

# 4. 部署
node scripts/deploy.js

# 5. 配置 IM（Lark 示例）
lark-cli config init
lark-cli auth login --recommend
lark-cli event +subscribe --output-dir messages/

# 6. 发消息测试
```

## 架构

```
IM 消息 → messages/ → watcher (轮询) → tmux send-keys → Agent 处理回复
                                                  ↑
                                            监工 supervisor (60s 巡检)
```

## 文件结构

```
.
├── AGENTS.md                    ← 项目总览（本文件）
├── CONVENTIONS.md               ← Agent 平台底座 prompt
├── tide.config.json          ← 配置文件
├── agents/
│   ├── gateway-agent/              ← 主 Agent（消息入口 + AI 路由）
│   ├── code-analyzer/             ← 代码分析 Agent
│   ├── code-review-agent/         ← PR 审查 Agent
│   ├── deploy-monitor/            ← 发布巡检 Agent
│   └── supervisor-agent/          ← 监工 Agent
├── knowledge-base/              ← 知识库（你填内容）
├── scripts/
│   ├── deploy.js                ← 一键部署
│   ├── harness-presets.js       ← Harness 预设（Claude/Codex/Trae）
│   ├── watcher.js               ← 通用 watcher（消息 + 任务唤醒）
│   ├── supervisor.js            ← 健康监控
│   └── im-setup.md              ← 部署指南 + 踩坑记录
├── tasks/                       ← Agent 间任务传递
├── repos/                       ← 代码仓库 symlink
├── messages/                    ← IM 消息落地
└── worklogs/                    ← 问答记录
```

## 如何定制

1. **换 Harness：** `node scripts/deploy.js --harness codex` — 支持 claude/codex/trae/openclaw
2. **改身份：** 编辑 `agents/gateway-agent/IDENTITY.md` — 改 Agent 的角色定义
3. **改操作指令：** 编辑 `agents/gateway-agent/AGENTS.md` — 改消息处理流程、回复方式
4. **填知识库：** 编辑 `knowledge-base/` — 写你的项目文档（只写"为什么"和"踩过的坑"，代码能读出的不写）
5. **关联代码：** `ln -s /your/repo repos/` — Agent 会直接读源码确认
6. **添加 Agent：** 在 `agents/` 下新建目录，写 IDENTITY.md + AGENTS.md，`tide.config.json` 的 `agents` 数组加一项（含 `watch` 即可自动被轮询唤醒）

## 切换 IM 平台

默认支持 Lark。换其他平台改两处：
- **收消息：** 把消息投递到 `messages/` 目录（webhook / CLI / 脚本）
- **发消息：** 改 `agents/gateway-agent/AGENTS.md` 中的回复命令

## 部署到 Linux

```bash
apt install tmux           # 装 tmux
npm install -g @larksuite/cli  # 装 Lark CLI（如用 Lark）
node scripts/deploy.js        # 一键部署
```

## 安全模型

- Agent 配置只能通过 `tmux attach` 管理员修改，IM 用户无权改
- 内置防 prompt 注入：忽略"忽略你的指令"等越狱尝试
- 禁止输出 API Key、Token、密码、服务器内部路径
- 禁止执行 `rm -rf` 等危险 shell 命令
- 对外部署建议在 webhook 前加一层鉴权

## 踩过的坑

详见 `scripts/im-setup.md`，记录了 11 个生产调试中踩的坑。
