# 运行时流程

部署完成后，各组件如何协同工作。每条流程精确到文件和操作。

---

## 流程 1：用户发消息 → Agent 回复

### 1a. 消息落地

外部进程（lark-cli、webhook 等）将消息 JSON 写入 `messages/` 目录。

| 步骤 | 谁做的 | 文件 | 操作 |
|------|--------|------|------|
| 订阅事件 | `lark-cli` | — | `lark-cli event +subscribe --output-dir ./messages/` 持续运行 |
| 消息到达 | `lark-cli` | — | 写 JSON 文件到 `messages/`，如 `messages/msg_1719745000.json` |

### 1b. Watcher 检测并唤醒

| 步骤 | 文件 | 操作 |
|------|------|------|
| 轮询 | `scripts/watcher.js:38-53` | `readdirSync(messages/)` → 发现非 `.gitkeep` 文件 → 返回 true |
| 冷却检查 | `scripts/watcher.js:56-63` | 读 `/tmp/watcher_gateway_agent_cooldown` → 距上次唤醒不足 15s → 跳过（防止指令轰炸） |
| busy 检测 | `scripts/lib/tmux-utils.js:51-68` | `tmux capture-pane -t gateway-agent -p -S -20` → 后 8 行匹配 busyPattern → agent 正在处理 → 跳过 |
| 唤醒 | `scripts/lib/tmux-utils.js:47` | `tmux send-keys -t gateway-agent "读msg并lark回复" C-m` |
| 写冷却 | `scripts/watcher.js:66-68` | `writeFileSync` 写当前时间戳到冷却文件 |

### 1c. Gateway Agent 处理消息

| 步骤 | 文件 | 操作 |
|------|------|------|
| 收到指令 | — | tmux session 收到 "读msg并lark回复" 按键 |
| 列表消息 | `agents/gateway-agent/AGENTS.md` 指引 | `ls messages/` → 按时间排序 |
| 即时反馈 | `agents/gateway-agent/AGENTS.md` 指引 | `lark-cli api POST /open-apis/im/v1/messages/{msg_id}/reactions` 加 👀 |
| 查知识库 | `agents/gateway-agent/AGENTS.md` 指引 | 读 `knowledge-base/README.md` → 定位相关文档 |
| 读代码 | `agents/gateway-agent/AGENTS.md` 指引 | 读 `repos/` 下对应代码确认 |
| 发回复 | `agents/gateway-agent/AGENTS.md` 指引 | `lark-cli api POST /open-apis/im/v1/messages` 发送回复 |
| 清理 | `agents/gateway-agent/AGENTS.md` 指引 | `rm` 删除已处理的消息文件 |
| 记录 | `agents/gateway-agent/AGENTS.md` 指引 | 追加问答摘要到 `worklogs/YYYY-MM-DD.md` |

---

## 流程 2：委托任务 → 专业 Agent 处理

### 2a. Gateway 判断需要委托

| 步骤 | 文件 | 操作 |
|------|------|------|
| 判断类型 | `agents/gateway-agent/AGENTS.md` 指引 | 深度代码分析(3+文件) → 委托 code-analyzer / PR审查 → 委托 code-review-agent / 发布巡检 → 委托 deploy-monitor |
| 写任务 | `agents/gateway-agent/AGENTS.md` 指引 | 创建 `tasks/code-req-001.json`（或 `review-req-xxx.json` / `deploy-req-xxx.json`） |
| 告知用户 | `agents/gateway-agent/AGENTS.md` 指引 | 回复 "复杂分析进行中，请稍等" |

### 2b. Task Watcher 检测并唤醒专业 Agent

| 步骤 | 文件 | 操作 |
|------|------|------|
| 轮询 | `scripts/watcher.js:38-53` | `readdirSync(tasks/)` → 发现匹配 `code-req-*.json` 的文件 |
| 冷却检查 | `scripts/watcher.js:56-63` | 读 `/tmp/watcher_code_analyzer_cooldown` → 未满 15s → 跳过 |
| busy 检测 | `scripts/lib/tmux-utils.js:51-68` | `tmux capture-pane -t code-analyzer -p -S -20` → 检测 busyPattern |
| 唤醒 | `scripts/lib/tmux-utils.js:47` | `tmux send-keys -t code-analyzer "读tasks并分析代码写结果" C-m` |

### 2c. 专业 Agent 处理任务

| 步骤 | 文件 | 操作 |
|------|------|------|
| 读任务 | `agents/code-analyzer/AGENTS.md` 指引 | 读 `tasks/code-req-*.json` → 获取 question / files / context |
| 分析代码 | `agents/code-analyzer/AGENTS.md` 指引 | 读 `repos/` 中对应代码 → 追踪调用链 → 得出结论 |
| 写结果 | `agents/code-analyzer/AGENTS.md` 指引 | 写 `tasks/code-res-001.json`（findings + conclusion） |
| 清理 | `agents/code-analyzer/AGENTS.md` 指引 | 删除 `tasks/code-req-001.json` |

### 2d. Gateway 取回结果

