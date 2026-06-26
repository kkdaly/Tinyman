# 编译构建平台智能助手 - 设计方案

## 概述

为公司内部代码编译和 Docker 镜像构建平台设计一个智能 Agent 助手，通过飞书机器人提供服务，解决平台用户在使用过程中遇到的配置、编译、Docker 构建等全链路问题。

- **交互渠道**：飞书机器人（私聊 + 群聊 @）
- **用户规模**：200+ 人
- **问题范围**：平台配置 → 编译（Node.js / Python / Go / Java）→ Docker 构建 → 镜像推送，全链路诊断
- **LLM**：对接公司已有采购的模型服务
- **知识来源**：平台文档（Wiki/飞书文档）、历史工单、代码仓库配置示例、DevOps 经验、构建日志

---

## 1. 整体架构：混合 RAG + Agentic 诊断

```
飞书消息网关 (Webhook + 鉴权 + 会话管理)
        │
        ▼
   问题路由器 (意图识别 + 复杂度判定)
        │
   ┌────┴────┐
   │         │
   ▼         ▼
快速通道    深度诊断通道
(RAG)       (Agentic Engine)
< 3s        10-30s
   │         │
   │    ┌────┴──────┐
   │    │   工具集    │
   │    │ • 日志分析  │
   │    │ • 配置校验  │
   │    │ • Docker   │
   │    │   解析器   │
   │    │ • 错误匹配  │
   │    └────┬──────┘
   │         │
   └────┬────┘
        ▼
    知识层
  • 文档向量库
  • 工单向量库
  • 错误知识图谱
        │
        ▼
   LLM 服务 (公司已有采购)
```

**三个核心原则**：
1. **快慢分离**：配置类问题走快速 RAG 通道，报错诊断走 Agent 深度推理
2. **知识分层**：文本知识（文档/工单）用向量检索，结构化错误模式用知识图谱
3. **渐进式能力**：工具集按阶段接入，不要求一次到位

---

## 2. 知识摄取管线

### 2.1 多源知识接入

| 来源 | 形态 | 处理方式 | 更新频率 |
|------|------|----------|----------|
| 平台文档 (Wiki/飞书文档) | 非结构化文本 | 分块 → 向量化 → 存入文档向量库 | 文档更新时触发同步（webhook / 定时拉取） |
| 历史工单 | 半结构化 (问题+回复) | 提取 QA 对 → 向量化 → 存入工单向量库 | 一次性导入 + 增量同步 |
| 代码仓库配置示例 | Dockerfile / pipeline.yaml / Makefile | 按项目+语言分类 → 存入配置模板库 | 定时扫描仓库 |
| DevOps 经验 | 散落在人脑中 | 提供后台录入界面，支持 "问题-原因-解法" 结构化录入 | 手动维护 |
| 构建日志 | 结构化 + 半结构化 | 提取错误片段 → 归类 → 补充知识图谱 | 实时或准实时 |

### 2.2 文档分块策略

- **滑动窗口 + 语义分块**：按标题/段落自然边界切块，每个 chunk 500-1000 token
- **保留元数据**：每个 chunk 记录来源文档标题、章节、URL、更新时间
- **增量更新**：文档变更时通过 webhook 或定时 diff 触发重新向量化对应章节

### 2.3 知识索引结构

```
文档向量库 (Milvus / Qdrant)
├── collection: platform_docs        # 平台使用文档
├── collection: language_guides      # 各语言构建指南
│   ├── filtered by: nodejs / python / go / java
├── collection: docker_guides        # Docker 构建最佳实践
└── collection: tickets              # 历史工单 QA 对

错误知识图谱 (Neo4j / NebulaGraph)
├── 节点: 错误类型 / 原因 / 解决方案 / 涉及组件
└── 关系: caused_by / resolved_by / related_to / occurs_in
```

---

## 3. 问题路由器

### 3.1 意图识别 Prompt

