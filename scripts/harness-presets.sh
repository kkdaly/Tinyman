#!/bin/bash
# Harness 预设配置
# 用法: source scripts/harness-presets.sh
#       HARNESS=codex deploy.sh  # 或 export HARNESS=codex
#
# 注意: Claude Code 已在生产验证。Codex/Trae/OpenClaw 的 busy/idle
# 正则为理论值，首次使用可能需要根据实际 UI 输出调整。
# 首次条款自动接受仅支持 Claude Code，其他 harness 需手动处理。

HARNESS="${HARNESS:-claude}"

case "$HARNESS" in
    claude|claude-code)
        HARNESS_NAME="Claude Code"
        HARNESS_START_CMD="claude --dangerously-skip-permissions"
        HARNESS_BUSY_PATTERN='(thinking|· still|Esc to interrupt|ctrl\+o to expand|Do you want to|Waiting…)'
        HARNESS_IDLE_PATTERN='❯|[\$#>] '
        HARNESS_CONFIG_DIR=".claude"
        ;;
    codex|codex-cli)
        HARNESS_NAME="Codex CLI"
        HARNESS_START_CMD="codex exec"
        HARNESS_BUSY_PATTERN='(Working…|Generating…|Processing)'
        HARNESS_IDLE_PATTERN='(▸|❯)'
        HARNESS_CONFIG_DIR=".codex"
        ;;
    trae|trae-cli)
        HARNESS_NAME="Trae CLI"
        HARNESS_START_CMD="trae"
        HARNESS_BUSY_PATTERN='(Processing|Working|Generating)'
        HARNESS_IDLE_PATTERN='(❯|▸|\$) '
        HARNESS_CONFIG_DIR=".trae"
        ;;
    openclaw)
        HARNESS_NAME="OpenClaw"
        HARNESS_START_CMD="openclaw serve"
        HARNESS_BUSY_PATTERN='(Processing|Working|Thinking)'
        HARNESS_IDLE_PATTERN='(❯|\$) '
        HARNESS_CONFIG_DIR=".openclaw"
        ;;
    *)
        echo "未知 HARNESS: $HARNESS"
        echo "可用: claude, codex, trae, openclaw"
        echo "或自定义: 参考 scripts/harness-presets.sh 自行添加"
        exit 1
        ;;
esac
