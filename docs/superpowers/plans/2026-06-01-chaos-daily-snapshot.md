# Chaos Daily Snapshot 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每日抓取 Chaos bounty 数据，存储快照，diff 出新增程序并输出。

**Architecture:** 单脚本 `chaos_daily_snapshot.py`，从 index.json 拉取 → 过滤 bounty → 保存快照 → 与上一次快照对比 → 输出新增。

**Tech Stack:** Python 3 stdlib (json, urllib, ssl, pathlib, datetime)

---

### Task 1: 创建 daily snapshot 脚本

**Files:**
- Create: `chaos_daily_snapshot.py`
- Create: `data/` (目录，脚本自动创建)

- [ ] **Step 1: 编写脚本**

```python
#!/usr/bin/env python3
"""Chaos 每日快照 — 抓取 bounty 数据，diff 出新增程序。"""

import json
import ssl
import sys
import urllib.request
from datetime import date
from pathlib import Path

INDEX_URL = "https://chaos-data.projectdiscovery.io/index.json"
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "data"


def fetch_data():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(INDEX_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
        return json.loads(resp.read())


def load_previous_snapshot():
    """找到最近一次快照文件并加载，返回 (date_str, programs_map)。"""
    snapshots = sorted(
        [f for f in DATA_DIR.glob("*.json") if not f.name.startswith("new_")],
        reverse=True,
    )
    if not snapshots:
        return None, {}
    prev_path = snapshots[0]
    prev_date = prev_path.stem
    with open(prev_path) as f:
        programs = json.load(f)
    return prev_date, {p["name"]: p for p in programs}


def diff_new(today_programs, prev_map):
    """返回 prev_map 中没有的新程序列表。"""
    return [p for p in today_programs if p["name"] not in prev_map]


def main():
    print(f"Fetching {INDEX_URL} ...", file=sys.stderr)
    all_data = fetch_data()

    bounty_programs = [p for p in all_data if p.get("bounty")]
    print(f"总程序: {len(all_data)}, 有赏金: {len(bounty_programs)}", file=sys.stderr)

    today_str = str(date.today())

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 保存今日快照
    today_path = DATA_DIR / f"{today_str}.json"
    with open(today_path, "w") as f:
        json.dump(bounty_programs, f, indent=2, ensure_ascii=False)
    print(f"快照已保存: {today_path}", file=sys.stderr)

    # 读取上一次快照并对比
    prev_date, prev_map = load_previous_snapshot()
    if prev_date is None:
        print("未找到历史快照，本次全部视为新增。", file=sys.stderr)
        new_programs = bounty_programs
    else:
        new_programs = diff_new(bounty_programs, prev_map)
        print(
            f"对比快照: {prev_date} → {today_str}, 新增: {len(new_programs)}",
            file=sys.stderr,
        )

    # 输出新增
    if new_programs:
        new_path = DATA_DIR / f"new_{today_str}.json"
        with open(new_path, "w") as f:
            json.dump(new_programs, f, indent=2, ensure_ascii=False)
        print(f"新增已保存: {new_path}", file=sys.stderr)

        # 终端输出
        print(f"\n{'名称':<40} {'子域名数':>10} {'平台':<15} {'最后更新'}")
        print("-" * 100)
        for p in sorted(new_programs, key=lambda x: x.get("count", 0), reverse=True):
            name = p["name"][:38]
            count = p.get("count", 0)
            platform = p.get("platform", "-") or "-"
            updated = p.get("last_updated", "")[:10]
            print(f"{name:<40} {count:>10,} {platform:<15} {updated}")
    else:
        print("无新增程序。")

    return 0 if new_programs else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: 运行脚本测试**

```bash
python3 chaos_daily_snapshot.py
```
预期: 创建 `data/YYYY-MM-DD.json` 和 `data/new_YYYY-MM-DD.json`（首次运行全部视为新增）

- [ ] **Step 3: 模拟第二天运行验证 diff**

```bash
python3 chaos_daily_snapshot.py
```
预期: 输出 "无新增程序。" 或少量新增

- [ ] **Step 4: 验证文件结构**

```bash
ls -la data/
```
预期: 两个快照文件 + 至少一个新文件