使用 LLM 做初筛（一次轻量调用），输出结构化的意图分类：

```
你是一个构建平台问题分类器。分析用户消息，输出 JSON：

{
  "category": "config|compile|docker|pipeline|other",
  "language": "nodejs|python|go|java|null",
  "complexity": "simple|complex",
  "has_error_log": true/false,
  "keywords": ["node-gyp", "python3"],
  "needs_build_log": true/false
}

简单问题 (complexity=simple)：平台怎么配置、字段说明、流程指引
复杂问题 (complexity=complex)：编译报错分析、Docker 构建失败、需要多步排查
```

### 3.2 路由规则

| 条件 | 通道 | 预期响应 |
|------|------|----------|
| complexity=simple && has_error_log=false | 快速 RAG | < 3s |
| complexity=complex 或 has_error_log=true | 深度诊断 | 10-30s |
| 用户上传了错误日志 | 深度诊断 | 10-30s |
| 飞书群聊中被 @（需要上下文理解） | 默认深度诊断 | 10-30s |

---

## 4. 快速通道：RAG 检索增强问答

### 4.1 处理流程

```
用户问题
  → Query Rewriting (用历史对话上下文改写问题)
  → 多路召回:
      ├── 文档向量检索 (top_k=5)
      ├── 工单向量检索 (top_k=3)
      └── 关键词 BM25 检索 (精确匹配配置项名称)
  → 精排重排序 (Reranker)
  → 拼接 Prompt + 检索结果
  → LLM 生成回答
  → 附上引用来源链接
```

### 4.2 RAG Prompt 模板

```
你是 [平台名称] 构建平台的智能助手。基于以下参考资料回答用户问题。

## 参考资料
{retrieved_docs}

## 对话历史
{chat_history}

## 用户问题
{user_question}

## 要求
- 如果参考资料中包含答案，准确引用并附上来源
- 如果参考资料不足以回答，明确告知用户，不要编造
- 涉及具体配置时，给出可复制的示例
- 回答简洁，技术问题直接给方案，不要铺垫
```

---

## 5. 深度诊断通道：Agentic Engine

### 5.1 Agent 推理循环

```
1. 理解问题 → 提取关键信息（语言、错误类型、上下文）
2. 制定排查计划 → 确定需要调用哪些工具
3. 执行工具调用 → 查日志 / 查文档 / 分析 Dockerfile / 匹配错误模式
4. 分析结果 → 验证假设，如果未定位根因则回到步骤 2
5. 生成诊断报告 → 根因分析 + 修复建议 + 参考来源
```

最大重试 5 轮，避免死循环。

### 5.2 Agent System Prompt（核心）

```
你是一个 [平台名称] 构建平台的资深运维专家 Agent。你的任务是诊断用户的构建问题并给出可操作的解决建议。

## 你可以使用的工具
- search_docs(query): 搜索平台文档
- search_tickets(error_keywords): 搜索历史工单中相似的问题
- analyze_build_log(log_content): 分析构建日志中的错误
- validate_config(platform_config): 校验平台配置项的合法性
- analyze_dockerfile(dockerfile_content): 分析 Dockerfile 的问题
- search_error_pattern(error_message): 在错误知识图谱中匹配已知错误模式

## 排查原则
1. 先定位问题范围（配置层 / 编译层 / Docker 层 / 平台层）
2. 优先查错误知识图谱，命中已知模式直接给方案
3. 未命中则逐步排查：读日志 → 找根因 → 给方案
4. 如果信息不足，向用户追问关键信息（如完整错误日志、Dockerfile、配置截图）
5. 不要猜测，不确定时明确说明不确定性

## 输出格式
每个诊断结果按以下结构输出：
### 问题定位
<简要描述根因>

### 原因分析
<技术原理说明>

### 解决方案
<具体可操作的步骤，带命令或配置示例>

### 参考
<引用文档/工单链接>
```

---

## 6. 工具集设计

### 6.1 构建日志分析器

