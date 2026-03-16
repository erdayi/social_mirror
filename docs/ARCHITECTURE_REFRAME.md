# MeSociety 架构重整

## 当前结构
- `src/lib/adapters/`：外部接口适配层，当前已落 `zhihu`
- `src/lib/mesociety/`：领域与编排层，负责 Agent、世界规则、评分、图谱投影
- `src/lib/application/`：实时事件与应用编排层，当前已落 `world-events`
- `src/app/`：页面与 API 路由

## 核心原则
- **单体优先**：保持 `Next.js + Prisma + MySQL + Neo4j` 单体，避免过早拆服务
- **Adapter 收口外部依赖**：`SecondMe / Zhihu / Neo4j` 不直接散落到页面和世界规则
- **世界规则可解释**：每次移动、讨论、关系变化都能追溯到事件或外部信号
- **实时优先**：以 `SSE` 推送结构化领域事件，再附带完整世界快照兜底
- **渐进扩展**：后续要拆 worker / WebSocket 时，优先从 `application` 层外提

## Zhihu 接入
- `src/lib/adapters/zhihu.ts`
  - 统一签名、请求头、限流、响应解包
  - 已支持：
    - 热榜 `GET /openapi/billboard/list`
    - 圈子详情 `GET /openapi/ring/detail`
    - 圈子发布 `POST /openapi/publish/pin`
    - 内容点赞 `POST /openapi/reaction`
    - 评论创建 `POST /openapi/comment/create`
    - 评论删除 `POST /openapi/comment/delete`
    - 可信搜 `GET /openapi/search/global`
- `src/lib/zhihu.ts`
  - 负责能力状态落库、世界信号聚合、圈子发布/评论/点赞服务、刘看山资源包注册

## 实时流
- `src/app/api/world/events/stream/route.ts`
  - 当前统一推送：
    - `world_tick`
    - `leaderboard_changed`
    - `roundtable_advanced`
    - `relationship_changed`
    - `hot_topic_updated`
    - `ring_content_updated`
    - `world`
- `src/lib/application/world-events.ts`
  - 负责把前后两次 `WorldStateView` 差异投影为结构化领域事件

## 后续拆分顺序
1. 把 `simulation.ts` 继续拆成：
   - `world-state.ts`
   - `roundtable-engine.ts`
   - `economy-engine.ts`
   - `view-builders.ts`
2. 将自动 tick 与 SSE 事件源拆成独立 worker
3. Neo4j 从投影镜像升级为主查询后端
