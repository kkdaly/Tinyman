#!/bin/bash
# 消息流水线：监控消息目录 → 检测 Agent 状态 → 唤醒
# 此脚本由 cron 或 while 循环驱动，不依赖 Harness

MESSAGES_DIR="$(dirname "$0")/../messages"
AGENT_SESSION="oncall-agent"

# 检测 Agent 是否忙碌
is_agent_busy() {
    # 获取 oncall-agent 最后 20 行输出
    local output
    output=$(tmux capture-pane -t "$AGENT_SESSION" -p -S -20 2>/dev/null)

    if [ -z "$output" ]; then
        # 无输出 = 可能刚启动，不算忙碌
        return 1
    fi

    # 检查最后一行的时间戳是否在最近 120 秒内
    # 这里用简单启发式：最后一行是否看起来像 AI 正在输出（不以命令提示符结尾）
    local last_line
    last_line=$(echo "$output" | tail -1)

    # 如果最后一行以常见的 prompt 结尾（如 $ # > ），说明空闲
    if echo "$last_line" | grep -qE '[$#>] $'; then
        return 1  # 空闲
    fi

    # 否则假定忙碌（正在输出）
    return 0
}

# 检查是否有人工 attach
is_human_attached() {
    tmux list-clients -t "$AGENT_SESSION" 2>/dev/null | grep -q .
}

# 主循环
main() {
    # tmux 不可用则静默退出
    if ! command -v tmux &>/dev/null; then
        exit 0
    fi

    # 检查是否有新消息
    local msg_count
    msg_count=$(find "$MESSAGES_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')

    if [ "$msg_count" -eq 0 ]; then
        return
    fi

    # 有人工 attach → 不干预
    if is_human_attached; then
        return
    fi

    # Agent 忙碌 → 等下一轮
    if is_agent_busy; then
        return
    fi

    # Agent 空闲 + 有消息 + 无人工 → 唤醒
    local wake_prompt="请检查 messages/ 目录中的 $msg_count 条新消息，逐条处理后回复用户。回忆核心原则：回答基于知识库和代码，禁止编造。"
    tmux send-keys -t "$AGENT_SESSION" "$wake_prompt" Enter
}

main
