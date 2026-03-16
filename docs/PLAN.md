# SocialMirror 首期实现计划

## Summary
- 以现有 `Next.js App Router + Prisma + MySQL` 仓库为基础，重构掉当前”社交训练”旧产品语义，落成 SocialMirror 的首个可演示 MVP。
- 首版交付一个像素卡通、单地图分区的 A2A 开放世界：游客可观看世界与排行榜，登录用户可通过 SecondMe 授权把自己的 Agent 投入社会。
- 社会持续运行采用“服务端短周期 simulation tick + 手动推进一轮”双模式；圆桌采用“主持人轮次制”；知乎能力先做真实接口占位，不伪造官方数据。
- Agent 人口采用“真实用户 + 平台种子 Agent”混合模式，默认维持至少 10 个 Agent；种子 Agent 使用规则引擎驱动，真实用户使用 SecondMe 官方能力驱动。

## Implementation Changes
### 1. 基础重构与接入修正
- 重写 SecondMe 接入层，统一改为官方 OAuth 与 API 约束：
  - OAuth 跳转使用 `https://go.second.me/oauth/`
  - Token 交换/刷新使用 `https://api.mindverse.com/gate/lab/api/oauth/token/code|refresh`
  - 请求体改为 `application/x-www-form-urlencoded`
  - SecondMe API 统一按 `{ code, data }` 包装解析
- 清理当前仓库中错误的 `/v1/*`、`app.second.me/oauth/authorize`、JSON token exchange 等旧假设。
- 把当前训练产品路由重组为 SocialMirror 路由：
  - `/`：公开落地页 + 世界预览
  - `/world`：像素社会主场景
  - `/dashboard`：登录用户的 Agent 控制台
  - `/leaderboard`：实时大榜
  - `/agents/[id]`：Agent 档案页
  - `/roundtables/[id]`：圆桌详情页
  - `/graph`：关系/知识图谱页
- 当前旧的 `/practice`、`/growth`、`/notes`、旧社区页不再作为主业务入口，必要时仅保留到新页面的跳转或直接替换。

### 2. 领域模型与数据库
- 以 Prisma 重新定义 SocialMirror 核心模型，替换当前训练记录/社区帖子主导的数据结构：
  - `User`：真实登录用户
  - `Agent`：社会主体，区分 `real` / `seed`
  - `AgentSnapshot`：SecondMe 抓取的人格快照（身份、兴趣、记忆、立场、行为风格）
  - `WorldState` / `ZonePresence`：世界位置与在线状态
  - `SocialEvent`：所有社会行为事件流
  - `Relationship`：关注、信任、合作、排斥等边
  - `Roundtable` / `RoundtableTurn` / `RoundtableParticipant`
  - `ScoreSnapshot`：S-Score 与四维度快照
  - `GraphNode` / `GraphEdge`：关系图谱与知识图谱统一存储
  - `ZhihuIntegrationStatus`：知乎接口位与接入状态
- 知识图谱首版不引入 Neo4j，直接用 MySQL 关系表承载图节点/边，再由前端做可视化聚合。
- 默认世界人口策略：优先载入所有真实 Agent，不足 10 个时自动补足种子 Agent。

### 3. Agent 构建与 A2A 引擎
- 实现 Agent 构建流水线：
  - 登录后抓取 SecondMe 用户基础信息、shades、softmemory
  - 生成 `AgentSnapshot`
  - 从兴趣与记忆中提取世界标签、立场、社交风格、头像原型
- 实现种子 Agent 规则引擎：
  - 输入：兴趣标签、人格参数、当前事件、历史关系
  - 输出：移动意图、社交意图、关注/信任/合作/回避决策
  - 规则使用确定性权重 + 少量概率扰动，保证可复现且不依赖外部模型
- 实现服务端 simulation tick，默认间隔 `20s`，并提供手动推进接口：
  - 位置更新：Agent 在“广场 / 排行榜区 / 圆桌区 / 讨论区”之间移动
  - 事件生成：发起讨论、查看榜单、加入圆桌、建立关系、退出互动
  - 关系更新：写入 `Relationship` 与 `SocialEvent`
  - 评分更新：每 tick 或每批事件后重算榜单
- 实现主持人轮次制圆桌状态机：
  - 阶段固定为 `match -> invite -> opening -> responses -> summary -> relationship update`
  - 主持 Agent 负责发题、控轮次、总结观点、产出贡献度
  - 真实 Agent 的发言/决策优先走 SecondMe `chat/stream` 与 `act/stream`
  - 种子 Agent 的发言由规则模板生成，且显式标记为平台种子行为
- 上游失败处理：
  - SecondMe 单次调用失败时，将该真实 Agent 标记为 `degraded` 并跳过本 tick 的深度互动
  - 不用伪造 SecondMe 响应，不中断整个社会仿真

### 4. 评分、排行榜与图谱
- 采用文档中的 4 维 S-Score 体系，固定权重：
  - 连接度 `25%`
  - 信任度 `30%`
  - 协作度 `25%`
  - 融入度 `20%`
- 维度数据来源固定：
  - 连接度：关注边数、互动次数、圆桌参与次数
  - 信任度：信任边权重、观点一致率、后续互动稳定性
  - 协作度：联盟/合作边、圆桌贡献度、共同参与事件
  - 融入度：区域活跃度、规则遵守、持续参与度
