# AI Agent 平台 — 傻瓜式部署教程

## 这是什么

一个通用 AI Agent 平台。用户在 IM（飞书/Slack）里发消息，Agent 自动查知识库和代码，智能回复。可用于问答、代码审查、发布巡检等场景。

## 第一步：装依赖

```bash
# macOS
brew install tmux

# Linux
sudo apt install tmux

# Lark CLI（如果用飞书）
npm install -g @larksuite/cli
```

## 第二步：配项目信息

**改 3 个文件：**

### 2.1 知识库 — 告诉 Agent 你的项目是什么

编辑 `knowledge-base/your-project.md`，把 `<...>` 替换掉：

```markdown
# 你的项目名

## 概述
一个 xxx 服务，提供 xxx 功能

## 子系统
| 组件 | 端口 | 技术栈 | 职责 |
|------|------|--------|------|
| api-server | 3000 | Go + Gin | 对外 API |
| admin | 3001 | Go + Gin | 管理后台 |

## 注意事项
- 共享数据库，改 Schema 要同步
- xxx

## 常见问题
| 关键词 | 查什么 |
|--------|--------|
| 接口报错 | api-server 的 logs/ |
| 部署 | docs/DEPLOY.md |
```

### 2.2 Agent 身份 — 告诉 Agent 它是谁

编辑 `CONVENTIONS.md`，改底座 prompt；编辑 `agents/gateway-agent/IDENTITY.md` 改入口 Agent 身份：

```markdown
## 你是谁
你是 xxx 项目的 AI 助手，负责回答开发者关于 xxx 的技术问题。
```

其余不用改。

### 2.3 关联代码 — 让 Agent 能读源码

```bash
ln -s /你的项目路径 repos/你的项目名
```

然后编辑 `knowledge-base/README.md`，更新仓库表：

```markdown
| 仓库 | 路径 | 用途 | 什么时候看 |
|------|------|------|-----------|
| 你的项目 | repos/你的项目名 | 主服务 | 所有后端问题 |
```

## 第三步：配飞书（如果用飞书）

```bash
# 1. 初始化（输入飞书 App ID 和 Secret）
lark-cli config init

# 2. 登录授权
lark-cli auth login --recommend
```

如果不用飞书，把消息投递机制换成你自己的（webhook → messages/ 目录）。

## 第四步：启动

```bash
cd 项目目录
node scripts/deploy.js
```

输出看到 "部署完成" 就 OK 了。

## 第五步：启动消息订阅（另开终端）

```bash
cd 项目目录
lark-cli event +subscribe --output-dir messages/
```

看到 "Connected. Waiting for events..." 就对了。

## 第六步：测试

在飞书里给 Bot 发一条消息。Agent 会：
1. 给你的消息加 👀 反应（表示已收到）
2. 查知识库和代码
3. 回复答案

想看 Agent 在干嘛：

```bash
tmux attach -t gateway-agent   # 进入
# 看完按 Ctrl+B 然后按 D 退出
```

## 重新部署

```bash
pkill -f watcher.js            # 停 watcher
tmux kill-server               # 停所有 session
node scripts/deploy.js         # 重来
lark-cli event +subscribe --output-dir messages/  # 重订消息
```

## 自定义配置

```bash
# 改轮询速度（默认 1s 轮询 / 15s 冷却）
node scripts/deploy.js --poll-interval 5 --poll-cooldown 30
```

## 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| Agent 不回复 | 你 attach 着 session | `Ctrl+B D` 脱离 |
| Agent 不回复 | 权限弹窗卡住了 | attach 进去点 Yes，选 always allow |
| 消息落地目录不对 | lark-cli 在 `~` 下跑的 | `cd` 到项目目录再执行 |
| 多久回复 | Agent 查资料需要 10-60 秒 | 正常，👀 反应会先出现 |
| 换个项目 | 改第二步的 3 个文件 | 重跑 `node scripts/deploy.js` |
| 换 IM 平台 | 改 `agents/gateway-agent/AGENTS.md` 里的回复命令 | 把 lark-cli 换成你的 |
| 重装 tmux | macOS 13 装不上 | 换 macOS 14+ 或 Linux |

## 停止

```bash
pkill -f watcher.js
tmux kill-server
```

## 项目结构速查

```
.
├── CONVENTIONS.md                ← Agent 平台底座 prompt
├── agents/gateway-agent/IDENTITY.md ← Agent 身份
├── agents/gateway-agent/AGENTS.md ← 操作指令（怎么回复、升级规则）
├── knowledge-base/              ← 你的项目文档
├── repos/                       ← 你的代码仓库 symlink
├── scripts/
│   ├── deploy.js                ← 一键部署
│   ├── watcher.js               ← 消息轮询 + 唤醒
│   ├── supervisor.sh            ← 监工巡检
│   └── *.js                     ← 任务相关脚本
└── messages/                    ← IM 消息落地（运行时）
```
