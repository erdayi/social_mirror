import { Prisma } from '@prisma/client'
import type {
  DistrictUpgradePlan,
  GraphEdgeType,
  GraphNodeType,
  Relationship,
  Roundtable,
  RoundtableParticipant,
  SocialEvent,
  ZoneType,
} from '@prisma/client'
import { mirrorGraphToNeo4j } from '@/lib/neo4j'
import { prisma } from '@/lib/prisma'
import { getSocialProfileFromAgent } from '@/lib/mesociety/agent-insights'
import { parseEconomyMeta } from '@/lib/mesociety/economy-meta'
import {
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
} from '@/lib/mesociety/social'
import type { AgentWithSnapshot } from '@/lib/mesociety/types'
import { getDistrictByPoint } from '@/lib/mesociety/world-map'

type GraphNodeDraft = {
  nodeKey: string
  type: GraphNodeType
  label: string
  refId?: string
  metadata?: Prisma.InputJsonValue
}

type GraphEdgeDraft = {
  type: GraphEdgeType
  sourceNodeKey: string
  targetNodeKey: string
  weight: number
  metadata?: Prisma.InputJsonValue
}

type GraphZoneMeta = {
  id: ZoneType
  label: string
}

type GraphRoundtableRecord = Pick<Roundtable, 'id' | 'topic' | 'status' | 'knowledgeJson'> & {
  participants: Array<Pick<RoundtableParticipant, 'agentId' | 'contributionScore'>>
}

type GraphEconomyEventRecord = Pick<
  SocialEvent,
  'actorAgentId' | 'targetAgentId' | 'metadata'
>

type GraphRelationshipRecord = Pick<
  Relationship,
  'sourceAgentId' | 'targetAgentId' | 'type' | 'strength'
>

export type GraphProjectionInput = {
  agents: AgentWithSnapshot[]
  relationships: GraphRelationshipRecord[]
  roundtables: GraphRoundtableRecord[]
  economyEvents: GraphEconomyEventRecord[]
  upgradePlans: DistrictUpgradePlan[]
  zones: GraphZoneMeta[]
}

const GRAPH_BATCH_SIZE = 200

function chunkItems<T>(items: T[], size = GRAPH_BATCH_SIZE) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function toGraphJsonSql(value?: Prisma.InputJsonValue) {
  if (typeof value === 'undefined') {
    return Prisma.sql`NULL`
  }

  return Prisma.sql`CAST(${JSON.stringify(value)} AS JSON)`
}

function queueGraphNode(
  drafts: Map<string, GraphNodeDraft>,
  nodeKey: string,
  input: {
    type: GraphNodeType
    label: string
    refId?: string
    metadata?: Prisma.InputJsonValue
  }
) {
  const previous = drafts.get(nodeKey)
  drafts.set(nodeKey, {
    nodeKey,
    type: input.type,
    label: input.label,
    refId: input.refId ?? previous?.refId,
    metadata: input.metadata ?? previous?.metadata,
  })
}

function queueGraphEdge(
  drafts: Map<string, GraphEdgeDraft>,
  input: {
    type: GraphEdgeType
    sourceNodeKey: string
    targetNodeKey: string
    weight: number
    metadata?: Prisma.InputJsonValue
  }
) {
  const key = `${input.sourceNodeKey}::${input.targetNodeKey}::${input.type}`
  const previous = drafts.get(key)
  drafts.set(key, {
    ...input,
    metadata: input.metadata ?? previous?.metadata,
  })
}

