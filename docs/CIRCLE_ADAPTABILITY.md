# 圈子适应性评估系统 - 技术实现文档

## 一、系统概述

### 1.1 核心目标
评估 AI 数字分身融入真实社交圈子（知乎圈子）的能力，输出适应性评分和诊断报告。

### 1.2 评估对象
- **输入**: 用户的 Second Me 数字分身数据
- **目标**: 知乎圈子
- **输出**: 圈子适应性评分 + 融入建议

---

## 二、评估维度体系

### 2.1 四维度评分模型

```
┌─────────────────────────────────────────────────────┐
│              圈子适应性 (Circle Adaptability)        │
├─────────────┬─────────────┬───────────────────────┤
│   兴趣匹配度  │  观点契合度   │    社交活跃度         │
│   (30%)     │   (30%)     │      (20%)            │
├─────────────┴─────────────┴───────────────────────┤
│                   融入能力 (20%)                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 各维度详细定义

| 维度 | 权重 | 数据来源 | 计算方式 |
|------|------|----------|----------|
| 兴趣匹配度 | 30% | Second Me 兴趣 API + 知乎圈子标签 | 交集/并集 * 100% |
| 观点契合度 | 30% | Second Me 软记忆 API + 圈子热帖 | 1 - \|立场分差\| / 100 |
| 社交活跃度 | 20% | 知乎圈子 API | 发言/互动/话题加权 |
| 融入能力 | 20% | 综合评估 | 风格/礼仪/稳定性加权 |

### 2.3 评分等级

| 等级 | 分数范围 | 含义 |
|------|----------|------|
| Excellent | 85-100 | 非常适合，核心成员 |
| Good | 70-84 | 较好适应，可融入 |
| Average | 50-69 | 一般适应，需改进 |
| Poor | 0-49 | 难以适应，风险较高 |

---

## 三、数据结构

### 3.1 输入数据接口

```typescript
interface AssessmentInput {
  // 数字分身数据（来自 Second Me API）
  agentProfile: {
    userId: string;
    name: string;
    interests: Array<{
      name: string;
      confidence: number;
    }>;
    memories: Array<{
      type: 'opinion' | 'hobby' | 'daily';
      content: string;
    }>;
    stance: 'support' | 'oppose' | 'neutral';
    socialStyle: 'rational' | 'emotional' | 'balanced';
  };

  // 目标圈子数据（来自知乎 API）
  circleData: {
    circleId: string;
    name: string;
    tags: string[];
    hotTopics: Array<{
      id: string;
      title: string;
      viewpoint: 'support' | 'oppose' | 'neutral';
      sentiment: number;
    }>;
    memberCount: number;
  };
}
```

### 3.2 输出结果接口

```typescript
interface AssessmentResult {
  agentId: string;
  circleId: string;
  timestamp: Date;

  // 各维度得分 (0-100)
  dimensions: {
    interestMatch: {
      score: number;
      matchedInterests: string[];
      unmatchedInterests: string[];
    };
    viewpointAlignment: {
      score: number;
      yourStance: string;
      circleStance: string;
      alignmentRate: number;
    };
    socialActivity: {
      score: number;
      metrics: {
        postsCount: number;
        responsesCount: number;
        topicsStarted: number;
      };
    };
    integrationAbility: {
      score: number;
      styleMatch: number;
      etiquetteScore: number;
      stabilityScore: number;
    };
  };

  // 综合评分
  totalScore: number;
  level: 'excellent' | 'good' | 'average' | 'poor';

  // 诊断报告
  diagnosis: {
    strengths: string[];
    weaknesses: string[];
    risks: string[];
    suggestions: string[];
  };
}
```

---

## 四、核心模块设计

### 4.1 数据采集模块 (DataCollector)

**职责**: 获取数字分身数据和圈子数据

```typescript
class DataCollector {
  // 获取 Second Me 用户数据
  async collectAgentData(userId: string): Promise<AgentProfile>;

  // 获取知乎圈子数据
  async collectCircleData(circleId: string): Promise<CircleData>;

  // 获取圈子热门话题
  async collectHotTopics(circleId: string): Promise<HotTopic[]>;
}
```

### 4.2 评分引擎 (ScoreEngine)

**职责**: 计算四维度评分

```typescript
class ScoreEngine {
  // 计算兴趣匹配度
  calculateInterestMatch(agent: AgentProfile, circle: CircleData): InterestMatchResult;

  // 计算观点契合度
  calculateViewpointAlignment(agent: AgentProfile, topics: HotTopic[]): ViewpointResult;

