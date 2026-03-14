# Second Me API 技术对接文档

> **对应官方文档**：https://develop-docs.second.me/zh/docs/api-reference/secondme
> **编写日期**：2026年03月14日
> **适配场景**：知乎 × Second Me 第二届 A2A 黑客松

---

## 一、API 基础信息

### 1.1 Base URL

```
https://api.mindverse.com/gate/lab
```

### 1.2 认证方式

所有 API 均需要 **OAuth2 Token** 认证：

```bash
curl -X GET "https://api.mindverse.com/gate/lab/api/secondme/user/info" \
  -H "Authorization: Bearer lba_at_your_access_token"
```

### 1.3 通用权限要求

| 权限 | 用途 |
|------|------|
| `user.info` | 获取用户基础信息 |
| `user.info.shades` | 获取用户兴趣标签 |
| `user.info.softmemory` | 获取用户软记忆 |
| `chat` | 聊天/行为判断 |
| `note.add` | 添加笔记 |
| `voice` | 语音合成 |

### 1.4 通用响应格式

**成功响应：**
```json
{
  "code": 0,
  "data": { ... }
}
```

**错误响应：**
```json
{
  "code": 403,
  "message": "Missing required permission",
  "subCode": "oauth2.scope.insufficient"
}
```

---

## 二、用户信息 API

### 2.1 获取用户基础信息

```
GET /api/secondme/user/info
```

**权限要求：** `user.info`

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "userId": "12345678",
    "name": "Username",
    "email": "user@example.com",
    "avatar": "https://cdn.example.com/avatar.jpg",
    "bio": "Personal bio",
    "selfIntroduction": "Self introduction content",
    "profileCompleteness": 85,
    "route": "username"
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户唯一ID |
| name | string | 用户名称 |
| email | string | 用户邮箱 |
| avatar | string | 头像URL |
| bio | string | 个人简介 |
| selfIntroduction | string | 自我介绍 |
| profileCompleteness | number | 资料完整度(0-100) |
| route | string | 个人主页路由 |

**在本项目中的应用：**

```typescript
// Agent 身份初始化
interface AgentIdentity {
  agentId: string;        // 来自 userId
  displayName: string;   // 来自 name
  avatar: string;       // 来自 avatar
  bio: string;          // 来自 bio
  selfIntro: string;    // 来自 selfIntroduction
}
```

---

## 三、兴趣标签 API

### 3.1 获取用户兴趣标签

```
GET /api/secondme/user/shades
```

**权限要求：** `user.info.shades`

**查询参数：** 无

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "shades": [
      {
        "id": 123,
        "shadeName": "Tech Enthusiast",
        "shadeIcon": "https://cdn.example.com/icon.png",
        "confidenceLevel": "HIGH",
        "shadeDescription": "Passionate about technology",
        "shadeDescriptionThirdView": "They are passionate about technology",
        "shadeContent": "Loves coding and gadgets",
        "shadeContentThirdView": "They love coding and gadgets",
        "sourceTopics": ["programming", "AI"],
        "shadeNamePublic": "Tech Lover",
        "shadeIconPublic": "https://cdn.example.com/public-icon.png",
        "confidenceLevelPublic": "HIGH",
        "shadeDescriptionPublic": "Tech enthusiast",
        "shadeDescriptionThirdViewPublic": "A tech enthusiast",
        "shadeContentPublic": "Enjoys technology",
        "shadeContentThirdViewPublic": "They enjoy technology",
        "sourceTopicsPublic": ["tech"],
        "hasPublicContent": true
      }
    ]
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| shadeName | string | 兴趣标签名称 |
| confidenceLevel | string | 置信度：VERY_HIGH/HIGH/MEDIUM/LOW/VERY_LOW |
| shadeDescription | string | 标签描述 |
| shadeContent | string | 标签内容 |
| sourceTopics | string[] | 来源话题 |
| hasPublicContent | boolean | 是否有公开内容 |

