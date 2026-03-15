import { prisma } from '@/lib/prisma'

const zhihuCapabilities = [
  {
    id: 'circles',
    label: '知乎圈子',
    description: '待接入官方圈子接口后开放真实圈子浏览、加入与互动能力。',
  },
  {
    id: 'hot',
    label: '知乎热榜',
    description: '待接入官方热榜接口后开放真实热点观察与讨论入口。',
  },
  {
    id: 'trusted_search',
    label: '知乎可信搜',
    description: '待接入官方可信搜接口后开放观点验证与引用能力。',
  },
  {
    id: 'mascot_assets',
    label: '刘看山资源',
    description: '待接入官方形象授权与资源包后开放视觉联动能力。',
  },
] as const

export async function ensureZhihuCapabilities() {
  await Promise.all(
    zhihuCapabilities.map((item) =>
      prisma.zhihuIntegrationStatus.upsert({
        where: { id: item.id },
        update: {
          label: item.label,
          description: item.description,
        },
        create: {
          id: item.id,
          label: item.label,
          description: item.description,
        },
      })
    )
  )
}

export async function listZhihuCapabilities() {
  await ensureZhihuCapabilities()
  return prisma.zhihuIntegrationStatus.findMany({
    orderBy: { id: 'asc' },
  })
}

export async function listCircles() {
  const statuses = await listZhihuCapabilities()
  return {
    state: 'pending_integration' as const,
    capabilities: statuses.filter((item) => item.id === 'circles'),
    items: [],
  }
}

export async function listHotTopics() {
  const statuses = await listZhihuCapabilities()
  return {
    state: 'pending_integration' as const,
    capabilities: statuses.filter((item) => item.id === 'hot'),
    items: [],
  }
}

export async function searchTrustedContent() {
  const statuses = await listZhihuCapabilities()
  return {
    state: 'pending_integration' as const,
    capabilities: statuses.filter((item) => item.id === 'trusted_search'),
    items: [],
  }
}

export async function getMascotAssets() {
  const statuses = await listZhihuCapabilities()
  return {
    state: 'pending_integration' as const,
    capabilities: statuses.filter((item) => item.id === 'mascot_assets'),
    items: [],
  }
}