- **输入**：用户粘贴的构建日志文本 / 平台构建日志 ID
- **处理**：
  1. 提取 ERROR / FATAL 行及上下文
  2. 识别错误类型（编译错误 / 依赖解析错误 / 链接错误 / Docker daemon 错误 / 平台超时等）
  3. 提取关键信息（文件路径、行号、依赖名、版本号）
- **与知识图谱联动**：用提取的错误指纹去知识图谱匹配已知模式

### 6.2 平台配置校验器

- 读取用户项目的平台配置文件
- 校验项：
  - 必填字段是否完整
  - 构建命令是否合理（如 `npm install` vs `npm ci`）
  - 镜像基础镜像是否存在
  - 资源限制设置是否合理
  - 环境变量引用是否正确
- **输出**：配置问题列表 + 修复建议

### 6.3 Dockerfile 解析器

- 静态分析 Dockerfile：
  - 基础镜像版本是否过旧/存在已知漏洞
  - COPY/ADD 路径是否正确
  - RUN 命令合并优化建议
  - 多阶段构建是否正确
  - .dockerignore 是否合理
  - 缓存利用是否充分
- 结合构建日志分析 layer 构建失败原因

### 6.4 错误模式匹配器

- 连接错误知识图谱
- 输入错误信息 → 输出匹配的错误模式 + 推荐解决方案 + 置信度
- 支持模糊匹配（不同版本的依赖报错信息可能略有差异）

---

## 7. 错误知识图谱

### 7.1 Schema 设计

```
节点类型：
- ErrorType      (错误类别)      属性: name, description, severity
- ErrorPattern   (具体错误模式)   属性: fingerprint, regex_pattern, language, component
- RootCause      (根因)          属性: description, category
- Solution       (解决方案)       属性: steps[], commands[], config_example
- Component      (涉及组件)       属性: name (node-gyp / pip / go mod / docker daemon / ...)

关系：
- ErrorPattern -[:belongs_to]-> ErrorType
- ErrorPattern -[:caused_by]-> RootCause
- RootCause    -[:resolved_by]-> Solution
- ErrorPattern -[:occurs_in]-> Component
- ErrorPattern -[:related_to]-> ErrorPattern  (经常一起出现)
```

### 7.2 构建方式

| 阶段 | 方法 | 产出 |
|------|------|------|
| 冷启动 | 导出现有工单，手工标注 50-100 个高频错误模式 | 核心知识图谱骨架 |
| 持续积累 | 每次深度诊断解决新问题后，运维确认后结构化录入图谱 | 增量节点和关系 |
| 半自动化 | 分析构建日志中的错误频率，发现新的高频错误模式，提醒运维录入 | 候选模式 |

### 7.3 典型知识图谱条目示例

```
ErrorPattern: "node-gyp rebuild failed"
  - belongs_to: CompileError
  - caused_by: NodeVersionMismatch
  - caused_by: MissingBuildTools
  - resolved_by: InstallBuildEssentials
  - resolved_by: UseNodeVersionFile
  - occurs_in: node-gyp
  - related_to: PythonNotFound (node-gyp 需要 python3)

Solution: InstallBuildEssentials
  - steps: [
      "apt-get install build-essential python3",
      "或设置 npm config set python /usr/bin/python3"
    ]
  - commands: ["npm config set python /usr/bin/python3 && npm rebuild"]
```

---

## 8. 飞书集成

### 8.1 交互设计

| 场景 | 行为 |
|------|------|
| 私聊提问 | 直接响应，维护会话上下文（记住上一轮的构建日志等） |
| 群聊 @机器人 | 响应，默认不带上下文，除非引用之前的消息 |
| 用户发送长日志 | 飞书消息有长度限制，长日志引导用户贴到飞书文档并发送链接，或分段发送 |
| 解决问题后 | 主动询问 "问题解决了吗？"，收集反馈 |
| 诊断超时（>30s） | 先回复 "正在排查中..."，排查完成后回复完整结果 |

