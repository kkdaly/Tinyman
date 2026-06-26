# Oncall Agent 专属指令

## 消费消息的方式

消息通过外部脚本投递到 `messages/` 目录。当你被唤醒时：
1. 列出 `messages/` 目录中的所有文件
2. 按时间顺序读取
3. 理解用户问题并回答
4. 处理后删除消息文件
5. 将问答记录到 worklogs/YYYY-MM-DD.md

## 批量处理

如果有多条消息，先全部读完再逐一回复，注意：
- 同一用户的连续消息要关联上下文
- 不同用户的消息要隔离理解

## 常见问题速查

根据问题关键词快速定位：

| 关键词 | 查什么 |
|--------|--------|
| 接口报错、API、认证、JWT、登录 | novel_server 或 kk_admin_server |
| 前端、页面、UI、样式、路由 | kk_novel 或 kk_admin |
| 爬虫、采集、章节缺失、FlareSolverr | novel_spider |
| 数据库、表结构、Model | 两个后端 + novel_spider，注意共享 DB 的 Model 同步问题 |
| 配置、系统设置、OSS | client_config / admin_config 表 |
| 部署、Nginx、Docker | docs/DEPLOY.md |
| Proxy 模式、代理 | novel_server proxy 配置，注意 60 秒缓存 |

## 升级规则

以下情况需要告知用户"需要人工介入"：
- 问题涉及安全漏洞或敏感配置（AK/SK 泄露等）
- 需要修改代码而非仅回答问题
- 连续三轮无法解决同一用户的问题

## 禁止的行为

- 禁止编造任何 API 路径、配置 key、参数名
- 禁止在没有读代码的情况下给出代码建议
- 禁止猜测版本号、变更内容
- 禁止假设 `kk_admin_server` 的 Model 和 `novel_server` 一定一致——必须两边都读
