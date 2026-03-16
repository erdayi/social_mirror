import Link from 'next/link'
import { RoundtableScene } from '@/components/mesociety/roundtable-scene'
import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import type {
  RoundtableSummary,
  WorldAgentView,
  WorldEventView,
  WorldStateView,
} from '@/lib/mesociety/types'

type Props = {
  world: WorldStateView
  roundtables: RoundtableSummary[]
  focusEvents?: WorldEventView[]
  highlightedEventIds?: string[]
}

const stageMeta: Record<string, { label: string; classes: string }> = {
  match: { label: '匹配中', classes: 'bg-[rgba(31,44,78,0.84)] text-[#72e7ff] border-[rgba(124,218,255,0.24)]' },
  invite: { label: '邀请中', classes: 'bg-[rgba(220,233,255,0.92)] text-[#435c86] border-[rgba(92,112,176,0.2)]' },
  opening: { label: '开场', classes: 'bg-[rgba(255,232,193,0.94)] text-[#8b5728] border-[rgba(156,109,52,0.2)]' },
  responses: { label: '回应中', classes: 'bg-[rgba(245,224,255,0.92)] text-[#6b4e95] border-[rgba(125,100,174,0.2)]' },
  summary: { label: '生成总结', classes: 'bg-[rgba(232,227,255,0.92)] text-[#5c54a4] border-[rgba(98,91,170,0.2)]' },
  relationship_update: {
    label: '关系更新',
    classes: 'bg-[rgba(255,225,229,0.92)] text-[#995267] border-[rgba(167,98,122,0.2)]',
  },
  completed: {
    label: '已完成',
    classes: 'bg-[rgba(41,30,60,0.94)] text-[rgba(249,233,199,0.72)] border-[rgba(126,113,186,0.24)]',
  },
}

const stanceLabelMap: Record<WorldAgentView['stance'], string> = {
  support: '支持型',
  neutral: '观察型',
  oppose: '质疑型',
}

const styleLabelMap: Record<WorldAgentView['style'], string> = {
  rational: '理性表达',
  emotional: '情绪表达',
  balanced: '平衡表达',
}

const goalLabelMap: Record<WorldAgentView['primaryGoal'], string> = {
  host_roundtable: '组织讨论',
  forge_alliance: '建立联盟',
  publish_knowledge: '沉淀知识',
  build_infrastructure: '建设秩序',
  track_hotspots: '追踪热点',
  expand_influence: '扩大影响',
}

const eventLabelMap: Record<string, string> = {
  join_roundtable: '加入圆桌',
  roundtable_summary: '圆桌总结',
  discuss_topic: '讨论议题',
  follow: '新增关注',
  trust: '新增信任',
  cooperate: '新增合作',
  alliance: '形成联盟',
  reject: '形成对立',
}

function StageBadge({ stage }: { stage: string }) {
  const meta = stageMeta[stage] ?? stageMeta.match
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${meta.classes}`}>
      {meta.label}
    </span>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(126,113,186,0.18)] bg-[rgba(31,23,46,0.82)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(249,233,199,0.52)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-black text-[#ffe08f]">{value}</p>
    </div>
  )
}

function EventChip({ type }: { type: string }) {
  const label = eventLabelMap[type] || type
  const negative = type === 'reject'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${
        negative
          ? 'border-[rgba(167,98,122,0.24)] bg-[rgba(84,37,57,0.92)] text-[#ffb8cb]'
          : 'border-[rgba(124,218,255,0.24)] bg-[rgba(31,44,78,0.84)] text-[#72e7ff]'
      }`}
    >
      {label}
    </span>
  )
}

function formatEventTime(value: WorldEventView['createdAt']) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function getFeaturedAgents(world: WorldStateView) {
  const activeIds = new Set(world.activeRoundtable?.participants.map((participant) => participant.id) || [])
  const activeAgents = world.agents
    .filter((agent) => activeIds.has(agent.id))
    .sort((left, right) => right.influence - left.influence)

  if (activeAgents.length >= 4) {
    return activeAgents.slice(0, 4)
  }

  const fallbackAgents = world.agents
    .filter((agent) => !activeIds.has(agent.id))
    .sort((left, right) => right.influence - left.influence)

  return [...activeAgents, ...fallbackAgents].slice(0, 4)
}

function getFocusEvents(world: WorldStateView) {
  return world.recentEvents
    .filter((event) =>
      ['join_roundtable', 'roundtable_summary', 'discuss_topic', 'follow', 'trust', 'cooperate', 'alliance', 'reject'].includes(
        event.type
      )
    )
    .slice(0, 6)
}