| 步骤 | 文件 | 操作 |
|------|------|------|
| 检测结果 | `agents/gateway-agent/AGENTS.md` 指引 | 主动读 `tasks/code-res-001.json`（或等待下次被 watcher 唤醒） |
| 整合回复 | `agents/gateway-agent/AGENTS.md` 指引 | 将专业 Agent 的结论整合为用户可读的回复 |
| 发回复 | `agents/gateway-agent/AGENTS.md` 指引 | `lark-cli api POST` 发送 |

---

## 流程 3：Supervisor 巡检

每 60 秒执行一次。由 deploy.js 第 6 步在 supervisor tmux session 中启动的 `while true; do node scripts/supervisor.js; sleep 60; done` 循环驱动。

### 3a. 单次巡检

| 步骤 | 文件 | 操作 |
|------|------|------|
| 加载配置 | `scripts/lib/config.js:23-37` | 读 `tide.config.json` → 合并 DEFAULTS |
| 解析参数 | `scripts/lib/cli-args.js:4-16` | `--staleness --backlog --loop-threshold` |
| 构建检查列表 | `scripts/supervisor.js:23-27` | 从 config.agents 派生 `[{session, label, stalenessSec}]` |

### 3b. 消息积压检查

| 步骤 | 文件 | 操作 |
|------|------|------|
| 读目录 | `scripts/supervisor.js:97-101` | `readdirSync(messagesDir)` → 过滤 `.gitkeep` |
| 判断阈值 | `scripts/supervisor.js:99` | 文件数 > `messageBacklogThreshold`(10) → alert |
| 告警 | `scripts/supervisor.js:30-49` | `console.log` + 若设了 `WEBHOOK_URL` 则 POST 飞书消息 |

### 3c. 逐 Session 检查

对每个 agent 执行：

| 步骤 | 文件 | 操作 |
|------|------|------|
| 存活检查 | `scripts/lib/tmux-utils.js:21` | `tmux has-session -t {session}` → 不存在 → alert |
| 人工介入 | `scripts/lib/tmux-utils.js:36` | `tmux list-clients -t {session}` → 有人在看 → 跳过所有检查 |
| 活动时间 | `scripts/lib/tmux-utils.js:41` | `tmux display-message -t {session} -p '#{session_activity}'` → 转秒数 |
| 卡死判断 | `scripts/supervisor.js:62-68` | `now - activity > stalenessSec` → alert |
| 捕获输出 | `scripts/lib/tmux-utils.js:30` | `tmux capture-pane -t {session} -p -S -50` |
| 空输出检查 | `scripts/supervisor.js:71-74` | 输出为空 → alert |
| 循环检测 | `scripts/supervisor.js:77-87` | tail 20 行 → 行计数 → 最大重复 > `loopThreshold`(5) → alert |

---

## 流程 4：批量消息处理

### 4a. 多条消息同时到达

| 步骤 | 文件 | 操作 |
|------|------|------|
| 落地 | `lark-cli` | 多用户消息 → 多个 JSON 文件写入 `messages/` |
| watcher 检测 | `scripts/watcher.js:38-53` | `readdirSync` → 发现多个文件 → 返回 true |
| 唤醒一次 | `scripts/lib/tmux-utils.js:47` | 只发一次 "读msg并lark回复" |
| 批量处理 | `agents/gateway-agent/AGENTS.md` 指引 | Agent 读所有消息 → 按用户分组 → 逐一回复 |
| 冷却保护 | `scripts/watcher.js:56-63` | 15s 冷却 → watcher 不会在 agent 处理期间重复唤醒 |

### 4b. 多条不同代理任务

| 步骤 | 文件 | 操作 |
|------|------|------|
| 多个 watcher | 4 个独立 watcher 进程 | 各自 poll 各自目录，互不干扰 |
| 并行唤醒 | `scripts/lib/tmux-utils.js:47` | gateway-agent 收消息 + code-analyzer 分析代码 → 同时进行 |
| 独立 session | — | 每个 agent 在独立 tmux session 中，上下文不混杂 |

---

## 流程 5：异常处理

### 5a. Agent 卡死

| 步骤 | 文件 | 操作 |
|------|------|------|
| 检测 | `scripts/supervisor.js:62-68` | session_activity 超过阈值（gateway 180s / 其他 300s） |
| 告警 | `scripts/supervisor.js:30-49` | console.log + WEBHOOK_URL POST |
| 恢复 | 人工操作 | `tmux attach -t {session}` 查看 → `Ctrl+C` 中断 → 手动重输命令 |

### 5b. Watcher 进程异常退出

| 步骤 | 文件 | 操作 |
|------|------|------|
| 错误日志 | `scripts/watcher.js:100-103` | catch → stderr `[timestamp] watcher[session] error: {message}` |
| 循环继续 | `scripts/watcher.js:96-106` | 异常不退出，sleep 后继续下一轮 |
| 无 PID 污染 | `scripts/deploy.js:118-121` | `--stop` 时进程已不存在 → 静默清理 PID 文件 |

### 5c. tmux 服务不可用

| 步骤 | 文件 | 操作 |
|------|------|------|
| watcher 检测 | `scripts/lib/tmux-utils.js:17-19` | `command -v tmux` 不存在 → watcher 静默退出 |
| supervisor 检测 | `scripts/lib/tmux-utils.js:21` | `hasSession` 返回 false → 逐 session 告警 |
