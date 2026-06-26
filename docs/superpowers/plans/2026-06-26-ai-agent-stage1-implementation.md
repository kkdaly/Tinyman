# AI Agent 阶段一实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建极简单 Agent 原型——tmux 托管、prompt 驱动、消息流水线、监工兜底，1-3 天内跑通。

**Architecture:** 三个 tmux session（oncall-agent / supervisor / code-analyzer），外部脚本处理消息订阅→检测→唤醒流水线，Agent 通过长驻 /loop 消费消息并基于可信知识库回答。

**Tech Stack:** Bash 脚本 + Claude Code (CLI) + tmux + 任意 IM 平台 CLI（按实际场景填入）

**前置条件:** 已确定 Agent 要解决的场景、已选定 IM 平台、已有至少一份可信知识文档。

---

## 文件结构

```
project-root/
├── .claude/
│   ├── CLAUDE.md              # Agent 核心 prompt（最小集）
│   └── settings.local.json    # compaction 等设置
├── agents/
│   ├── oncall-agent/
│   │   └── AGENTS.md          # Oncall Agent 专属 prompt
│   ├── supervisor-agent/
│   │   └── AGENTS.md          # 监工 Agent prompt
│   └── code-analyzer/
│       └── AGENTS.md          # 代码分析 Agent prompt
├── knowledge-base/
│   ├── README.md              # 知识库索引：有哪些仓库、什么场景看哪些
│   └── <domain>.md            # 各领域知识文档
├── scripts/
│   ├── msg-watcher.sh         # 消息流水线：监控+检测+唤醒
│   └── supervisor.sh          # 监工循环
├── worklogs/                  # Agent 每次问答记录
├── messages/                  # IM 消息订阅落地的目录
└── repos/                     # clone 的代码仓库（按需）
```

---

### Task 1: 创建目录结构和 tmux 会话

**Files:**
- Create: 上述全部目录
- 无测试文件

- [ ] **Step 1: 创建目录**

```bash
mkdir -p agents/oncall-agent agents/supervisor-agent agents/code-analyzer
mkdir -p knowledge-base scripts worklogs messages repos
```

- [ ] **Step 2: 创建三个 tmux 会话**

```bash
# 创建 detached session，后续 attach 查看
tmux new-session -d -s oncall-agent
tmux new-session -d -s supervisor
tmux new-session -d -s code-analyzer

# 验证
tmux ls
```

Expected: 三个 session 均显示 `(attached)` 或 `(detached)`。

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "chore: scaffold agent directory structure and tmux sessions"
```

---

### Task 2: 编写知识库索引

**Files:**
- Create: `knowledge-base/README.md`

- [ ] **Step 1: 编写知识库索引**

```markdown
# 知识库索引

## 代码仓库

| 仓库 | 路径 | 用途 | 什么时候看 |
|------|------|------|-----------|
| <repo-name> | repos/<repo-name> | <一句话描述> | <什么场景下参考> |

## 领域知识

| 文档 | 内容 | Owner |
|------|------|-------|
| <domain>.md | <一句话描述> | @<owner> |

## 重要组件背景

<!-- 列举 Agent 需要感知的组件和背景知识 -->
<!-- 例如：服务跑在什么平台上、流量走什么、有什么特殊配置 -->

## 使用说明

Agent 回答用户问题时：
1. 先查本知识库是否有相关文档
2. 再读对应代码仓库确认
3. 如果知识库和代码都没有答案，明确告知用户并记录
```

- [ ] **Step 2: 提交**

```bash
git add knowledge-base/README.md
git commit -m "feat: add knowledge base index template"
```

---

### Task 3: 编写 Oncall Agent 的 CLAUDE.md

**Files:**
- Create: `.claude/CLAUDE.md`

- [ ] **Step 1: 编写核心 CLAUDE.md（最小精简版）**

```markdown
# AI Oncall Agent

## 你是谁

你是团队的 Oncall Agent，负责回答用户的技术问题。你的回答必须基于可信知识库和代码，禁止编造。

## 核心原则（每次回复前回忆）

1. 所有回答必须基于 `knowledge-base/` 目录中的文档和 `repos/` 中的代码
2. 如果不确定，读代码确认，不要猜测
3. 如果知识库和代码都没有答案，坦诚告知用户并记录到 worklog
4. 优先简洁，不要啰嗦

## 工作流程