function buildGraphProjection(input: GraphProjectionInput) {
  const nodeDrafts = new Map<string, GraphNodeDraft>()
  const edgeDrafts = new Map<string, GraphEdgeDraft>()

  for (const zone of input.zones) {
    queueGraphNode(nodeDrafts, `zone:${zone.id}`, {
      type: 'zone',
      label: zone.label,
      refId: zone.id,
    })
  }

  for (const agent of input.agents) {
    const social = getSocialProfileFromAgent(agent)
    const district = getDistrictByPoint(agent.zonePresence?.x || 0, agent.zonePresence?.y || 0)
    const agentNodeKey = `agent:${agent.id}`

    queueGraphNode(nodeDrafts, agentNodeKey, {
      type: 'agent',
      label: agent.displayName,
      refId: agent.id,
      metadata: {
        source: agent.source,
        stance: agent.stance,
        career: social.career,
        faction: social.faction,
        primaryGoal: social.primaryGoal,
      },
    })

    for (const topicLabel of [
      `职业:${getSocialCareerLabel(social.career)}`,
      `阵营:${getSocialFactionLabel(social.faction)}`,
      `目标:${getSocialGoalLabel(social.primaryGoal)}`,
      `街区:${district.label}`,
    ]) {
      const topicNodeKey = `topic:${topicLabel}`

      queueGraphNode(nodeDrafts, topicNodeKey, {
        type: 'topic',
        label: topicLabel,
      })

      queueGraphEdge(edgeDrafts, {
        type: 'mentions',
        sourceNodeKey: agentNodeKey,
        targetNodeKey: topicNodeKey,
        weight: 1,
      })
    }

    queueGraphEdge(edgeDrafts, {
      type: 'participates_in',
      sourceNodeKey: agentNodeKey,
      targetNodeKey: `zone:${agent.currentZone}`,
      weight: 1,
      metadata: {
        districtId: district.id,
        districtLabel: district.label,
      },
    })
  }

  for (const roundtable of input.roundtables) {
    const roundtableNodeKey = `roundtable:${roundtable.id}`
    const topicNodeKey = `topic:${roundtable.topic}`

    queueGraphNode(nodeDrafts, roundtableNodeKey, {
      type: 'roundtable',
      label: roundtable.topic,
      refId: roundtable.id,
      metadata: {
        status: roundtable.status,
      },
    })

    queueGraphNode(nodeDrafts, topicNodeKey, {
      type: 'topic',
      label: roundtable.topic,
      refId: roundtable.id,
    })

    queueGraphEdge(edgeDrafts, {
      type: 'mentions',
      sourceNodeKey: roundtableNodeKey,
      targetNodeKey: topicNodeKey,
      weight: 1,
    })

    const knowledge =
      roundtable.knowledgeJson &&
      typeof roundtable.knowledgeJson === 'object' &&
      !Array.isArray(roundtable.knowledgeJson)
        ? (roundtable.knowledgeJson as Record<string, unknown>)
        : {}
    const knowledgeInsight = typeof knowledge.keyInsight === 'string' ? knowledge.keyInsight : ''

    if (knowledgeInsight) {
      const knowledgeNodeKey = `knowledge:${roundtable.id}`

      queueGraphNode(nodeDrafts, knowledgeNodeKey, {
        type: 'knowledge',
        label: `洞察:${roundtable.topic}`,
        refId: roundtable.id,
        metadata: roundtable.knowledgeJson as Prisma.InputJsonValue,
      })

      queueGraphEdge(edgeDrafts, {
        type: 'mentions',
        sourceNodeKey: roundtableNodeKey,
        targetNodeKey: knowledgeNodeKey,
        weight: 1,
      })

      queueGraphEdge(edgeDrafts, {
        type: 'mentions',
        sourceNodeKey: topicNodeKey,
        targetNodeKey: knowledgeNodeKey,
        weight: 1,
      })

      for (const participant of roundtable.participants) {
        queueGraphEdge(edgeDrafts, {
          type: 'mentions',
          sourceNodeKey: `agent:${participant.agentId}`,
          targetNodeKey: knowledgeNodeKey,
          weight: 1,
        })
      }
    }

    for (const participant of roundtable.participants) {
      queueGraphEdge(edgeDrafts, {
        type: 'participates_in',
        sourceNodeKey: `agent:${participant.agentId}`,
        targetNodeKey: roundtableNodeKey,
        weight: participant.contributionScore || 1,
      })

      queueGraphEdge(edgeDrafts, {
        type: 'discusses',
        sourceNodeKey: `agent:${participant.agentId}`,
        targetNodeKey: topicNodeKey,
        weight: 1,
      })
    }
  }

  for (const event of input.economyEvents) {
    const economy = parseEconomyMeta(event.metadata)
    if (!economy) {
      continue
    }

    const resourceNodeKey = `topic:资源:${economy.resource}`

    queueGraphNode(nodeDrafts, resourceNodeKey, {
      type: 'topic',
      label: `资源:${economy.resourceLabel}`,
      metadata: {
        category: economy.category,
        units: economy.units,
      },
    })

    if (economy.districtLabel) {
      const districtNodeKey = `topic:街区资源:${economy.districtLabel}`

      queueGraphNode(nodeDrafts, districtNodeKey, {
        type: 'topic',
        label: `街区:${economy.districtLabel}`,
        metadata: {
          resource: economy.resourceLabel,
          category: economy.category,
        },
      })

      queueGraphEdge(edgeDrafts, {
        type: 'mentions',
        sourceNodeKey: districtNodeKey,
        targetNodeKey: resourceNodeKey,
        weight: Math.max(1, economy.units),
      })

      if (economy.category === 'alliance_investment' || economy.category === 'resource_consumption') {
        const governanceLabel =
          economy.category === 'alliance_investment' ? '治理:联盟投资' : '治理:街区维持'
        const governanceNodeKey = `topic:${governanceLabel}`

        queueGraphNode(nodeDrafts, governanceNodeKey, {
          type: 'topic',
          label: governanceLabel,
          metadata: {
            districtLabel: economy.districtLabel,
            resource: economy.resourceLabel,
          },
        })

        queueGraphEdge(edgeDrafts, {
          type: 'mentions',
          sourceNodeKey: districtNodeKey,
          targetNodeKey: governanceNodeKey,
          weight: Math.max(1, economy.units),
        })

        queueGraphEdge(edgeDrafts, {
          type: 'mentions',
          sourceNodeKey: governanceNodeKey,
          targetNodeKey: resourceNodeKey,
          weight: Math.max(1, economy.units),
        })
      }
    }

    if (event.actorAgentId) {
      queueGraphEdge(edgeDrafts, {
        type: 'discusses',
        sourceNodeKey: `agent:${event.actorAgentId}`,
        targetNodeKey: resourceNodeKey,
        weight: Math.max(1, economy.units),
        metadata: {
          category: economy.category,
        },
      })
    }

    if (economy.workPointId && economy.workPointLabel) {
      const outputNodeKey = `knowledge:work:${economy.workPointId}`

      queueGraphNode(nodeDrafts, outputNodeKey, {
        type: 'knowledge',
        label: `${economy.workPointLabel}:${economy.resourceLabel}`,
        metadata: {
          category: economy.category,
          districtLabel: economy.districtLabel,
          units: economy.units,
        },
      })

      queueGraphEdge(edgeDrafts, {
        type: 'mentions',
        sourceNodeKey: resourceNodeKey,
        targetNodeKey: outputNodeKey,
        weight: Math.max(1, economy.units),
      })
    }

    if (event.targetAgentId && economy.category === 'resource_exchange') {
      queueGraphEdge(edgeDrafts, {
        type: 'discusses',
        sourceNodeKey: `agent:${event.targetAgentId}`,
        targetNodeKey: resourceNodeKey,
        weight: Math.max(1, economy.units),
        metadata: {
          category: 'resource_exchange',
        },
      })
    }
  }

  for (const plan of input.upgradePlans) {
    const projectNodeKey = `knowledge:project:${plan.id}`
    const districtNodeKey = `topic:街区资源:${plan.districtLabel}`
    const resourceNodeKey = `topic:资源:${plan.requiredResourceKey}`

    queueGraphNode(nodeDrafts, projectNodeKey, {
      type: 'knowledge',
      label: `工程:${plan.title}`,
      refId: plan.id,
      metadata: {
        districtLabel: plan.districtLabel,
        stage: plan.stage,
        progressPercent: plan.progressPercent,
        requiredResourceLabel: plan.requiredResourceLabel,
      },
    })

    queueGraphNode(nodeDrafts, districtNodeKey, {
      type: 'topic',
      label: `街区:${plan.districtLabel}`,
      metadata: {
        project: plan.title,
      },
    })

    queueGraphEdge(edgeDrafts, {
      type: 'mentions',
      sourceNodeKey: districtNodeKey,
      targetNodeKey: projectNodeKey,
      weight: Math.max(1, plan.progressPercent / 25),
      metadata: {
        stage: plan.stage,
      },
    })

    queueGraphNode(nodeDrafts, resourceNodeKey, {
      type: 'topic',
      label: `资源:${plan.requiredResourceLabel}`,
      metadata: {
        category: 'project_requirement',
      },
    })

    queueGraphEdge(edgeDrafts, {
      type: 'mentions',
      sourceNodeKey: projectNodeKey,
      targetNodeKey: resourceNodeKey,
      weight: Math.max(1, plan.requiredUnits / 10),
    })

    if (plan.sponsorAgentId) {
      queueGraphEdge(edgeDrafts, {
        type: 'mentions',
        sourceNodeKey: `agent:${plan.sponsorAgentId}`,
        targetNodeKey: projectNodeKey,
        weight: Math.max(1, plan.progressPercent / 20),
      })
    }
  }

  const edgeTypeMap: Record<GraphRelationshipRecord['type'], GraphEdgeType> = {
    follow: 'follows',
    trust: 'trusts',
    cooperate: 'cooperates',
    reject: 'rejects',
    alliance: 'cooperates',
  }

  for (const relationship of input.relationships) {
    queueGraphEdge(edgeDrafts, {
      type: edgeTypeMap[relationship.type],
      sourceNodeKey: `agent:${relationship.sourceAgentId}`,
      targetNodeKey: `agent:${relationship.targetAgentId}`,
      weight: relationship.strength,
      metadata: {
        type: relationship.type,
      },
    })
  }

  return { nodeDrafts, edgeDrafts }
}