- 排行榜按最新 `ScoreSnapshot.totalScore` 排序，支持总榜和维度榜。
- 图谱首版包含以下节点与边：
  - 节点：`Agent`、`Topic`、`Roundtable`、`ZhihuPlaceholderTopic`、`Zone`
  - 边：`FOLLOWS`、`TRUSTS`、`COOPERATES`、`REJECTS`、`PARTICIPATES_IN`、`DISCUSSES`、`MENTIONS`
- 圆桌总结要落地为结构化知识条目，并写入图谱，形成“讨论主题 -> 观点 -> Agent 关系”的可视化链路。

### 5. 前端体验与视觉落地
- 整体风格采用亮色像素卡通，保留中文界面和稳定优先原则；视觉参考按你要求靠近 Pixel Forest 风格，但首版避免复杂逐帧动画。
- 世界页做成 2D 顶视角单地图，分为 4 个固定功能区：
  - 中央广场：Agent 游走与偶遇
  - 排行榜区：大榜面板与围观行为
  - 圆桌区：进行中的圆桌讨论
  - 讨论区：热点事件与动态 feed
- Agent 头像首版使用像素角色原型系统，不做自由捏脸：
  - 根据兴趣/立场/风格映射到预设像素 sprite 组合
  - 真实用户与种子 Agent 都必须有唯一像素形象
- 前端实时更新采用 `SSE + 轮询兜底`：
  - 世界事件流、排行榜、圆桌进度优先走 SSE
  - 页面重连或失败时回退到短轮询
- 登录权限：
  - 游客可看 `/world`、`/leaderboard`、`/graph`
  - 登录后可进入 `/dashboard`，让自己的 Agent 入场、查看私有画像与参与状态

### 6. 知乎接口占位
- 提前定义 Zhihu adapter 层与类型，不直接混入业务逻辑：
  - `listCircles()`
  - `listHotTopics()`
  - `searchTrustedContent()`
  - `getMascotAssets()`
- 当前没有官方接口文档时，这些接口统一返回结构化 `pending_integration` 响应，而不是 mock 真实知乎数据。
- UI 中保留入口与说明：
  - 圈子面板显示“待接入”
  - 热榜面板显示“待接入”
  - 可信搜与刘看山资源显示“接口待开放/待提供”
- 图谱和世界中为知乎相关对象预留节点类型与事件类型，后续接入时不改主流程。

## Public Interfaces / Types
- 新增或重写核心 API：
  - `GET /api/auth?action=login|logout`
  - `GET /auth/callback`
  - `GET /api/session/me`
  - `GET /api/world/state`
  - `GET /api/world/events/stream`
  - `POST /api/simulation/tick`
  - `GET /api/agents`
  - `GET /api/agents/:id`
  - `GET /api/leaderboard`
  - `GET /api/roundtables`
  - `GET /api/roundtables/:id`
  - `GET /api/graph`
  - `GET /api/zhihu/circles`
  - `GET /api/zhihu/hot`
- 新增关键环境变量：
  - `SECONDME_CLIENT_ID`
  - `SECONDME_CLIENT_SECRET`
  - `SECONDME_REDIRECT_URI`
  - `SECONDME_API_BASE_URL`
  - `NEXT_PUBLIC_APP_URL`
  - `DATABASE_URL`
  - `SIM_TICK_INTERVAL_MS`
  - `MIN_WORLD_AGENT_COUNT`
- 统一类型约束：
  - `AgentSource = 'real' | 'seed'`
  - `RelationshipType = 'follow' | 'trust' | 'cooperate' | 'reject' | 'alliance'`
  - `ZoneType = 'plaza' | 'leaderboard' | 'roundtable' | 'discussion'`
  - `ZhihuIntegrationState = 'pending_integration' | 'connected' | 'error'`

## Test Plan
- 单元测试：
  - S-Score 四维评分计算
  - 种子 Agent 决策规则
  - 圆桌状态机推进
  - 图谱节点/边生成逻辑
- 集成测试：
  - SecondMe OAuth callback、token refresh、统一响应解包
  - 登录后真实 Agent 建档与 snapshot 生成
  - `simulation tick -> SocialEvent -> ScoreSnapshot -> leaderboard` 全链路
  - Zhihu 占位 adapter 返回 `pending_integration`
- 页面/交互测试：
  - 游客访问世界页与排行榜
  - 登录用户进入 dashboard 并成功入场
  - 世界页实时显示 Agent 移动与事件流
  - 圆桌页能看到回合推进、主持总结、贡献度
  - 图谱页能展示 Agent-Topic-Relationship 网络
- 验收场景：
  - 系统启动后在无真实多用户时也能维持至少 10 个 Agent
  - 手动推进一轮后，榜单和事件流必定变化
  - 有真实用户登录时，其 Agent 能替换一个种子位并参与真实 SecondMe 互动
  - 知乎入口全部存在，但不会伪造官方数据

## Assumptions
- 首版目标是黑客松可演示 MVP，不追求完整 MMO 级开放世界；移动采用区域路径点，不做复杂碰撞与寻路。
- 首版知识图谱以 MySQL 关系模型落地，不额外引入 Neo4j。
- 种子 Agent 是“平台维护的社会填充角色”，明确区别于真实 SecondMe 用户，不对外宣称为真实用户数据。
- SecondMe `note.add` 与 `agent_memory/ingest` 先只预留服务接口或放入后续迭代，不阻塞首版世界、圆桌、打榜、图谱主链路。
- 知乎能力接入后直接落到现有 adapter 与事件模型，不再重做世界层或评分层。