收到用户消息后：
1. 理解用户的问题
2. 查 knowledge-base/README.md 找到相关文档
3. 读相关代码确认
4. 回复用户
5. 记录到 worklogs/YYYY-MM-DD.md

## 记录 worklog

每次问答在 worklogs/YYYY-MM-DD.md 末尾追加：

```
### [HH:MM] @用户
**问题:** 用户问题摘要
**回答:** 你的回答摘要
**依据:** knowledge-base/xxx.md, repos/xxx/path/to/file
**状态:** resolved / needs-followup / escalated
```
```

- [ ] **Step 2: 提交**

```bash
git add .claude/CLAUDE.md
git commit -m "feat: add oncall agent core CLAUDE.md"
```

---

### Task 4: 编写 Oncall Agent 专属 AGENTS.md

**Files:**
- Create: `agents/oncall-agent/AGENTS.md`

- [ ] **Step 1: 编写 oncall-agent 专属 prompt**

```markdown
# Oncall Agent 专属指令

## 消费消息的方式

消息通过外部脚本投递到 `messages/` 目录。当你被唤醒时：
1. 列出 `messages/` 目录中的所有文件
2. 按时间顺序读取
3. 理解用户问题并回答
4. 处理后删除消息文件
5. 将问答记录到 worklogs/YYYY-MM-DD.md

## 批量处理

如果有多条消息，先全部读完再逐一回复，注意：
- 同一用户的连续消息要关联上下文
- 不同用户的消息要隔离理解

## 升级规则

以下情况需要告知用户"需要人工介入"：
- 问题涉及安全漏洞或敏感信息
- 需要修改代码而非仅回答问题
- 连续三轮无法解决同一用户的问题

## 禁止的行为
- 禁止编造任何 API、配置、参数名
- 禁止在没有读代码的情况下给出代码建议
- 禁止猜测版本号、变更内容
```

- [ ] **Step 2: 提交**

```bash
git add agents/oncall-agent/AGENTS.md
git commit -m "feat: add oncall agent AGENTS.md"
```

---

### Task 5: 编写监工 Agent prompt

**Files:**
- Create: `agents/supervisor-agent/AGENTS.md`

- [ ] **Step 1: 编写监工 prompt**

```markdown
# 监工 Agent

## 核心任务

每 60 秒检查所有 Agent 的状态，异常时通知你。

## 工作循环

每 60 秒执行：

1. `tmux capture-pane -t oncall-agent -p -S -50` 获取 oncall-agent 最近 50 行输出
2. `tmux capture-pane -t code-analyzer -p -S -50` 获取 code-analyzer 最近 50 行输出
3. `ls messages/ | wc -l` 检查消息积压

## 判断规则

### 正常 → 跳过
- 捕获的输出中有近期（180 秒内）的新内容
- 输出内容无重复循环
- 消息积压在合理范围内

### Agent 空闲 + 有消息积压 → 唤醒
- tmux send-keys -t oncall-agent "请检查 messages/ 目录中的新消息并处理"

### 异常 → 通知
以下情况立即通知：
- 最近 180 秒无任何输出（可能卡死）
- 最近 20 行出现相同模式的重复（可能循环）
- 消息积压超过 10 条

## 关键原则（每次检查前回忆）

1. 如果通过 capture-pane 看到有人正在 tmux 中输入（人工已 attach），绝对不要 send-keys——退出检查即可
2. 不确定是否异常时，宁可通知让人类判断，不要自作主张
3. 通知时附上最近输出片段，方便快速判断
```

- [ ] **Step 2: 提交**

```bash
git add agents/supervisor-agent/AGENTS.md
git commit -m "feat: add supervisor agent AGENTS.md"
```

---

### Task 6: 编写代码分析 Agent prompt

**Files:**
- Create: `agents/code-analyzer/AGENTS.md`

- [ ] **Step 1: 编写代码分析 Agent prompt**

```markdown
# 代码分析 Agent

## 职责

当 Oncall Agent 需要深入分析代码时，由你独立完成分析，返回结论。

## 工作方式

被唤醒后：
1. 读取 Oncall Agent 发来的分析请求（在 messages/ 或 worklog 中）
2. 在 repos/ 中找到对应代码
3. 追踪调用链，理解逻辑
4. 输出结论到 worklogs/YYYY-MM-DD.md
5. 结论要简洁，只说关键发现

## 输出格式