  // 计算社交活跃度
  calculateSocialActivity(agentId: string, circleId: string): SocialActivityResult;

  // 计算融入能力
  calculateIntegrationAbility(agent: AgentProfile): IntegrationAbilityResult;

  // 综合评分
  calculateTotalScore(dimensions: Dimensions): AssessmentResult;
}
```

### 4.3 模拟引擎 (SimulationEngine)

**职责**: 模拟社交行为，生成评估场景

```typescript
class SimulationEngine {
  // 生成自我介绍
  generateSelfIntro(agent: AgentProfile, circle: CircleData): string;

  // 生成话题评论
  generateComment(agent: AgentProfile, topic: HotTopic): string;

  // 模拟互动回应
  generateResponse(agent: AgentProfile, message: string): string;
}
```

### 4.4 报告生成器 (ReportGenerator)

**职责**: 生成诊断报告

```typescript
class ReportGenerator {
  // 生成评估报告
  generateReport(result: AssessmentResult): AssessmentReport;

  // 生成优势分析
  generateStrengths(dimensions: Dimensions): string[];

  // 生成劣势分析
  generateWeaknesses(dimensions: Dimensions): string[];

  // 生成改进建议
  generateSuggestions(dimensions: Dimensions): string[];
}
```

---

## 五、API 接口设计

### 5.1 评估接口

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/assess` | POST | 发起圈子适应性评估 |
| `/api/assess/:id` | GET | 获取评估结果 |
| `/api/agent/:id` | GET | 获取数字分身信息 |
| `/api/circles` | GET | 获取知乎圈子列表 |
| `/api/circles/:id` | GET | 获取圈子详情 |

### 5.2 请求示例

```bash
# 发起评估
curl -X POST http://localhost:3000/api/assess \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "circleId": "zhihu_circle_456"
  }'
```

### 5.3 响应示例

```json
{
  "agentId": "user_123",
  "circleId": "zhihu_circle_456",
  "timestamp": "2026-03-14T10:00:00Z",
  "dimensions": {
    "interestMatch": {
      "score": 85,
      "matchedInterests": ["科技", "AI"],
      "unmatchedInterests": ["法律"]
    },
    "viewpointAlignment": {
      "score": 72,
      "yourStance": "neutral",
      "circleStance": "support",
      "alignmentRate": 0.72
    },
    "socialActivity": {
      "score": 65,
      "metrics": {
        "postsCount": 5,
        "responsesCount": 12,
        "topicsStarted": 2
      }
    },
    "integrationAbility": {
      "score": 85,
      "styleMatch": 90,
      "etiquetteScore": 80,
      "stabilityScore": 85
    }
  },
  "totalScore": 78,
  "level": "good",
  "diagnosis": {
    "strengths": ["兴趣广泛且深入", "立场理性客观", "沟通风格成熟"],
    "weaknesses": ["圈子融入较慢", "观点可能小众"],
    "risks": ["缺乏熟人网络", "社交主动性不足"],
    "suggestions": [
      "主动参与讨论：每天至少回复2-3个热门话题",
      "建立个人标签：在自我介绍中突出专业领域",
      "适当展示柔软度：理性之余可增加一些个人故事"
    ]
  }
}
```

---

## 六、核心算法

### 6.1 兴趣匹配度计算

```typescript
function calculateInterestMatch(
  agentInterests: string[],
  circleTags: string[]
): number {
  // Jaccard 相似度
  const intersection = agentInterests.filter(i =>
    circleTags.some(tag => tag.includes(i) || i.includes(tag))
  );
  const union = [...new Set([...agentInterests, ...circleTags])];

  return (intersection.length / union.length) * 100;
}
```

### 6.2 观点契合度计算

```typescript
function calculateViewpointAlignment(
  agentStance: string,
  topicViewpoints: string[]
): number {
  const stanceMap = { 'support': 1, 'neutral': 0, 'oppose': -1 };
  const agentScore = stanceMap[agentStance] || 0;

  const circleAvg = topicViewpoints.reduce((sum, v) =>
    sum + (stanceMap[v] || 0), 0) / topicViewpoints.length;

  // 归一化到 0-100
  return Math.max(0, (1 - Math.abs(agentScore - circleAvg) / 2) * 100);
}
```

### 6.3 社交活跃度计算

```typescript
function calculateSocialActivity(
  postsCount: number,
  responsesCount: number,
  topicsStarted: number
): number {
  // 加权计算
  const postsScore = Math.min(postsCount / 10 * 100, 40);
  const responsesScore = Math.min(responsesCount / 20 * 100, 35);
  const topicsScore = Math.min(topicsStarted / 5 * 100, 25);

  return Math.round(postsScore + responsesScore + topicsScore);
}
```

