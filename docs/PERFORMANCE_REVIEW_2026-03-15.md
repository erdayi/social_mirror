# 性能排查记录 - 2026-03-15

## 文档范围

本文档用于记录当前运行在 `http://127.0.0.1:3000` 的项目性能基线、已确认问题、以及拟定的优化方案。

当前阶段仅做排查记录，不实施任何优化代码修改。

补充约束：

- 本轮优化不引入任何额外组件、缓存中间件、消息队列或第三方服务
- 仅允许修改现有应用代码、Prisma schema 和已有运行逻辑

## 当前基线

### 运行时快照

- 服务端口：`3000`
- 当前服务进程 PID：`42148`
- Node 进程内存采样：
  - `WorkingSet64`：约 `429 MB` 到 `438 MB`
  - `PrivateMemorySize64`：约 `714 MB` 到 `723 MB`

### 请求耗时

这里的“冷请求”表示首次访问或缓存过期后的访问；“热请求”表示当前内存缓存窗口内的重复访问。

| 接口 / 页面 | 冷请求样本 | 热请求样本 |
|---|---:|---:|
| `/` | `868.9 ms` | `145.5-160.2 ms` |
| `/world` | `148.9 ms` | `116.9-139.1 ms` |
| `/api/world/state` | `407.1 ms` | `26.3-31.2 ms` |
| `/leaderboard` | `1298.3 ms` | `120.6-130.8 ms` |
| `/api/world/events/stream` 首个数据块 | `899 ms` | 未单独重复采样 |

### 缓存失效验证

当前世界视图缓存 TTL 为 `4 秒`。

当按 `5 秒` 间隔连续访问 `/api/world/state` 时，响应耗时分别回升到：

- `644.8 ms`
- `552.4 ms`
- `485.1 ms`

这说明当前缓存时间过短，无法覆盖正常的页面浏览节奏。

## 已确认的问题

### P0. `getWorldStateView()` 是当前最主要的瓶颈

文件：`src/lib/mesociety/simulation.ts`

`getWorldStateView()` 负责聚合整份世界视图，并被以下入口复用：

- 首页
- 世界页
- `/api/world/state`
- `/api/world/events/stream`
- 其他世界相关页面

一次调用内部会并发执行以下分支：

- `ensureWorldState()`
- `listAgents()`
- `buildLeaderboard()`
- `socialEvent.findMany(...)`
- `getActiveRoundtable()`
- `listZhihuCapabilities()`

影响：

- 冷请求成本高
- 同一份重查询逻辑被多个入口重复触发
- 远程数据库 RTT 会随着查询数量被放大

### P0. 缓存有效，但 TTL 太短

文件：`src/lib/mesociety/simulation.ts`

当前配置：

```ts
const VIEW_CACHE_TTL_MS = 4_000
```

已观测现象：

- `/api/world/state` 热请求仅约 `26-31 ms`
- 等待 `5 秒` 后再次访问，会回到约 `485-645 ms`

影响：

- 用户很容易落在缓存窗口之外
- 后端会反复执行同一套重的世界聚合逻辑

### P0. SSE 轮询会先全量取世界状态，再做差异判断

文件：`src/app/api/world/events/stream/route.ts`

当前行为：

- 每次轮询都会先调用 `getWorldStateView()`
- 之后才比较 signature 决定是否向客户端推送数据

影响：

- 即使世界状态没有变化，也会先执行完整数据库读取
- 只要 `/world` 页面保持打开，就会持续给后端施压
- 首个 SSE 数据块响应较慢，实测约 `899 ms`

### P0. Prisma 查询日志在当前环境始终开启

文件：`src/lib/prisma.ts`

当前配置：

```ts
log: ['query']
```

影响：

- 每次查询都会产生额外控制台 I/O
- 日志噪音较大，不利于准确观察真实热点
- 高频接口会持续承担这部分额外开销

### P1. 排行榜查询路径存在两段式取数

文件：`src/lib/mesociety/simulation.ts`

当前行为：

- `getLatestScoreSnapshots()` 先执行 `aggregate(_max.tickNumber)`
- 再执行 `findMany()` 拉取该 tick 的排行榜数据

影响：

- 多了一次数据库往返
- 冷请求下 `/leaderboard` 是当前最慢页面，实测约 `1298 ms`

### P1. `listAgents()` 和 `getActiveRoundtable()` 查询范围过宽、加载过深

文件：`src/lib/mesociety/simulation.ts`

当前行为：