```
### [HH:MM] 代码分析结论
**请求:** 用户问什么 / Oncall Agent 想问什么
**分析范围:** repos/xxx/path
**发现:**
1. 要点一
2. 要点二
**结论:** 一句话总结
```
```

- [ ] **Step 2: 提交**

```bash
git add agents/code-analyzer/AGENTS.md
git commit -m "feat: add code analyzer AGENTS.md"
```

---

### Task 7: 配置 Harness (Claude Code)

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: 读取当前 settings.local.json**

```bash
cat .claude/settings.local.json
```

- [ ] **Step 2: 合并 compaction 配置**

确保 settings.local.json 包含以下字段（与已有字段合并，不覆盖）：

```json
{
  "compactOnStart": true,
  "autoCompactThreshold": 0.15
}
```

如果文件已有其他字段，用 Edit 工具合并。如果是空文件或不存在，直接写入。

- [ ] **Step 3: 在 oncall-agent session 中启动 Claude Code**

```bash
tmux send-keys -t oncall-agent "cd $(pwd) && claude" Enter
```

- [ ] **Step 4: 在 oncall-agent session 中启动 /loop**

在 oncall-agent tmux session 中执行：

```
/loop 60s 检查 messages/ 目录中是否有新消息，如果有则按 agents/oncall-agent/AGENTS.md 的指示处理。
```

- [ ] **Step 5: 提交**

```bash
git add .claude/settings.local.json
git commit -m "chore: configure compaction threshold to 15%"
```

---

### Task 8: 编写消息流水线脚本

**Files:**
- Create: `scripts/msg-watcher.sh`

- [ ] **Step 1: 编写 msg-watcher.sh**

```bash
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
```

- [ ] **Step 2: 添加执行权限**

```bash
chmod +x scripts/msg-watcher.sh
```

- [ ] **Step 3: 提交**

```bash
git add scripts/msg-watcher.sh
git commit -m "feat: add message pipeline watcher script"
```

---

### Task 9: 编写监工脚本

**Files:**
- Create: `scripts/supervisor.sh`

- [ ] **Step 1: 编写 supervisor.sh**

```bash
#!/bin/bash
# 监工循环：每 60 秒检查 Agent 状态，异常时告警
# 启动方式：在 supervisor tmux session 中 while true; do ./scripts/supervisor.sh; sleep 60; done

SUPERVISOR_DIR="$(dirname "$0")/.."
MESSAGES_DIR="$SUPERVISOR_DIR/messages"
WORKLOG_DIR="$SUPERVISOR_DIR/worklogs"

# 告警函数 —— 按你的 IM 平台实现
alert() {
    local level="$1"  # warn / critical
    local title="$2"
    local detail="$3"
    local date_str
    date_str=$(date "+%Y-%m-%d %H:%M:%S")

    echo "[$date_str] [$level] $title"
    echo "$detail"
    echo "---"

    # TODO: 替换为你使用的 IM 通知方式
    # 例如 Lark webhook:
    # curl -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" \
    #   -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"[$level] $title\n$detail\"}}"
}

check_session() {
    local session="$1"
    local label="$2"
    local staleness_sec="${3:-180}"

    local output
    output=$(tmux capture-pane -t "$session" -p -S -50 2>/dev/null)

    if [ -z "$output" ]; then
        alert "warn" "$label session 无输出" "session: $session"
        return 1
    fi

    # 检查最后输出时间（通过检查输出中是否有时间戳或活跃迹象）
    # 简化判断：输出中是否包含最近 5 分钟内的内容
    # 这里用文件修改时间作为 proxy
    # 更准确的做法需要 AI 判断，这里做规则兜底

    # 检查是否有重复行（循环检测的简单启发式）
    local repeated
    repeated=$(echo "$output" | tail -20 | sort | uniq -c | sort -rn | head -1 | awk '{print $1}')
    if [ "$repeated" -gt 5 ]; then
        alert "critical" "$label 疑似循环" "session: $session\n最近输出:\n$output"
        return 1
    fi

    return 0
}

main() {
    local date_str
    date_str=$(date "+%Y-%m-%d %H:%M:%S")

    # 检查消息积压
    local msg_count
    msg_count=$(find "$MESSAGES_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$msg_count" -gt 10 ]; then
        alert "warn" "消息积压: $msg_count 条" "目录: $MESSAGES_DIR"
    fi

    # 检查各 session
    check_session "oncall-agent" "Oncall" 180
    check_session "code-analyzer" "CodeAnalyzer" 300

    echo "[$date_str] supervisor check complete"
}