export function RoundtablesHub({
  world,
  roundtables,
  focusEvents: focusEventsOverride,
  highlightedEventIds = [],
}: Props) {
  const active = world.activeRoundtable
  const primaryHotTopic = world.externalSignals.primaryHotTopic
  const candidateHotTopics = world.externalSignals.candidateHotTopics
  const featuredAgents = getFeaturedAgents(world)
  const focusEvents = focusEventsOverride ?? getFocusEvents(world)
  const historyRoundtables = roundtables.filter((roundtable) => roundtable.id !== active?.id)
  const latestTurns = active?.turns.slice(-2).reverse() || []
  const relationshipEventCount = world.recentEvents.filter((event) =>
    ['follow', 'trust', 'cooperate', 'alliance', 'reject'].includes(event.type)
  ).length

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="world-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="pixel-label text-[#72e7ff]">当前焦点</p>
              <h2 className="pixel-title mt-2 text-2xl text-[#ffe9ae]">
                {active ? active.topic : '等待新圆桌生成'}
              </h2>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">
                {active
                  ? `这场讨论由 ${active.hostName} 发起，参与者、最新发言与关系变化都会围绕它持续展开。`
                  : '当前没有活跃圆桌，关键角色、社会动态和最近的历史讨论仍会继续更新。'}
              </p>
            </div>
            {active ? <StageBadge stage={active.status} /> : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <SummaryMetric label="活跃圆桌" value={active ? '1 场' : '0 场'} />
            <SummaryMetric label="参与角色" value={active ? `${active.participants.length} 位` : `${featuredAgents.length} 位`} />
            <SummaryMetric label="关系变化" value={`${relationshipEventCount} 条`} />
            <SummaryMetric label="历史讨论" value={`${historyRoundtables.length || roundtables.length} 场`} />
          </div>

          {(primaryHotTopic || candidateHotTopics.length) ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[20px] border border-[rgba(124,218,255,0.18)] bg-[rgba(27,36,58,0.78)] px-4 py-4">
                <p className="text-xs font-black text-[#72e7ff]">当前主议题</p>
                <p className="mt-3 text-base font-black text-[#ffe9ae]">
                  {primaryHotTopic?.title || active?.topic || '等待外部热点进入讨论'}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.76)]">
                  {primaryHotTopic?.excerpt ||
                    '当前活跃圆桌会优先围绕主议题展开，次级话题会继续留在候选池等待后续讨论接力。'}
                </p>
              </div>

              <div className="rounded-[20px] border border-[rgba(126,113,186,0.18)] bg-[rgba(31,23,46,0.82)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-[#72e7ff]">热议候选</p>
                  <span className="pixel-inline-badge">{candidateHotTopics.length} 条</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {candidateHotTopics.length ? (
                    candidateHotTopics.map((topic) => (
                      <span key={topic.id} className="pixel-inline-badge">
                        {topic.title}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-semibold text-[rgba(249,233,199,0.68)]">
                      暂时没有新的备选议题。
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {active ? (
            <div className="mt-5 rounded-[24px] border border-[rgba(126,113,186,0.22)] bg-[rgba(31,23,46,0.9)] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#72e7ff]">活跃圆桌</p>
                  <p className="mt-2 text-base font-black text-[#ffe9ae]">
                    主持人 {active.hostName} · {active.participants.length} 位参与者
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/roundtables/${active.id}`} className="pixel-button">
                    查看详情
                  </Link>
                  <Link href={`/agents/${active.hostId}`} className="pixel-button subtle">
                    主持人画像
                  </Link>
                </div>
              </div>

              <div className="mt-4">
                <RoundtableScene roundtable={active} />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-[20px] border border-[rgba(124,218,255,0.18)] bg-[rgba(27,36,58,0.78)] px-4 py-4">
                  <p className="text-xs font-black text-[#72e7ff]">参与者</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {active.participants.slice(0, 8).map((participant) => (
                      <Link key={participant.id} href={`/agents/${participant.id}`} className="pixel-inline-badge">
                        {participant.name}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {latestTurns.length ? (
                    latestTurns.map((turn) => (
                      <div key={turn.id} className="pixel-chat-line">
                        <div className="flex flex-wrap items-center gap-2">
                          <StageBadge stage={turn.stage} />
                          <span className="pixel-inline-badge">{turn.speakerName || '系统'}</span>
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.84)]">
                          {turn.content}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="pixel-chat-line">
                      <p className="text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                        这场圆桌刚开始，还没有足够的发言记录。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="world-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="pixel-label text-[#72e7ff]">关键角色</p>
              <h3 className="pixel-title mt-2 text-lg text-[#ffe9ae]">当前关系网中的关键角色</h3>
            </div>
            <span className="pixel-inline-badge">{featuredAgents.length} 位</span>
          </div>

          <div className="mt-4 space-y-3">
            {featuredAgents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="zone-card flex items-center gap-4 transition hover:-translate-y-0.5"
              >
                <WorldAgentSprite
                  name={agent.name}
                  pixelRole={agent.pixelRole}
                  pixelPalette={agent.pixelPalette}
                  source={agent.source}
                  status={agent.status}
                  showPlate={false}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-black text-[#ffe9ae]">{agent.name}</p>
                    <span className="pixel-inline-badge">影响力 {agent.influence.toFixed(0)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="pixel-inline-badge">{stanceLabelMap[agent.stance]}</span>
                    <span className="pixel-inline-badge">{styleLabelMap[agent.style]}</span>
                    <span className="pixel-inline-badge">{goalLabelMap[agent.primaryGoal]}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="world-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="pixel-label text-[#72e7ff]">最新动态</p>
              <h3 className="pixel-title mt-2 text-lg text-[#ffe9ae]">最近发生了什么</h3>
            </div>
            <span className="pixel-inline-badge">{focusEvents.length} 条</span>
          </div>

          <div className="mt-4 space-y-3">
            {focusEvents.map((event) => (
              <div
                key={event.id}
                className={`pixel-chat-line live-feed-item transition-all duration-700 ${
                  highlightedEventIds.includes(event.id)
                    ? 'is-new border-[rgba(124,218,255,0.42)] bg-[rgba(32,52,86,0.9)] shadow-[0_0_0_1px_rgba(124,218,255,0.16),0_0_24px_rgba(114,231,255,0.18)]'
                    : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <EventChip type={event.type} />
                  {event.topic ? <span className="pixel-inline-badge">{event.topic}</span> : null}
                  {highlightedEventIds.includes(event.id) ? (
                    <span className="rounded-full border border-[rgba(124,218,255,0.3)] bg-[rgba(31,44,78,0.84)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#72e7ff]">
                      刚更新
                    </span>
                  ) : null}
                  <span className="text-xs font-semibold text-[rgba(249,233,199,0.58)]">
                    {formatEventTime(event.createdAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.84)]">
                  {event.summary || '该事件尚无摘要。'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                  {event.actorId && event.actorName ? (
                    <Link href={`/agents/${event.actorId}`} className="pixel-link">
                      {event.actorName}
                    </Link>
                  ) : null}
                  {event.targetId && event.targetName ? (
                    <>
                      <span>→</span>
                      <Link href={`/agents/${event.targetId}`} className="pixel-link">
                        {event.targetName}
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <section className="world-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[rgba(126,113,186,0.18)] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="pixel-label text-[#72e7ff]">历史讨论</p>
              <h3 className="pixel-title mt-2 text-lg text-[#ffe9ae]">最近结束或仍可回看的圆桌</h3>
            </div>
            <div className="text-xs font-semibold text-[rgba(249,233,199,0.72)]">
              当前展示 {historyRoundtables.length || roundtables.length} 场
            </div>
          </div>

          {historyRoundtables.length ? (
            <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
              {historyRoundtables.map((roundtable) => (
                <Link
                  key={roundtable.id}
                  href={`/roundtables/${roundtable.id}`}
                  className="rounded-[24px] border border-[rgba(126,113,186,0.2)] bg-[rgba(31,23,46,0.78)] px-4 py-4 transition hover:-translate-y-0.5 hover:border-[rgba(124,218,255,0.22)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <WorldAgentSprite
                        name={roundtable.hostName}
                        pixelRole={roundtable.hostPixelRole}
                        pixelPalette={roundtable.hostPixelPalette}
                        source={roundtable.participants.find((participant) => participant.id === roundtable.hostId)?.source || 'seed'}
                        showPlate={false}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#ffe9ae]">{roundtable.topic}</p>
                        <p className="mt-1 text-xs font-semibold text-[rgba(249,233,199,0.68)]">
                          主持人 {roundtable.hostName} · {roundtable.participants.length} 位参与者
                        </p>
                      </div>
                    </div>
                    <StageBadge stage={roundtable.status} />
                  </div>

                  <p className="mt-4 line-clamp-3 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.82)]">
                    {roundtable.summary || '这场圆桌还没有留下完整总结，但已经可以进入详情页查看过程与参与者。'}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {roundtable.participants.slice(0, 4).map((participant) => (
                      <span key={participant.id} className="pixel-inline-badge">
                        {participant.name}
                      </span>
                    ))}
                    {roundtable.participants.length > 4 ? (
                      <span className="pixel-inline-badge">+{roundtable.participants.length - 4}</span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-5 py-6">
              <p className="pixel-empty">目前还没有可回看的历史圆桌，等下一轮讨论生成后这里会出现。</p>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