### 8.2 会话管理

- 每个用户/群聊维护独立会话，TTL 30 分钟
- 会话存储最近的上下文（提问历史、已上传的日志内容、当前排查阶段）
- 支持 `/reset` 命令清除会话上下文

### 8.3 飞书能力利用

- **卡片消息**：诊断报告用飞书卡片呈现，结构化展示问题/原因/方案/参考
- **按钮交互**：卡片附带 "已解决" / "未解决需要人工" 按钮，一键反馈
- **文档解析**：如果用户发送飞书文档链接，解析文档内容作为问题上下文

---

## 9. 反馈闭环

### 9.1 反馈收集

- **显式反馈**：诊断报告卡片上的 "已解决 / 未解决" 按钮
- **隐式反馈**：同一会话内用户是否重复问类似问题（说明上次没解决）
- **定期回顾**：每周人工抽查未解决的问题，补充到知识图谱

### 9.2 效果度量

| 指标 | 定义 | 目标 |
|------|------|------|
| 自助解决率 | 用户反馈 "已解决" / 总诊断次数 | > 60%（初期），> 80%（成熟期） |
| 首次响应时间 | 用户提问到首次回复的时间 | < 3s（快速），< 30s（深度） |
| 人工转接率 | 触发转人工的比例 | < 20% |
| 知识覆盖率 | 命中知识图谱中已知模式的比例 | > 50% |

---

## 10. 分阶段交付计划

### Phase 1：基础 RAG 问答（第 1-3 周）

- 知识摄取管线（文档 + 工单导入 + 向量化）
- 快速通道 RAG 引擎
- 飞书机器人基础接入（私聊 + 群聊 @）
- 问题路由器（简单版，LLM 分类）
- **交付物**：能回答平台配置类问题，附带文档引用

### Phase 2：知识图谱 + 基础诊断（第 4-6 周）

- 构建错误知识图谱（手工标注 50-100 个高频模式）
- Agentic Engine 框架
- 错误模式匹配器 + Dockerfile 解析器
- 深度诊断通道上线
- **交付物**：能诊断常见编译和 Docker 构建错误，给出修复建议

### Phase 3：高级工具 + 持续优化（第 7-10 周）

- 构建日志分析器（对接平台日志 API）
- 平台配置校验器
- 错误知识图谱半自动化积累
- 反馈闭环机制完善
- 飞书卡片消息 + 按钮交互
- **交付物**：完整能力上线，持续从反馈中优化

---

## 11. 技术栈建议

| 组件 | 推荐方案 | 备选方案 |
|------|----------|----------|
| 后端框架 | Python (FastAPI) | Go (Gin) |
| LLM 服务 | 公司已有采购的模型 API | - |
| 向量数据库 | Milvus / Qdrant | Chroma（轻量） |
| 图数据库 | Neo4j Community | NebulaGraph |
| 搜索引擎 | Elasticsearch (BM25) | - |
| 消息队列 | Redis / Kafka | RabbitMQ |
| 飞书 SDK | lark-oapi (飞书开放平台 SDK) | - |
| 部署 | K8s 集群（和平台共用基础设施） | Docker Compose（开发阶段） |
| 监控 | Prometheus + Grafana | 公司已有监控体系 |

---

## 12. 待决策项

以下事项需要在实现前确定：

1. **LLM 接入细节**：公司已有采购的是哪个模型服务？API 接口形式？上下文窗口大小？是否支持 Function Calling？
2. **平台 API 权限**：Agent 需要调用构建平台的哪些 API（读日志、读配置等）？鉴权方式？
3. **知识来源访问**：能否直接访问 Wiki/飞书文档的 API？历史工单存在哪个系统？
4. **飞书应用注册**：谁负责在飞书开放平台注册应用并配置权限？
5. **人工兜底策略**：Agent 解决不了的问题转给谁？转接流程是什么？