main
```

- [ ] **Step 2: 添加执行权限**

```bash
chmod +x scripts/supervisor.sh
```

- [ ] **Step 3: 在 supervisor tmux session 中启动监工循环**

```bash
tmux send-keys -t supervisor "cd $(pwd) && while true; do ./scripts/supervisor.sh; sleep 60; done" Enter
```

- [ ] **Step 4: 提交**

```bash
git add scripts/supervisor.sh
git commit -m "feat: add supervisor monitoring script"
```

---

### Task 10: 编写第一份领域知识文档

**Files:**
- Create: `knowledge-base/<your-domain>.md`（按实际场景命名）

- [ ] **Step 1: 编写知识文档模板**

```markdown
# <领域名称>

## 概述

<一句话描述这个领域是什么>

## 关键概念

<!-- 列出 Agent 必须理解的背景知识和术语 -->

### <概念 1>
- 是什么：
- 和我们的关系：
- 踩过的坑：

### <概念 2>
- 是什么：
- 和我们的关系：
- 踩过的坑：

## 相关仓库

| 仓库 | 关键路径 | 说明 |
|------|---------|------|
| | | |

## 常见问题

<!-- Agent 可以从这里直接匹配高频问题 -->

### Q: <问题>
A: <答案>
依据: <代码路径或文档链接>
```

- [ ] **Step 2: 填入实际内容**

根据你选定的场景，填写至少一个领域知识文档。确保：
- 所有内容经过人工校对
- 代码能读出的"怎么做"不写在这里
- 专注"为什么"和"踩过的坑"

- [ ] **Step 3: 提交**

```bash
git add knowledge-base/
git commit -m "feat: add initial domain knowledge document"
```

---

### Task 11: 端到端验证

- [ ] **Step 1: 验证 tmux 会话都在运行**

```bash
tmux ls
```

Expected: 三个 session 列出。

- [ ] **Step 2: 手动投递一条测试消息**

```bash
echo '{"user":"test","content":"你好，请介绍一下你自己","timestamp":"2026-06-26T10:00:00"}' > messages/test-001.json
```

- [ ] **Step 3: 手动触发一次 msg-watcher**

```bash
./scripts/msg-watcher.sh
```

Expected: 如果 oncall-agent 空闲，会向其 send-keys 唤醒提示。

- [ ] **Step 4: 验证监工脚本能正常运行**

```bash
./scripts/supervisor.sh
```

Expected: 输出检查结果，无异常告警。

- [ ] **Step 5: 清理测试消息**

```bash
rm messages/test-001.json
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: end-to-end verification"
```

---

### Task 12: 配置 IM 消息订阅（平台特定）

> **注意：** 此任务取决于你选择的 IM 平台。以下为 Lark 示例，其他平台同理替换。

- [ ] **Step 1: 配置 Lark CLI 消息订阅**

```bash
# Lark 平台示例 —— 订阅消息到 messages/ 目录
lark-cli event subscribe --output-dir messages/
```

- [ ] **Step 2: 验证消息能正常落地**

在 Lark 中给 Bot 发一条消息，确认 `messages/` 目录下生成了文件。

- [ ] **Step 3: 将 msg-watcher.sh 加入 cron 或循环**

```bash
# 方式一：cron 每 30 秒
# */1 * * * * /path/to/scripts/msg-watcher.sh
# */1 * * * * sleep 30 && /path/to/scripts/msg-watcher.sh

# 方式二：后台 while 循环
# nohup bash -c 'while true; do /path/to/scripts/msg-watcher.sh; sleep 30; done' &
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "chore: configure IM message subscription"
```

---

## 阶段一完成标准

- [ ] tmux 三个 session 都在运行
- [ ] oncall-agent 能接收消息并基于知识库回答
- [ ] 监工每 60 秒检查状态，异常时通知
- [ ] worklog 每日记录，跨天压缩
- [ ] 连续运行 24 小时无卡死

## 下一步（阶段二）

阶段一稳定运行 1-2 周后：
1. 按 keep/cut/merge/move 精简 prompt
2. 引入消息流水线正式抽象（订阅→通知→检测→唤醒→批量处理）
3. 部署代码分析 Agent
4. 监工 Agent 接入 IM 通知
