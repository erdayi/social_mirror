import type { ZoneType } from '@prisma/client'

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
