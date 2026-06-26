# 会话状态

## 当前运行

```
tmux 会话:
  oncall-agent   ← Agent
  supervisor     ← 监工 (60s)
  code-analyzer  ← 代码分析（按需）

后台进程:
  msg-watcher    ← 1s 轮询 messages/

IM 订阅:
  见 scripts/im-setup.md
```

## 快速恢复

```bash
cd /Users/kkdaly/Desktop/test

# 检查状态
tmux ls
ps aux | grep msg-watcher | grep -v grep

# 连接 Agent（Ctrl+B D 脱离）
tmux attach -t oncall-agent

# 重新部署
./scripts/deploy.sh
```

## 切换角色

```bash
./scripts/switch-agent.sh list
./scripts/switch-agent.sh <role-name>
```
