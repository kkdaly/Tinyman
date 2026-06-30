# 启动流程

运行 `node scripts/deploy.js` 后，精确到每个文件发生了什么。

## 第 0 步：入口 `node scripts/deploy.js`

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 解析 CLI 参数 | `scripts/lib/cli-args.js` | `--harness codex` → `{ harness: 'codex' }` |
| 加载配置 | `scripts/lib/config.js` | 读 `tide.config.json` → 合并 DEFAULTS → 输出完整配置 |
| 校验配置 | `scripts/lib/config.js` | 检查 harness 有效、数字合法、agent 字段完整 |
| 选 harness 预设 | `scripts/harness-presets.js` | `resolve('claude')` → 查出 busy/idle 正则、startCmd 等 |

## 第 1 步：依赖检查 `scripts/deploy.js:23-61`

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 检查 tmux | — | `command -v tmux` 是否存在，否则报安装指引并退出 |
| 检查 AI CLI | — | `command -v claude`（或其他 harness）是否存在，报安装指引 |
| 检查 API Key | — | Claude Code 模式下，提示 ANTHROPIC_API_KEY 未设（仅警告，不退出） |

## 第 2 步：身份初始化 `scripts/deploy.js:64-72`

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 遍历 config.agents | — | 每个 agent 检查 `agents/{session}/IDENTITY.md` 是否存在 |
| 拷贝默认模板 | — | 不存在 → `cp IDENTITY.default.md → IDENTITY.md`（已存在则跳过） |

## 第 3 步：条款接受 `scripts/deploy.js:75-98`

仅 `harness.needsTermsAccept === true`（Claude Code）时执行。

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 创建临时 session | `scripts/lib/tmux-utils.js:25` | `tmux new-session -d -s bootstrap-{pid}` |
| 启动 Claude | `scripts/lib/tmux-utils.js:47` | `tmux send-keys "claude --dangerously-skip-permissions" C-m` |
| 等待条款出现 | `scripts/lib/tmux-utils.js:74-101` | 每 1s capture pane → 检测 "I accept" → 发现后 send-keys Enter |
| 等待 prompt | `scripts/lib/tmux-utils.js:74-101` | 检测 idlePattern 匹配 → 条款已接受 |
| 清理 | — | send-keys "exit" → `tmux kill-session` |

## 第 4 步：创建 tmux 会话 `scripts/deploy.js:169-183`

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 拼接 session 列表 | — | config.agents 各 session + `'supervisor'` |
| 逐个创建 | `scripts/lib/tmux-utils.js:25` | `tmux new-session -d -s {session} -c {rootDir}`（已存在则跳过） |

## 第 5 步：启动 Agent `scripts/deploy.js:185-196`

对 config.agents 中每个 agent 依次执行（注意：supervisor 不在 agents 列表中，在第 6 步单独处理）。

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 启动 CLI | `scripts/lib/tmux-utils.js:47` | `tmux send-keys "cd {rootDir} && {harness.startCmd}" C-m` |
| 等待就绪 | `scripts/lib/tmux-utils.js:74-101` | 每 1s capture pane 10 行 → 检测 idlePattern → 超时 30s 报警 |
| 注入身份 | `scripts/lib/tmux-utils.js:47` | 普通 agent: `tmux send-keys "读{identity}的IDENTITY和AGENTS" C-m` |
| 注入上下文 | — | gateway 特殊处理：额外注入 `项目: {projectName} — {projectDesc}。IM平台: {imPlatform}。目录: messages={dir}, repos={dir}...` |

## 第 6 步：启动监工 `scripts/deploy.js:198-200`

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 启动循环 | `scripts/lib/tmux-utils.js:47` | `tmux send-keys "cd {rootDir} && while true; do node scripts/supervisor.js ...; sleep 60; done" C-m` |

**supervisor.js 每次执行时：**

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 加载配置 | `scripts/lib/config.js` | 读 tide.config.json → 合并 DEFAULTS |
| 解析 CLI 参数 | `scripts/lib/cli-args.js` | `--staleness 180 --backlog 10 --loop-threshold 5` |
| 构建检查列表 | — | 从 config.agents 派生 `[{session, label, stalenessSec}]` |
| 检查消息积压 | — | `readdirSync(messagesDir)` → > 阈值则 alert |
| 逐 session 检查 | `scripts/lib/tmux-utils.js` | `hasSession` → `isHumanAttached` → `getSessionActivity` → `capturePane` |
| 卡死检测 | — | `now - session_activity > stalenessSec` → alert |
| 循环检测 | — | tail 20 行 → 计数 → 重复 > 阈值 → alert |
| 发送 webhook | — | `WEBHOOK_URL` 环境变量存在 → POST 飞书消息 |

## 第 7 步：启动 watcher 后台进程 `scripts/deploy.js:202-227`

对 config.agents 中有 `watch` 字段的 agent 逐个执行。

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 构建参数 | — | `--watch {dir} --session {name} --wake-cmd {cmd} --pattern {pattern} --poll-interval N --poll-cooldown N` |
| 启动子进程 | — | `spawn('node', ['scripts/watcher.js', ...args], {detached: true, stdio: 'ignore'})` |
| 写 PID 文件 | — | `os.tmpdir()/tide_watcher_{session}.pid` |

**watcher.js 每个实例运行时：**

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 解析 CLI 参数 | `scripts/lib/cli-args.js` | 提取 watch/session/wake-cmd/pattern |
| 加载配置 | `scripts/lib/config.js` | 读 tide.config.json → 合并 DEFAULTS → 取 harness |
| 加载 harness | `scripts/harness-presets.js` | `resolve(harness)` → 取 busy/idle 正则 |
| 设置冷却文件 | — | `os.tmpdir()/watcher_{session}_cooldown` |
| 主循环 | — | `while true`: |
| 检查 tmux | `scripts/lib/tmux-utils.js:17` | `command -v tmux` 不存在 → exit 0 |
| 检查 session | `scripts/lib/tmux-utils.js:21` | `has-session` 不存在 → 跳过本轮 |
| 检查文件 | — | `readdirSync` → 过滤 `.gitkeep` → glob 匹配 → 无文件则跳过 |
| 冷却检查 | — | 读冷却文件 → 距上次唤醒不足 cooldown 秒 → 跳过 |
| busy 检测 | `scripts/lib/tmux-utils.js:51-68` | capture 20 行 → 后 8 行测 busyPattern → 后 3 行测 idlePattern |
| 唤醒 | `scripts/lib/tmux-utils.js:47` | `tmux send-keys "{wakeCmd}" C-m` |
| 写冷却时间戳 | — | 更新冷却文件 |
| 休眠 | `scripts/lib/tmux-utils.js:70` | `sleep(pollInterval * 1000)` ms |

## 停止流程 `node scripts/deploy.js --stop`

| 操作 | 文件 | 做什么 |
|------|------|--------|
| 扫描 PID 文件 | — | `os.tmpdir()` 下 `tide_watcher_*.pid` |
| 逐个 kill | — | `process.kill(pid)` |
| 清理 PID 文件 | — | `fs.unlinkSync` |