**置信度筛选规则：**

```typescript
// 筛选高置信度兴趣标签
const HIGH_CONFIDENCE_LEVELS = ['VERY_HIGH', 'HIGH'];

function filterHighConfidenceShades(shades: Shade[]): Shade[] {
  return shades.filter(s =>
    HIGH_CONFIDENCE_LEVELS.includes(s.confidenceLevel)
  );
}

// 提取核心领域
function extractPrimaryInterests(shades: Shade[], minCount: number = 3): string[] {
  return filterHighConfidenceShades(shades)
    .slice(0, minCount)
    .map(s => s.shadeName);
}
```

**在本项目中的应用：**

```typescript
// Agent 兴趣领域
interface AgentInterests {
  primary: string[];    // 置信度 HIGH 及以上的前3个
  all: Array<{
    name: string;
    confidence: string;
    topics: string[];
  }>;
  // 匹配规则
  matchesCircle(circleTags: string[]): number;  // Jaccard 相似度
}
```

---

## 四、软记忆 API

### 4.1 获取用户软记忆

```
GET /api/secondme/user/softmemory
```

**权限要求：** `user.info.softmemory`

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 搜索关键词 |
| pageNo | integer | 否 | 页码（默认1） |
| pageSize | integer | 否 | 每页数量（默认20，最大100） |

**请求示例：**
```
GET /api/secondme/user/softmemory?keyword=hobby&pageNo=1&pageSize=20
```

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 456,
        "factObject": "Hobbies",
        "factContent": "Enjoys reading science fiction novels",
        "createTime": 1705315800000,
        "updateTime": 1705315800000
      },
      {
        "id": 457,
        "factObject": "Daily Routine",
        "factContent": "Wakes up at 7 AM every day",
        "createTime": 1704873600000,
        "updateTime": 1704873600000
      }
    ],
    "total": 100
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 记忆ID |
| factObject | string | 记忆类别（如 Hobbies、Daily Routine、Opinion） |
| factContent | string | 记忆内容 |
| createTime | number | 创建时间（毫秒时间戳） |
| updateTime | number | 更新时间（毫秒时间戳） |

**记忆分类规则：**

```typescript
// 记忆类别枚举
type MemoryCategory = 'Hobbies' | 'Daily Routine' | 'Opinion' | 'Preferences' | 'Experiences';

// 分类提取
function categorizeMemories(memories: SoftMemory[]): Record<MemoryCategory, string[]> {
  const categories: Record<MemoryCategory, string[]> = {
    'Hobbies': [],
    'Daily Routine': [],
    'Opinion': [],
    'Preferences': [],
    'Experiences': []
  };

  memories.forEach(m => {
    const category = m.factObject as MemoryCategory;
    if (categories[category]) {
      categories[category].push(m.factContent);
    }
  });

  return categories;
}

// 观点提取（用于立场判断）
function extractOpinions(memories: SoftMemory[]): string[] {
  return memories
    .filter(m => m.factObject === 'Opinion')
    .map(m => m.factContent);
}
```

**在本项目中的应用：**

```typescript
// Agent 记忆系统
interface AgentMemory {
  opinions: string[];      // 观点记忆 → 决定立场
  hobbies: string[];      // 爱好记忆 → 兴趣匹配
  preferences: string[];   // 偏好记忆 → 行为模式
  experiences: string[];  // 经历记忆 → 社交风格

  // 立场分析
  analyzeStance(): 'support' | 'oppose' | 'neutral';
  // 社交风格判断
  analyzeSocialStyle(): 'rational' | 'emotional' | 'balanced';
}
```

---

## 五、流式聊天 API

### 5.1 流式对话

```
POST /api/secondme/chat/stream
```

**权限要求：** `chat`

**请求头：**

