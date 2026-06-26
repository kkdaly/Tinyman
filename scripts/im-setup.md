# Lark 消息订阅配置

## 已就绪

- `lark-cli` 已安装 (v1.0.58)
- 消息订阅命令: `lark-cli event +subscribe`

## 需要你完成

### 1. 创建 Lark App

前往 https://open.larksuite.com/ 创建应用，获取 App ID 和 App Secret。

### 2. 配置权限

在 Lark 开放平台为你的 App 添加以下权限：
- `im:message:readonly` — 读取消息
- `im:message.group_at_msg.include_bot:readonly` — 接收群内 at Bot 消息

### 3. 初始化 Lark CLI

```bash
lark-cli config init
# 按提示输入 App ID 和 App Secret
```

### 4. 授权登录

```bash
lark-cli auth login --recommend
```

### 5. 启动消息订阅

```bash
# 订阅消息到 messages/ 目录
lark-cli event +subscribe --output-dir messages/
```

### 6. 启动消息流水线

```bash
# 后台循环运行 msg-watcher
nohup bash -c 'while true; do ./scripts/msg-watcher.sh; sleep 30; done' &
```

## 回复通道

消息回复有两种方式：
1. 在 Agent 的 loop prompt 中通过 lark-cli 直接回复
2. 在 supervisor prompt 中加入 lark message send 命令

具体 reply 方式在 lark-cli config init 后根据可用的 send 命令调整。
