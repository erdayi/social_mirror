import {
  WORLD_CHUNK_SIZE,
  WORLD_DISTRICTS,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
  WORLD_WORK_POINTS,
} from '@/lib/mesociety/world-map'
import type {
  WorldStateView,
  ZhihuCircleSignalView,
  ZhihuHotSignalView,
  ZhihuMascotSignalView,
  ZhihuStatusView,
  ZhihuTrustedSignalView,
} from '@/lib/mesociety/types'

type ZhihuCapabilityLike = {
  id: string
  label: string
  state: ZhihuStatusView['state']
  description: string | null
  worldRole?: string | null
  expectedData?: string | null
  integrationHint?: string | null
}

export function buildZhihuStatusViews(zhihu: ZhihuCapabilityLike[]) {
  return zhihu.map<ZhihuStatusView>((item) => ({
    id: item.id,
    label: item.label,
    state: item.state,
    description: item.description || '待接入官方接口。',
    worldRole: item.worldRole || '待定义',
    expectedData: item.expectedData || '待提供',
    integrationHint: item.integrationHint || '待提供接口文档后完成接线',
  }))
}

export function buildWorldExternalSignalsView(input: {
  primaryHotTopic?: ZhihuHotSignalView | null
  candidateHotTopics?: ZhihuHotSignalView[]
  hotTopics: ZhihuHotSignalView[]
  circles: ZhihuCircleSignalView[]
  trustedResults: ZhihuTrustedSignalView[]
  mascot: ZhihuMascotSignalView[]
  limits?: {
    hotTopics?: number
    circles?: number
    trustedResults?: number
    mascot?: number
  }
}): WorldStateView['externalSignals'] {
  return {
    primaryHotTopic: input.primaryHotTopic || null,
    candidateHotTopics: (input.candidateHotTopics || []).slice(
      0,
      input.limits?.hotTopics || (input.candidateHotTopics || []).length
    ),
    hotTopics: input.hotTopics.slice(0, input.limits?.hotTopics || input.hotTopics.length),
    circles: input.circles.slice(0, input.limits?.circles || input.circles.length),
    trustedResults: input.trustedResults.slice(
      0,
      input.limits?.trustedResults || input.trustedResults.length
    ),
    mascot: input.mascot.slice(0, input.limits?.mascot || input.mascot.length),
  }
}

export function buildWorldMapView(): WorldStateView['map'] {
  return {
    width: WORLD_MAP_WIDTH,
    height: WORLD_MAP_HEIGHT,
    chunkSize: WORLD_CHUNK_SIZE,
    workPoints: WORLD_WORK_POINTS.map((point) => ({
      id: point.id,
      districtId: point.districtId,
      label: point.label,
      kind: point.kind,
      x: point.x,
      y: point.y,
    })),
    districts: WORLD_DISTRICTS,
  }
}
