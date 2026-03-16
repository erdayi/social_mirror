import { env } from '@/lib/env'
import type { GraphView } from '@/lib/mesociety/types'

type Neo4jStatus = GraphView['meta']['neo4jStatus']
type Neo4jRecord = {
  get: (key: string) => unknown
}
type Neo4jQueryResult = {
  records: Neo4jRecord[]
}
type Neo4jTransaction = {
  run: (query: string, params?: Record<string, unknown>) => Promise<unknown>
}
type Neo4jSession = {
  run: (query: string, params?: Record<string, unknown>) => Promise<Neo4jQueryResult>
  executeWrite: <T>(operation: (tx: Neo4jTransaction) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}
type Neo4jDriver = {
  session: (options?: { database?: string }) => Neo4jSession
}
type Neo4jModule = {
  driver: (uri: string, authToken: unknown, config?: Record<string, unknown>) => Neo4jDriver
  auth: {
    basic: (username: string, password: string) => unknown
  }
}

let neo4jDriverPromise: Promise<Neo4jModule | null> | null = null
let neo4jInstance: Neo4jDriver | null = null
let neo4jFailureReason: string | null = null
let neo4jFailureUntil = 0

function dynamicImport(moduleName: string) {
  return new Function(
    'moduleName',
    'return import(moduleName)'
  )(moduleName) as Promise<unknown>
}

function hasNeo4jConfig() {
  return Boolean(env.neo4j.uri && env.neo4j.username && env.neo4j.password)
}

function normalizeNeo4jError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('ECONNREFUSED')) {
    return '本地 Neo4j 未启动，当前已自动回退到 MySQL 图谱。'
  }

  if (message.toLowerCase().includes('encryption')) {
    return 'Neo4j 加密配置不兼容，当前已自动回退到 MySQL 图谱。'
  }

  return 'Neo4j 当前不可用，已自动回退到 MySQL 图谱。'
}

async function loadNeo4jDriver() {
  if (!hasNeo4jConfig()) {
    return null
  }

  if (!neo4jDriverPromise) {
    neo4jDriverPromise = dynamicImport('neo4j-driver')
      .then((module) => {
        const candidate = module as { default?: Neo4jModule }
        return candidate.default || (module as Neo4jModule)
      })
      .catch(() => null)
  }

  return neo4jDriverPromise
}

async function getNeo4jInstance() {
  if (!hasNeo4jConfig()) {
    return null
  }

  if (neo4jFailureUntil > Date.now()) {
    return null
  }

  if (neo4jInstance) {
    return neo4jInstance
  }

  const neo4j = await loadNeo4jDriver()
  if (!neo4j) {
    return null
  }

  neo4jInstance = neo4j.driver(
    env.neo4j.uri,
    neo4j.auth.basic(env.neo4j.username, env.neo4j.password),
    {
      encrypted: 'ENCRYPTION_OFF',
      disableLosslessIntegers: true,
    }
  )

  return neo4jInstance
}

async function withNeo4jSession<T>(
  operation: (session: Neo4jSession) => Promise<T>
): Promise<
  | {
      ok: true
      value: T
      status: Neo4jStatus
    }
  | {
      ok: false
      value: null
      status: Neo4jStatus
      reason?: string
    }
> {
  if (!hasNeo4jConfig()) {
    return {
      ok: false,
      value: null,
      status: 'not_configured',
    }
  }

  const driver = await getNeo4jInstance()
  if (!driver) {
    return {
      ok: false,
      value: null,
      status: neo4jFailureReason ? 'error' : 'driver_missing',
      reason: neo4jFailureReason || 'neo4j-driver 未安装，当前仍使用 MySQL 图谱。',
    }
  }

  const session = driver.session(
    env.neo4j.database
      ? {
          database: env.neo4j.database,
        }
      : undefined
  )

  try {
    const value = await operation(session)
    neo4jFailureReason = null
    neo4jFailureUntil = 0
    return {
      ok: true,
      value,
      status: 'connected',
    }
  } catch (error) {
    neo4jInstance = null
    neo4jFailureReason = normalizeNeo4jError(error)
    neo4jFailureUntil = Date.now() + 15_000
    return {
      ok: false,
      value: null,
      status: 'error',
      reason: neo4jFailureReason,
    }
  } finally {
    await session.close()
  }
}

function sanitizeRelationshipType(type: string) {
  const cleaned = type.toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
  return cleaned || 'RELATED_TO'
}

export async function getNeo4jGraphView() {
  const result = await withNeo4jSession(async (session) => {
    const [nodeResult, edgeResult] = await Promise.all([
      session.run(
        `
          MATCH (node:GraphNode)
          RETURN
            node.id AS id,
            node.nodeKey AS nodeKey,
            node.nodeType AS nodeType,
            node.label AS label,
            node.size AS size
          ORDER BY node.label ASC
          LIMIT 48
        `
      ),
      session.run(
        `
          MATCH (source:GraphNode)-[edge]->(target:GraphNode)
          RETURN
            edge.id AS id,
            edge.edgeType AS edgeType,
            source.id AS sourceId,
            target.id AS targetId,
            edge.weight AS weight
          ORDER BY edge.id ASC
          LIMIT 72
        `
      ),
    ])

    return {
      nodes: nodeResult.records.map((record) => ({
        id: String(record.get('id')),
        key: String(record.get('nodeKey')),
        type: String(record.get('nodeType')),
        label: String(record.get('label')),
        size: Number(record.get('size') || 12),
      })),
      edges: edgeResult.records.map((record) => ({
        id: String(record.get('id')),
        type: String(record.get('edgeType')),
        source: String(record.get('sourceId')),
        target: String(record.get('targetId')),
        weight: Number(record.get('weight') || 1),
      })),
    }
  })

  if (!result.ok) {
    return {
      graph: null,
      status: result.status,
      reason: result.reason,
    }
  }

  return {
    graph: {
      ...result.value,
      meta: {
        backend: 'neo4j',
        neo4jStatus: result.status,
        reason: null,
      },
    } satisfies GraphView,
    status: result.status,
    reason: null,
  }
}

export async function mirrorGraphToNeo4j(graph: Omit<GraphView, 'meta'>) {
  const result = await withNeo4jSession(async (session) => {
    await session.executeWrite(async (tx) => {
      await tx.run('MATCH (node:GraphNode) DETACH DELETE node')

      for (const node of graph.nodes) {
        await tx.run(
          `
            MERGE (node:GraphNode {id: $id})
            SET
              node.nodeKey = $nodeKey,
              node.nodeType = $nodeType,
              node.label = $label,
              node.size = $size
          `,
          {
            id: node.id,
            nodeKey: node.key,
            nodeType: node.type,
            label: node.label,
            size: node.size,
          }
        )
      }

      for (const edge of graph.edges) {
        const relationshipType = sanitizeRelationshipType(edge.type)
        await tx.run(
          `
            MATCH (source:GraphNode {id: $sourceId})
            MATCH (target:GraphNode {id: $targetId})
            MERGE (source)-[relation:${relationshipType} {id: $id}]->(target)
            SET
              relation.edgeType = $edgeType,
              relation.weight = $weight
          `,
          {
            id: edge.id,
            sourceId: edge.source,
            targetId: edge.target,
            edgeType: edge.type,
            weight: edge.weight,
          }
        )
      }
    })
  })

  return {
    status: result.status,
    reason: result.ok ? null : result.reason,
  }
}
