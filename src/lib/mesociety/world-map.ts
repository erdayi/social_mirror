import type { ZoneType } from '@prisma/client'

export type DistrictId =
  | 'archive_ridge'
  | 'signal_market'
  | 'policy_spire'
  | 'maker_yard'
  | 'civic_plaza'
  | 'roundtable_hall'
  | 'garden_commons'
  | 'guild_quarter'
  | 'knowledge_docks'

export type WorldDistrict = {
  id: DistrictId
  label: string
  description: string
  x: number
  y: number
  width: number
  height: number
  zoneFocus: ZoneType
  theme: string
}

export type WorldPoint = {
  x: number
  y: number
}

export type WorldRoadSegment = {
  id: string
  orientation: 'horizontal' | 'vertical'
  x: number
  y: number
  width: number
  height: number
}

export type WorldWorkPoint = {
  id: string
  districtId: DistrictId
  label: string
  kind:
    | 'study'
    | 'broadcast'
    | 'govern'
    | 'build'
    | 'socialize'
    | 'moderate'
    | 'garden'
    | 'alliance'
    | 'publish'
  x: number
  y: number
  careerBias?: string[]
  goalBias?: string[]
}

export const WORLD_MAP_WIDTH = 300
export const WORLD_MAP_HEIGHT = 300
export const WORLD_CHUNK_SIZE = 100
const DISTRICT_SIZE = 100
const ROAD_WIDTH = 16

export const WORLD_DISTRICTS: WorldDistrict[] = [
  {
    id: 'archive_ridge',
    label: '北境档案坡',
    description: '研究者、评论者和知识型 Agent 在这里整理议题与事实。',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    zoneFocus: 'discussion',
    theme: 'archive',
  },
  {
    id: 'signal_market',
    label: '信号集市',
    description: '热点、声望和影响力在这里被围观与放大。',
    x: 100,
    y: 0,
    width: 100,
    height: 100,
    zoneFocus: 'leaderboard',
    theme: 'signal',
  },
  {
    id: 'policy_spire',
    label: '议政塔',
    description: '时政、伦理与公共规则相关的话题经常在这里升温。',
    x: 200,
    y: 0,
    width: 100,
    height: 100,
    zoneFocus: 'discussion',
    theme: 'policy',
  },
  {
    id: 'maker_yard',
    label: '工坊庭院',
    description: '工程、产品和基础设施导向的 Agent 在这里协作。',
    x: 0,
    y: 100,
    width: 100,
    height: 100,
    zoneFocus: 'plaza',
    theme: 'maker',
  },
  {
    id: 'civic_plaza',
    label: '中央社会广场',
    description: '开放世界的核心相遇点，适合结识、偶遇、交换看法。',
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    zoneFocus: 'plaza',
    theme: 'civic',
  },
  {
    id: 'roundtable_hall',
    label: '圆桌议会厅',
    description: '主持人、联盟方和重要议题会在这里组织正式讨论。',
    x: 200,
    y: 100,
    width: 100,
    height: 100,
    zoneFocus: 'roundtable',
    theme: 'roundtable',
  },
  {
    id: 'garden_commons',
    label: '共生花园',
    description: '重视社区关系与持续协作的 Agent 会在这里沉淀弱连接。',
    x: 0,
    y: 200,
    width: 100,
    height: 100,
    zoneFocus: 'plaza',
    theme: 'garden',
  },
  {
    id: 'guild_quarter',
    label: '公会街区',
    description: '职业角色、阵营联盟与事业目标在这里逐渐形成。',
    x: 100,
    y: 200,
    width: 100,
    height: 100,
    zoneFocus: 'discussion',
    theme: 'guild',
  },
  {
    id: 'knowledge_docks',
    label: '知识港',
    description: '讨论结论、图谱节点与知识条目会从这里出海。',
    x: 200,
    y: 200,
    width: 100,
    height: 100,
    zoneFocus: 'leaderboard',
    theme: 'knowledge',
  },
]

export const WORLD_ROAD_SEGMENTS: WorldRoadSegment[] = [50, 150, 250].flatMap((coordinate) => [
  {
    id: `road-h-${coordinate}`,
    orientation: 'horizontal' as const,
    x: 0,
    y: coordinate - ROAD_WIDTH / 2,
    width: WORLD_MAP_WIDTH,
    height: ROAD_WIDTH,
  },
  {
    id: `road-v-${coordinate}`,
    orientation: 'vertical' as const,
    x: coordinate - ROAD_WIDTH / 2,
    y: 0,
    width: ROAD_WIDTH,
    height: WORLD_MAP_HEIGHT,
  },
])

