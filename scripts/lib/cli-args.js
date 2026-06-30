// 简单的 CLI 参数解析，无外部依赖
// --key value → { key: 'value' }, --flag → { flag: true }

function parseArgs(argv) {
  const args = {};
  const list = argv || process.argv;
  for (let i = 2; i < list.length; i++) {
    const arg = list[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

module.exports = { parseArgs };
