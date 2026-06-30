#!/usr/bin/env node
// 监工：检查 Agent 状态，异常时告警
// 由 deploy.js 在 supervisor tmux session 中循环调用:
//   while true; do node scripts/supervisor.js; sleep 60; done

const fs = require('fs');
const path = require('path');
const { hasSession, capturePane, isHumanAttached, getSessionActivity } = require('./lib/tmux-utils');

const rootDir = path.resolve(__dirname, '..');

// ── 配置 ──
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(rootDir, 'tinyman.config.json'), 'utf8'));
} catch {
  config = { dirs: { messages: 'messages' } };
}

const messagesDir = path.resolve(rootDir, config.dirs.messages || 'messages');

const CHECKS = [
  { session: 'gateway-agent', label: 'Gateway', stalenessSec: 180 },
  { session: 'code-analyzer', label: 'CodeAnalyzer', stalenessSec: 300 },
  { session: 'code-review-agent', label: 'CodeReview', stalenessSec: 300 },
  { session: 'deploy-monitor', label: 'DeployMonitor', stalenessSec: 300 },
];

// ── 告警 ──
function alert(level, title, detail) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${timestamp}] [${level}] ${title}`);
  if (detail) console.log(detail);
  console.log('---');
  // TODO: 替换为你使用的 IM 通知方式
  // 例如 Lark webhook:
  // const https = require('https');
  // const webhookUrl = process.env.WEBHOOK_URL;
  // if (webhookUrl) { ... }
}

// ── 检查单个 session ──
function checkSession(session, label, stalenessSec) {
  if (!hasSession(session)) {
    alert('warn', `${label} session 不存在`, `session: ${session}`);
    return false;
  }

  if (isHumanAttached(session)) {
    return true; // 人工介入，不干预
  }

  const activity = getSessionActivity(session);
  if (activity > 0) {
    const elapsed = Math.floor(Date.now() / 1000) - activity;
    if (elapsed > stalenessSec) {
      alert('critical', `${label} 疑似卡死: ${elapsed}秒无活动`, `session: ${session} (阈值: ${stalenessSec}秒)`);
      return false;
    }
  }

  const output = capturePane(session, 50);
  if (!output.trim()) {
    alert('warn', `${label} session 无输出`, `session: ${session}`);
    return false;
  }

  // 循环检测：最近 20 行中重复最多的行 > 5 次
  const tail = output.trim().split('\n').slice(-20);
  const lineCounts = {};
  tail.forEach((line) => {
    lineCounts[line] = (lineCounts[line] || 0) + 1;
  });
  const maxRepeat = Math.max(...Object.values(lineCounts));
  if (maxRepeat > 5) {
    alert('critical', `${label} 疑似循环`, `session: ${session}\n最近输出:\n${tail.join('\n')}`);
    return false;
  }

  return true;
}

// ── 主流程 ──
function main() {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // 消息积压检查
  try {
    const files = fs.readdirSync(messagesDir).filter((f) => f !== '.gitkeep');
    if (files.length > 10) {
      alert('warn', `消息积压: ${files.length} 条`, `目录: ${messagesDir}`);
    }
  } catch {
    // 目录不存在就跳过
  }

  // 检查各 session
  CHECKS.forEach(({ session, label, stalenessSec }) => {
    checkSession(session, label, stalenessSec);
  });

  console.log(`[${timestamp}] supervisor check complete`);
}

main();