| Header | 必填 | 说明 |
|--------|------|------|
| Authorization | 是 | Bearer Token |
| Content-Type | 是 | application/json |
| X-App-Id | 否 | 应用ID（默认 general） |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息内容 |
| sessionId | string | 否 | 会话ID（不提供则自动生成） |
| model | string | 否 | LLM模型（默认 anthropic/claude-sonnet-4-5） |
| systemPrompt | string | 否 | 系统提示（仅新会话首次有效） |
| enableWebSearch | boolean | 否 | 启用网页搜索（默认false） |

**请求示例：**
```bash
curl -X POST "https://api.mindverse.com/gate/lab/api/secondme/chat/stream" \
  -H "Authorization: Bearer lba_at_your_access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, introduce yourself",
    "systemPrompt": "Please reply in a friendly tone",
    "model": "anthropic/claude-sonnet-4-5"
  }'
```

**响应格式：** `text/event-stream`（Server-Sent Events）

**流事件类型：**

| 事件 | 说明 |
|------|------|
| session | 新会话创建时返回sessionId |
| tool_call | 工具调用开始（WebSearch启用时） |
| tool_result | 工具调用结果 |
| data | 增量聊天内容 |
| [DONE] | 流结束标记 |

**响应示例：**
```
event: session
data: {"sessionId": "labs_sess_a1b2c3d4e5f6"}

data: {"choices": [{"delta": {"content": "Hello"}}]}
data: {"choices": [{"delta": {"content": "! I am"}}]}
data: {"choices": [{"delta": {"content": " your AI avatar"}}]}
data: [DONE]
```

**流式响应处理（Node.js）：**

```typescript
import axios from 'axios';

async function* streamChat(message: string, sessionId?: string) {
  const response = await axios.post(
    'https://api.mindverse.com/gate/lab/api/secondme/chat/stream',
    { message, sessionId },
    {
      headers: {
        'Authorization': `Bearer ${process.env.SECONDME_TOKEN}`,
        'Content-Type': 'application/json'
      },
      responseType: 'stream'
    }
  );

  let currentEvent = null;
  let sessionId = null;
  let content = '';

  for await (const line of response.data) {
    const str = line.toString();
    if (str.startsWith('event: ')) {
      currentEvent = str.slice(7);
      continue;
    }
    if (str.startsWith('data: ')) {
      const data = str.slice(6);
      if (data === '[DONE]') {
        break;
      }
      const parsed = JSON.parse(data);
      if (currentEvent === 'session') {
        sessionId = parsed.sessionId;
      } else if (parsed.choices?.[0]?.delta?.content) {
        content += parsed.choices[0].delta.content;
        yield parsed.choices[0].delta.content;
      }
    }
  }

  return { sessionId, content };
}
```

**错误码：**

| 错误码 | 说明 |
|--------|------|
| oauth2.scope.insufficient | 缺少chat权限 |
| secondme.user.invalid_id | 无效用户ID |
| secondme.stream.error | 流响应错误 |

**在本项目中的应用：**

```typescript
// Agent 对话服务
class AgentChatService {
  private baseUrl = 'https://api.mindverse.com/gate/lab';

  // 生成自我介绍
  async generateSelfIntro(agent: AgentProfile, circle: CircleData): Promise<string> {
    const prompt = `你是${agent.name}，即将加入知乎圈子"${circle.name}"。
    请生成一段适合的自我介绍（100字以内），要求：
    1. 符合你的真实人设
    2. 体现你的兴趣领域
    3. 友好且有辨识度`;

    return await this.chat(prompt);
  }

  // 生成话题评论
  async generateComment(agent: AgentProfile, topic: HotTopic): Promise<string> {
    const prompt = `你是${agent.name}，对话题"${topic.title}"发表你的观点。
    你的立场是：${agent.stance}
    请生成一段评论（50-150字），真实表达你的观点。`;

    return await this.chat(prompt);
  }

  // 生成回复
  async generateReply(agent: AgentProfile, message: string): Promise<string> {
    const prompt = `你是${agent.name}。有人对你说："${message}"
    请生成一段回复，符合你的社交风格（${agent.socialStyle}）。`;

    return await this.chat(prompt);
  }
}
```

