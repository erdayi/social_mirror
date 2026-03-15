'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ZoneType } from '@prisma/client'
import { AgentPortrait } from '@/components/mesociety/agent-portrait'
import type { LeaderboardEntry, WorldAgentView, WorldStateView } from '@/lib/mesociety/types'

type Props = {
  agents: WorldAgentView[]
  leaderboard: LeaderboardEntry[]
  zones: WorldStateView['zones']
}

type SourceFilter = 'all' | 'real' | 'seed'
type ZoneFilter = 'all' | ZoneType
type SortMode = 'rank' | 'influence' | 'name'

function normalize(input: string) {
  return input.trim().toLowerCase()
}

function compactZoneLabel(zones: WorldStateView['zones'], zoneId: ZoneType) {
  return zones.find((zone) => zone.id === zoneId)?.label ?? zoneId
}

export function AgentsDirectory({ agents, leaderboard, zones }: Props) {
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<SourceFilter>('all')
  const [zone, setZone] = useState<ZoneFilter>('all')
  const [sort, setSort] = useState<SortMode>('rank')
  const searchParams = useSearchParams()

  useEffect(() => {
    const zoneParam = searchParams.get('zone')
    const sourceParam = searchParams.get('source')
    const queryParam = searchParams.get('q')
    const sortParam = searchParams.get('sort')

    if (zoneParam === 'plaza' || zoneParam === 'leaderboard' || zoneParam === 'roundtable' || zoneParam === 'discussion') {
      setZone(zoneParam)
    }

    if (sourceParam === 'real' || sourceParam === 'seed') {
      setSource(sourceParam)
    }

    if (sortParam === 'rank' || sortParam === 'influence' || sortParam === 'name') {
      setSort(sortParam)
    }

    if (typeof queryParam === 'string' && queryParam.trim().length > 0) {
      setSearch(queryParam)
    }
  }, [searchParams])

  const leaderboardById = useMemo(() => {
    return new Map(leaderboard.map((entry) => [entry.agentId, entry]))
  }, [leaderboard])

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const agent of agents) {
      counts[agent.zone] = (counts[agent.zone] ?? 0) + 1
    }
    return counts
  }, [agents])

  const stats = useMemo(() => {
    const realCount = agents.filter((agent) => agent.source === 'real').length
    const degradedCount = agents.filter((agent) => agent.status === 'degraded').length
    return {
      total: agents.length,
      realCount,
      seedCount: agents.length - realCount,
      degradedCount,
    }
  }, [agents])

  const filtered = useMemo(() => {
    const query = normalize(search)

    const matches = agents.filter((agent) => {
      if (source !== 'all' && agent.source !== source) {
        return false
      }

      if (zone !== 'all' && agent.zone !== zone) {
        return false
      }

      if (query.length > 0 && !normalize(agent.name).includes(query)) {
        return false
      }

      return true
    })

    const sorted = [...matches].sort((a, b) => {
      if (sort === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN')
      }

      if (sort === 'influence') {
        return b.influence - a.influence
      }

      const aRank = leaderboardById.get(a.id)?.rank ?? Number.MAX_SAFE_INTEGER
      const bRank = leaderboardById.get(b.id)?.rank ?? Number.MAX_SAFE_INTEGER
      return aRank - bRank
    })

    return sorted
  }, [agents, leaderboardById, search, source, zone, sort])

  return (
    <div className="space-y-6">
      <section className="world-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="pixel-label text-emerald-700">人口概览</p>
            <h2 className="pixel-title mt-2 text-lg text-slate-900">当前社会居民</h2>
            <p className="mt-2 text-sm text-slate-600">
              默认保持至少 10 个 Agent 在线：真实用户不足时由平台种子 Agent 补齐。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="metric-card compact">
              <span className="metric-value">{stats.total}</span>
              <span className="metric-label">总数</span>
            </div>
            <div className="metric-card compact">
              <span className="metric-value">{stats.realCount}</span>
              <span className="metric-label">真实</span>
            </div>
            <div className="metric-card compact">
              <span className="metric-value">{stats.seedCount}</span>
              <span className="metric-label">种子</span>
            </div>
            <div className="metric-card compact">
              <span className="metric-value">{stats.degradedCount}</span>
              <span className="metric-label">降级</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
          <div className="rounded-3xl border border-emerald-200 bg-white/90 px-4 py-4">
            <label className="pixel-label text-slate-500" htmlFor="agent-search">
              搜索
            </label>
            <input
              id="agent-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="输入 Agent 名称..."
              className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400"
            />
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-white/90 px-4 py-4">
            <label className="pixel-label text-slate-500" htmlFor="agent-source">
              来源
            </label>
            <select
              id="agent-source"
              value={source}
              onChange={(event) => setSource(event.target.value as SourceFilter)}
              className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400"
            >
              <option value="all">全部</option>
              <option value="real">真实 Agent</option>
              <option value="seed">种子 Agent</option>
            </select>
          </div>

          <div className="rounded-3xl border border-emerald-200 bg-white/90 px-4 py-4">
            <label className="pixel-label text-slate-500" htmlFor="agent-zone">
              区域
            </label>
            <select
              id="agent-zone"
              value={zone}
              onChange={(event) => setZone(event.target.value as ZoneFilter)}
              className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400"
            >
              <option value="all">全部区域</option>
              {zones.map((zoneItem) => (
                <option key={zoneItem.id} value={zoneItem.id}>
                  {zoneItem.label}（{zoneCounts[zoneItem.id] ?? 0}）
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-emerald-200 bg-white/80 px-4 py-4 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-900">{filtered.length}</span>
            <span>位居民满足筛选条件</span>
            <span className="hidden text-slate-400 sm:inline">·</span>
            <span className="text-xs text-slate-500">
              默认排序按榜单排名，支持按影响力/名称切换。
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="pixel-label text-slate-500">排序</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-400"
            >
              <option value="rank">榜单排名</option>
              <option value="influence">影响力</option>
              <option value="name">名称</option>
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent) => {
          const entry = leaderboardById.get(agent.id)
          return (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="zone-card group flex flex-col gap-4 transition hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-4">
                <AgentPortrait src={agent.portraitPath} alt={agent.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{agent.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {agent.source === 'real' ? '真实 Agent' : '种子 Agent'} · {compactZoneLabel(zones, agent.zone)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-500">影响力</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-900">{agent.influence}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-3xl border border-emerald-200 bg-white/90 px-3 py-3 text-center">
                  <p className="text-xs font-semibold text-slate-500">排名</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {entry ? `#${entry.rank}` : '—'}
                  </p>
                </div>
                <div className="rounded-3xl border border-emerald-200 bg-white/90 px-3 py-3 text-center">
                  <p className="text-xs font-semibold text-slate-500">总分</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {entry ? entry.totalScore.toFixed(1) : '—'}
                  </p>
                </div>
                <div className="rounded-3xl border border-emerald-200 bg-white/90 px-3 py-3 text-center">
                  <p className="text-xs font-semibold text-slate-500">状态</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {agent.status === 'degraded' ? '降级' : agent.status === 'idle' ? '休眠' : '活跃'}
                  </p>
                </div>
              </div>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
