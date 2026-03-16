import type { DistrictId } from '@/lib/mesociety/world-map'

function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function toPositiveNumber(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  return Math.max(0, value)
}

export type EconomyMeta = {
  category: 'resource_output' | 'resource_exchange' | 'resource_consumption' | 'alliance_investment'
  resource: string
  resourceLabel: string
  units: number
  counterpartResource: string | null
  counterpartLabel: string | null
  districtId: DistrictId | null
  districtLabel: string | null
  workPointId: string | null
  workPointLabel: string | null
}

export type ZhihuMeta = {
  source: 'circles' | 'hot' | 'trusted_search' | 'mascot_assets'
  verifiedCount: number
  circleActions: number
  hotTopicActions: number
}

export function parseEconomyMeta(metadata: unknown): EconomyMeta | null {
  const record = toRecord(metadata)
  const economy = toRecord(record.economy)
  const category =
    economy.category === 'resource_output' ||
    economy.category === 'resource_exchange' ||
    economy.category === 'resource_consumption' ||
    economy.category === 'alliance_investment'
      ? economy.category
      : null

  if (!category) {
    return null
  }

  const resource = typeof economy.resource === 'string' ? economy.resource : null
  const resourceLabel = typeof economy.resourceLabel === 'string' ? economy.resourceLabel : null
  const districtId = typeof record.districtId === 'string' ? (record.districtId as DistrictId) : null
  const districtLabel = typeof record.districtLabel === 'string' ? record.districtLabel : null
  const workPointId = typeof record.workPointId === 'string' ? record.workPointId : null
  const workPointLabel = typeof record.workPointLabel === 'string' ? record.workPointLabel : null

  if (!resource || !resourceLabel) {
    return null
  }

  return {
    category,
    resource,
    resourceLabel,
    units: toPositiveNumber(economy.units),
    counterpartResource:
      typeof economy.counterpartResource === 'string' ? economy.counterpartResource : null,
    counterpartLabel:
      typeof economy.counterpartLabel === 'string' ? economy.counterpartLabel : null,
    districtId,
    districtLabel,
    workPointId,
    workPointLabel,
  }
}

export function parseZhihuMeta(metadata: unknown): ZhihuMeta | null {
  const record = toRecord(metadata)
  const zhihu = toRecord(record.zhihu)
  const source =
    zhihu.source === 'circles' ||
    zhihu.source === 'hot' ||
    zhihu.source === 'trusted_search' ||
    zhihu.source === 'mascot_assets'
      ? zhihu.source
      : null

  if (!source) {
    return null
  }

  return {
    source,
    verifiedCount: toPositiveNumber(zhihu.verifiedCount),
    circleActions: toPositiveNumber(zhihu.circleActions),
    hotTopicActions: toPositiveNumber(zhihu.hotTopicActions),
  }
}