- `listAgents()` 会把所有 agent 连同最新 snapshot、`zonePresence`、`user` 一起拉取
- `getActiveRoundtable()` 会加载 host、participants、turns、speaker 等整套关联数据

影响：

- 每次冷请求下的世界聚合都比较重
- 随着数据规模增长，查询成本会继续上升

### P1. 当前高频查询字段缺少关键索引

文件：`prisma/schema.prisma`

当前已经存在的索引：

- `SocialEvent.createdAt`
- `SocialEvent.type + createdAt`
- `Relationship.sourceAgentId + type`
- `Relationship.targetAgentId + type`
- `ScoreSnapshot.unique(agentId, tickNumber)`
- `ScoreSnapshot.index(tickNumber, totalScore)`

按当前查询模式仍然缺少的索引：

- `Agent.currentZone`
- `Agent.status`
- `AgentSnapshot(agentId, createdAt desc)`
- `Roundtable.status`
- 可选的单列 `ScoreSnapshot.tickNumber`

影响：

- 某些冷查询会做更多扫描工作
- 数据量继续增长后，冷请求性能会进一步恶化

### P1. 数据库是远程 MySQL，查询扇出被明显放大

文件：`.env.local`

当前 `DATABASE_URL` 指向远程 MySQL 主机 `111.229.152.8`。

影响：

- 每次 Prisma 查询都要承担网络 RTT
- 当前查询数量较多，会把这一成本放大得更明显
- 冷请求受影响尤其大

### P2. 大部分页面都被强制设为动态渲染

相关文件包括：

- `src/app/page.tsx`
- `src/app/world/page.tsx`
- `src/app/leaderboard/page.tsx`
- `src/app/roundtables/page.tsx`
- 以及其他页面和 API

当前行为：

```ts
export const dynamic = 'force-dynamic'
```

影响：

- 读多写少页面无法利用页面级缓存或 ISR
- 每次访问都会重新走服务端路径

### P2. 当前内存占用偏高，需要二次验证

当前服务进程观测值：

- `WorkingSet64`：约 `429-438 MB`
- `PrivateMemorySize64`：约 `714-723 MB`

连续访问 `/api/world/state` 10 次后，内存有轻微上升，没有立即回落。

当前结论：

- 这已经足以视为性能关注点
- 但还不足以直接判断为内存泄漏
- 更可能的来源包括：大对象聚合、缓存对象驻留、Prisma 查询日志、长生命周期运行态对象

## 拟定的解决方案

### S1. 收敛 Prisma 日志输出

优先级：`P0`

修改方向：

- 开发环境使用 `['query', 'error', 'warn']`
- 非开发环境改为 `['error']` 或 `[]`

预期收益：

- 降低 I/O 开销
- 减少日志噪音
- 更容易判断真实性能热点

### S2. 将世界视图缓存 TTL 从 4 秒提升到 15 秒

优先级：`P0`

目标文件：

- `src/lib/mesociety/simulation.ts`

修改方向：

```ts
const VIEW_CACHE_TTL_MS = 15_000
```

预期收益：

- 显著提高缓存命中率
- 减少重复世界聚合
- 直接改善页面和 API 的平均响应时间

权衡：

- 世界视图可能最多滞后约 `15 秒`

### S3. 优化 SSE，先做轻量变化检测，再决定是否全量取数

优先级：`P0`

目标文件：

- `src/app/api/world/events/stream/route.ts`

修改方向：

- 先只查询 `WorldState.tickCount`
- 如果 tick 未变化，直接跳过 `getWorldStateView()`
- 可选地把 SSE 轮询间隔从 `4 秒` 提高到 `5 秒`
- 可选地把 keep-alive 间隔从 `10 秒` 提高到 `15 秒`

预期收益：

- 大幅减少无效数据库查询
- 降低 `/world` 常开时的后台持续压力

### S4. 改写排行榜查询逻辑，避免先 aggregate 再查明细

优先级：`P1`

目标文件：

- `src/lib/mesociety/simulation.ts`

修改方向：

- 用 `findFirst({ orderBy: { tickNumber: 'desc' } })` 获取最新 tick
- 再查询该 tick 的全部排行榜数据

预期收益：

- 减少一次较重的聚合步骤
- 降低 `/leaderboard` 及世界聚合链路的延迟

### S5. 按当前查询模式补齐缺失索引

优先级：`P1`

目标文件：

- `prisma/schema.prisma`

建议索引：

```prisma
model Agent {
  @@index([currentZone])
  @@index([status])
}

model AgentSnapshot {
  @@index([agentId, createdAt(sort: Desc)])
}

model Roundtable {
  @@index([status])
}

model ScoreSnapshot {
  @@index([tickNumber])
  @@index([tickNumber, totalScore(sort: Desc)])
}
```