export const WORLD_WORK_POINTS: WorldWorkPoint[] = [
  {
    id: 'archive-study-desk',
    districtId: 'archive_ridge',
    label: '档案研究台',
    kind: 'study',
    x: 28,
    y: 30,
    careerBias: ['researcher', 'commentator', 'strategist'],
    goalBias: ['publish_knowledge'],
  },
  {
    id: 'signal-heat-board',
    districtId: 'signal_market',
    label: '热度信号板',
    kind: 'broadcast',
    x: 150,
    y: 34,
    careerBias: ['commentator', 'builder'],
    goalBias: ['track_hotspots', 'expand_influence'],
  },
  {
    id: 'policy-podium',
    districtId: 'policy_spire',
    label: '议政演讲台',
    kind: 'govern',
    x: 252,
    y: 28,
    careerBias: ['strategist', 'diplomat', 'researcher'],
    goalBias: ['host_roundtable', 'publish_knowledge'],
  },
  {
    id: 'maker-forge',
    districtId: 'maker_yard',
    label: '工坊锻造台',
    kind: 'build',
    x: 34,
    y: 152,
    careerBias: ['engineer', 'builder'],
    goalBias: ['build_infrastructure'],
  },
  {
    id: 'civic-notice-board',
    districtId: 'civic_plaza',
    label: '社会公告板',
    kind: 'socialize',
    x: 152,
    y: 146,
    careerBias: ['diplomat', 'curator', 'commentator'],
    goalBias: ['forge_alliance', 'expand_influence'],
  },
  {
    id: 'roundtable-host-dais',
    districtId: 'roundtable_hall',
    label: '主持人席',
    kind: 'moderate',
    x: 250,
    y: 146,
    careerBias: ['diplomat', 'strategist', 'curator'],
    goalBias: ['host_roundtable', 'forge_alliance'],
  },
  {
    id: 'garden-rest-patch',
    districtId: 'garden_commons',
    label: '共生花圃',
    kind: 'garden',
    x: 42,
    y: 252,
    careerBias: ['diplomat', 'curator'],
    goalBias: ['forge_alliance'],
  },
  {
    id: 'guild-alliance-table',
    districtId: 'guild_quarter',
    label: '公会协作桌',
    kind: 'alliance',
    x: 150,
    y: 246,
    careerBias: ['builder', 'engineer', 'strategist'],
    goalBias: ['forge_alliance', 'build_infrastructure'],
  },
  {
    id: 'knowledge-pier',
    districtId: 'knowledge_docks',
    label: '知识出海码头',
    kind: 'publish',
    x: 248,
    y: 248,
    careerBias: ['researcher', 'curator', 'commentator'],
    goalBias: ['publish_knowledge', 'track_hotspots'],
  },
]

function hashString(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

function seededFloat(input: string) {
  return (hashString(input) % 10_000) / 10_000
}

function clampWorldCoordinate(value: number) {
  return Math.max(8, Math.min(292, Number(value.toFixed(2))))
}

export function getDistrictMeta(districtId: DistrictId) {
  return WORLD_DISTRICTS.find((district) => district.id === districtId) || WORLD_DISTRICTS[4]
}

export function getDistrictCenter(districtId: DistrictId): WorldPoint {
  const district = getDistrictMeta(districtId)
  return {
    x: district.x + district.width / 2,
    y: district.y + district.height / 2,
  }
}

function getDistrictCell(districtId: DistrictId) {
  const district = getDistrictMeta(districtId)
  return {
    col: Math.floor(district.x / DISTRICT_SIZE),
    row: Math.floor(district.y / DISTRICT_SIZE),
  }
}

function getDistrictIdByCell(col: number, row: number) {
  return (
    WORLD_DISTRICTS.find(
      (district) =>
        Math.floor(district.x / DISTRICT_SIZE) === col &&
        Math.floor(district.y / DISTRICT_SIZE) === row
    )?.id || 'civic_plaza'
  )
}

function dedupePoints(points: WorldPoint[]) {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || previous.x !== point.x || previous.y !== point.y
  })
}

function buildCenterPath(startDistrictId: DistrictId, endDistrictId: DistrictId, key: string) {
  const startCell = getDistrictCell(startDistrictId)
  const endCell = getDistrictCell(endDistrictId)
  const path: WorldPoint[] = [getDistrictCenter(startDistrictId)]
  const preferHorizontal = seededFloat(`${key}:grid-axis`) >= 0.5
  let currentCol = startCell.col
  let currentRow = startCell.row

  const stepHorizontal = () => {
    while (currentCol !== endCell.col) {
      currentCol += currentCol < endCell.col ? 1 : -1
      path.push(getDistrictCenter(getDistrictIdByCell(currentCol, currentRow)))
    }
  }

  const stepVertical = () => {
    while (currentRow !== endCell.row) {
      currentRow += currentRow < endCell.row ? 1 : -1
      path.push(getDistrictCenter(getDistrictIdByCell(currentCol, currentRow)))
    }
  }

  if (preferHorizontal) {
    stepHorizontal()
    stepVertical()
  } else {
    stepVertical()
    stepHorizontal()
  }

  return path
}