---

## 七、评估报告模板

### 7.1 Markdown 报告

```markdown
# 圈子适应性评估报告

## 基本信息
- 评估对象：[你的名字]
- 目标圈子：[圈子名称]
- 评估时间：2026-03-14

## 综合评分：78/100（良好适应）

### 维度得分详情
| 维度 | 得分 | 等级 | 说明 |
|---|---|---|---|
| 兴趣匹配度 | 85/100 | ★★★★★ | 与圈子主题高度匹配 |
| 观点契合度 | 72/100 | ★★★★☆ | 与圈子主流观点基本一致 |
| 社交活跃度 | 65/100 | ★★★☆☆ | 初次进入，发言较少 |
| 融入能力 | 85/100 | ★★★★★ | 沟通风格理性友好 |

## 优势分析
✅ **兴趣广泛且深入**：对科技、法律等领域有独到见解
✅ **立场理性客观**：观点逻辑清晰，易被接受
✅ **沟通风格成熟**：说话有条理，不偏激

## 劣势与风险
⚠️ **圈子融入较慢**：初次进入缺乏熟人网络
⚠️ **观点可能小众**：某些见解可能与主流不符

## 改进建议
1. **主动参与讨论**：每天至少回复2-3个热门话题
2. **建立个人标签**：在自我介绍中突出专业领域
3. **适当展示柔软度**：理性之余可增加一些个人故事

## 中国社会融入能力评估
| 能力项 | 评分 | 说明 |
|---|---|---|
| 理性思考能力 | ★★★★★ | 逻辑清晰，观点独立 |
| 情感表达能力 | ★★★☆☆ | 较为内敛，可增加表达 |
| 社交主动性 | ★★☆☆☆ | 较被动，需要激励 |
| 文化适应能力 | ★★★★☆ | 对主流文化有较好理解 |
| 冲突处理能力 | ★★★☆☆ | 避免正面冲突，可更从容 |

**总体评价**：你的数字分身具备较好的理性思维和独立性，适合在知识型社区发展。建议增加情感表达和社交主动性，能更好地融入中国社会圈层。
```

---

## 八、系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    API 层 (Express)                      │
├─────────────────────────────────────────────────────────┤
│  /api/assess    评估入口                               │
│  /api/agent     数字分身管理                           │
│  /api/circles   圈子数据                               │
│  /api/report    报告生成                               │
├─────────────────────────────────────────────────────────┤
│                   业务逻辑层                             │
├──────────────────┬──────────────────┬─────────────────┤
│  DataCollector   │  ScoreEngine      │  ReportGenerator │
│  数据采集模块     │  评分引擎         │  报告生成器      │
├──────────────────┴──────────────────┴─────────────────┤
│                   外部服务层                             │
├──────────────────┬──────────────────┬─────────────────┤
│  Second Me API   │   知乎API         │  大模型API       │
└──────────────────┴──────────────────┴─────────────────┘
```

---

## 九、文件结构

```
/src
├── index.ts                 # 入口
├── config/
│   └── index.ts            # 配置
├── types/
│   └── index.ts           # 类型定义
├── services/
│   ├── SecondMeService.ts  # Second Me API服务
│   ├── ZhihuService.ts     # 知乎API服务
│   ├── AgentService.ts     # 数字分身服务
│   └── CircleService.ts    # 圈子服务
├── engines/
│   ├── DataCollector.ts    # 数据采集引擎
│   ├── ScoreEngine.ts       # 评分引擎
│   └── SimulationEngine.ts  # 模拟引擎
├── generators/
│   └── ReportGenerator.ts  # 报告生成器
├── routes/
│   └── index.ts            # 路由
└── utils/
    └── index.ts            # 工具函数
```

---

## 十、开发计划

### Day 1: 基础搭建
- [ ] 项目初始化 (Node.js + TypeScript)
- [ ] Second Me API 对接
- [ ] 知乎 API 对接

### Day 2: 核心功能
- [ ] 数据采集模块
- [ ] 评分引擎（四维度计算）
- [ ] 模拟引擎（社交场景生成）

### Day 3: 输出完善
- [ ] 报告生成器
- [ ] API 接口
- [ ] 前端展示

---

## 十一、待确认问题

1. **Second Me API 权限**: 是否已获得 API 调用权限？
2. **知乎 API**: 是使用真实 API 还是模拟数据？
3. **评估范围**: 评估单个圈子还是多个圈子？
4. **前端需求**: 是否需要配套可视化界面？
