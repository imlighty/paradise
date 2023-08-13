import * as server from '@minecraft/server'

export function sendTitle(
  value: string,
  dimension: 'overworld' | 'nether' | 'the_end' = 'overworld',
  type: 'title' | 'subtitle' | 'actionbar' = 'title'
) {
  server.world.getDimension(dimension).runCommand(`title @a ${type} ${value}`)
}
