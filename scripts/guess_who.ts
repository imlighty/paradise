import * as server from '@minecraft/server'
import { formattedTime, getHighestOverworldBlock, sendTitle, shuffleArray } from './utils'
import { JaylyDB } from './libs/jaylydb/index'

export default class {
  private players: Player[] = []
  private status: 'waiting' | 'starting' | 'running' | 'stopped' = 'waiting'
  private timeLeft = {
    default: 240,
    current: 0,
  }
  private tasks: Map<string, number> | undefined = new Map()
  private db: JaylyDB

  constructor() {
    this.timeLeft.current = this.timeLeft.default
    this.db = new JaylyDB('paradise:guess_who', false)
    console.log('Guess Who loaded!')
    this.initialize()
  }

  private initialize() {
    server.world.getDimension('overworld').runCommand('difficulty peaceful')
    this.tasks?.set(
      'main',
      server.system.runInterval(() => {
        switch (this.status) {
          case 'waiting':
            if (this.players.length < 2) sendTitle('§aWaiting for players... §7(§b!join§7)', 'overworld', 'actionbar')
            break
          case 'running':
            sendTitle(
              `§6Time left: §e${formattedTime(this.timeLeft.current)}\n§aSeekers: §b${this.calculatePlayers(
                'seeker'
              )} §f| §aHiders: §b${this.calculatePlayers('hider')}`,
              'overworld',
              'actionbar'
            )
            break
          case 'stopped':
            sendTitle(
              `${this.calculatePlayers('hider') === 0 ? '§aSeekers win!' : '§aHiders win!'}`,
              'overworld',
              'actionbar'
            )
            break
        }
      })
    )
    server.world.afterEvents.playerSpawn.subscribe((event) => {
      if (event.initialSpawn) {
        if (this.status === 'waiting')
          server.system.run(() => {
            event.player.teleport(
              JSON.parse(
                (this.db.get('queue_spawn') as string) || '{"x":0,"y":' + getHighestOverworldBlock(0, 0) + ',"z":0}'
              ) as server.Vector3
            )
            event.player.dimension.runCommand(`gamemode adventure ${event.player.name}`)
          })
        else if (this.status === 'running')
          server.system.run(() => {
            this.players.push({ player: event.player, status: 'spectator' })
            event.player.dimension.runCommand(`gamemode spectator ${event.player.name}`)
            let spawnPoints = JSON.parse((this.db.get('hiders_spawn') as string) || '[]')
            let spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)]
            event.player.teleport(spawnPoint)
          })
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
          case 'end':
            if (!player.hasTag('admin')) return player.sendMessage(`§cYou don't have permission to use this command!`)
            if (this.status !== 'running') return player.sendMessage(`§cThere is no game running!`)
            this.endGame()
            break
          case 'setup':
            if (!player.hasTag('admin')) return player.sendMessage(`§cYou don't have permission to use this command!`)
            if (args.length < 1)
              return player.sendMessage(
                `§cUsage: !setup <queue_spawn|hiders_spawn|purge_hiders_spawn|seekers_spawn|purge_seekers_spawn> [additional arguments]`
              )
            switch (args[0]) {
              case 'queue_spawn':
                server.system.run(() => {
                  let loc = player.location
                  loc.y += 1
                  this.db.set('queue_spawn', JSON.stringify(loc))
                })
                player.sendMessage(`§aSet queue spawn to your location!`)
                break
              case 'hiders_spawn':
                server.system.run(() => {
                  let loc = player.location
                  loc.y += 1
                  let locations = JSON.parse((this.db.get('hiders_spawn') as string) || '[]')
                  locations.push(loc)
                  this.db.set('hiders_spawn', JSON.stringify(locations))
                })
                player.sendMessage(`§aAdded a location to the hiders spawn points!`)
                break
              case 'purge_hiders_spawn':
                server.system.run(() => this.db.set('hiders_spawn', '[]'))
                player.sendMessage(`§aPurged all hiders spawn points!`)
                break
              case 'seekers_spawn':
                server.system.run(() => {
                  let loc = player.location
                  loc.y += 1
                  let locations = JSON.parse((this.db.get('seekers_spawn') as string) || '[]')
                  locations.push(loc)
                  this.db.set('seekers_spawn', JSON.stringify(locations))
                })
                player.sendMessage(`§aAdded a location to the seekers spawn points!`)
                break
              case 'purge_seekers_spawn':
                server.system.run(() => this.db.set('seekers_spawn', '[]'))
                player.sendMessage(`§aPurged all seekers spawn points!`)
                break
            }
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
    server.system.run(() => {
      let maxPlayers =
        (this.db.get('max_players') as number) === undefined ? 10 : (this.db.get('max_players') as number)
      if (this.players.length >= maxPlayers) return player.sendMessage(`§cThe game is full!`)
      if (this.getPlayer(player) !== undefined) return player.sendMessage(`§cYou are already in the game!`)
      this.players.push({ player: player })
      this.players.forEach((p) => {
        p.player.playSound('random.pop')
        p.player.sendMessage(`§b${player.name} §ajoined the queue! §7(${this.players.length}/${maxPlayers})`)
      })
    })
  }

  switchToSeeker(player: server.Player) {
    server.system.run(() => {
      let p = this.getPlayer(player)
      if (p === undefined) return
      p.status = 'seeker'
      p.hiding_entity?.kill()
      p.hiding_entity = undefined
      if (this.calculatePlayers('hider') === 0) this.endGame()
      let spawnPoints = JSON.parse((this.db.get('seekers_spawn') as string) || '[]')
      let spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)]
      p.player.teleport(spawnPoint)
      p.player.sendMessage(`§aYou are now a §bseeker§a!`)
    })
  }

  getPlayer(player: server.Player): Player | undefined {
    return this.players.find((p) => p.player.name === player.name)
  }

  calculatePlayers(type: 'hider' | 'seeker') {
    return this.players.filter((p) => p.status === type).length
  }

  getRandomMob(): string {
    let mobs = ['coconutter']
    return mobs[Math.floor(Math.random() * mobs.length)]
  }

  startGame() {
    this.status = 'running'
    this.players = shuffleArray(this.players)
    this.players.forEach((p) => {
      let probability = Math.random() * 100 + 1
      let totalPlayers = this.players.length
      /* this.getPlayer(p.player)!.status =
        (this.calculatePlayers('seeker') < 1 && probability > 50) || this.calculatePlayers('hider') === totalPlayers - 1
          ? 'seeker'
          : 'hider' */
      this.getPlayer(p.player)!.status = 'hider'
      if (p.status === 'hider') {
        let mob = this.getRandomMob()
        server.system.run(() => {
          let spawnPoints = JSON.parse((this.db.get('hiders_spawn') as string) || '[]')
          let spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)]
          p.player.teleport(spawnPoint)
          p.hiding_entity = p.player.dimension.spawnEntity('paradise:' + mob, p.player.location)
        })
        p.task = server.system.runInterval(() => {
          p.player.addEffect(server.EffectTypes.get('invisibility') as server.EffectType, 5, { showParticles: false })
          if (!p.player.hasTag('hiding')) p.player.addTag('hiding')
          if (p.hiding_entity !== undefined || !p.hiding_entity!.hasTag('hiding')) p.hiding_entity!.addTag('hiding')
          p.hiding_entity!.teleport(p.player.location)
          p.hiding_entity!.setRotation(p.player.getRotation())
          let health = p.player.getComponent('minecraft:health') as server.EntityHealthComponent
          health.setCurrentValue(health.defaultValue)
          health = p.hiding_entity?.getComponent('minecraft:health') as server.EntityHealthComponent
          health.setCurrentValue(health.defaultValue)
        })
      } else if (p.status === 'seeker') {
        server.system.run(() => {
          let spawnPoints = JSON.parse((this.db.get('seekers_spawn') as string) || '[]')
          let spawnPoint = spawnPoints[Math.floor(Math.random() * spawnPoints.length)]
          p.player.teleport(spawnPoint)
        })
        p.task = server.system.runInterval(() => {
          let health = p.player.getComponent('minecraft:health') as server.EntityHealthComponent
          health.setCurrentValue(health.defaultValue)
        })
      }
    })
    this.tasks?.set(
      'counter',
      server.system.runInterval(() => {
        if (this.timeLeft.current === 0) {
          this.endGame()
          server.system.clearRun(this.tasks?.get('counter')!)
          return
        }
        this.timeLeft.current--
      }, 20)
    )
  }

  endGame() {
    server.system.run(() => {
      if (this.calculatePlayers('hider') === 0) {
        sendTitle('§aSeekers win!', 'overworld', 'title')
      } else {
        sendTitle('§aHiders win!', 'overworld', 'title')
      }
      this.status = 'stopped'
    })
    server.system.runTimeout(() => {
      this.status = 'waiting'
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
        server.system.run(() =>
          p.player.teleport(
            JSON.parse(
              (this.db.get('queue_spawn') as string) || '{"x":0,"y":' + getHighestOverworldBlock(0, 0) + ',"z":0}'
            ) as server.Vector3
          )
        )
      })
      this.players = []
      this.timeLeft.current = this.timeLeft.default
    }, 100)
  }
}

type Player = {
  player: server.Player
  hiding_entity?: server.Entity
  task?: number
  status?: 'hider' | 'seeker' | 'spectator'
}
