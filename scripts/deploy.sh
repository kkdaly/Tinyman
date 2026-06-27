#!/bin/bash
# 一键部署 AI Agent 平台（含首次引导）
# 用法: ./scripts/deploy.sh                           # 默认 Claude Code
#       HARNESS=codex ./scripts/deploy.sh              # Codex CLI
#       HARNESS=trae ./scripts/deploy.sh               # Trae CLI
# 配置: POLL_INTERVAL=1 POLL_COOLDOWN=15 ./scripts/deploy.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── 加载 Harness 预设 ──
source "$ROOT_DIR/scripts/harness-presets.sh"

POLL_INTERVAL="${POLL_INTERVAL:-1}"
POLL_COOLDOWN="${POLL_COOLDOWN:-15}"

echo "╔══════════════════════════════════════╗"
echo "║  AI Agent 平台 — 一键部署           ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "==> Harness: $HARNESS_NAME"
echo "==> 轮询间隔: ${POLL_INTERVAL}s / 冷却: ${POLL_COOLDOWN}s"

# ── 0. 检查依赖 ──
echo "==> 检查依赖..."

if ! command -v tmux &>/dev/null; then
    echo "   tmux 未安装，尝试安装..."
    if command -v apt &>/dev/null; then sudo apt update && sudo apt install -y tmux
    elif command -v yum &>/dev/null; then sudo yum install -y tmux
    elif command -v brew &>/dev/null; then brew install tmux
    else echo "请手动安装 tmux: https://github.com/tmux/tmux/wiki/Installing"; exit 1
    fi
fi
echo "   ✓ tmux $(tmux -V 2>/dev/null | head -1)"

case "$HARNESS" in
    claude)
        if ! command -v claude &>/dev/null; then
            echo ""
            echo "   ✗ Claude Code 未安装，请运行:"
            echo "     npm install -g @anthropic-ai/claude-code"
            echo ""
            exit 1
        fi
        if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
            echo ""
            echo "   ⚠ 未检测到 API Key，请先设置:"
            echo "     export ANTHROPIC_API_KEY=sk-xxx"
            echo "     export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic  # 如用中转"
            echo ""
        fi
        ;;
    codex)
        if ! command -v codex &>/dev/null; then
            echo "   ✗ Codex CLI 未安装，请先安装后重试"; exit 1
        fi
        ;;
    trae)
        if ! command -v trae &>/dev/null; then
            echo "   ✗ Trae CLI 未安装，请先安装后重试"; exit 1
        fi
        ;;
esac
echo "   ✓ $HARNESS_NAME"

# ── 0b. Claude Code 首次条款 ──
if [ "$HARNESS" = "claude" ]; then
    echo "==> 检查首次运行条款..."
    BOOTSTRAP_SESSION="bootstrap-$$"
    tmux new-session -d -s "$BOOTSTRAP_SESSION" -c "$ROOT_DIR" 2>/dev/null
    tmux send-keys -t "$BOOTSTRAP_SESSION" "claude --dangerously-skip-permissions" C-m

    ACCEPTED=false
    for i in $(seq 1 15); do
        sleep 1
        pane=$(tmux capture-pane -t "$BOOTSTRAP_SESSION" -p -S -10 2>/dev/null)
        if echo "$pane" | grep -q "I accept"; then
            echo "   ⚡ 自动接受条款..."
            tmux send-keys -t "$BOOTSTRAP_SESSION" Down C-m
            sleep 3
            ACCEPTED=true
            break
        fi
        if echo "$pane" | grep -qE '(❯|▸)'; then
            echo "   ✓ 条款已接受（跳过）"
            ACCEPTED=true
            break
        fi
    done

    tmux send-keys -t "$BOOTSTRAP_SESSION" C-c C-c 2>/dev/null || true; sleep 1
    tmux send-keys -t "$BOOTSTRAP_SESSION" "exit" C-m 2>/dev/null || true; sleep 1
    tmux kill-session -t "$BOOTSTRAP_SESSION" 2>/dev/null || true

    if [ "$ACCEPTED" = false ]; then
        echo "   ✗ 条款接受超时，手动运行 claude 一次后重试"
        exit 1
    fi
fi

# ── 1. 首次使用提示 ──
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║                                             ║"
echo "  ║   🎉 部署完成！                              ║"
echo "  ║                                             ║"
echo "  ║   不改: 默认是一个通用 AI 问答助手，也能用    ║"
echo "  ║   改了: 变成 Oncall 值班 / 代码审查 / 你自己 ║"
echo "  ║                                             ║"
echo "  ║   改这 3 个文件就够了:                        ║"
echo "  ║                                             ║"
echo "  ║   agents/gateway-agent/CLAUDE.md             ║"
echo "  ║   → Agent 是谁？做什么的？                    ║"
echo "  ║                                             ║"
echo "  ║   agents/gateway-agent/AGENTS.md             ║"
echo "  ║   → 怎么回复？怎么委托任务？                  ║"
echo "  ║                                             ║"
echo "  ║   knowledge-base/your-project.md             ║"
echo "  ║   → Agent 需要知道的背景知识                  ║"
echo "  ║                                             ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  或者 attach 到 gateway-agent，AI 会帮你配置:"
echo "    tmux attach -t gateway-agent"
echo ""

# ── 4. 创建 tmux 会话 ──
echo "==> 创建 tmux 会话..."

for session in gateway-agent supervisor code-analyzer code-review-agent deploy-monitor; do
    if tmux has-session -t "$session" 2>/dev/null; then
        echo "  会话 $session 已存在，跳过"
    else
        tmux new-session -d -s "$session" -c "$ROOT_DIR"
        echo "  会话 $session 已创建"
    fi
