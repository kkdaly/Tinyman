#!/bin/bash
# 首次运行引导脚本 — 一键完成环境检查 + 条款接受
# 用法: ./scripts/bootstrap.sh
#       HARNESS=codex ./scripts/bootstrap.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/harness-presets.sh"

echo "╔══════════════════════════════════════╗"
echo "║  AI Agent 平台 — 首次运行引导       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. 检查依赖 ──
echo "==> 检查依赖..."

fail() { echo "   ✗ $1 未安装，请先安装: $2"; exit 1; }

command -v tmux &>/dev/null || fail "tmux" "brew install tmux / apt install tmux"
echo "   ✓ tmux $(tmux -V 2>/dev/null | head -1)"

# 检查 harness CLI
case "$HARNESS" in
    claude) command -v claude &>/dev/null || fail "claude" "npm install -g @anthropic-ai/claude-code" ;;
    codex)  command -v codex &>/dev/null || fail "codex" "参考 Codex CLI 安装文档" ;;
    trae)   command -v trae &>/dev/null || fail "trae" "参考 Trae CLI 安装文档" ;;
esac
echo "   ✓ $HARNESS_NAME"

# ── 2. 检查知识库 ──
echo "==> 检查配置..."
if [ ! -f "$ROOT_DIR/knowledge-base/your-project.md" ]; then
    echo "   ⚠ knowledge-base/your-project.md 未配置（可选，不影响运行）"
fi
if [ ! -f "$ROOT_DIR/.env" ]; then
    echo "   ⚠ .env 未创建，使用默认配置"
fi
echo "   ✓ 配置检查完成"

# ── 3. 接受首次条款（Claude Code 首次运行需要）──
if [ "$HARNESS" = "claude" ]; then
    echo "==> 检查 ${HARNESS_NAME} 首次运行条款..."

    BOOTSTRAP_SESSION="bootstrap-$$"
    tmux new-session -d -s "$BOOTSTRAP_SESSION" -c "$ROOT_DIR"
    tmux send-keys -t "$BOOTSTRAP_SESSION" "claude --dangerously-skip-permissions" C-m

    ACCEPTED=false
    for i in $(seq 1 15); do
        sleep 1
        pane=$(tmux capture-pane -t "$BOOTSTRAP_SESSION" -p -S -10 2>/dev/null)

        # 条款弹窗 → 用 Down 键导航到 "Yes, I accept" 然后 Enter
        if echo "$pane" | grep -q "I accept"; then
            echo "   ⚡ 检测到条款弹窗，自动接受..."
            tmux send-keys -t "$BOOTSTRAP_SESSION" Down Enter
            sleep 3
            ACCEPTED=true
            break
        fi

        # 已经就绪（之前接受过）
        if echo "$pane" | grep -qE '(❯|▸)'; then
            echo "   ✓ 条款已接受（跳过）"
            ACCEPTED=true
            break
        fi
    done

    # 退出临时 Claude Code 会话
    tmux send-keys -t "$BOOTSTRAP_SESSION" C-c C-c 2>/dev/null
    sleep 1
    tmux send-keys -t "$BOOTSTRAP_SESSION" "exit" C-m 2>/dev/null
    sleep 1
    tmux kill-session -t "$BOOTSTRAP_SESSION" 2>/dev/null

    if [ "$ACCEPTED" = false ]; then
        echo "   ✗ 条款接受超时，请手动运行一次 claude 并接受条款后重试"
        exit 1
    fi
fi

# ── 4. 完成 ──
echo ""
echo "╔══════════════════════════════════════╗"
echo "║  引导完成！现在可以部署:             ║"
echo "║  ./scripts/deploy.sh                ║"
echo "╚══════════════════════════════════════╝"
