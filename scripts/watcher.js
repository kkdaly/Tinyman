#!/usr/bin/env node
// 通用 Agent 唤醒脚本 — 替代 msg-watcher.sh / code-watcher.sh / review-watcher.sh / deploy-watcher.sh
// Usage:
//   node scripts/watcher.js --watch messages --session gateway-agent --wake-cmd "读msg并lark回复"
//   node scripts/watcher.js --watch tasks --pattern "code-req-*.json" --session code-analyzer --wake-cmd "读tasks并分析代码写结果"

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseArgs } = require('./lib/cli-args');
const { hasTmux, hasSession, isAgentBusy, sendKeys, sleep } = require('./lib/tmux-utils');
const { resolve: resolveHarness } = require('./harness-presets');

const args = parseArgs();

const watchDir = args.watch;
const filePattern = args.pattern;
const session = args.session;
const wakeCmd = args['wake-cmd'];

if (!watchDir || !session || !wakeCmd) {
  process.exit(1);
}

// ── 加载配置 ──
const rootDir = path.resolve(__dirname, '..');
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(rootDir, 'tinyman.config.json'), 'utf8'));
} catch {
  config = { harness: 'claude', pollInterval: 1, pollCooldown: 15 };
}

const harness = resolveHarness(config.harness);
const pollInterval = (parseInt(args['poll-interval']) || config.pollInterval || 1) * 1000;
const cooldownSec = parseInt(args['poll-cooldown']) || config.pollCooldown || 15;
const watchPath = path.resolve(rootDir, watchDir);
const tmpdir = os.tmpdir();
const cooldownFile = path.join(tmpdir, `watcher_${session.replace(/[^a-zA-Z0-9]/g, '_')}_cooldown`);

// ── 检查匹配文件 ──
function hasMatchingFiles() {
  try {
    const files = fs.readdirSync(watchPath).filter((f) => {
      if (f === '.gitkeep') return false;
      if (filePattern) {
        // Convert glob pattern to regex: * → .*, ? → .
        const reStr = '^' + filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
        return new RegExp(reStr).test(f);
      }
      return true;
    });
    return files.length > 0;
  } catch {
    return false;
  }
}

// ── 冷却检查 ──
function isInCooldown() {
  try {
    const lastWake = parseInt(fs.readFileSync(cooldownFile, 'utf8'), 10);
    const elapsed = Math.floor(Date.now() / 1000) - lastWake;
    return elapsed < cooldownSec;
  } catch {
    return false;
  }
}

function setCooldown() {
  fs.writeFileSync(cooldownFile, String(Math.floor(Date.now() / 1000)));
}

// ── 主循环 ──
async function loop() {
  if (!hasTmux()) {
    process.exit(0);
  }

  if (!hasSession(session)) {
    return;
  }

  if (!hasMatchingFiles()) {
    return;
  }

  if (isInCooldown()) {
    return;
  }

  if (isAgentBusy(session, harness)) {
    return;
  }

  setCooldown();
  sendKeys(session, wakeCmd);
}

async function run() {
  while (true) {
    try {
      await loop();
    } catch {
      // 静默继续
    }
    await sleep(pollInterval);
  }
}

run();