done

# ── 辅助函数: 等待 Harness 就绪，自动处理条款弹窗 ──
wait_harness_ready() {
    local session="$1"
    for i in $(seq 1 30); do
        sleep 1
        local pane
        pane=$(tmux capture-pane -t "$session" -p -S -10 2>/dev/null)
        # 首次运行条款弹窗 → 自动接受
        if echo "$pane" | grep -q "I accept"; then
            tmux send-keys -t "$session" Down C-m
            sleep 2
        fi
        if echo "$pane" | grep -qE '(❯|▸)'; then
            echo "   $session 就绪 (${i}s)"
            return 0
        fi
    done
    echo "   ⚠ $session 超时未就绪"
    return 1
}

# ── 5. 启动 Gateway Agent ──
echo "==> 在 gateway-agent 会话中启动 ${HARNESS_NAME}..."
tmux send-keys -t gateway-agent "cd $ROOT_DIR && $HARNESS_START_CMD" C-m
wait_harness_ready "gateway-agent"
tmux send-keys -t gateway-agent "读gateway的CLAUDE和AGENTS" C-m
sleep 5
tmux send-keys -t gateway-agent "帮用户配置平台，问他搭建什么类型" C-m

# ── 6. 启动监工 ──
echo "==> 在 supervisor 会话中启动监工循环..."
tmux send-keys -t supervisor "cd $ROOT_DIR && while true; do ./scripts/supervisor.sh; sleep 60; done" C-m

# ── 7. 启动代码分析 Agent ──
echo "==> 在 code-analyzer 会话中启动 ${HARNESS_NAME}..."
tmux send-keys -t code-analyzer "cd $ROOT_DIR && $HARNESS_START_CMD" C-m
wait_harness_ready "code-analyzer"
tmux send-keys -t code-analyzer "读code-analyzer的AGENTS" C-m

# ── 8. 启动 Code Review Agent ──
echo "==> 在 code-review-agent 会话中启动 ${HARNESS_NAME}..."
tmux send-keys -t code-review-agent "cd $ROOT_DIR && $HARNESS_START_CMD" C-m
wait_harness_ready "code-review-agent"
tmux send-keys -t code-review-agent "读code-review的CLAUDE和AGENTS" C-m

# ── 9. 启动 Deploy Monitor ──
echo "==> 在 deploy-monitor 会话中启动 ${HARNESS_NAME}..."
tmux send-keys -t deploy-monitor "cd $ROOT_DIR && $HARNESS_START_CMD" C-m
wait_harness_ready "deploy-monitor"
tmux send-keys -t deploy-monitor "读deploy-monitor的CLAUDE和AGENTS" C-m

# ── 10. 启动消息流水线 ──
echo "==> 启动消息流水线（后台，${POLL_INTERVAL}s 轮询，${POLL_COOLDOWN}s 冷却）..."
POLL_COOLDOWN="$POLL_COOLDOWN" nohup bash -c "while true; do $ROOT_DIR/scripts/msg-watcher.sh; sleep $POLL_INTERVAL; done" > /dev/null 2>&1 &
echo "   msg-watcher PID: $!"

# ── 11. 启动任务流水线（后台，${POLL_INTERVAL}s 轮询）──
echo "==> 启动任务流水线（后台）..."
POLL_COOLDOWN="$POLL_COOLDOWN" nohup bash -c "while true; do $ROOT_DIR/scripts/code-watcher.sh; sleep $POLL_INTERVAL; done" > /dev/null 2>&1 &
echo "   code-watcher PID: $!"
POLL_COOLDOWN="$POLL_COOLDOWN" nohup bash -c "while true; do $ROOT_DIR/scripts/review-watcher.sh; sleep $POLL_INTERVAL; done" > /dev/null 2>&1 &
echo "   review-watcher PID: $!"
POLL_COOLDOWN="$POLL_COOLDOWN" nohup bash -c "while true; do $ROOT_DIR/scripts/deploy-watcher.sh; sleep $POLL_INTERVAL; done" > /dev/null 2>&1 &
echo "   deploy-watcher PID: $!"

# ── 12. 输出状态 ──
echo ""
echo "═══════════════════════════════════════════"
echo "  部署完成"
echo "═══════════════════════════════════════════"
echo ""
echo "tmux 会话:"
tmux ls 2>/dev/null || echo "  (tmux 未运行)"
echo ""
echo "操作:"
echo "  tmux attach -t gateway-agent       # 查看 Gateway Agent"
echo "  tmux attach -t supervisor         # 查看监工"
echo "  tmux attach -t code-analyzer      # 查看代码分析 Agent"
echo "  tmux attach -t code-review-agent  # 查看 PR 审查 Agent"
echo "  tmux attach -t deploy-monitor     # 查看发布巡检 Agent"
echo ""
echo "下一步 — 配置 Lark:"
echo "  1. lark-cli config init        # 输入飞书 App 凭证"
echo "  2. lark-cli auth login --recommend"
echo "  3. lark-cli event +subscribe --output-dir ./messages/"
echo ""
echo "停止:"
echo "  kill \$(pgrep -f msg-watcher.sh)    # 停止消息流水线"
echo "  kill \$(pgrep -f code-watcher.sh)   # 停止任务流水线"
echo "  kill \$(pgrep -f review-watcher.sh)"
echo "  kill \$(pgrep -f deploy-watcher.sh)"
echo "  tmux kill-session -t gateway-agent"
echo "  tmux kill-session -t supervisor"
echo "  tmux kill-session -t code-analyzer"
echo "═══════════════════════════════════════════"
