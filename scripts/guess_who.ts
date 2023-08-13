import * as server from '@minecraft/server'
import { sendTitle } from './utils'

export default class {
  private players: Player[] = []
  private status: 'waiting' | 'running' | 'stopped' = 'waiting'
  private task: number | null = null

  constructor() {
    console.log('Guess Who loaded!')
    this.initialize()
  }

  private initialize() {
    this.task = server.system.runInterval(() => {
      if (this.status === 'waiting') {
        sendTitle('§aWaiting for players... §7(§b!join§7)', 'overworld', 'actionbar')
      }
      switch (this.status) {
        case 'waiting':
          sendTitle('§aWaiting for players... §7(§b!join§7)', 'overworld', 'actionbar')
          break
        case 'running':
          sendTitle(
            `§aSeekers: §b${this.calculatePlayers('seeker')} §f| §aHiders: §b${this.calculatePlayers('hider')}`,
            'overworld',
            'actionbar'
          )
          break
        case 'stopped':
          server.system.clearRun(this.task!)
          break
      }
    })
    server.world.beforeEvents.chatSend.subscribe((event) => {
      let player = event.sender
      let msg = event.message
      if (msg.startsWith('!')) {
        event.cancel = true
        let cmd = msg.replace('!', '').split(' ')[0]
        let args = msg.replace('!', '').split(' ').slice(1)
        switch (cmd) {
          case 'start':
            if (!player.hasTag('admin')) return player.sendMessage(`§cYou don't have permission to use this command!`)
            this.startGame()
            break
          case 'stop':
            if (!player.hasTag('admin')) return player.sendMessage(`§cYou don't have permission to use this command!`)
            // this.stopGame()
            break
          case 'join':
            this.addPlayer(player)
            break
          case 'add':
            if (!player.hasTag('admin')) return player.sendMessage(`§cYou don't have permission to use this command!`)
            if (args.length < 1) return player.sendMessage(`§cUsage: !add <player>`)
            let playerName = args[0]
            let target = server.world.getPlayers().find((p) => p.name === playerName)
            if (!target) return player.sendMessage(`§cPlayer not found!`)
            this.addPlayer(target)
            player.sendMessage(`§aAdded §b${playerName} to the game!`)
            break
          default:
            player.sendMessage(`§cUnknown command: ${cmd}`)
            break
        }
      }
    })
  }

  addPlayer(player: server.Player) {
    // let isSeeker = this.players.length === 0 ? true : false
    let isSeeker = false
    this.players.push({ player: player, status: isSeeker ? 'seeker' : 'hider' })
    player.sendMessage(`§aYou joined the queue for a game of §bGuess Who§a!`)
  }

  calculatePlayers(type: 'hider' | 'seeker') {
    return this.players.filter((p) => p.status === type).length
  }

  getRandomMob(): Mob {
    let mobs: Mob[] = ['sheep', 'pig', 'cow', 'chicken', 'rabbit', 'llama', 'wolf']
    return mobs[Math.floor(Math.random() * mobs.length)]
  }

  startGame() {
    this.status = 'running'
    this.players.forEach((p) => {
      if (p.status === 'hider') {
        let mob = this.getRandomMob()
        server.system.run(() => {
          p.hiding_entity = {
            name: mob,
            entity: p.player.dimension.spawnEntity('minecraft:' + mob, p.player.location),
          }
        })
        p.task = server.system.runInterval(() => {
          p.player.addEffect(server.EffectTypes.get('invisibility') as server.EffectType, 5, { showParticles: false })
          p.hiding_entity!.entity.teleport(p.player.location)
          p.hiding_entity!.entity.setRotation(p.player.getRotation())
        })
      }
    })
  }
}

type Mob = 'sheep' | 'pig' | 'cow' | 'chicken' | 'rabbit' | 'llama' | 'wolf'

type Player = {
  player: server.Player
  hiding_entity?: {
    name: Mob
    entity: server.Entity
  }
  task?: number
  status: 'hider' | 'seeker' | 'spectator'
}
