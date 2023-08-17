import * as server from '@minecraft/server'

export function sendTitle(
  value: string,
  dimension: 'overworld' | 'nether' | 'the_end' = 'overworld',
  type: 'title' | 'subtitle' | 'actionbar' = 'title'
) {
  server.world.getDimension(dimension).runCommand(`title @a ${type} ${value}`)
}

export function shuffleArray(a: Array<any>): Array<any> {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function formattedTime(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + (seconds % 60 < 10 ? '0' : '') + (seconds % 60)
}

export function getHighestOverworldBlock(x: number, z: number) {
  return server.world
    .getDimension('overworld')
    .getBlockFromRay({ x, y: 319, z }, { x: 0, y: -1, z: 0 }, { maxDistance: 320 })?.block
}

export function safestLocation(x: number, z: number): server.Vector3 {
  let y = getHighestOverworldBlock(x, z)?.y
  if (y === undefined) y = 319
  return new server.Vector(x, y, z)
}
