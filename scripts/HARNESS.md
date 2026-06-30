# 切换 Harness / IM 平台

## 换 Harness

一条命令：

```bash
node scripts/deploy.js --harness codex     # Codex CLI
node scripts/deploy.js --harness trae      # Trae CLI
node scripts/deploy.js --harness openclaw  # OpenClaw
# 默认 Claude Code
node scripts/deploy.js
```

或写入 `tide.config.json` 的 `"harness"` 字段。

所有 harness 差异集中在 `scripts/harness-presets.js`：

| 配置项 | 说明 |
|--------|------|
| `HARNESS_START_CMD` | 启动命令 |
| `HARNESS_BUSY_PATTERN` | 忙碌检测正则 |
| `HARNESS_IDLE_PATTERN` | 空闲检测正则 |

### 添加新 Harness

编辑 `scripts/harness-presets.js`，在 `presets` 对象中加一项：

```js
mytool: {
  name: 'MyTool',
  startCmd: 'mytool chat',
  busyPattern: /(Processing|Thinking)/,
  idlePattern: /(❯|\$)/,
  configDir: '.mytool',
  needsTermsAccept: false,
},
```

其余全部复用：tmux、watcher、supervisor、知识库、agents/。

## 换 IM 平台（Lark → 企业微信 / Slack / 其他）

改 2 处：

### 1. 收消息 — 把消息投递到 messages/

```
Lark:      lark-cli event +subscribe --output-dir messages/
企业微信:  启动 HTTP server 接收 webhook → 写入 messages/
Slack:     socket mode / events API → 写入 messages/
通用:      任何能 POST 到 messages/ 目录的机制
```

最简单通用方案——启动一个 HTTP server 接收 webhook：

```bash
ncat -l -p 8080 -c 'cat > messages/$(date +%s).json'
```

### 2. 发消息 — 改 agents/gateway-agent/AGENTS.md 中的回复命令

```
Lark:      lark-cli api POST /open-apis/im/v1/messages ...
企业微信:   curl -X POST "https://qyapi.weixin.qq.com/.../webhook/send?key=..." ...
Slack:     curl -X POST "https://hooks.slack.com/..." ...
通用:      任何 curl/webhook/SDK 命令
```
