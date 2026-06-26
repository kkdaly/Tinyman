#!/bin/bash
# 一键部署 AI Oncall Agent — 小说阅读平台
# 用法: ./scripts/deploy.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> 部署目录: $ROOT_DIR"

# ── 1. 检查 tmux ──
if ! command -v tmux &>/dev/null; then
    echo "==> tmux 未安装，尝试安装..."
    if command -v apt &>/dev/null; then
        sudo apt update && sudo apt install -y tmux
    elif command -v yum &>/dev/null; then
        sudo yum install -y tmux
    elif command -v brew &>/dev/null; then
        brew install tmux
    else
        echo "请手动安装 tmux: https://github.com/tmux/tmux/wiki/Installing"
        exit 1
    fi
fi
echo "==> tmux: $(tmux -V)"

# ── 2. 检查 lark-cli ──
if ! command -v lark-cli &>/dev/null; then
    echo "==> lark-cli 未安装，正在安装..."
    npm install -g @larksuite/cli
fi
echo "==> lark-cli: $(lark-cli --version 2>/dev/null || echo '请手动运行 lark-cli config init')"

# ── 3. 检查知识库和仓库 ──
if [ ! -f "$ROOT_DIR/knowledge-base/novels-platform.md" ]; then
    echo "⚠ 知识库文件缺失: knowledge-base/novels-platform.md"
fi
if [ ! -d "$ROOT_DIR/repos/novels" ]; then
    echo "⚠ 代码仓库未关联: repos/novels/ — 请先 clone 或 symlink"
fi

# ── 4. 创建 tmux 会话 ──
echo "==> 创建 tmux 会话..."

for session in oncall-agent supervisor code-analyzer; do
    if tmux has-session -t "$session" 2>/dev/null; then
        echo "  会话 $session 已存在，跳过"
    else
        tmux new-session -d -s "$session" -c "$ROOT_DIR"
        echo "  会话 $session 已创建"
    fi
done

# ── 5. 启动 Oncall Agent ──
echo "==> 在 oncall-agent 会话中启动 Claude Code..."
tmux send-keys -t oncall-agent "cd $ROOT_DIR && claude" Enter
# 不设 /loop —— 由外部 msg-watcher 通过 tmux send-keys 事件驱动唤醒，避免空转消耗 token

# ── 6. 启动监工 ──
echo "==> 在 supervisor 会话中启动监工循环..."
tmux send-keys -t supervisor "cd $ROOT_DIR && while true; do ./scripts/supervisor.sh; sleep 60; done" Enter

# ── 7. 启动消息流水线 ──
echo "==> 启动消息流水线（后台，1s 轮询）..."
nohup bash -c "while true; do $ROOT_DIR/scripts/msg-watcher.sh; sleep 1; done" > /dev/null 2>&1 &
echo "   msg-watcher PID: $!"

# ── 8. 输出状态 ──
echo ""
echo "═══════════════════════════════════════════"
echo "  部署完成"
echo "═══════════════════════════════════════════"
echo ""
echo "tmux 会话:"
tmux ls 2>/dev/null || echo "  (tmux 未运行)"
echo ""
echo "操作:"
echo "  tmux attach -t oncall-agent    # 查看 Oncall Agent"
echo "  tmux attach -t supervisor      # 查看监工"
echo "  tmux attach -t code-analyzer   # 查看代码分析 Agent"
echo ""
echo "下一步 — 配置 Lark:"
echo "  1. lark-cli config init        # 输入飞书 App 凭证"
echo "  2. lark-cli auth login --recommend"
echo "  3. lark-cli event +subscribe --output-dir $ROOT_DIR/messages/"
echo ""
echo "停止:"
echo "  kill \$(pgrep -f msg-watcher.sh)  # 停止消息流水线"
echo "  tmux kill-session -t oncall-agent"
echo "  tmux kill-session -t supervisor"
echo "  tmux kill-session -t code-analyzer"
echo "═══════════════════════════════════════════"
