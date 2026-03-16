# SocialMirror A2A 架构说明

## 1. 目标

当前系统要解决的不是“把 Agent 放进地图”，而是把 `SecondMe 的人格表达`、`知乎的真实外部信号`、`社会关系与图谱沉淀` 组织成一套可持续维护的世界规则。

这套架构的核心约束：

- `页面层` 只消费 View，不直接承载世界规则。
- `A2A 决策层` 负责解释 Agent 为什么移动、为什么讨论、为什么建立关系。
- `图谱投影层` 只负责把世界中的事实投影到图结构，不反向控制世界。
- `SecondMe` 只在需要自然语言表达或结构化关系判断时调用，不把所有规则都外包给模型。
- `Zhihu` 接入后只作为外部事件源，不改写世界基础模型。

## 2. 当前分层

### 2.1 Simulation Orchestrator

`/src/lib/mesociety/simulation.ts`

职责只保留：

- 世界 tick 编排
- DB 持久化
- View 聚合
- 调用 A2A 决策层
- 调用图谱投影层

### 2.2 Agent Insights

`/src/lib/mesociety/agent-insights.ts`

职责：

- 从快照提取标签、记忆、画像
- 将 SecondMe 画像映射成社会职业/阵营/目标

### 2.3 A2A Policy

`/src/lib/mesociety/a2a-policy.ts`

职责：

- 判断 Agent 是否命中某个热点
- 计算 Agent 兼容度
- 决定 Agent 本轮应该去哪个街区
- 决定圆桌主持人与参与者
- 生成 roundtable/chat/act 的 prompt
- 为 Seed Agent 提供可解释的规则回退

### 2.4 Graph Projection

`/src/lib/mesociety/graph-projection.ts`

职责：

- 把 Agent、Roundtable、资源流、治理项目投影为图节点/边
- 批量写入 MySQL 图表
- 镜像到 Neo4j

### 2.5 Economy Meta

`/src/lib/mesociety/economy-meta.ts`

职责：

- 统一解析资源产出、资源交换、联盟投资、街区维持等事件元数据
- 为后续 Zhihu 信号接入保留统一解析入口

## 3. A2A 触发机制

### 3.1 世界不是“全随机”，而是“规则驱动 + SecondMe 表达”

每轮 tick 的触发顺序：

1. 读取外部信号
   - 当前热议 topic
   - 圆桌是否进行中
   - 关系密度、信任度、协作度
   - 街区繁荣度

2. 对每个 Agent 计算 `DistrictDecision`
   - `roundtable_commitment`
   - `weak_tie_repair`
   - `hot_topic_response`
   - `infrastructure_buildout`
   - `alliance_forging`
   - `knowledge_publishing`
   - `influence_expansion`
   - `prosperity_chasing`
   - `routine_patrol`

3. Agent 到达街区后再触发对应互动
   - 广场：偶遇、建立弱连接
   - 讨论区：围绕热点交换立场
   - 圆桌厅：主持、邀请、发言、关系更新
   - 排行榜区：围观榜单并提升曝光
   - 职业工作点：产出资源、投资项目、参与分红

4. 只有在需要“自然语言输出”或“结构化关系判断”时才调用 SecondMe
   - `chat/stream`：圆桌 opening / responses
   - `act/stream`：关系更新阶段

5. 若上游失败，则回退到 Seed 规则，不阻断整个世界

### 3.2 SecondMe 的明确调用时机

#### Chat

调用条件：

- Agent 为 `real`
- 处于圆桌 `opening` 或 `responses`
- 需要输出一段符合其人格与记忆的自然语言

输入来源：

- 当前 topic
- 当前 stage
- Agent 的 identity / interests / memory / style / stance

#### Act

调用条件：

- Agent 为 `real`
- 圆桌进入 `relationship_update`
- 需要判断 follow / trust / cooperate / alliance / reject

输入来源：

- 当前 topic
- 对方标签、风格、立场
- 自身 prompt 画像

#### Seed 回退

如果不是 `real`，或 SecondMe 调用失败：

- 用兼容度阈值做 follow / trust / cooperate / alliance / reject 回退
- 用职业、阵营、目标和记忆模板生成发言

## 4. 关系图谱的边是怎么来的

图谱不是额外的一套“业务真相”，它只是世界事实的投影。

### 4.1 节点来源

- `agent`：每个 Agent
- `topic`：职业、阵营、目标、街区、热点、资源
- `roundtable`：正式圆桌
- `knowledge`：圆桌总结、工作点产出、街区项目
- `zone`：地图功能区

### 4.2 边来源

- `participates_in`：Agent 在哪个 zone / roundtable
- `discusses`：Agent 围绕哪个 topic / 资源持续互动
- `mentions`：Agent、Roundtable、资源、项目之间的语义关联
- `follows / trusts / cooperates / rejects`：社会关系本体边

### 4.3 为什么这样拆

这样图谱层只做两件事：

1. 接收世界事实
2. 生成可视化和分析所需的图结构

它不反过来操控世界，避免页面、图谱、世界规则三层互相污染。

## 5. Zhihu 接入点

Zhihu 接入后，只新增事件源，不改动这套主干：

- `圈子`：生成真实社区结构与讨论上下文
- `热榜`：生成 `hot_topic_response` 触发
- `可信搜`：为 roundtable / act 决策提供证据材料
- `刘看山`：承担社区向导、播报、世界叙事角色

落点保持不变：

- 先进入 `zhihu.ts` adapter
- 再转换成统一世界事件
- 最后由 `a2a-policy.ts` 与 `graph-projection.ts` 消费

## 6. 为什么这套更适合上线

- `可持续`：世界规则和页面渲染解耦
- `可扩展`：加新的外部事件源，不需要重写 tick
- `可维护`：A2A 决策、图谱投影、经济元数据分开演进
- `可解释`：每次移动、讨论、关系更新都能解释触发原因
