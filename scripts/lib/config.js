// 配置加载 — 所有脚本共用的默认值和读取逻辑

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  harness: 'claude',
  projectName: 'Tide',
  projectDesc: '',
  imPlatform: 'lark',
  promptBase: 'CONVENTIONS.md',
  pollInterval: 1,
  pollCooldown: 15,
  dirs: {
    repos: 'repos',
    knowledge: 'knowledge-base',
    messages: 'messages',
    tasks: 'tasks',
    worklogs: 'worklogs',
  },
  supervisorStalenessSec: 180,
  messageBacklogThreshold: 10,
  loopDetectionThreshold: 5,
  agents: [],
};

function loadConfig(rootDir) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(rootDir, 'tide.config.json'), 'utf8'));
  } catch {
    config = {};
  }

  // 合并默认值
  return {
    ...DEFAULTS,
    ...config,
    dirs: { ...DEFAULTS.dirs, ...(config.dirs || {}) },
  };
}

const { presets } = require('../harness-presets');
const VALID_HARNESSES = Object.keys(presets);

function validateConfig(config) {
  const errors = [];

  if (!VALID_HARNESSES.includes(config.harness)) {
    errors.push(`harness: "${config.harness}" 无效，可选: ${VALID_HARNESSES.join(', ')}`);
  }

  if (typeof config.pollInterval !== 'number' || config.pollInterval < 1) {
    errors.push('pollInterval 必须是 >= 1 的数字');
  }

  if (typeof config.pollCooldown !== 'number' || config.pollCooldown < 1) {
    errors.push('pollCooldown 必须是 >= 1 的数字');
  }

  const dirKeys = ['repos', 'knowledge', 'messages', 'tasks', 'worklogs'];
  if (config.dirs && typeof config.dirs === 'object') {
    dirKeys.forEach((k) => {
      if (config.dirs[k] !== undefined && typeof config.dirs[k] !== 'string') {
        errors.push(`dirs.${k} 必须是字符串`);
      }
    });
  }

  if (!Array.isArray(config.agents)) {
    errors.push('agents 必须是数组');
  } else {
    config.agents.forEach((a, i) => {
      if (!a.session) errors.push(`agents[${i}]: 缺少 session`);
      if (!a.identity) errors.push(`agents[${i}]: 缺少 identity`);
      if (a.description !== undefined && typeof a.description !== 'string') {
        errors.push(`agents[${i}]: description 必须是字符串`);
      }
      if (a.stalenessSec !== undefined && (typeof a.stalenessSec !== 'number' || a.stalenessSec < 1)) {
        errors.push(`agents[${i}]: stalenessSec 必须是 >= 1 的数字`);
      }
      if (a.watch) {
        if (!a.watch.dir) errors.push(`agents[${i}].watch: 缺少 dir`);
        if (!a.watch.cmd) errors.push(`agents[${i}].watch: 缺少 cmd`);
      }
    });
  }

  return errors;
}

module.exports = { loadConfig, validateConfig, DEFAULTS };