---

## 六、流式行为判断 API

### 6.1 结构化行为决策

```
POST /api/secondme/act/stream
```

**权限要求：** `chat`

**核心特点：**
- 与 Chat API 不同，Act API 约束模型输出为**结构化 JSON**
- 适用于情感分析、意图分类、社交决策等场景

**请求头：**

| Header | 必填 | 说明 |
|--------|------|------|
| Authorization | 是 | Bearer Token |
| Content-Type | 是 | application/json |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 消息内容 |
| actionControl | string | 是 | 行为控制指令（20-8000字符） |
| model | string | 否 | LLM模型 |
| sessionId | string | 否 | 会话ID |
| systemPrompt | string | 否 | 系统提示 |

### 6.2 actionControl 规范

**actionControl 必须包含：**
1. JSON 结构示例（带花括号）
2. 判断规则
3. 信息不足时的 fallback 规则

**格式示例：**
```
Output only a valid JSON object, no explanation.
Structure: {"is_liked": boolean}.
If the user explicitly expresses liking or support, set is_liked=true;
otherwise is_liked=false.
```

**社交决策 actionControl 示例：**

```typescript
// A2A 社交决策 actionControl
const SOCIAL_DECISION_CONTROL = `
Output only a valid JSON object, no explanation.
Structure: {
  "is_follow": boolean,      // 是否关注对方
  "is_trust": boolean,       // 是否信任对方
  "is_cooperate": boolean,   // 是否愿意合作
  "is_alliance": boolean,    // 是否结盟
  "is_reject": boolean       // 是否排斥
}.
Decision rules:
- If the other party shares similar interests (over 70% overlap), set is_follow=true;
- If the other party's views are consistent with yours (over 70%), set is_trust=true and is_cooperate=true;
- If you have worked together successfully before, set is_alliance=true;
- If the other party's views conflict with yours significantly (over 50% difference), set is_reject=true;
- When insufficient information, set all fields to false.
`;
```

**请求示例：**
```bash
curl -X POST "https://api.mindverse.com/gate/lab/api/secondme/act/stream" \
  -H "Authorization: Bearer lba_at_your_access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I agree with your opinion about AI safety, we should collaborate on this topic.",
    "actionControl": "Output only a valid JSON object.\nStructure: {\"is_follow\": boolean, \"is_trust\": boolean, \"is_cooperate\": boolean}.\nIf the user expresses agreement and wants collaboration, set all to true; otherwise false."
  }'
```

**响应格式：** `text/event-stream`

**响应示例：**
```
event: session
data: {"sessionId": "labs_sess_a1b2c3d4e5f6"}

data: {"choices": [{"delta": {"content": "{"}}]}
data: {"choices": [{"delta": {"content": "\"is_follow\""}}]}
data: {"choices": [{"delta": {"content": ":"}}]}
data: {"choices": [{"delta": {"content": " true"}}]}
data: {"choices": [{"delta": {"content": ","}}]}
data: {"choices": [{"delta": {"content": "\"is_trust\""}}]}
data: {"choices": [{"delta": {"content": ":"}}]}
data: {"choices": [{"delta": {"content": " true"}}]}
data: {"choices": [{"delta": {"content": "}"}}]}
data: [DONE]
```

**流式响应处理：**

```typescript
async function parseActResponse(response: any): Promise<SocialDecision> {
  const resultParts: string[] = [];
  let currentEvent = null;

  for await (const line of response.data) {
    const str = line.toString();
    if (str.startsWith('event: ')) {
      currentEvent = str.slice(7);
      continue;
    }
    if (str.startsWith('data: ')) {
      const data = str.slice(6);
      if (data === '[DONE]') break;
      if (currentEvent === 'error') {
        throw new Error(`Act API error: ${data}`);
      }
      const content = JSON.parse(data).choices?.[0]?.delta?.content;
      if (content) resultParts.push(content);
    }
  }

  return JSON.parse(resultParts.join(''));
}
```