预期收益：

- 加快冷查询
- 在数据量增长时减缓性能恶化

### S6. 缩减世界聚合中的预加载范围

优先级：`P1`

目标函数：

- `listAgents()`
- `getActiveRoundtable()`
- `getWorldStateView()` 内的事件查询

修改方向：

- 只查询当前视图真正需要的字段
- 如果只用到关联对象的少量字段，就不要整对象 include
- 对不需要完整历史的视图加上合理限制

预期收益：

- 减少查询返回体积
- 降低序列化成本
- 降低单次请求的内存压力

### S7. 重新评估页面级缓存策略

优先级：`P2`

修改方向：

- 对必须实时的页面保留动态渲染
- 对首页、排行榜等非强实时页面评估 `revalidate`

预期收益：

- 降低服务端渲染压力
- 减少重复请求带来的后端负担

权衡：

- 页面实时性会有所降低

### S8. 在第一轮优化后重新做内存画像

优先级：`P2`

执行方式：

- 记录优化前后重复请求下的进程内存变化
- 比较 P0 / P1 优化前后的结果
- 如果内存仍持续上涨，再继续排查长生命周期缓存和大对象驻留

预期收益：

- 能把“正常运行态增长”和“真实内存问题”区分开

## 建议实施顺序

1. `S1` 收敛 Prisma 日志
2. `S2` 延长缓存 TTL
3. `S3` 增加 SSE 轻量变化检测
4. `S4` 改写排行榜查询
5. `S5` 补数据库索引
6. `S6` 缩减查询载荷
7. `S7` 评估页面级缓存
8. `S8` 二次内存画像

## 第一批优化后的预期方向

如果先只实施 `S1` 到 `S5`，预期会出现以下变化：

- `/`、`/api/world/state`、`/leaderboard` 的冷请求延迟下降
- `/api/world/events/stream` 的重复数据库压力明显下降
- 普通浏览路径下缓存命中率提高
- 日志噪音降低，运行时额外开销减少

## 当前状态

- 问题记录：已完成
- 方案记录：已完成
- 优化实施：第一批已开始

## 优化验证记录

### 第一轮优化后验证结果

第一轮优化包含：

- Prisma 日志收敛
- 视图缓存 TTL 从 `4s` 提升到 `15s`
- SSE 先检查 `tickCount`
- 排行榜查询改写
- Prisma 索引定义补充

验证结果：

| 接口 / 页面 | 结果 |
|---|---|
| `/api/world/state` 热请求 | 稳定在 `25-40 ms` |
| `/api/world/state` 跨 5 秒再次访问 | 仍可维持在 `50 ms` 左右，而不是回到数百毫秒 |
| `/leaderboard` 冷请求 | 从约 `1298 ms` 降到约 `988 ms` |
| SSE 首包 | 有改善，但仍偏慢 |

结论：

- 第一轮优化已确认生效
- 提升最明显的是 `world state` 缓存命中和重复读取成本

### 第二轮优化后验证结果

第二轮优化包含：

- 世界视图改为按需字段查询
- 圆桌摘要改为轻量查询
- 最近事件改为最小字段集
- 排行榜关联 Agent 字段裁剪

预热后验证结果：

| 接口 / 页面 | 结果 |
|---|---|
| `/` 冷请求 | 约 `967.7 ms` |
| `/` 热请求 | `149.7-166.2 ms` |
| `/api/world/state` 热请求 | `25.0-27.2 ms` |
| `/api/world/state` 跨缓存窗口首次请求 | 约 `726 ms` |
| `/leaderboard` 冷请求 | 约 `481.7 ms` |
| `/leaderboard` 热请求 | `153.5-175.8 ms` |
| SSE 首包 | 约 `584 ms` |

结论：

- 第二轮优化继续生效
- `world state` 缓存失效后的重建时间从秒级明显下降
- `leaderboard` 冷请求进一步下降
- SSE 首包从秒级大幅降到亚秒级

### 第三轮优化实施状态

第三轮已完成代码实现，但尚未完成运行态验证。

已实施内容：

- 首页不再复用完整 `WorldStateView`
- 新增首页专用轻量视图读取路径
- 首页组件只消费首页真正需要的字段

预期收益：

- 继续降低首页冷请求
- 进一步减少首页首屏聚合对象大小

待验证事项：

- 重启实例后重新测试首页冷请求
- 观察首页是否继续低于第二轮结果
