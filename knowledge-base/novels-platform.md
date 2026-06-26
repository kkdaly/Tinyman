# 小说阅读平台

## 概述

一个完整的小说阅读平台，支持用户浏览、搜索、阅读小说，管理员通过后台管理内容和系统配置。数据源来自 wenku8.net，通过 Python 爬虫采集。

## 子项目

| 仓库 | 路径 | 用途 | 什么时候看 |
|------|------|------|-----------|
| novel_server | repos/novels/novel_server | 用户端 API（端口 3000） | 用户报接口错误、认证问题、阅读/搜索/收藏功能异常 |
| kk_admin_server | repos/novels/kk_admin_server | 管理端 API（端口 3001） | 管理后台接口异常、管理员认证问题、系统配置相关 |
| kk_novel | repos/novels/kk_novel | 用户前端 SPA（端口 5173 dev） | 前端页面问题、UI 异常、路由跳转问题 |
| kk_admin | repos/novels/kk_admin | 管理前端 SPA（端口 5273 dev） | 管理后台页面问题 |
| novel_spider | repos/novels/novel_spider | Python 爬虫（CLI） | 数据采集失败、章节缺失、导出问题 |

## 技术栈

- **后端:** Node.js + Koa + TypeScript + Sequelize ORM + JWT
- **前端:** Vue 3 + Vite + Pinia + Tailwind CSS
- **爬虫:** Python 3 + SQLAlchemy + PyMySQL
- **基础设施:** MySQL 8.0（共享单库 `kk_novel`）、Redis 6+（仅 novel_server）、FlareSolverr（反反爬）

## 关键架构决策

### 共享 MySQL 数据库

最重要的设计决策。两个后端（novel_server、kk_admin_server）和爬虫（novel_spider）读写同一个 `kk_novel` 数据库。这意味着：

- kk_admin_server 的 Model 定义必须和 novel_server 保持一致
- 爬虫直接写表，不经过任何 API
- 任何 Schema 变更需要同步到三个代码库

### Proxy 代理模式

novel_server 支持 proxy 模式：当 `proxy.enabled` 为 true 时，小说详情/章节请求会实时代理到源站（wenku8.net），而非返回本地数据库内容。proxy 配置缓存在 proxyMiddleware 中 60 秒，配置变更不会立即生效。

### 标签系统重构（2026-04）

从 `novel.tags` JSON 数组迁移到 `tag` + `novel_tag` 关联表，保留了向后兼容的回退逻辑。

### 系统配置分离

`client_config` 和 `admin_config` 两张配置表，通过 `isPublic` 控制是否对外暴露。敏感配置（AK/SK）标记为 `isPublic=0`。

## 端口映射

| 组件 | 开发端口 | 生产访问 |
|------|---------|---------|
| novel_server | 3000 | Nginx `/api/` |
| kk_admin_server | 3001 | Nginx `/api/admin/`（仅内网） |
| kk_novel | 5173 | Nginx 静态文件 |
| kk_admin | 5273 | Nginx 静态文件（admin 子域名） |
| FlareSolverr | 8191 | 仅内网 |
| MySQL | 3306 | 内网 |
| Redis | 6379 | 内网 |

## 注意事项（踩过的坑）

1. Model 同步是手动的且有风险。如果 novel_server 加了列而 kk_admin_server 没加，`sequelize.sync({ alter: true })` 可能意外删改列。

2. FlareSolverr URL 必须以 `/v1` 结尾。如果 .env 里写成 `http://localhost:8191`（缺 `/v1`），爬虫会收到 HTTP 405。

3. Proxy 配置缓存 60 秒。改完 `proxy.enabled` 不会立刻生效。重启 novel_server 可立即生效。

4. JWT 密钥是独立的。novel_server 和 kk_admin_server 使用不同的 JWT secret，token 不互通。

5. 管理端 JWT 是基于 user 表的——通过 `isAdmin=1 AND isBanned=0` 判断管理员身份，没有独立的 admin 表。

6. 生产环境管理端接口不应暴露到公网。需通过 Nginx IP 白名单或内网限制访问 `/api/admin/*`。

7. 爬虫直接写数据库，绕过服务层。如果 DB schema 变更，必须手动更新 `novel_spider/db/models.py`。

8. 数据库初始化顺序：init.sql → 迁移脚本（按序）→ preset-configs.sql → admin 用户 INSERT。
