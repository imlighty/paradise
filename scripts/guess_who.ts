import * as server from '@minecraft/server'
import { sendTitle } from './utils'

export default class {
  private players: Player[] = []
  private status: 'waiting' | 'starting' | 'running' | 'stopped' = 'waiting'
  private task: number | null = null

  constructor() {
    console.log('Guess Who loaded!')
    this.initialize()
  }

  private initialize() {
    this.task = server.system.runInterval(() => {
      switch (this.status) {
        case 'waiting':
          if (this.players.length < 2) sendTitle('§aWaiting for players... §7(§b!join§7)', 'overworld', 'actionbar')
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
    server.world.afterEvents.entityHitEntity.subscribe((event) => {
      if (event.damagingEntity.typeId === server.MinecraftEntityTypes.player.id) {
        let player = this.getPlayer(event.damagingEntity as server.Player)
        if (player === undefined) return
        if (player.status === 'seeker') {
          if (!event.hitEntity.hasTag('hiding')) {
            ;(player as Player).player.applyDamage(1)
            return
          } else {
            let hidingPlayer = event.hitEntity as server.Player
            this.switchToSeeker(hidingPlayer)
          }
        }
      }
    })
  }

  addPlayer(player: server.Player) {
    this.players.push({ player: player })
    player.sendMessage(`§aYou joined the queue for a game of §bGuess Who§a!`)
  }

  switchToSeeker(player: server.Player) {
    let p = this.getPlayer(player)
    if (p === undefined) return
    p.status = 'seeker'
    if (this.calculatePlayers('hider') === 0) this.endGame()
    p.player.sendMessage(`§aYou are now a §bseeker§a!`)
  }

  getPlayer(player: server.Player): Player | undefined {
    return this.players.find((p) => p.player.name === player.name)
  }

  calculatePlayers(type: 'hider' | 'seeker') {
    return this.players.filter((p) => p.status === type).length
  }

  getRandomMob(): string {
    let mobs = ['sheep', 'pig', 'cow', 'wolf']
    return mobs[Math.floor(Math.random() * mobs.length)]
  }

  startGame() {
    this.status = 'running'
    this.players.forEach((p) => {
      let probability = Math.random() * 100 + 1
      let totalPlayers = this.players.length
      this.getPlayer(p.player)!.status =
        (this.calculatePlayers('seeker') < 1 && probability > 50) || this.calculatePlayers('hider') === totalPlayers - 1
          ? 'seeker'
          : 'hider'
      if (p.status === 'hider') {
        let mob = this.getRandomMob()
        server.system.run(() => {
          p.hiding_entity = p.player.dimension.spawnEntity('minecraft:' + mob, p.player.location)
        })
        p.task = server.system.runInterval(() => {
          p.player.addEffect(server.EffectTypes.get('invisibility') as server.EffectType, 5, { showParticles: false })
          if (!p.player.hasTag('hiding')) p.player.addTag('hiding')
          if (p.hiding_entity !== undefined || !p.hiding_entity!.hasTag('hiding')) p.hiding_entity!.addTag('hiding')
          p.hiding_entity!.teleport(p.player.location)
          p.hiding_entity!.setRotation(p.player.getRotation())
        })
      } else if (p.status === 'seeker') {
        p.task = server.system.runInterval(() => {
          let health = p.player.getComponent('minecraft:health') as server.EntityHealthComponent
          health.setCurrentValue(health.defaultValue)
        })
      }
    })
  }

  endGame() {
    this.status = 'stopped'
    this.players.forEach((p) => {
      if (p.task !== undefined) server.system.clearRun(p.task)
      if (p.status === 'hider') {
        p.hiding_entity!.kill()
        p.player.removeTag('hiding')
      }
      p.player.removeTag('hiding')
      p.player.removeTag('seeker')
      p.player.removeTag('spectator')
      try {
        p.player.removeEffect('minecraft:invisibility')
      } catch (err) {}
      p.player.teleport(server.world.getDefaultSpawnLocation())
    })
    this.players = []
  }
}

type Player = {
  player: server.Player
  hiding_entity?: server.Entity
  task?: number
  status?: 'hider' | 'seeker' | 'spectator'
}
