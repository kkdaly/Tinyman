#!/bin/bash
# Agent 角色切换脚本
# 用法: ./scripts/switch-agent.sh <role-name>
#       ./scripts/switch-agent.sh list

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROLES_DIR="$ROOT_DIR/roles"

list_roles() {
    echo "可用角色:"
    for role in "$ROLES_DIR"/*/; do
        local name=$(basename "$role")
        if [ -f "$role/CLAUDE.md" ]; then
            echo "  $name"
        fi
    done
    echo ""
    echo "用法: ./scripts/switch-agent.sh <role-name>"
}

switch_role() {
    local role="$1"
    local role_dir="$ROLES_DIR/$role"

    if [ ! -d "$role_dir" ]; then
        echo "错误: 角色 '$role' 不存在"
        list_roles
        exit 1
    fi

    if [ ! -f "$role_dir/CLAUDE.md" ]; then
        echo "错误: 角色 '$role' 缺少 CLAUDE.md"
        exit 1
    fi

    echo "==> 切换到角色: $role"

    # 1. 切换 CLAUDE.md
    cp "$role_dir/CLAUDE.md" "$ROOT_DIR/.claude/CLAUDE.md"
    echo "  CLAUDE.md ✓"

    # 2. 切换 AGENTS.md
    if [ -f "$role_dir/AGENTS.md" ]; then
        cp "$role_dir/AGENTS.md" "$ROOT_DIR/agents/oncall-agent/AGENTS.md"
        echo "  AGENTS.md ✓"
    fi

    # 3. 切换知识库（保留 novels-platform.md 除非角色目录有不同内容）
    if [ -d "$role_dir/knowledge-base" ] && [ "$(ls -A "$role_dir/knowledge-base" 2>/dev/null)" ]; then
        cp "$role_dir/knowledge-base/"* "$ROOT_DIR/knowledge-base/" 2>/dev/null
        echo "  知识库 ✓"
    fi

    # 4. 重启 Agent（向 oncall-agent tmux session 注入新 prompt 上下文）
    if tmux has-session -t oncall-agent 2>/dev/null; then
        tmux send-keys -t oncall-agent "已切换到 $role 角色。请重新阅读 CLAUDE.md 和 AGENTS.md，确认你的新身份和职责。" Enter
        echo "  Agent 已通知 ✓"
    fi

    echo ""
    echo "==> 切换完成。当前角色: $role"
    echo "    知识库: knowledge-base/"
    echo "    代码仓库: repos/"
}

# 主入口
case "${1:-}" in
    list|ls)
        list_roles
        ;;
    "")
        echo "用法: ./scripts/switch-agent.sh <role-name>"
        list_roles
        exit 1
        ;;
    *)
        switch_role "$1"
        ;;
esac
