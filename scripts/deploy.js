#!/usr/bin/env node
// 一键部署 AI Agent 平台
// Usage:
//   node scripts/deploy.js                           # 默认 Claude Code
//   node scripts/deploy.js --harness codex           # Codex CLI
//   node scripts/deploy.js --harness trae            # Trae CLI
//   node scripts/deploy.js --poll-interval 5 --poll-cooldown 30

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { resolve: resolveHarness } = require('./harness-presets');
const { createSession, hasSession, sendKeys, waitUntilReady } = require('./lib/tmux-utils');

const ROOT_DIR = path.resolve(__dirname, '..');

// ── CLI 参数 ──
const cliArgs = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
    cliArgs[key] = val;
  }
}

// ── 加载配置 ──
function loadConfig() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'tinyman.config.json'), 'utf8'));
  } catch {
    console.error('✗ 未找到 tinyman.config.json');
    process.exit(1);
  }

  config.harness = cliArgs.harness || config.harness || 'claude';
  config.pollInterval = parseInt(cliArgs['poll-interval']) || config.pollInterval || 1;
  config.pollCooldown = parseInt(cliArgs['poll-cooldown']) || config.pollCooldown || 15;
  return config;
}

// ── 依赖检查 ──
function checkDeps(harness) {
  console.log('==> 检查依赖...');

  // tmux
  try {
    execSync('command -v tmux', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const version = execSync('tmux -V', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    console.log(`   ✓ ${version}`);
  } catch {
    console.error('   ✗ tmux 未安装，请先安装:');
    console.error('     macOS: brew install tmux');
    console.error('     Linux: sudo apt install tmux');
    console.error('     Windows: 下载 itmux');
    process.exit(1);
  }

  // AI CLI
  try {
    const cli = harness.name === 'Claude Code' ? 'claude' : harness.name.toLowerCase().split(' ')[0];
    execSync(`command -v ${cli}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    console.log(`   ✓ ${harness.name}`);
  } catch {
    console.error(`   ✗ ${harness.name} 未安装`);
    if (harness.name === 'Claude Code') {
      console.error('     npm install -g @anthropic-ai/claude-code');
    }
    process.exit(1);
  }

  if (harness.name === 'Claude Code') {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      console.log('');
      console.log('   ⚠ 未检测到 API Key，请先设置:');
      console.log('     export ANTHROPIC_API_KEY=sk-xxx');
      console.log('     export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic  # 如用中转');
      console.log('');
    }
  }
}

// ── 身份初始化 ──
function initIdentities(agents) {
  agents.forEach((a) => {
    const identityPath = path.join(ROOT_DIR, 'agents', a.session, 'IDENTITY.md');
    const defaultPath = path.join(ROOT_DIR, 'agents', a.session, 'IDENTITY.default.md');
    if (!fs.existsSync(identityPath) && fs.existsSync(defaultPath)) {
      fs.copyFileSync(defaultPath, identityPath);
    }
  });
}

// ── Claude Code 首次条款接受 ──
async function acceptTerms(harness) {
  if (!harness.needsTermsAccept) return;

  console.log('==> 检查首次运行条款...');
  const bootstrapSession = `bootstrap-${process.pid}`;

  try {
    createSession(bootstrapSession, ROOT_DIR);
    sendKeys(bootstrapSession, 'claude --dangerously-skip-permissions');
    const ready = await waitUntilReady(bootstrapSession, harness, 15);
    if (!ready) {
      console.log('   ✗ 条款接受超时，手动运行 claude 一次后重试');
      process.exit(1);
    }
  } finally {
    try {
      sendKeys(bootstrapSession, 'exit');
      execSync(`tmux kill-session -t "${bootstrapSession}" 2>/dev/null`, { stdio: 'ignore' });
    } catch {
      // ignore cleanup errors
    }
  }
  console.log('   ✓ 条款已接受');
}

// ── 从配置读取 agent 和 watcher 列表 ──

// ── 主流程 ──
async function main() {
  const config = loadConfig();
  const harness = resolveHarness(config.harness);

  console.log('╔══════════════════════════════════════╗');
  console.log('║  AI Agent 平台 — 一键部署           ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`==> Harness: ${harness.name}`);
  console.log(`==> 轮询间隔: ${config.pollInterval}s / 冷却: ${config.pollCooldown}s`);

  checkDeps(harness);

  const dirs = config.dirs || {};
  const messagesDir = dirs.messages || 'messages';
  const reposDir = dirs.repos || 'repos';
  const knowledgeDir = dirs.knowledge || 'knowledge-base';
  const worklogsDir = dirs.worklogs || 'worklogs';

  const agents = config.agents || [];
  const projectName = config.projectName || 'Tinyman';
  const projectDesc = config.projectDesc || '';
  const imPlatform = config.imPlatform || 'lark';
  const supervisorStalenessSec = config.supervisorStalenessSec || 180;
  const messageBacklogThreshold = config.messageBacklogThreshold || 10;
  const loopDetectionThreshold = config.loopDetectionThreshold || 5;

  initIdentities(agents);
  await acceptTerms(harness);

  // 创建 tmux sessions
  console.log('==> 创建 tmux 会话...');
  const ALL_SESSIONS = [
    ...agents.map((a) => a.session),
    'supervisor',
  ];

  ALL_SESSIONS.forEach((session) => {
    if (hasSession(session)) {
      console.log(`  会话 ${session} 已存在，跳过`);
    } else {
      createSession(session, ROOT_DIR);
      console.log(`  会话 ${session} 已创建`);
    }
  });

  // 启动 Agent
  for (const { session, identity } of agents) {
    console.log(`==> 在 ${session} 会话中启动 ${harness.name}...`);
    sendKeys(session, `cd ${ROOT_DIR} && ${harness.startCmd}`);
    await waitUntilReady(session, harness, 30);

    let initCmd = `读${identity}的IDENTITY和AGENTS`;
    if (identity === 'gateway') {
      initCmd = `读gateway的IDENTITY和AGENTS。项目: ${projectName} — ${projectDesc}。IM平台: ${imPlatform}。目录: messages=${messagesDir}, repos=${reposDir}, knowledge=${knowledgeDir}, worklogs=${worklogsDir}`;
    }
    sendKeys(session, initCmd);
  }

  // 启动监工循环 — 传递 supervisor 配置参数
  console.log('==> 在 supervisor 会话中启动监工循环...');
  sendKeys('supervisor', `cd ${ROOT_DIR} && while true; do node scripts/supervisor.js --staleness ${supervisorStalenessSec} --backlog ${messageBacklogThreshold} --loop-threshold ${loopDetectionThreshold}; sleep 60; done`);

  // 启动 watcher 后台进程（只对有 watch 配置的 agent）
  console.log('==> 启动消息流水线...');
  agents.filter((a) => a.watch).forEach((a) => {
    const args = [
      path.join(__dirname, 'watcher.js'),
      '--watch', a.watch.dir,
      '--session', a.session,
      '--wake-cmd', a.watch.cmd,
      '--poll-interval', String(config.pollInterval),
      '--poll-cooldown', String(config.pollCooldown),
    ];
    if (a.watch.pattern) {
      args.splice(3, 0, '--pattern', a.watch.pattern);
    }

    const child = spawn('node', args, {
      detached: true,
      stdio: 'ignore',
      cwd: ROOT_DIR,
    });
    child.unref();
    console.log(`   ${a.session} watcher PID: ${child.pid}`);
  });

  // 打印摘要
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║                                             ║');
  console.log('  ║   部署完成！                                ║');
  console.log('  ║                                             ║');
  console.log('  ║   去飞书给 Bot 发第一条消息                  ║');
  console.log('  ║   Bot 会启动配置向导                        ║');
  console.log('  ║                                             ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  手动配置:');
  console.log('    agents/gateway-agent/IDENTITY.md   ← Agent 身份');
  console.log('    agents/gateway-agent/AGENTS.md   ← 回复方式');
  console.log('    knowledge-base/your-project.md   ← 知识库');
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  部署完成');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('tmux 会话:');
  execSync('tmux ls 2>/dev/null || echo "  (tmux 未运行)"', { encoding: 'utf8', stdio: 'inherit' });
  console.log('');
  console.log('操作:');
  ALL_SESSIONS.forEach((s) => {
    console.log(`  tmux attach -t ${s}`);
  });
  console.log('');
  console.log('下一步 — 配置 Lark:');
  console.log('  1. lark-cli config init        # 输入飞书 App 凭证');
  console.log('  2. lark-cli auth login --recommend');
  console.log('  3. lark-cli event +subscribe --output-dir ./messages/');
  console.log('');
  console.log('停止:');
  console.log('  pkill -f watcher.js');
  console.log('  tmux kill-server');
  console.log('═══════════════════════════════════════════');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
