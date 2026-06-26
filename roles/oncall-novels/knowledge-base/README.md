# 知识库索引

## 代码仓库

| 仓库 | 路径 | 用途 | 什么时候看 |
|------|------|------|-----------|
| novels | repos/novels | 小说阅读平台全栈项目 | 所有 Oncall 问答 |

包含子项目：
- **novel_server** — 用户端 API（端口 3000），Node.js + Koa + Sequelize
- **kk_admin_server** — 管理端 API（端口 3001），Node.js + Koa + Sequelize
- **kk_novel** — 用户前端 SPA，Vue 3 + Vite + Tailwind
- **kk_admin** — 管理前端 SPA，Vue 3 + Vite + Tailwind
- **novel_spider** — 爬虫，Python + SQLAlchemy + PyMySQL

## 领域知识

| 文档 | 内容 | Owner |
|------|------|-------|
| novels-platform.md | 小说阅读平台架构、技术栈、常见问题、踩坑记录 | @kkdaly |

## 重要组件背景

- **MySQL 8.0** — 共享单库 `kk_novel`，两个后端 + 爬虫共用，Model 同步需手动维护
- **Redis 6+** — 仅 novel_server 使用，用于 session 和缓存
- **FlareSolverr** — 反反爬代理，Docker 运行在 8191，URL 必须以 `/v1` 结尾
- **Nginx** — 生产反向代理，`/api/` → novel_server:3000，`/api/admin/` → kk_admin_server:3001（仅内网）
- **JWT** — novel_server 和 kk_admin_server 使用独立的 JWT secret
- **Proxy 模式** — novel_server 支持实时代理到源站（wenku8.net），配置缓存 60 秒

## 使用说明

Agent 回答用户问题时：
1. 先查本知识库是否有相关文档
2. 再读对应代码仓库确认（repos/novels/ 下）
3. 如果知识库和代码都没有答案，明确告知用户并记录到 worklog
