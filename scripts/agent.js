#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { loadConfig } = require('./lib/config');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'tinyman.config.json');

function ask(rl, prompt, defaultVal) {
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` (${defaultVal}): ` : ': ';
    rl.question(prompt + suffix, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

// ── 新增 agent ──
async function add(rl) {
  console.log('\n=== 新增 Agent ===\n');

  const session = await ask(rl, 'Agent 名称 (如 security-auditor)');
  if (!session) { console.log('已取消'); return; }

  const identity = await ask(rl, '身份标识 (如 security)', session);
  const description = await ask(rl, '职责描述');

  const hasWatch = (await ask(rl, '是否需要 watcher 自动唤醒? (y/n)', 'y')) === 'y';
  let watch = null;
  if (hasWatch) {
    const dir = await ask(rl, '  监控目录', 'tasks');
    const pattern = await ask(rl, '  监控文件模式 (如 security-req-*.json)', `${identity}-req-*.json`);
    const cmd = await ask(rl, '  唤醒命令 (如 读tasks/security-req并审计安全)', `读tasks/${identity}-req并处理`);
    watch = { dir, pattern, cmd };
  }

  const stalenessSec = parseInt(await ask(rl, '卡死超时秒数', '300'), 10);

  // 写入 tinyman.config.json
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.agents.push({
    session,
    identity,
    description,
    stalenessSec,
    ...(watch ? { watch } : {}),
  });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\n  ✓ 已更新 tinyman.config.json`);

  // 创建 agent 目录和文件
  const agentDir = path.join(ROOT, 'agents', session);
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir);
  }

  const identityPath = path.join(agentDir, 'IDENTITY.md');
  const agentsPath = path.join(agentDir, 'AGENTS.md');

  if (!fs.existsSync(identityPath)) {
    fs.writeFileSync(identityPath, `# ${identity} Agent\n\n## 你是谁\n\n${description}\n\n## 核心原则\n\n1. 遵循 CONVENTIONS.md 中的共享规则\n2. 所有结论必须基于 repos/ 中的实际代码\n3. 输出精炼，只写发现和结论\n\n## 工作流程\n\n被 watcher.js 唤醒后：\n1. 读 tasks/${identity}-req-*.json（可能有多个）\n2. 按时间顺序处理\n3. 输出结论到 tasks/${identity}-res-{id}.json\n4. 删除已处理的请求文件\n\n## 输出格式\n\n\`\`\`json\n{"id":"req-xxx","findings":["发现1","发现2"],"conclusion":"一句话总结","files_checked":["repos/xxx/path"]}\n\`\`\`\n\n## 禁止\n\n- 禁止在没有读代码的情况下下结论\n- 禁止直接回复用户，只写结论到 tasks/\n`);
    console.log(`  ✓ 已创建 ${session}/IDENTITY.md`);
  }

  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, `# ${identity} Agent 操作指令\n\n## 消费任务\n\n被 watcher.js 唤醒后：\n1. 读 tasks/${identity}-req-*.json（可能有多个）\n2. 按时间顺序处理\n3. 完成后写 tasks/${identity}-res-{id}.json\n4. 删除已处理的请求文件\n\n## 处理要求\n\n<!-- 在此填写你的领域专用指令，如审查维度、检查清单、判断标准等 -->\n\n## 禁止\n\n- 禁止在没有读代码的情况下下结论\n- 禁止直接回复用户，只写结论到 tasks/\n`);
    console.log(`  ✓ 已创建 ${session}/AGENTS.md`);
  }

  console.log('\n下一步:');
  console.log(`  1. 编辑 agents/${session}/IDENTITY.md 完善身份`);
  console.log(`  2. 编辑 agents/${session}/AGENTS.md 完善操作指令`);
  console.log(`  3. 运行 node scripts/deploy.js 重新部署`);
}

// ── 修改 agent ──
async function edit(rl, sessionName) {
  console.log(`\n=== 修改 Agent: ${sessionName} ===\n`);
  console.log('(直接回车保持当前值，输入新值覆盖)\n');

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const agent = config.agents.find((a) => a.session === sessionName);
  if (!agent) {
    console.error(`✗ 未找到 agent: ${sessionName}`);
    console.error(`  可用: ${config.agents.map((a) => a.session).join(', ')}`);
    return;
  }

  agent.description = await ask(rl, '职责描述', agent.description);
  agent.stalenessSec = parseInt(await ask(rl, '卡死超时秒数', String(agent.stalenessSec || 300)), 10);

  if (agent.watch) {
    console.log('');
    const hasWatch = (await ask(rl, '保留 watcher? (y/n)', 'y')) === 'y';
    if (hasWatch) {
      agent.watch.dir = await ask(rl, '  监控目录', agent.watch.dir);
      agent.watch.pattern = await ask(rl, '  监控文件模式', agent.watch.pattern);
      agent.watch.cmd = await ask(rl, '  唤醒命令', agent.watch.cmd);
    } else {
      delete agent.watch;
    }
  } else {
    const addWatch = (await ask(rl, '添加 watcher? (y/n)', 'n')) === 'y';
    if (addWatch) {
      agent.watch = {
        dir: await ask(rl, '  监控目录', 'tasks'),
        pattern: await ask(rl, '  监控文件模式', `${agent.identity}-req-*.json`),
        cmd: await ask(rl, '  唤醒命令', `读tasks/${agent.identity}-req并处理`),
      };
    }
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`\n  ✓ 已更新 tinyman.config.json`);

  console.log('\n下一步:');
  console.log(`  1. 需要改身份 → 编辑 agents/${sessionName}/IDENTITY.md`);
  console.log(`  2. 需要改操作 → 编辑 agents/${sessionName}/AGENTS.md`);
  console.log(`  3. 运行 node scripts/deploy.js 重新部署`);
}

// ── 删除 agent ──
async function remove(rl, sessionName) {
  console.log(`\n=== 删除 Agent: ${sessionName} ===\n`);

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const idx = config.agents.findIndex((a) => a.session === sessionName);
  if (idx === -1) {
    console.error(`✗ 未找到 agent: ${sessionName}`);
    return;
  }

  const confirm = await ask(rl, `确认删除 ${sessionName}? (y/n)`, 'n');
  if (confirm !== 'y') { console.log('已取消'); return; }

  config.agents.splice(idx, 1);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ✓ 已从 tinyman.config.json 删除 ${sessionName}`);
  console.log(`  (agents/${sessionName}/ 目录保留，手动删除)`);
}

// ── 列出 agent ──
function list() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  console.log('\n=== 当前 Agent 列表 ===\n');
  config.agents.forEach((a) => {
    console.log(`  ${a.session}`);
    console.log(`    身份: ${a.identity}  卡死阈值: ${a.stalenessSec}s`);
    console.log(`    描述: ${a.description || '(无)'}`);
    console.log(`    watcher: ${a.watch ? `${a.watch.dir}/${a.watch.pattern || '*'} → "${a.watch.cmd}"` : '(无)'}`);
    console.log('');
  });
}

// ── 入口 ──
async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
      args[key] = val;
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    if (args.list) {
      list();
    } else if (args.add) {
      await add(rl);
    } else if (args.edit) {
      await edit(rl, args.edit);
    } else if (args.remove) {
      await remove(rl, args.remove);
    } else {
      console.log('用法:');
      console.log('  node scripts/agent.js --add              新增 agent');
      console.log('  node scripts/agent.js --edit <session>    修改 agent');
      console.log('  node scripts/agent.js --remove <session>  删除 agent');
      console.log('  node scripts/agent.js --list             列出所有 agent');
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
