# Neo4j 接入说明

## 当前状态
- 项目默认仍使用 `MySQL` 作为图谱读写底座。
- 如果配置了 Neo4j 连接信息，并额外安装 `neo4j-driver`，系统会把 `GraphNode / GraphEdge` 同步到 Neo4j，并优先从 Neo4j 读取图谱页面。

## 本地安装方式

### 方式一：Neo4j Desktop
1. 安装 `Neo4j Desktop`
2. 新建一个本地 DBMS
3. 记录连接信息：
   - `bolt://localhost:7687`
   - 用户名
   - 密码
   - 数据库名（通常可用 `neo4j`）

### 方式二：Docker
```bash
docker run --name mesociety-neo4j ^
  -p 7474:7474 -p 7687:7687 ^
  -e NEO4J_AUTH=neo4j/your-password ^
  -d neo4j
```

启动后：
- Browser: `http://localhost:7474`
- Bolt: `bolt://localhost:7687`

## Node 依赖
在项目根目录执行：

```bash
npm install neo4j-driver
```

## 环境变量
在 `.env.local` 中加入：

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
```

## 启动顺序
1. 先启动 MySQL
2. 再启动 Neo4j
3. 最后启动项目：

```bash
npm run dev
```

## 验证方式
1. 打开 `http://localhost:3000/graph`
2. 查看页面顶部图谱状态
3. 如果显示：
   - `图谱后端：Neo4j`，说明已经切换成功
   - `图谱后端：MySQL`，说明仍在回退模式

## 说明
- 没有安装 `neo4j-driver` 时，项目不会崩溃，会自动回退到 MySQL。
- 首版同步策略是“全量镜像当前图谱快照”，适合黑客松演示；后续可以改成增量同步。