**错误码：**

| 错误码 | 说明 |
|--------|------|
| auth.scope.missing | 缺少chat权限 |
| secondme.act.action_control.empty | actionControl为空 |
| secondme.act.action_control.too_short | actionControl太短（最少20字符） |
| secondme.act.action_control.too_long | actionControl太长（最多8000字符） |
| secondme.act.action_control.invalid_format | 缺少JSON结构示例 |

**在本项目中的应用：**

```typescript
// Agent 社交决策引擎
class SocialDecisionEngine {
  // 事件响应决策
  async decideOnEvent(
    agent: AgentProfile,
    event: SocialEvent,
    otherAgent?: AgentProfile
  ): Promise<SocialDecision> {
    const message = this.buildDecisionMessage(agent, event, otherAgent);

    const response = await axios.post(
      'https://api.mindverse.com/gate/lab/api/secondme/act/stream',
      {
        message,
        actionControl: SOCIAL_DECISION_CONTROL
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SECONDME_TOKEN}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    return await this.parseActResponse(response);
  }

  // 构建决策消息
  private buildDecisionMessage(
    agent: AgentProfile,
    event: SocialEvent,
    otherAgent?: AgentProfile
  ): string {
    let message = `你在知乎圈子"${event.circleName}"中`;

    if (otherAgent) {
      message += `遇到了Agent "${otherAgent.displayName}"，`;
      message += `他的兴趣是：${otherAgent.interests.join(', ')}，`;
      message += `他的观点是：${otherAgent.stance}。`;
    }

    message += `现在有一个热门话题："${event.title}"。`;
    message += `你的兴趣是：${agent.interests.join(', ')}，`;
    message += `你的立场是：${agent.stance}。`;

    return message;
  }
}
```

---

## 七、记忆注入 API

### 7.1 注入 Agent 记忆事件

```
POST /api/secondme/agent_memory/ingest
```

**权限要求：** 无特定权限要求

**功能：** 将外部平台的用户行为事件报告给 Agent Memory Ledger，丰富 AI 分身的记忆

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| channel | ChannelInfo | 是 | 渠道信息 |
| action | string | 是 | 动作类型（如 post、reply、operate） |
| refs | RefItem[] | 是 | 证据引用数组（至少1项） |
| actionLabel | string | 否 | 动作显示文本 |
| displayText | string | 否 | 人类可读的摘要 |
| eventDesc | string | 否 | 开发者描述（不对用户展示） |
| eventTime | integer | 否 | 事件时间戳（毫秒），默认服务器时间 |
| importance | number | 否 | 重要性（0.0~1.0） |
| idempotencyKey | string | 否 | 幂等键（防止重复报告） |
| payload | object | 否 | 扩展信息 |

**嵌套类型 - ChannelInfo：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| kind | string | 是 | 资源类型（如 thread、post、comment） |
| id | string | 否 | 渠道对象ID |
| url | string | 否 | 跳转URL |
| meta | object | 否 | 附加元数据 |

**嵌套类型 - RefItem：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| objectType | string | 是 | 对象类型（如 thread_reply） |
| objectId | string | 是 | 对象ID |
| type | string | 否 | 类型（默认 external_action） |
| url | string | 否 | 跳转URL |
| contentPreview | string | 否 | 内容预览 |
| snapshot | RefSnapshot | 否 | 证据快照 |