async function flushGraphNodes(nodeDrafts: Map<string, GraphNodeDraft>) {
  const drafts = Array.from(nodeDrafts.values())
  if (!drafts.length) {
    return new Map<string, string>()
  }

  for (const chunk of chunkItems(drafts)) {
    const now = new Date()
    const values = chunk.map((draft) => Prisma.sql`(
      ${crypto.randomUUID()},
      ${draft.nodeKey},
      ${draft.type},
      ${draft.refId ?? null},
      ${draft.label},
      ${toGraphJsonSql(draft.metadata)},
      ${now},
      ${now}
    )`)

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO graph_nodes (id, nodeKey, nodeType, refId, label, metadata, createdAt, updatedAt)
      VALUES ${Prisma.join(values)}
      ON DUPLICATE KEY UPDATE
        nodeType = VALUES(nodeType),
        refId = VALUES(refId),
        label = VALUES(label),
        metadata = VALUES(metadata),
        updatedAt = VALUES(updatedAt)
    `)
  }

  const rows = await prisma.graphNode.findMany({
    where: {
      nodeKey: {
        in: drafts.map((draft) => draft.nodeKey),
      },
    },
    select: {
      id: true,
      nodeKey: true,
    },
  })

  return new Map(rows.map((row) => [row.nodeKey, row.id]))
}

async function flushGraphEdges(
  edgeDrafts: Map<string, GraphEdgeDraft>,
  nodeMap: Map<string, string>
) {
  const drafts = Array.from(edgeDrafts.values())
    .map((draft) => {
      const sourceNodeId = nodeMap.get(draft.sourceNodeKey)
      const targetNodeId = nodeMap.get(draft.targetNodeKey)

      if (!sourceNodeId || !targetNodeId) {
        return null
      }

      return {
        ...draft,
        sourceNodeId,
        targetNodeId,
      }
    })
    .filter((draft): draft is GraphEdgeDraft & { sourceNodeId: string; targetNodeId: string } =>
      Boolean(draft)
    )

  if (!drafts.length) {
    return
  }

  for (const chunk of chunkItems(drafts)) {
    const now = new Date()
    const values = chunk.map((draft) => Prisma.sql`(
      ${crypto.randomUUID()},
      ${draft.type},
      ${draft.sourceNodeId},
      ${draft.targetNodeId},
      ${draft.weight},
      ${toGraphJsonSql(draft.metadata)},
      ${now},
      ${now}
    )`)

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO graph_edges (id, edgeType, sourceNodeId, targetNodeId, weight, metadata, createdAt, updatedAt)
      VALUES ${Prisma.join(values)}
      ON DUPLICATE KEY UPDATE
        weight = VALUES(weight),
        metadata = VALUES(metadata),
        updatedAt = VALUES(updatedAt)
    `)
  }
}

export async function syncProjectedGraph(input: GraphProjectionInput) {
  const { nodeDrafts, edgeDrafts } = buildGraphProjection(input)
  const nodeMap = await flushGraphNodes(nodeDrafts)
  await flushGraphEdges(edgeDrafts, nodeMap)

  const [nodes, edges] = await Promise.all([
    prisma.graphNode.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 48,
    }),
    prisma.graphEdge.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 72,
    }),
  ])

  await mirrorGraphToNeo4j({
    nodes: nodes.map((node) => ({
      id: node.id,
      key: node.nodeKey,
      type: node.nodeType,
      label: node.label,
      size: node.nodeType === 'agent' ? 18 : node.nodeType === 'topic' ? 15 : 12,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      type: edge.edgeType,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      weight: edge.weight,
    })),
  })
}
