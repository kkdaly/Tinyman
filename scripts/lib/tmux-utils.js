// tmux 通用工具 — watcher 和 supervisor 共用
// Windows 上使用 itmux 提供 tmux 命令，接口一致

const { execSync } = require('child_process');

function tmux(args) {
  try {
    return execSync(`tmux ${args}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function hasTmux() {
  try {
    execSync('command -v tmux', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function hasSession(session) {
  return tmux(`has-session -t "${session}"`) !== null;
}

function createSession(session, cwd) {
  const result = tmux(`new-session -d -s "${session}" -c "${cwd}"`);
  return result !== null;
}

function capturePane(session, lines) {
  const l = lines || 20;
  const output = tmux(`capture-pane -t "${session}" -p -S -${l}`);
  return output || '';
}

function isHumanAttached(session) {
  const output = tmux(`list-clients -t "${session}"`);
  return output !== null && output.trim().length > 0;
}

function getSessionActivity(session) {
  const output = tmux(`display-message -t "${session}" -p '#{session_activity}'`);
  if (!output) return 0;
  return parseInt(output.trim(), 10) || 0;
}

function sendKeys(session, cmd) {
  const safe = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return tmux(`send-keys -t "${session}" "${safe}" C-m`);
}

function isAgentBusy(session, harness) {
  const output = capturePane(session, 20);
  if (!output) return false;

  const lines = output.trim().split('\n');
  const recent = lines.slice(-8).join('\n');
  const lastThree = lines.slice(-3).join('\n');

  if (harness.busyPattern && harness.busyPattern.test(recent)) {
    return true;
  }

  if (harness.idlePattern && harness.idlePattern.test(lastThree)) {
    return false;
  }

  return true; // 不确定时视为忙碌，保守处理
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(session, harness, timeoutSec) {
  const timeout = (timeoutSec || 30) * 1000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Claude Code 首次条款接受
    if (harness.needsTermsAccept) {
      const pane = capturePane(session, 10);
      if (pane.includes('I accept')) {
        sendKeys(session, 'Enter');
        await sleep(2000);
      }
    }

    const pane = capturePane(session, 10);
    const lastThree = pane.trim().split('\n').slice(-3).join('\n');

    if (harness.idlePattern && harness.idlePattern.test(lastThree)) {
      console.log(`   ${session} 就绪`);
      return true;
    }

    await sleep(1000);
  }

  console.log(`   ⚠ ${session} 超时未就绪`);
  return false;
}

module.exports = {
  hasTmux,
  hasSession,
  createSession,
  capturePane,
  isHumanAttached,
  getSessionActivity,
  sendKeys,
  isAgentBusy,
  waitUntilReady,
  sleep,
};
