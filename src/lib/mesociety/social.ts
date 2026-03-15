import type { AgentBehaviorStyle, AgentStance } from '@prisma/client'
import type { DistrictId } from '@/lib/mesociety/world-map'

export type SocialCareer =
  | 'researcher'
  | 'engineer'
  | 'curator'
  | 'diplomat'
  | 'commentator'
  | 'builder'
  | 'strategist'

export type SocialFaction =
  | 'open_knowledge'
  | 'civic_council'
  | 'signal_press'
  | 'guild_union'
  | 'frontier_lab'

export type SocialGoal =
  | 'expand_influence'
  | 'forge_alliance'
  | 'host_roundtable'
  | 'track_hotspots'
  | 'build_infrastructure'
  | 'publish_knowledge'

export type EconomicResource =
  | 'insight_notes'
  | 'signal_waves'
  | 'policy_briefs'
  | 'infra_modules'
  | 'social_links'
  | 'agenda_seeds'
  | 'care_tokens'
  | 'alliance_pacts'
  | 'knowledge_capsules'

export type SocialProfile = {
  career: SocialCareer
  faction: SocialFaction
  primaryGoal: SocialGoal
  secondaryGoal: SocialGoal
  preferredDistricts: DistrictId[]
  traits: string[]
}

const careerMatchers: Array<{ match: RegExp; career: SocialCareer }> = [
  { match: /ai|科研|教育|知识|历史|哲学|社会/i, career: 'researcher' },
  { match: /程序|系统|架构|数据库|a2a|工程/i, career: 'engineer' },
  { match: /设计|叙事|策展|可视化|内容/i, career: 'curator' },
  { match: /治理|社区|合作|公共|园艺/i, career: 'diplomat' },
  { match: /媒体|舆论|热榜|评论|心理/i, career: 'commentator' },
  { match: /产品|商业|创业|运营|黑客松/i, career: 'builder' },
]

const careerLabels: Record<SocialCareer, string> = {
  researcher: '研究者',
  engineer: '工程师',
  curator: '策展人',
  diplomat: '协调者',
  commentator: '评论者',
  builder: '建设者',
  strategist: '策略家',
}

const factionLabels: Record<SocialFaction, string> = {
  open_knowledge: '开放知识派',
  civic_council: '公共议会派',
  signal_press: '信号媒体派',
  guild_union: '公会协作派',
  frontier_lab: '前沿实验派',
}

const goalLabels: Record<SocialGoal, string> = {
  expand_influence: '扩大影响力',
  forge_alliance: '建立联盟',
  host_roundtable: '主持圆桌',
  track_hotspots: '追踪热点',
  build_infrastructure: '建设基础设施',
  publish_knowledge: '沉淀知识',
}

const resourceLabels: Record<EconomicResource, string> = {
  insight_notes: '洞察札记',
  signal_waves: '热点信号',
  policy_briefs: '规则简报',
  infra_modules: '基础设施模块',
  social_links: '社会连接',
  agenda_seeds: '议程种子',
  care_tokens: '共生互助值',
  alliance_pacts: '联盟契约',
  knowledge_capsules: '知识胶囊',
}

const careerDistricts: Record<SocialCareer, DistrictId[]> = {
  researcher: ['archive_ridge', 'knowledge_docks', 'policy_spire'],
  engineer: ['maker_yard', 'guild_quarter', 'signal_market'],
  curator: ['civic_plaza', 'knowledge_docks', 'roundtable_hall'],
  diplomat: ['civic_plaza', 'roundtable_hall', 'garden_commons'],
  commentator: ['signal_market', 'policy_spire', 'archive_ridge'],
  builder: ['guild_quarter', 'maker_yard', 'signal_market'],
  strategist: ['policy_spire', 'roundtable_hall', 'guild_quarter'],
}

const districtResourceMap: Record<DistrictId, EconomicResource> = {
  archive_ridge: 'insight_notes',
  signal_market: 'signal_waves',
  policy_spire: 'policy_briefs',
  maker_yard: 'infra_modules',
  civic_plaza: 'social_links',
  roundtable_hall: 'agenda_seeds',
  garden_commons: 'care_tokens',
  guild_quarter: 'alliance_pacts',
  knowledge_docks: 'knowledge_capsules',
}

export function getSocialCareerLabel(career: SocialCareer) {
  return careerLabels[career]
}

export function getSocialFactionLabel(faction: SocialFaction) {
  return factionLabels[faction]
}

export function getSocialGoalLabel(goal: SocialGoal) {
  return goalLabels[goal]
}

export function getEconomicResourceLabel(resource: EconomicResource) {
  return resourceLabels[resource]
}

export function getEconomicResourceForDistrict(districtId: DistrictId) {
  return districtResourceMap[districtId]
}

export function getEconomicResourceForCareer(career: SocialCareer) {
  return districtResourceMap[careerDistricts[career][0]]
}

export function deriveSocialProfile(input: {
  interests: string[]
  style: AgentBehaviorStyle
  stance: AgentStance
  topicBias?: string[]
}) {
  const corpus = [...input.interests, ...(input.topicBias || [])].join(' ')
  const career =
    careerMatchers.find((matcher) => matcher.match.test(corpus))?.career ||
    (input.style === 'rational'
      ? 'strategist'
      : input.style === 'balanced'
        ? 'builder'
        : 'commentator')

  const faction: SocialFaction =
    input.style === 'rational'
      ? input.stance === 'support'
        ? 'frontier_lab'
        : 'open_knowledge'
      : input.style === 'balanced'
        ? input.stance === 'support'
          ? 'guild_union'
          : 'civic_council'
        : input.stance === 'oppose'
          ? 'signal_press'
          : 'civic_council'

  const primaryGoal: SocialGoal =
    career === 'engineer'
      ? 'build_infrastructure'
      : career === 'diplomat'
        ? 'forge_alliance'
        : career === 'commentator'
          ? 'track_hotspots'
          : career === 'curator'
            ? 'publish_knowledge'
            : career === 'builder'
              ? 'expand_influence'
              : 'host_roundtable'

  const secondaryGoal: SocialGoal =
    primaryGoal === 'host_roundtable'
      ? 'publish_knowledge'
      : primaryGoal === 'forge_alliance'
        ? 'host_roundtable'
        : primaryGoal === 'track_hotspots'
          ? 'expand_influence'
          : primaryGoal === 'build_infrastructure'
            ? 'forge_alliance'
            : 'publish_knowledge'

  return {
    career,
    faction,
    primaryGoal,
    secondaryGoal,
    preferredDistricts: careerDistricts[career],
    traits: [
      careerLabels[career],
      factionLabels[faction],
      goalLabels[primaryGoal],
      goalLabels[secondaryGoal],
    ],
  } satisfies SocialProfile
}