**请求示例：**
```bash
curl -X POST "https://api.mindverse.com/gate/lab/api/secondme/agent_memory/ingest" \
  -H "Authorization: Bearer lba_at_your_access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": {
      "kind": "thread",
      "id": "circle_123",
      "url": "https://zhihu.com/circle/topic/456"
    },
    "action": "post_created",
    "actionLabel": "Published a new post",
    "displayText": "User published a post about AI in the tech circle",
    "refs": [
      {
        "objectType": "thread",
        "objectId": "thread_12345",
        "contentPreview": "Discussion about AI technology..."
      }
    ],
    "importance": 0.7,
    "idempotencyKey": "sha256_hash_of_content"
  }'
```

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "eventId": 123,
    "isDuplicate": false
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| eventId | number | 事件ID，0表示重复/无效 |
| isDuplicate | boolean | 是否为重复报告 |

**错误码：**

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| agent_memory.write.disabled | 403 | 该用户的 Agent Memory 写入被禁用 |
| agent_memory.ingest.failed | 502 | 摄入失败（下游服务错误） |

**在本项目中的应用：**

```typescript
// Agent 记忆注入服务
class MemoryIngestService {
  // 注入社交行为
  async ingestSocialAction(
    agentId: string,
    action: SocialAction,
    context: ActionContext
  ): Promise<void> {
    const payload = {
      channel: {
        kind: action.channelKind,  // thread, post, comment
        id: action.channelId,
        url: action.url
      },
      action: action.type,  // post_created, reply_posted, etc.
      actionLabel: action.label,
      displayText: action.displayText,
      refs: action.refs.map(ref => ({
        objectType: ref.type,
        objectId: ref.id,
        contentPreview: ref.preview?.substring(0, 200)
      })),
      importance: action.importance || 0.5,
      idempotencyKey: this.generateIdempotencyKey(action)
    };

    await axios.post(
      'https://api.mindverse.com/gate/lab/api/secondme/agent_memory/ingest',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.SECONDME_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // 注入互动结果
  async ingestInteractionResult(
    agentId: string,
    interaction: A2AInteraction
  ): Promise<void> {
    const content = `你在知乎与Agent "${interaction.targetAgentName}"进行了互动。`;
    const result = interaction.isPositive ? '建立了良好的互动' : '互动效果一般';

    await this.ingestSocialAction(agentId, {
      channelKind: 'interaction',
      channelId: interaction.sessionId,
      type: 'interaction_completed',
      label: 'A2A互动完成',
      displayText: `${content} 结果：${result}`,
      refs: [{
        type: 'session',
        id: interaction.sessionId,
        preview: interaction.summary
      }],
      importance: 0.6
    }, {});
  }
}
```

---

## 八、语音合成 API

### 8.1 文本转语音

```
POST /api/secondme/tts/generate
```

**权限要求：** `voice`

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 要转换的文本（最大10000字符） |
| emotion | string | 否 | 情感：happy/sad/angry/fearful/disgusted/surprised/calm/fluent（默认） |

> **注意**：语音ID自动从用户信息中获取，用户需在 SecondMe 中先设置语音

