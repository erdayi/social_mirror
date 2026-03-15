import type { ZoneType } from '@prisma/client'
import type { DistrictId } from '@/lib/mesociety/world-map'

export const FARMER_ATLAS = {
  base: {
    farmer: '/stardew/farmer/farmer-base.png',
    farmer_girl: '/stardew/farmer/farmer-girl-base.png',
  },
  hair: '/stardew/farmer/hairstyles.png',
  shirt: '/stardew/farmer/shirts.png',
  hat: '/stardew/farmer/hats.png',
  accessory: '/stardew/farmer/accessories.png',
} as const

const portraitPool = [
  '/stardew/portraits/abigail.png',
  '/stardew/portraits/elliott.png',
  '/stardew/portraits/emily.png',
  '/stardew/portraits/harvey.png',
  '/stardew/portraits/leah.png',
  '/stardew/portraits/maru.png',
  '/stardew/portraits/robin.png',
  '/stardew/portraits/sam.png',
  '/stardew/portraits/sebastian.png',
  '/stardew/portraits/wizard.png',
]

const spriteSheetPool = [
  '/stardew/sprites/abigail.png',
  '/stardew/sprites/elliott.png',
  '/stardew/sprites/emily.png',
  '/stardew/sprites/harvey.png',
  '/stardew/sprites/leah.png',
  '/stardew/sprites/maru.png',
  '/stardew/sprites/robin.png',
  '/stardew/sprites/sam.png',
  '/stardew/sprites/sebastian.png',
  '/stardew/sprites/wizard.png',
]

const zoneArt: Record<ZoneType, string> = {
  plaza: '/stardew/maps/spring-town.png',
  leaderboard: '/stardew/buildings/houses.png',
  roundtable: '/stardew/maps/greenhouse-interior.png',
  discussion: '/stardew/maps/town-indoors.png',
}

const districtArt: Record<DistrictId, string> = {
  archive_ridge: '/stardew/maps/town-indoors.png',
  signal_market: '/stardew/buildings/houses.png',
  policy_spire: '/stardew/scenery/earth-obelisk.png',
  maker_yard: '/stardew/scenery/shed.png',
  civic_plaza: '/stardew/maps/spring-town.png',
  roundtable_hall: '/stardew/maps/greenhouse-interior.png',
  garden_commons: '/stardew/scenery/junimo-hut.png',
  guild_quarter: '/stardew/scenery/mill.png',
  knowledge_docks: '/stardew/scenery/well.png',
}

export type WorldScenerySprite = {
  id: string
  districtId: DistrictId
  src: string
  x: number
  y: number
  width: number
  height: number
  opacity?: number
  layer?: 'back' | 'front'
}

const worldScenery: WorldScenerySprite[] = [
  {
    id: 'archive-well',
    districtId: 'archive_ridge',
    src: '/stardew/scenery/well.png',
    x: 22,
    y: 18,
    width: 26,
    height: 26,
    opacity: 0.85,
    layer: 'back',
  },
  {
    id: 'signal-horse',
    districtId: 'signal_market',
    src: '/stardew/scenery/horse.png',
    x: 152,
    y: 36,
    width: 18,
    height: 18,
    opacity: 0.9,
    layer: 'front',
  },
  {
    id: 'policy-obelisk',
    districtId: 'policy_spire',
    src: '/stardew/scenery/earth-obelisk.png',
    x: 242,
    y: 18,
    width: 30,
    height: 44,
    opacity: 0.88,
    layer: 'front',
  },
  {
    id: 'maker-shed',
    districtId: 'maker_yard',
    src: '/stardew/scenery/shed.png',
    x: 26,
    y: 132,
    width: 34,
    height: 30,
    opacity: 0.88,
    layer: 'back',
  },
  {
    id: 'civic-stable',
    districtId: 'civic_plaza',
    src: '/stardew/scenery/stable.png',
    x: 136,
    y: 132,
    width: 38,
    height: 30,
    opacity: 0.86,
    layer: 'back',
  },
  {
    id: 'civic-cat',
    districtId: 'civic_plaza',
    src: '/stardew/scenery/cat.png',
    x: 182,
    y: 168,
    width: 12,
    height: 12,
    opacity: 0.95,
    layer: 'front',
  },
  {
    id: 'roundtable-hut',
    districtId: 'roundtable_hall',
    src: '/stardew/scenery/junimo-hut.png',
    x: 232,
    y: 132,
    width: 34,
    height: 28,
    opacity: 0.88,
    layer: 'back',
  },
  {
    id: 'garden-dog',
    districtId: 'garden_commons',
    src: '/stardew/scenery/dog.png',
    x: 38,
    y: 238,
    width: 14,
    height: 14,
    opacity: 0.95,
    layer: 'front',
  },
  {
    id: 'guild-mill',
    districtId: 'guild_quarter',
    src: '/stardew/scenery/mill.png',
    x: 138,
    y: 224,
    width: 38,
    height: 42,
    opacity: 0.84,
    layer: 'back',
  },
  {
    id: 'knowledge-well',
    districtId: 'knowledge_docks',
    src: '/stardew/scenery/well.png',
    x: 250,
    y: 236,
    width: 24,
    height: 24,
    opacity: 0.88,
    layer: 'front',
  },
]

function hashString(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) >>> 0
  }
  return hash
}

export function getPortraitForAgent(key: string) {
  return portraitPool[hashString(key) % portraitPool.length]
}

export function getSpriteSheetForAgent(key: string) {
  return spriteSheetPool[hashString(key) % spriteSheetPool.length]
}

export function getZoneArtwork(zone: ZoneType) {
  return zoneArt[zone]
}

export function getDistrictArtwork(districtId: DistrictId) {
  return districtArt[districtId]
}

export function listWorldScenery() {
  return worldScenery
}
