import { WorldAgentSprite } from '@/components/mesociety/world-agent-sprite'
import {
  getSocialCareerLabel,
  getSocialFactionLabel,
  getSocialGoalLabel,
} from '@/lib/mesociety/social'
import type { AgentSocietyStats, WorldAgentView } from '@/lib/mesociety/types'

type NumericStatKey = Exclude<keyof AgentSocietyStats, 'momentumLabel'>

type Props = {
  title: string
  subtitle: string
  agent: Pick<
    WorldAgentView,
    | 'name'
    | 'source'
    | 'status'
    | 'pixelRole'
    | 'pixelPalette'
    | 'districtLabel'
    | 'workPointLabel'
    | 'career'
    | 'faction'
    | 'primaryGoal'
    | 'secondaryGoal'
  >
  stats?: AgentSocietyStats | null
}

const statLabels: Array<{
  key: NumericStatKey
  label: string
}> = [
  { key: 'productionScore', label: '职业产出' },
  { key: 'resourceScore', label: '资源产出' },
  { key: 'allianceScore', label: '联盟收益' },
  { key: 'tradeScore', label: '交易协作' },
  { key: 'knowledgeScore', label: '知识沉淀' },
  { key: 'socialCapital', label: '社会资本' },
]

export function FarmerIdentityCard({ title, subtitle, agent, stats }: Props) {
  return (
    <div className="farmer-identity-card">
      <div className="farmer-identity-stage">
        <div className="farmer-identity-glow" />
        <WorldAgentSprite
          name={agent.name}
          pixelRole={agent.pixelRole}
          pixelPalette={agent.pixelPalette}
          source={agent.source}
          status={agent.status}
          size="lg"
          showPlate={false}
          emphasis
        />
      </div>

      <div className="farmer-identity-copy">
        <p className="pixel-label text-[#72e7ff]">{title}</p>
        <h3 className="mt-3 text-xl font-black text-[#ffe9ae]">{agent.name}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.78)]">
          {subtitle}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pixel-inline-badge">{getSocialCareerLabel(agent.career)}</span>
          <span className="pixel-inline-badge">{getSocialFactionLabel(agent.faction)}</span>
          <span className="pixel-inline-badge">{agent.districtLabel}</span>
          {agent.workPointLabel ? <span className="pixel-inline-badge">{agent.workPointLabel}</span> : null}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="pixel-chat-line">
            <p className="text-xs font-black text-[#72e7ff]">主目标</p>
            <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
              {getSocialGoalLabel(agent.primaryGoal)}
            </p>
          </div>
          <div className="pixel-chat-line">
            <p className="text-xs font-black text-[#72e7ff]">副目标</p>
            <p className="mt-2 text-sm font-semibold text-[rgba(249,233,199,0.82)]">
              {getSocialGoalLabel(agent.secondaryGoal)}
            </p>
          </div>
        </div>

        {stats ? (
          <div className="farmer-identity-stats">
            {statLabels.map((item) => (
              <div key={item.key} className="metric-card compact">
                <span className="metric-value">{stats[item.key].toFixed(1)}</span>
                <span className="metric-label">{item.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {stats ? (
          <div className="farmer-momentum-pill">
            当前社会动能：{stats.momentumLabel}
          </div>
        ) : null}
      </div>
    </div>
  )
}
