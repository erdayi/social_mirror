import type {
  WorldEventView,
  ZhihuCircleSignalView,
  ZhihuHotSignalView,
  ZhihuMascotSignalView,
  ZhihuTrustedSignalView,
} from '@/lib/mesociety/types'

export type WorldSignalSet = {
  hotTopics: ZhihuHotSignalView[]
  circles: ZhihuCircleSignalView[]
  trustedResults: ZhihuTrustedSignalView[]
  mascot: ZhihuMascotSignalView[]
}

export function selectWorldHotTopic(input: {
  tickNumber: number
  recentEvents: Array<Pick<WorldEventView, 'topic'>>
  hotTopics: ZhihuHotSignalView[]
  fallbackTopics: readonly string[]
}) {
  if (input.hotTopics[0]?.title) {
    return {
      topic: input.hotTopics[0].title,
      source: 'zhihu_hot' as const,
    }
  }

  const recentTopic = input.recentEvents.find((event) => Boolean(event.topic))?.topic
  if (recentTopic) {
    return {
      topic: recentTopic,
      source: 'relationship' as const,
    }
  }

  return {
    topic: input.fallbackTopics[input.tickNumber % input.fallbackTopics.length] || 'Agent 社会关系',
    source: 'system' as const,
  }
}

export function buildZhihuSignalMeta(input: {
  hotTopics?: ZhihuHotSignalView[]
  circles?: ZhihuCircleSignalView[]
  trustedResults?: ZhihuTrustedSignalView[]
  mascot?: ZhihuMascotSignalView[]
}) {
  const hotTopic = input.hotTopics?.[0] || null
  const circle = input.circles?.[0] || null
  const trusted = input.trustedResults?.[0] || null
  const mascot = input.mascot?.[0] || null

  return {
    zhihu: {
      source: hotTopic
        ? 'hot'
        : circle
          ? 'circles'
          : trusted
            ? 'trusted_search'
            : mascot
              ? 'mascot_assets'
              : 'hot',
      verifiedCount: trusted ? trusted.confidence : 0,
      circleActions: circle ? 1 : 0,
      hotTopicActions: hotTopic ? 1 : 0,
      hotTopicTitle: hotTopic?.title || null,
      circleName: circle?.title || null,
      trustedQuery: trusted?.query || null,
      mascotName: mascot?.name || null,
    },
  }
}

export function buildWorldGuideCards(signals: WorldSignalSet) {
  return [
    {
      id: 'hot',
      title: '热榜驱动',
      summary: signals.hotTopics[0]
        ? `当前外部事件源是「${signals.hotTopics[0].title}」，Agent 会围绕它形成讨论与榜单波动。`
        : '暂无真实热榜输入，世界暂时使用内部热点种子推进。',
    },
    {
      id: 'circle',
      title: '圈子语境',
      summary: signals.circles[0]
        ? `当前圈层语境来自「${signals.circles[0].title}」，它提供真实社区结构与内容氛围。`
        : '暂无圈子语境输入，Agent 仍按内部社会结构巡游。',
    },
    {
      id: 'trusted',
      title: '可信证据',
      summary: signals.trustedResults[0]
        ? `当前证据主题是「${signals.trustedResults[0].query}」，会影响 trust 与 cooperate 决策。`
        : '暂无可信搜证据输入，观点判断暂时依赖人格与关系历史。',
    },
    {
      id: 'mascot',
      title: '刘看山向导',
      summary: signals.mascot[0]
        ? `刘看山资源包已注册，当前向导角色为 ${signals.mascot[0].name}。`
        : '刘看山资源位已接入，可作为向导与播报角色使用。',
    },
  ]
}
