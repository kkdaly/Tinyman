# 会话状态 — 2026-06-26

## 当前运行

```
tmux 会话:
  oncall-agent   ← Oncall Agent（attached 则有人在操作）
  supervisor     ← 监工循环 60s
  code-analyzer  ← 待命（阶段二启用）

后台进程:
  msg-watcher    ← 1s 轮询 messages/ 目录

Lark 订阅:
  lark-cli event +subscribe --output-dir messages/
```

## 快速恢复

```bash
cd /Users/kkdaly/Desktop/test

# 检查状态
tmux ls
ps aux | grep msg-watcher | grep -v grep

# 连接 Agent（Ctrl+B D 脱离）
tmux attach -t oncall-agent

# 如果挂了，重新部署
./scripts/deploy.sh
lark-cli event +subscribe --output-dir messages/
```

## 当前配置

- **Agent 角色:** oncall-novels（小说阅读平台）
- **知识库:** knowledge-base/novels-platform.md
- **代码仓库:** repos/novels → /Users/kkdaly/Desktop/novels
- **Compaction:** 15%
- **Lark CLI:** v1.0.58

## 切换角色

```bash
./scripts/switch-agent.sh list
./scripts/switch-agent.sh <role-name>
```
