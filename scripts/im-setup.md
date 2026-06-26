# 小说阅读平台 AI Oncall Agent — 部署指南

## 架构概览

```
Lark 消息 → messages/ 目录 → msg-watcher (1s 轮询) → tmux send-keys → Agent 唤醒处理
                                                    ↑
                                              监工 Agent (60s 巡检)
```

**两个唤醒机制：**
- **msg-watcher（外部，1s）：** bash 脚本轮询 messages/ 目录，发现新消息通过 tmux send-keys 注入唤醒指令。不消耗 Agent 上下文，这是主要唤醒通道。
- **/loop（内部，已废弃）：** Claude Code 自带定时器，长时间无消息会空耗 token，已被 msg-watcher 替代。

## 前置条件

- Linux 或 macOS（tmux 可用）
- Node.js 22+（lark-cli 依赖）
- tmux 已安装
- 飞书 App 已创建，具备以下权限：
  - `im:message:readonly`
  - `im:message.group_at_msg.include_bot:readonly`

## 首次部署

```bash
cd /Users/kkdaly/Desktop/test

# 1. 安装 Lark CLI
npm install -g @larksuite/cli

# 2. 配置飞书凭证（交互式，需 App ID / App Secret）
lark-cli config init

# 3. 授权登录
lark-cli auth login --recommend

# 4. 一键部署（tmux 会话 + 监工 + msg-watcher）
./scripts/deploy.sh

# 5. 启动消息订阅（另开终端，会阻塞在前台）
lark-cli event +subscribe --output-dir messages/

# 6. 脱离 oncall-agent session，让 Agent 后台运行
#    在 oncall-agent tmux 窗口里按 Ctrl+B 然后按 D
```

## 重新部署

```bash
cd /Users/kkdaly/Desktop/test

# 清理旧的
tmux kill-session -t oncall-agent 2>/dev/null
tmux kill-session -t supervisor 2>/dev/null
tmux kill-session -t code-analyzer 2>/dev/null
pkill -f msg-watcher.sh

# 重新部署
./scripts/deploy.sh

# 重新订阅消息
lark-cli event +subscribe --output-dir messages/
```

## 验证

```bash
# 查看 tmux 会话
tmux ls

# 查看 msg-watcher 进程
ps aux | grep msg-watcher | grep -v grep

# 查看 Agent 状态
tmux capture-pane -t oncall-agent -p -S -10

# 手动触发
echo '{"event":{"message":{"content":"{\"text\":\"测试\"}"}}}' > messages/test.json
# 等 1-2 秒，检查 Agent 是否处理
```

## 日常操作

| 操作 | 命令 |
|------|------|
| 查看 Agent 输出 | `tmux attach -t oncall-agent` |
| 脱离 session | `Ctrl+B` 然后 `D` |
| 查看监工日志 | `tmux attach -t supervisor` |
| 手动唤醒 Agent | `tmux send-keys -t oncall-agent "检查 messages/" Enter` |
| 停止全部 | `./scripts/deploy.sh` 末尾有停止命令 |

## 关键设计

- **msg-watcher 不会在人工 attach 时唤醒 Agent**——检测到 `tmux list-clients` 有人连接就跳过，防止打断你的操作。所以日常要让 Agent 自己跑就 detach。
- **busy 检测看 `❯` prompt**——Agent 输出末尾有 Claude Code 的 `❯` 说明空闲，否则假定正在处理中，msg-watcher 会等下一轮。
- **消息文件按 Lark event_id 命名**——Agent 处理后删文件，`.gitkeep` 保留目录结构，msg-watcher 排除 `.gitkeep` 不计入消息数。