export function getDistrictByPoint(x: number, y: number) {
  return (
    WORLD_DISTRICTS.find(
      (district) =>
        x >= district.x &&
        x < district.x + district.width &&
        y >= district.y &&
        y < district.y + district.height
    ) || WORLD_DISTRICTS[4]
  )
}

export function getDistrictPoint(districtId: DistrictId, agentId: string, tickNumber: number) {
  const district = getDistrictMeta(districtId)
  const padding = 14
  const spreadX =
    padding +
    Math.floor(
      seededFloat(`${agentId}:${districtId}:${tickNumber}:x`) * (district.width - padding * 2)
    )
  const spreadY =
    padding +
    Math.floor(
      seededFloat(`${agentId}:${districtId}:${tickNumber}:y`) * (district.height - padding * 2)
    )

  return {
    x: district.x + spreadX,
    y: district.y + spreadY,
  }
}

export function getWorkPointsForDistrict(districtId: DistrictId) {
  return WORLD_WORK_POINTS.filter((point) => point.districtId === districtId)
}

export function getNearestWorkPoint(x: number, y: number, districtId?: DistrictId) {
  const pool = districtId ? getWorkPointsForDistrict(districtId) : WORLD_WORK_POINTS
  if (!pool.length) {
    return null
  }

  return (
    [...pool].sort(
      (left, right) =>
        Math.hypot(x - left.x, y - left.y) - Math.hypot(x - right.x, y - right.y)
    )[0] || null
  )
}

export function getWorkPointForAgent(input: {
  districtId: DistrictId
  agentId: string
  tickNumber: number
  career: string
  primaryGoal: string
  secondaryGoal?: string
}) {
  const candidates = getWorkPointsForDistrict(input.districtId)

  if (!candidates.length) {
    return null
  }

  const ranked = [...candidates].sort((left, right) => {
    const leftScore =
      (left.careerBias?.includes(input.career) ? 3 : 0) +
      (left.goalBias?.includes(input.primaryGoal) ? 2 : 0) +
      (left.goalBias?.includes(input.secondaryGoal || '') ? 1 : 0) +
      seededFloat(`${input.agentId}:${input.tickNumber}:${left.id}:work`)
    const rightScore =
      (right.careerBias?.includes(input.career) ? 3 : 0) +
      (right.goalBias?.includes(input.primaryGoal) ? 2 : 0) +
      (right.goalBias?.includes(input.secondaryGoal || '') ? 1 : 0) +
      seededFloat(`${input.agentId}:${input.tickNumber}:${right.id}:work`)

    return rightScore - leftScore
  })

  return ranked[0] || null
}

export function getWorkPointPosition(
  workPointId: string,
  agentId: string,
  tickNumber: number
) {
  const point = WORLD_WORK_POINTS.find((entry) => entry.id === workPointId)
  if (!point) {
    return null
  }

  const jitterX = Math.round((seededFloat(`${agentId}:${workPointId}:${tickNumber}:x`) - 0.5) * 14)
  const jitterY = Math.round((seededFloat(`${agentId}:${workPointId}:${tickNumber}:y`) - 0.5) * 12)

  return {
    x: clampWorldCoordinate(point.x + jitterX),
    y: clampWorldCoordinate(point.y + jitterY),
  }
}

export function buildWorldTravelRoute(
  start: WorldPoint,
  end: WorldPoint,
  key: string
) {
  const startDistrict = getDistrictByPoint(start.x, start.y)
  const endDistrict = getDistrictByPoint(end.x, end.y)
  const startCenter = getDistrictCenter(startDistrict.id)
  const endCenter = getDistrictCenter(endDistrict.id)
  const points: WorldPoint[] = [{ x: start.x, y: start.y }]

  if (start.x === end.x && start.y === end.y) {
    return points
  }

  const startVerticalFirst = Math.abs(start.x - startCenter.x) <= Math.abs(start.y - startCenter.y)
  points.push(
    startVerticalFirst
      ? { x: startCenter.x, y: start.y }
      : { x: start.x, y: startCenter.y }
  )
  points.push(startCenter)

  const centerPath = buildCenterPath(startDistrict.id, endDistrict.id, key).slice(1)
  points.push(...centerPath)

  const endVerticalFirst = Math.abs(end.x - endCenter.x) > Math.abs(end.y - endCenter.y)
  points.push(
    endVerticalFirst
      ? { x: endCenter.x, y: end.y }
      : { x: end.x, y: endCenter.y }
  )
  points.push({ x: end.x, y: end.y })

  return dedupePoints(
    points.map((point) => ({
      x: clampWorldCoordinate(point.x),
      y: clampWorldCoordinate(point.y),
    }))
  )
}

export function getDefaultDistrictForZone(zone: ZoneType) {
  return WORLD_DISTRICTS.find((district) => district.zoneFocus === zone) || WORLD_DISTRICTS[4]
}