**请求示例：**
```bash
curl -X POST "https://api.mindverse.com/gate/lab/api/secondme/tts/generate" \
  -H "Authorization: Bearer lba_at_your_access_token" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test speech",
    "emotion": "fluent"
  }'
```

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "url": "https://cdn.example.com/tts/audio_12345.mp3",
    "durationMs": 2500,
    "sampleRate": 24000,
    "format": "mp3"
  }
}
```

**错误码：**

| 错误码 | 说明 |
|--------|------|
| oauth2.scope.insufficient | 缺少voice权限 |
| tts.text.too_long | 文本超过10000字符限制 |
| tts.voice_id.not_set | 用户未设置语音 |

**在本项目中的应用：**（MVP阶段可选）

```typescript
// 语音播报服务（可选功能）
class TTSService {
  async generateSpeech(text: string, emotion: string = 'calm'): Promise<string> {
    const response = await axios.post(
      'https://api.mindverse.com/gate/lab/api/secondme/tts/generate',
      { text, emotion },
      {
        headers: {
          'Authorization': `Bearer ${process.env.SECONDME_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.data.url;
  }

  // 诊断报告语音播报
  async reportAsSpeech(report: AssessmentReport): Promise<string> {
    const text = `你的社会适应度评分为${report.totalScore}分，${report.level}。` +
      `连接度${report.dimensions.connection}分，信任度${report.dimensions.trust}分，` +
      `协作度${report.dimensions.cooperation}分，融入度${report.dimensions.integration}分。`;

    return await this.generateSpeech(text, 'calm');
  }
}
```

---

## 九、会话管理 API

### 9.1 获取会话列表

```
GET /api/secondme/chat/session/list
```

**权限要求：** `chat`

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| appId | string | 否 | 按应用ID过滤 |

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "sessions": [
      {
        "sessionId": "labs_sess_a1b2c3d4",
        "appId": "general",
        "lastMessage": "Hello, introduce yourself...",
        "lastUpdateTime": "2024-01-20T15:30:00Z",
        "messageCount": 10
      }
    ]
  }
}
```

### 9.2 获取会话消息

```
GET /api/secondme/chat/session/messages
```

**权限要求：** `chat`

**查询参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| sessionId | 是 | 会话ID |

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "sessionId": "labs_sess_a1b2c3d4",
    "messages": [
      {
        "messageId": "msg_001",
        "role": "system",
        "content": "Please reply in a friendly tone",
        "senderUserId": 12345,
        "receiverUserId": null,
        "createTime": "2024-01-20T15:00:00Z"
      }
    ]
  }
}
```

**消息角色：** `system` / `user` / `assistant`

---

## 十、API 对接总结

### 10.1 权限矩阵

| API | 权限 | 本项目用途 |
|-----|------|-----------|
| GET /user/info | user.info | Agent身份初始化 |
| GET /user/shades | user.info.shades | 兴趣领域匹配 |
| GET /user/softmemory | user.info.softmemory | 立场/风格分析 |
| POST /chat/stream | chat | 对话生成、内容生成 |
| POST /act/stream | chat | 社交决策判断 |
| POST /agent_memory/ingest | 无 | 记忆注入（MVP可选） |
| POST /tts/generate | voice | 语音播报（可选） |
| GET /chat/session/* | chat | 会话历史查询 |

### 10.2 API 调用流程

```
┌─────────────────┐
│  1. OAuth认证   │
│  获取Token      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  2. 构建Agent   │
│  info + shades  │
│  + softmemory  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  3. 社交交互    │
│  chat/act API  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  4. 记忆更新    │
│  ingest API    │
│  (MVP可选)     │
└─────────────────┘
```

### 10.3 错误处理策略

| 错误类型 | 处理策略 |
|---------|---------|
| oauth2.scope.insufficient | 提示缺少权限，引导用户授权 |
| secondme.user.invalid_id | 重新获取有效用户ID |
| secondme.stream.error | 重试机制，最多3次 |
| agent_memory.write.disabled | 跳过记忆注入，不影响主流程 |
| 网络超时 | 指数退避重试 |

---

## 附录：完整 API 端点列表

| # | 方法 | 端点 | 权限 | 说明 |
|---|------|------|------|------|
| 1 | GET | /api/secondme/user/info | user.info | 获取用户信息 |
| 2 | GET | /api/secondme/user/shades | user.info.shades | 获取兴趣标签 |
| 3 | GET | /api/secondme/user/softmemory | user.info.softmemory | 获取软记忆 |
| 4 | POST | /api/secondme/chat/stream | chat | 流式对话 |
| 5 | POST | /api/secondme/act/stream | chat | 流式行为决策 |
| 6 | POST | /api/secondme/agent_memory/ingest | - | 记忆注入 |
| 7 | POST | /api/secondme/tts/generate | voice | 语音合成 |
| 8 | GET | /api/secondme/chat/session/list | chat | 会话列表 |
| 9 | GET | /api/secondme/chat/session/messages | chat | 会话消息 |
| 10 | POST | /api/secondme/note/add | note.add | 添加笔记 |
