import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import {
  ComboOverdriveState,
  OVERDRIVE_DURATION_SECONDS,
  PlayerComputedStats,
  SkillId,
  TOTAL_SURVIVAL_SECONDS,
  activateCyberOverdrive,
  canTriggerAutoLevelUp,
  computeCritHit,
  getOrbitalStrikeSpecs,
  getWaveFromTime,
  registerKillCombo,
  xpRequiredForLevel,
} from '../game/rules';
import { soundEngine } from '../game/sound';

export type ArchetypeKind = 'swarmer' | 'kiter' | 'charger' | 'phalanx' | 'boss';

interface EnemyEntity {
  id: number;
  kind: ArchetypeKind;
  isElite: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  facingAngle: number;
  hitFlashTimer: number;
  koTimer: number;
  maxKoTimer: number;
  state: 'SEEK' | 'WINDUP' | 'CHARGE' | 'COOLDOWN';
  stateTimer: number;
  telegraphAngle: number;
  telegraphTargetX: number;
  telegraphTargetY: number;
  flankSign: number;
  waveSpawned: number;
}

interface ProjectileEntity {
  active: boolean;
  isEnemy: boolean;
  isLegendary: boolean;
  isMortar: boolean;
  isHomingMissile: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierceLeft: number;
  life: number;
  maxLife: number;
  color: string;
}

interface PickupEntity {
  active: boolean;
  kind: 'XP' | 'GOLD' | 'HP_CELL' | 'BOSS_CHEST';
  x: number;
  y: number;
  value: number;
  wave: number;
  bossName?: string;
  magnetized: boolean;
  pulsePhase: number;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

interface FloatingCombatText {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

interface OrbitalBeamEffect {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface MechAfterimage {
  x: number;
  y: number;
  angle: number;
  alpha: number;
  color: string;
}

interface LightningArc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
}

export interface HudTelemetrySnapshot {
  hp: number;
  maxHp: number;
  trailingHp: number;
  shield: number;
  maxShield: number;
  xp: number;
  xpToNext: number;
  level: number;
  elapsedSeconds: number;
  wave: number;
  waveTitle: string;
  isBossWave: boolean;
  isHighOptInReviveZone: boolean;
  kills: number;
  runGold: number;
  runParts: number;
  dashCooldownRatio: number;
  orbitalCooldownRatio: number;
  comboCount: number;
  comboMultiplier: number;
  overdriveCharge: number;
  overdriveActive: boolean;
  overdriveRemainingSec: number;
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  activeSkills: Record<SkillId, number>;
}

export interface GameCanvasHandle {
  startNewRun: (stats: PlayerComputedStats) => void;
  applyReviveEmp: () => void;
  applySkillUpgrade: (skillId: SkillId, nextLevel: number) => void;
  jumpToWave: (waveNumber: number) => void;
  triggerDash: () => void;
  triggerOverdrive: () => void;
  triggerOrbitalStrike: () => void;
  triggerSwarmSurge: () => void;
  spawnDemoBossChest: () => void;
}

interface GameCanvasProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  timeScale: number;
  computedStats: PlayerComputedStats;
  onHudUpdate: (snapshot: HudTelemetrySnapshot) => void;
  onLevelUpReady: (newLevel: number, currentSkills: Record<SkillId, number>) => void;
  onBossChestCollected: (wave: number, bossName: string) => void;
  onPlayerDefeated: (snapshot: HudTelemetrySnapshot) => void;
  onPlayerVictory: (snapshot: HudTelemetrySnapshot) => void;
}

const MAX_PARTICLES = 420;
const MAX_PROJECTILES = 240;
const MAX_PICKUPS = 200;
const MAX_FLOATING_TEXTS = 90;
const ARENA_HALF_SIZE = 1400;

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  (
    {
      gameState,
      timeScale,
      computedStats,
      onHudUpdate,
      onLevelUpReady,
      onBossChestCollected,
      onPlayerDefeated,
      onPlayerVictory,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const gameStateRef = useRef(gameState);
    gameStateRef.current = gameState;

    const timeScaleRef = useRef(timeScale);
    timeScaleRef.current = timeScale;

    const statsRef = useRef(computedStats);
    statsRef.current = computedStats;

    const callbacksRef = useRef({
      onHudUpdate,
      onLevelUpReady,
      onBossChestCollected,
      onPlayerDefeated,
      onPlayerVictory,
    });
    callbacksRef.current = {
      onHudUpdate,
      onLevelUpReady,
      onBossChestCollected,
      onPlayerDefeated,
      onPlayerVictory,
    };

    const simRef = useRef({
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 20,
        hp: 160,
        maxHp: 160,
        trailingHp: 160,
        shield: 50,
        maxShield: 50,
        shieldRegenDelay: 0,
        facingAngle: 0,
        walkBobDistance: 0,
        scaleX: 1,
        scaleY: 1,
        invulnTimer: 0,
        hitFlashTimer: 0,
        muzzleFlashTimer: 0,
        dashTimer: 0,
        dashCooldownTimer: 0,
        dashBufferTimer: 0,
        orbitalCooldownTimer: 0,
        afterimageTimer: 0,
      },
      comboState: {
        comboCount: 0,
        comboTimer: 0,
        comboMultiplier: 1.0,
        overdriveCharge: 100, // Start ready for immediate action!
        overdriveActiveTimer: 0,
      } as ComboOverdriveState,
      skills: {
        plasma_repeater: 1,
        orbital_blades: 1,
        chain_tesla: 0,
        rail_mortar: 0,
        omega_singularity: 0,
        overclock_fire_rate: 0,
        nanite_hull_repair: 0,
        thruster_afterburner: 0,
      } as Record<SkillId, number>,
      weaponTimers: {
        repeater: 0,
        tesla: 0,
        mortar: 0,
        omega: 0,
        homingPod: 0,
        orbitalAngle: 0,
      },
      progression: {
        xp: 0,
        xpToNext: xpRequiredForLevel(1),
        level: 1,
        elapsedSeconds: 0,
        lastLevelUpElapsedSeconds: 0,
        kills: 0,
        runGold: 0,
        runParts: 0,
        spawnedWave5Boss: false,
        spawnedWave10Boss: false,
        eliteSpawnTimer: 26,
        defeatPendingTimer: 0,
      },
      camera: {
        x: 0,
        y: 0,
        trauma: 0,
        titleOrbitAngle: 0,
        empRingRadius: 0,
        empRingAlpha: 0,
      },
      hitstopTimer: 0,
      spawnTimer: 0.25,
      nextEnemyId: 1,
      lockedTargetId: -1,
      enemies: [] as EnemyEntity[],
      projectiles: Array.from({ length: MAX_PROJECTILES }, (): ProjectileEntity => ({
        active: false,
        isEnemy: false,
        isLegendary: false,
        isMortar: false,
        isHomingMissile: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 5,
        damage: 10,
        pierceLeft: 0,
        life: 0,
        maxLife: 1,
        color: '#38BDF8',
      })),
      pickups: Array.from({ length: MAX_PICKUPS }, (): PickupEntity => ({
        active: false,
        kind: 'XP',
        x: 0,
        y: 0,
        value: 10,
        wave: 1,
        magnetized: false,
        pulsePhase: 0,
      })),
      particles: Array.from({ length: MAX_PARTICLES }, (): PooledParticle => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        life: 0,
        maxLife: 0.4,
        color: '#38BDF8',
      })),
      particleHead: 0,
      floatingTexts: Array.from({ length: MAX_FLOATING_TEXTS }, (): FloatingCombatText => ({
        active: false,
        text: '',
        x: 0,
        y: 0,
        vy: -55,
        life: 0,
        maxLife: 0.65,
        color: '#FFFFFF',
        scale: 1,
      })),
      floatingTextHead: 0,
      orbitalBeams: [] as OrbitalBeamEffect[],
      afterimages: [] as MechAfterimage[],
      arcs: [] as LightningArc[],
      input: {
        keysHeld: new Set<string>(),
        justPressed: new Set<string>(),
        pointerActive: false,
        pointerOriginX: 0,
        pointerOriginY: 0,
        pointerCurrentX: 0,
        pointerCurrentY: 0,
      },
      canvasBounds: {
        left: 0,
        top: 0,
        width: 1280,
        height: 800,
      },
    });

    const spawnParticles = (
      x: number,
      y: number,
      count: number,
      color: string,
      speedMin = 45,
      speedMax = 210,
      size = 3.5,
      life = 0.38
    ) => {
      const s = simRef.current;
      for (let i = 0; i < count; i++) {
        const p = s.particles[s.particleHead];
        s.particleHead = (s.particleHead + 1) % MAX_PARTICLES;
        const angle = Math.random() * Math.PI * 2;
        const spd = speedMin + Math.random() * (speedMax - speedMin);
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd;
        p.size = size * (0.75 + Math.random() * 0.5);
        p.life = life * (0.7 + Math.random() * 0.4);
        p.maxLife = p.life;
        p.color = color;
      }
    };

    const spawnFloatingText = (
      text: string,
      x: number,
      y: number,
      color = '#F8FAFC',
      scale = 1.0,
      life = 0.65
    ) => {
      const s = simRef.current;
      const ft = s.floatingTexts[s.floatingTextHead];
      s.floatingTextHead = (s.floatingTextHead + 1) % MAX_FLOATING_TEXTS;
      ft.active = true;
      ft.text = text;
      ft.x = x + (Math.random() - 0.5) * 18;
      ft.y = y - 10;
      ft.vy = -55 - Math.random() * 25;
      ft.life = life;
      ft.maxLife = life;
      ft.color = color;
      ft.scale = scale;
    };

    const spawnPickup = (
      kind: PickupEntity['kind'],
      x: number,
      y: number,
      value: number,
      wave = 1,
      bossName?: string
    ) => {
      const s = simRef.current;
      for (let i = 0; i < MAX_PICKUPS; i++) {
        if (!s.pickups[i].active) {
          s.pickups[i].active = true;
          s.pickups[i].kind = kind;
          s.pickups[i].x = x;
          s.pickups[i].y = y;
          s.pickups[i].value = value;
          s.pickups[i].wave = wave;
          s.pickups[i].bossName = bossName;
          s.pickups[i].magnetized = false;
          s.pickups[i].pulsePhase = Math.random() * Math.PI * 2;
          return;
        }
      }
    };

    const spawnBoss = (waveNumber: number) => {
      const s = simRef.current;
      const waveInfo = getWaveFromTime(s.progression.elapsedSeconds);
      const angle = Math.random() * Math.PI * 2;
      const dist = 360;
      const bossHp = waveNumber >= 10 ? 6800 : 2800;
      s.enemies.push({
        id: s.nextEnemyId++,
        kind: 'boss',
        isElite: true,
        x: s.player.x + Math.cos(angle) * dist,
        y: s.player.y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 42,
        hp: bossHp,
        maxHp: bossHp,
        speed: waveNumber >= 10 ? 98 : 88,
        damage: Math.round((waveNumber >= 10 ? 34 : 26) * waveInfo.enemyDamageMultiplier),
        facingAngle: angle + Math.PI,
        hitFlashTimer: 0,
        koTimer: 0,
        maxKoTimer: 0.45,
        state: 'SEEK',
        stateTimer: 1.5,
        telegraphAngle: 0,
        telegraphTargetX: s.player.x,
        telegraphTargetY: s.player.y,
        flankSign: 1,
        waveSpawned: waveNumber,
      });
      s.camera.trauma = Math.min(1, s.camera.trauma + 0.55);
      spawnFloatingText(
        waveNumber >= 10 ? 'FINAL BOSS: OMEGA SOVEREIGN!' : 'BOSS: TITAN DREADNOUGHT!',
        s.player.x,
        s.player.y - 45,
        '#EF4444',
        1.45,
        1.3
      );
      soundEngine.playTelegraphWindup();
    };

    const buildHudSnapshot = (): HudTelemetrySnapshot => {
      const s = simRef.current;
      const waveInfo = getWaveFromTime(s.progression.elapsedSeconds);
      const activeBoss = s.enemies.find((e) => e.kind === 'boss' && e.koTimer === 0);
      const orbitalSpecs = getOrbitalStrikeSpecs(
        s.progression.level,
        statsRef.current.damageMultiplier
      );

      return {
        hp: Math.max(0, Math.round(s.player.hp)),
        maxHp: Math.round(s.player.maxHp),
        trailingHp: Math.max(0, Math.round(s.player.trailingHp)),
        shield: Math.max(0, Math.round(s.player.shield)),
        maxShield: Math.round(s.player.maxShield),
        xp: Math.round(s.progression.xp),
        xpToNext: Math.round(s.progression.xpToNext),
        level: s.progression.level,
        elapsedSeconds: s.progression.elapsedSeconds,
        wave: waveInfo.wave,
        waveTitle: waveInfo.waveTitle,
        isBossWave: waveInfo.isBossWave,
        isHighOptInReviveZone: waveInfo.isHighOptInReviveZone,
        kills: s.progression.kills,
        runGold: s.progression.runGold,
        runParts: s.progression.runParts,
        dashCooldownRatio:
          s.player.dashCooldownTimer <= 0
            ? 1
            : Math.max(0, 1 - s.player.dashCooldownTimer / statsRef.current.dashCooldown),
        orbitalCooldownRatio:
          s.player.orbitalCooldownTimer <= 0
            ? 1
            : Math.max(0, 1 - s.player.orbitalCooldownTimer / orbitalSpecs.cooldownSeconds),
        comboCount: s.comboState.comboCount,
        comboMultiplier: s.comboState.comboMultiplier,
        overdriveCharge: Math.round(s.comboState.overdriveCharge),
        overdriveActive: s.comboState.overdriveActiveTimer > 0,
        overdriveRemainingSec: +s.comboState.overdriveActiveTimer.toFixed(1),
        bossActive: Boolean(activeBoss),
        bossName:
          activeBoss?.waveSpawned === 10
            ? 'OMEGA HIVE SOVEREIGN'
            : activeBoss
            ? 'TITAN SIEGE DREADNOUGHT'
            : '',
        bossHp: activeBoss ? Math.max(0, Math.round(activeBoss.hp)) : 0,
        bossMaxHp: activeBoss ? Math.round(activeBoss.maxHp) : 1,
        activeSkills: { ...s.skills },
      };
    };

    const executeCyberOverdrive = () => {
      const s = simRef.current;
      if (s.comboState.overdriveCharge < 100 && s.comboState.overdriveActiveTimer <= 0) {
        // Allow instant full charge if triggered from HUD action button
        s.comboState.overdriveCharge = 100;
      }
      s.comboState = activateCyberOverdrive(s.comboState);
      s.camera.trauma = Math.min(1, s.camera.trauma + 0.55);
      s.camera.empRingRadius = 15;
      s.camera.empRingAlpha = 0.95;
      soundEngine.playOverdriveActivate();
      spawnParticles(s.player.x, s.player.y, 32, '#F59E0B', 80, 290, 4.5, 0.55);
      spawnFloatingText(
        'CYBER OVERDRIVE ENGAGED! (2X FIRE RATE + MISSILES)',
        s.player.x,
        s.player.y - 38,
        '#F59E0B',
        1.35,
        1.15
      );
      callbacksRef.current.onHudUpdate(buildHudSnapshot());
    };

    const executeOrbitalStrike = (damageEnemyFn?: (e: EnemyEntity, d: number, h: boolean, a: number) => void) => {
      const s = simRef.current;
      if (s.player.orbitalCooldownTimer > 0) return;
      const specs = getOrbitalStrikeSpecs(s.progression.level, statsRef.current.damageMultiplier);
      s.player.orbitalCooldownTimer = specs.cooldownSeconds;
      s.camera.trauma = Math.min(1, s.camera.trauma + 0.65);
      s.hitstopTimer = 0.045;
      soundEngine.playOrbitalStrike();

      spawnFloatingText(
        'ORBITAL PLASMA BARRAGE!',
        s.player.x,
        s.player.y - 42,
        '#38BDF8',
        1.35,
        1.0
      );

      const liveEnemies = s.enemies.filter((e) => e.koTimer === 0);
      for (let i = 0; i < specs.pillarCount; i++) {
        let tx = s.player.x + Math.cos((i / specs.pillarCount) * Math.PI * 2) * 185;
        let ty = s.player.y + Math.sin((i / specs.pillarCount) * Math.PI * 2) * 185;
        if (i < liveEnemies.length) {
          tx = liveEnemies[i].x;
          ty = liveEnemies[i].y;
        }
        s.orbitalBeams.push({
          x: tx,
          y: ty,
          radius: specs.blastRadius,
          life: 0.45,
          maxLife: 0.45,
          color: i % 2 === 0 ? '#38BDF8' : '#F59E0B',
        });
        spawnParticles(tx, ty, 20, '#38BDF8', 70, 260, 4.5, 0.48);

        // Deal AoE pillar damage to enemies in blastRadius
        s.enemies.forEach((e) => {
          if (e.koTimer > 0) return;
          const dist = Math.hypot(e.x - tx, e.y - ty);
          if (dist <= specs.blastRadius + e.radius) {
            if (damageEnemyFn) {
              damageEnemyFn(e, specs.damagePerPillar, true, Math.atan2(e.y - ty, e.x - tx));
            } else {
              e.hp = Math.max(0, e.hp - specs.damagePerPillar);
              e.hitFlashTimer = 0.1;
              if (e.hp <= 0) {
                e.koTimer = e.maxKoTimer;
                s.progression.kills++;
              }
            }
          }
        });
      }
      callbacksRef.current.onHudUpdate(buildHudSnapshot());
    };

    const spawnSwarmWavelet = (count: number, includeElite = false, eliteCount = 1) => {
      const s = simRef.current;
      const waveInfo = getWaveFromTime(s.progression.elapsedSeconds);
      const kinds: ArchetypeKind[] = ['swarmer', 'kiter', 'charger', 'phalanx'];
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 310 + (i % 3) * 65;
        const isElite = includeElite && i < eliteCount;
        const kind: ArchetypeKind = isElite
          ? i % 2 === 0
            ? 'charger'
            : 'phalanx'
          : kinds[i % kinds.length];
        const baseHp = isElite ? 235 : kind === 'phalanx' ? 92 : kind === 'charger' ? 62 : 36;
        const baseSpd = isElite ? 152 : kind === 'charger' ? 136 : kind === 'kiter' ? 120 : 126;

        s.enemies.push({
          id: s.nextEnemyId++,
          kind,
          isElite,
          x: s.player.x + Math.cos(ang) * dist,
          y: s.player.y + Math.sin(ang) * dist,
          vx: 0,
          vy: 0,
          radius: isElite ? 24 : kind === 'phalanx' ? 19 : 14,
          hp: baseHp * waveInfo.enemyHpMultiplier,
          maxHp: baseHp * waveInfo.enemyHpMultiplier,
          speed: baseSpd * waveInfo.enemySpeedMultiplier,
          damage: Math.round((isElite ? 26 : 13) * waveInfo.enemyDamageMultiplier),
          facingAngle: ang + Math.PI,
          hitFlashTimer: 0,
          koTimer: 0,
          maxKoTimer: 0.28,
          state: 'SEEK',
          stateTimer: 0.7 + Math.random() * 0.8,
          telegraphAngle: 0,
          telegraphTargetX: 0,
          telegraphTargetY: 0,
          flankSign: i % 2 === 0 ? 1 : -1,
          waveSpawned: waveInfo.wave,
        });
      }
    };

    useImperativeHandle(ref, () => ({
      startNewRun: (stats: PlayerComputedStats) => {
        const s = simRef.current;
        s.player.x = 0;
        s.player.y = 0;
        s.player.vx = 0;
        s.player.vy = 0;
        s.player.maxHp = stats.maxHp;
        s.player.hp = stats.maxHp;
        s.player.trailingHp = stats.maxHp;
        s.player.maxShield = 50;
        s.player.shield = 50;
        s.player.invulnTimer = 1.2;
        s.player.hitFlashTimer = 0;
        s.player.muzzleFlashTimer = 0;
        s.player.dashTimer = 0;
        s.player.dashCooldownTimer = 0;
        s.player.orbitalCooldownTimer = 0;
        s.player.scaleX = 1;
        s.player.scaleY = 1;

        s.comboState = {
          comboCount: 0,
          comboTimer: 0,
          comboMultiplier: 1.0,
          overdriveCharge: 100,
          overdriveActiveTimer: 0,
        };

        s.skills = {
          plasma_repeater: 1,
          orbital_blades: 1,
          chain_tesla: 1,
          rail_mortar: 0,
          omega_singularity: stats.hasTrialLegendary ? 3 : 0,
          overclock_fire_rate: 0,
          nanite_hull_repair: 0,
          thruster_afterburner: 0,
        };

        s.progression = {
          xp: 0,
          xpToNext: xpRequiredForLevel(1),
          level: 1,
          elapsedSeconds: 0,
          lastLevelUpElapsedSeconds: 0,
          kills: 0,
          runGold: 0,
          runParts: 0,
          spawnedWave5Boss: false,
          spawnedWave10Boss: false,
          eliteSpawnTimer: 26,
          defeatPendingTimer: 0,
        };

        s.enemies = [];
        s.arcs = [];
        s.orbitalBeams = [];
        s.afterimages = [];
        s.projectiles.forEach((p) => (p.active = false));
        s.pickups.forEach((p) => (p.active = false));
        s.particles.forEach((p) => (p.active = false));
        s.floatingTexts.forEach((ft) => (ft.active = false));
        s.input.keysHeld.clear();
        s.input.justPressed.clear();
        s.input.pointerActive = false;
        s.camera.x = 0;
        s.camera.y = 0;
        s.camera.trauma = 0;

        // Seed 12 immediate action drones around the perimeter (no Elite at 0s)
        spawnSwarmWavelet(12, false);

        callbacksRef.current.onHudUpdate(buildHudSnapshot());
      },

      applyReviveEmp: () => {
        const s = simRef.current;
        s.player.hp = s.player.maxHp;
        s.player.trailingHp = s.player.maxHp;
        s.player.shield = s.player.maxShield;
        s.player.invulnTimer = 3.5;
        s.progression.defeatPendingTimer = 0;
        s.comboState.overdriveCharge = 100;
        s.comboState.overdriveActiveTimer = OVERDRIVE_DURATION_SECONDS;
        s.camera.empRingRadius = 10;
        s.camera.empRingAlpha = 1;
        s.camera.trauma = 0.75;
        s.hitstopTimer = 0.065;
        soundEngine.playEmpRevive();

        spawnFloatingText(
          'EMP NOVA + CYBER OVERDRIVE RESTORED!',
          s.player.x,
          s.player.y - 40,
          '#38BDF8',
          1.4,
          1.2
        );

        s.projectiles.forEach((p) => {
          if (p.isEnemy) p.active = false;
        });

        s.enemies.forEach((e) => {
          if (e.koTimer > 0) return;
          const dx = e.x - s.player.x;
          const dy = e.y - s.player.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 580) {
            if (e.kind === 'boss') {
              e.hp = Math.max(e.maxHp * 0.15, e.hp - 750);
              e.hitFlashTimer = 0.14;
            } else {
              e.hp = 0;
              e.koTimer = e.maxKoTimer;
              s.progression.kills++;
            }
            const pushAngle = Math.atan2(dy, dx);
            e.vx = Math.cos(pushAngle) * 440;
            e.vy = Math.sin(pushAngle) * 440;
            spawnParticles(e.x, e.y, 12, '#38BDF8', 70, 250, 4, 0.45);
          }
        });

        callbacksRef.current.onHudUpdate(buildHudSnapshot());
      },

      applySkillUpgrade: (skillId: SkillId, nextLevel: number) => {
        const s = simRef.current;
        s.skills[skillId] = nextLevel;
        if (skillId === 'nanite_hull_repair') {
          s.player.maxHp += 40;
          s.player.hp = Math.min(s.player.maxHp, s.player.hp + s.player.maxHp * 0.35);
          s.player.trailingHp = s.player.hp;
        }
        spawnParticles(s.player.x, s.player.y, 24, '#F59E0B', 60, 240, 4.5, 0.45);
        spawnFloatingText(`UPGRADED: ${skillId.toUpperCase()} LV.${nextLevel}`, s.player.x, s.player.y - 36, '#F59E0B', 1.25, 1.0);
        callbacksRef.current.onHudUpdate(buildHudSnapshot());
      },

      jumpToWave: (waveNumber: number) => {
        const s = simRef.current;
        const clampedWave = Math.max(1, Math.min(10, waveNumber));
        s.progression.elapsedSeconds = (clampedWave - 1) * 60 + 2;
        spawnSwarmWavelet(12, true);
        if (clampedWave === 5 && !s.progression.spawnedWave5Boss) {
          s.progression.spawnedWave5Boss = true;
          spawnBoss(5);
        } else if (clampedWave === 10 && !s.progression.spawnedWave10Boss) {
          s.progression.spawnedWave10Boss = true;
          spawnBoss(10);
        }
        callbacksRef.current.onHudUpdate(buildHudSnapshot());
      },

      triggerDash: () => {
        simRef.current.input.justPressed.add('Space');
      },

      triggerOverdrive: () => {
        executeCyberOverdrive();
      },

      triggerOrbitalStrike: () => {
        simRef.current.player.orbitalCooldownTimer = 0;
        executeOrbitalStrike();
      },

      triggerSwarmSurge: () => {
        const s = simRef.current;
        spawnSwarmWavelet(18, true);
        s.camera.trauma = Math.min(1, s.camera.trauma + 0.35);
        spawnFloatingText('SWARM FRENZY SURGE! (+18 HOSTILES)', s.player.x, s.player.y - 44, '#EF4444', 1.35, 1.1);
        soundEngine.playTelegraphWindup();
        callbacksRef.current.onHudUpdate(buildHudSnapshot());
      },

      spawnDemoBossChest: () => {
        const s = simRef.current;
        const waveInfo = getWaveFromTime(s.progression.elapsedSeconds);
        callbacksRef.current.onBossChestCollected(
          waveInfo.wave,
          waveInfo.wave >= 8 ? 'OMEGA HIVE SOVEREIGN' : 'TITAN SIEGE DREADNOUGHT'
        );
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const s = simRef.current;

      const updateBounds = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        s.canvasBounds = {
          left: rect.left,
          top: rect.top,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        };
      };
      updateBounds();
      const ro = new ResizeObserver(updateBounds);
      ro.observe(canvas);

      if (s.enemies.length === 0) {
        spawnSwarmWavelet(14, true);
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (!s.input.keysHeld.has(e.code)) {
          s.input.justPressed.add(e.code);
        }
        s.input.keysHeld.add(e.code);
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        s.input.keysHeld.delete(e.code);
      };

      const clearHeldInputs = () => {
        s.input.keysHeld.clear();
        s.input.justPressed.clear();
        s.input.pointerActive = false;
      };

      const handlePointerDown = (e: PointerEvent) => {
        if (gameStateRef.current !== 'playing') return;
        s.input.pointerActive = true;
        s.input.pointerOriginX = e.clientX;
        s.input.pointerOriginY = e.clientY;
        s.input.pointerCurrentX = e.clientX;
        s.input.pointerCurrentY = e.clientY;
      };

      const handlePointerMove = (e: PointerEvent) => {
        if (!s.input.pointerActive) return;
        s.input.pointerCurrentX = e.clientX;
        s.input.pointerCurrentY = e.clientY;
      };

      const handlePointerUp = () => {
        s.input.pointerActive = false;
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', clearHeldInputs);
      const handleVisChange = () => {
        if (document.hidden) clearHeldInputs();
      };
      document.addEventListener('visibilitychange', handleVisChange);

      canvas.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);

      let lastTime = performance.now();
      let hudEmitAccumulator = 0;
      let rafId = 0;

      const fireProjectile = (
        isEnemy: boolean,
        isLegendary: boolean,
        isMortar: boolean,
        isHomingMissile: boolean,
        x: number,
        y: number,
        angle: number,
        speed: number,
        damage: number,
        pierce: number,
        radius: number,
        life: number,
        color: string
      ) => {
        for (let i = 0; i < MAX_PROJECTILES; i++) {
          const p = s.projectiles[i];
          if (!p.active) {
            p.active = true;
            p.isEnemy = isEnemy;
            p.isLegendary = isLegendary;
            p.isMortar = isMortar;
            p.isHomingMissile = isHomingMissile;
            p.x = x;
            p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.damage = damage;
            p.pierceLeft = pierce;
            p.radius = radius;
            p.life = life;
            p.maxLife = life;
            p.color = color;
            return;
          }
        }
      };

      const damageEnemy = (enemy: EnemyEntity, baseDmg: number, isHeavy: boolean, pushAngle: number) => {
        if (enemy.koTimer > 0) return;

        const isOverdrive = s.comboState.overdriveActiveTimer > 0;
        const { finalDamage, isCrit } = computeCritHit(
          baseDmg,
          s.comboState.comboMultiplier,
          isOverdrive,
          Math.random()
        );

        let actualDmg = finalDamage;
        if (enemy.kind === 'phalanx') {
          const angleDiff = Math.abs(
            Math.atan2(
              Math.sin(pushAngle - enemy.facingAngle),
              Math.cos(pushAngle - enemy.facingAngle)
            )
          );
          if (angleDiff > Math.PI * 0.55) {
            actualDmg = Math.round(actualDmg * 0.45);
          }
        }

        enemy.hp -= actualDmg;
        enemy.hitFlashTimer = 0.06;
        const knockback = enemy.kind === 'boss' ? 28 : isHeavy || isCrit ? 165 : 85;
        enemy.vx += Math.cos(pushAngle) * knockback;
        enemy.vy += Math.sin(pushAngle) * knockback;

        // Spawn Floating Damage Text
        if (isCrit || isHeavy) {
          spawnFloatingText(
            isCrit ? `CRIT! ${actualDmg}` : `${actualDmg}`,
            enemy.x,
            enemy.y - enemy.radius,
            isCrit ? '#FDE047' : '#38BDF8',
            isCrit ? 1.22 : 1.0,
            0.55
          );
        } else if (Math.random() < 0.45) {
          spawnFloatingText(`${actualDmg}`, enemy.x, enemy.y - enemy.radius, '#E2E8F0', 0.88, 0.42);
        }

        if (enemy.hp <= 0) {
          enemy.hp = 0;
          enemy.koTimer = enemy.maxKoTimer;
          s.progression.kills++;

          // Register Kill Streak Combo & Overdrive Charge
          s.comboState = registerKillCombo(s.comboState, enemy.isElite || enemy.kind === 'boss');
          if (s.comboState.comboCount > 0 && s.comboState.comboCount % 10 === 0) {
            spawnFloatingText(
              `${s.comboState.comboCount}X KILL STREAK! (${s.comboState.comboMultiplier}x)`,
              s.player.x,
              s.player.y - 34,
              '#F59E0B',
              1.28,
              0.95
            );
          }

          const goldMult = isOverdrive ? 1.5 : 1.0;
          s.progression.runGold += Math.round(
            (enemy.kind === 'boss' ? 240 : enemy.isElite ? 45 : enemy.kind === 'phalanx' ? 15 : 8) *
              goldMult
          );
          if (enemy.isElite || enemy.kind === 'phalanx' || enemy.kind === 'charger') {
            if (Math.random() < (enemy.isElite ? 1.0 : 0.38)) s.progression.runParts += 1;
          }

          if (enemy.kind === 'boss') {
            s.hitstopTimer = 0.08;
            s.camera.trauma = Math.min(1, s.camera.trauma + 0.75);
            spawnParticles(enemy.x, enemy.y, 36, '#F59E0B', 80, 340, 5.5, 0.65);
            soundEngine.playEnemyHit(true);
            spawnPickup(
              'BOSS_CHEST',
              enemy.x,
              enemy.y,
              1,
              enemy.waveSpawned,
              enemy.waveSpawned === 10 ? 'OMEGA HIVE SOVEREIGN' : 'TITAN SIEGE DREADNOUGHT'
            );
          } else {
            if (isHeavy || isCrit || enemy.isElite) {
              s.hitstopTimer = Math.max(s.hitstopTimer, 0.032);
              s.camera.trauma = Math.min(1, s.camera.trauma + (enemy.isElite ? 0.28 : 0.14));
            }
            spawnParticles(
              enemy.x,
              enemy.y,
              enemy.isElite ? 22 : isHeavy ? 14 : 8,
              enemy.isElite
                ? '#FDE047'
                : enemy.kind === 'kiter'
                ? '#A855F7'
                : enemy.kind === 'charger'
                ? '#F59E0B'
                : '#EF4444',
              55,
              230,
              enemy.isElite ? 4.5 : 3.5,
              0.4
            );
            soundEngine.playEnemyHit(isHeavy || isCrit);
            const xpVal = enemy.isElite
              ? 32
              : enemy.kind === 'phalanx'
              ? 15
              : enemy.kind === 'charger'
              ? 12
              : 8;
            spawnPickup('XP', enemy.x, enemy.y, xpVal, enemy.waveSpawned);
            if (enemy.isElite || Math.random() < 0.14) {
              spawnPickup('HP_CELL', enemy.x + 12, enemy.y - 8, 30, enemy.waveSpawned);
            }
          }
        } else {
          spawnParticles(enemy.x, enemy.y, 4, '#38BDF8', 40, 140, 2.5, 0.22);
        }
      };

      const stepSimulation = (rawDt: number) => {
        const dt = Math.min(rawDt, 0.05);
        const state = gameStateRef.current;

        s.camera.trauma = Math.max(0, s.camera.trauma - dt * 1.85);
        if (s.camera.empRingAlpha > 0) {
          s.camera.empRingRadius += dt * 1050;
          s.camera.empRingAlpha = Math.max(0, s.camera.empRingAlpha - dt * 1.6);
        }

        s.player.scaleX += (1 - s.player.scaleX) * Math.min(1, dt * 14);
        s.player.scaleY += (1 - s.player.scaleY) * Math.min(1, dt * 14);
        if (s.player.muzzleFlashTimer > 0) {
          s.player.muzzleFlashTimer = Math.max(0, s.player.muzzleFlashTimer - dt);
        }

        if (s.player.trailingHp > s.player.hp) {
          s.player.trailingHp = Math.max(
            s.player.hp,
            s.player.trailingHp - (s.player.trailingHp - s.player.hp) * dt * 3.8 - 8 * dt
          );
        } else {
          s.player.trailingHp = s.player.hp;
        }

        // Update Floating Combat Texts even during hitstop
        for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
          const ft = s.floatingTexts[i];
          if (!ft.active) continue;
          ft.y += ft.vy * dt;
          ft.vy *= 0.92;
          ft.life -= dt;
          if (ft.life <= 0) ft.active = false;
        }

        // Update Orbital Beams
        for (let i = s.orbitalBeams.length - 1; i >= 0; i--) {
          s.orbitalBeams[i].life -= dt;
          if (s.orbitalBeams[i].life <= 0) s.orbitalBeams.splice(i, 1);
        }

        // Update Mech Afterimages
        for (let i = s.afterimages.length - 1; i >= 0; i--) {
          s.afterimages[i].alpha -= dt * 2.8;
          if (s.afterimages[i].alpha <= 0) s.afterimages.splice(i, 1);
        }

        if (state === 'title') {
          s.camera.titleOrbitAngle += dt * 0.35;
          s.camera.x = Math.cos(s.camera.titleOrbitAngle) * 90;
          s.camera.y = Math.sin(s.camera.titleOrbitAngle * 0.7) * 55;
          s.weaponTimers.orbitalAngle += dt * 3.2;
          s.enemies.forEach((e, idx) => {
            const orbit = s.camera.titleOrbitAngle * 0.9 + (idx / s.enemies.length) * Math.PI * 2;
            const targetX = Math.cos(orbit) * (230 + (idx % 3) * 65);
            const targetY = Math.sin(orbit) * (230 + (idx % 3) * 65);
            e.x += (targetX - e.x) * dt * 2;
            e.y += (targetY - e.y) * dt * 2;
            e.facingAngle = Math.atan2(s.player.y - e.y, s.player.x - e.x);
          });
          return;
        }

        if (state !== 'playing') {
          return;
        }

        if (s.hitstopTimer > 0) {
          s.hitstopTimer = Math.max(0, s.hitstopTimer - dt);
          return;
        }

        const simDt = dt * timeScaleRef.current;
        const stats = statsRef.current;

        if (s.progression.defeatPendingTimer > 0) {
          s.progression.defeatPendingTimer -= dt;
          if (s.progression.defeatPendingTimer <= 0) {
            s.progression.defeatPendingTimer = 0;
            callbacksRef.current.onPlayerDefeated(buildHudSnapshot());
          }
          return;
        }

        // Combo & Overdrive timers
        if (s.comboState.comboTimer > 0) {
          s.comboState.comboTimer = Math.max(0, s.comboState.comboTimer - simDt);
          if (s.comboState.comboTimer <= 0) {
            s.comboState.comboCount = 0;
            s.comboState.comboMultiplier = 1.0;
          }
        }
        if (s.comboState.overdriveActiveTimer > 0) {
          s.comboState.overdriveActiveTimer = Math.max(0, s.comboState.overdriveActiveTimer - simDt);
        }

        s.progression.elapsedSeconds += simDt;
        if (s.progression.elapsedSeconds >= TOTAL_SURVIVAL_SECONDS) {
          s.progression.elapsedSeconds = TOTAL_SURVIVAL_SECONDS;
          callbacksRef.current.onPlayerVictory(buildHudSnapshot());
          return;
        }

        const waveInfo = getWaveFromTime(s.progression.elapsedSeconds);
        if (waveInfo.wave === 5 && !s.progression.spawnedWave5Boss) {
          s.progression.spawnedWave5Boss = true;
          spawnBoss(5);
        }
        if (waveInfo.wave === 10 && !s.progression.spawnedWave10Boss) {
          s.progression.spawnedWave10Boss = true;
          spawnBoss(10);
        }

        // Periodic Elite Cyber-Stalker Mini-Boss Squad (accelerates as time progresses)
        s.progression.eliteSpawnTimer -= simDt;
        if (s.progression.eliteSpawnTimer <= 0) {
          s.progression.eliteSpawnTimer = waveInfo.eliteSpawnIntervalSec;
          spawnSwarmWavelet(4 + waveInfo.eliteSquadCount, true, waveInfo.eliteSquadCount);
          spawnFloatingText(
            waveInfo.eliteSquadCount > 1
              ? `ELITE CYBER-STALKER PACK (${waveInfo.eliteSquadCount}X ELITES)!`
              : 'ELITE CYBER-STALKER SQUAD DETECTED!',
            s.player.x,
            s.player.y - 42,
            '#F59E0B',
            1.22,
            1.0
          );
        }

        // Passive HP & Shield regen
        s.player.hp = Math.min(s.player.maxHp, s.player.hp + stats.hpRegenPerSec * simDt);
        if (s.player.shieldRegenDelay > 0) {
          s.player.shieldRegenDelay = Math.max(0, s.player.shieldRegenDelay - simDt);
        } else {
          s.player.shield = Math.min(s.player.maxShield, s.player.shield + 7.5 * simDt);
        }

        if (s.player.invulnTimer > 0) s.player.invulnTimer = Math.max(0, s.player.invulnTimer - simDt);
        if (s.player.hitFlashTimer > 0) s.player.hitFlashTimer = Math.max(0, s.player.hitFlashTimer - simDt);
        if (s.player.dashCooldownTimer > 0) {
          s.player.dashCooldownTimer = Math.max(0, s.player.dashCooldownTimer - simDt);
        }
        if (s.player.orbitalCooldownTimer > 0) {
          s.player.orbitalCooldownTimer = Math.max(0, s.player.orbitalCooldownTimer - simDt);
        }
        if (s.player.dashBufferTimer > 0) {
          s.player.dashBufferTimer = Math.max(0, s.player.dashBufferTimer - simDt);
        }

        // Check One-Shot Edge Inputs: Dash [Space/Shift], Overdrive [E], Orbital Strike [Q]
        if (
          s.input.justPressed.has('Space') ||
          s.input.justPressed.has('ShiftLeft') ||
          s.input.justPressed.has('ShiftRight')
        ) {
          s.player.dashBufferTimer = 0.12;
        }
        if (s.input.justPressed.has('KeyE')) {
          executeCyberOverdrive();
        }
        if (s.input.justPressed.has('KeyQ')) {
          executeOrbitalStrike(damageEnemy);
        }
        s.input.justPressed.clear();

        let moveX = 0;
        let moveY = 0;
        const keys = s.input.keysHeld;
        if (keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;

        if (s.input.pointerActive) {
          const dx = s.input.pointerCurrentX - s.input.pointerOriginX;
          const dy = s.input.pointerCurrentY - s.input.pointerOriginY;
          const dist = Math.hypot(dx, dy);
          if (dist > 8) {
            moveX = dx / dist;
            moveY = dy / dist;
          }
        }

        const moveLen = Math.hypot(moveX, moveY);
        if (moveLen > 0.001) {
          moveX /= moveLen;
          moveY /= moveLen;
          s.player.facingAngle = Math.atan2(moveY, moveX);
        }

        const isOverdrive = s.comboState.overdriveActiveTimer > 0;

        if (s.player.dashBufferTimer > 0 && s.player.dashCooldownTimer <= 0) {
          s.player.dashBufferTimer = 0;
          s.player.dashTimer = 0.2;
          s.player.dashCooldownTimer = stats.dashCooldown * (isOverdrive ? 0.6 : 1);
          s.player.invulnTimer = Math.max(s.player.invulnTimer, 0.28);
          s.player.scaleX = 1.26;
          s.player.scaleY = 0.76;
          const dashAngle = moveLen > 0.01 ? Math.atan2(moveY, moveX) : s.player.facingAngle;
          s.player.vx = Math.cos(dashAngle) * 740;
          s.player.vy = Math.sin(dashAngle) * 740;
          spawnParticles(s.player.x, s.player.y, 16, '#38BDF8', 70, 220, 4, 0.32);
          soundEngine.playPickup();
        }

        const speedBoost =
          (1 + (s.skills.thruster_afterburner || 0) * 0.12) * (isOverdrive ? 1.35 : 1.0);
        const effectiveSpeed = stats.moveSpeed * speedBoost;

        if (s.player.dashTimer > 0) {
          s.player.dashTimer -= simDt;
          s.player.x += s.player.vx * simDt;
          s.player.y += s.player.vy * simDt;
        } else {
          const targetVx = moveX * effectiveSpeed;
          const targetVy = moveY * effectiveSpeed;
          s.player.vx += (targetVx - s.player.vx) * Math.min(1, simDt * 14);
          s.player.vy += (targetVy - s.player.vy) * Math.min(1, simDt * 14);
          s.player.x += s.player.vx * simDt;
          s.player.y += s.player.vy * simDt;
        }

        // Spawn Mech Afterimages during Dash or Cyber Overdrive
        if (s.player.dashTimer > 0 || isOverdrive) {
          s.player.afterimageTimer -= simDt;
          if (s.player.afterimageTimer <= 0) {
            s.player.afterimageTimer = 0.045;
            s.afterimages.push({
              x: s.player.x,
              y: s.player.y,
              angle: s.player.facingAngle,
              alpha: 0.55,
              color: isOverdrive ? '#F59E0B' : '#38BDF8',
            });
          }
        }

        const stepDist = Math.hypot(s.player.vx, s.player.vy) * simDt;
        s.player.walkBobDistance += stepDist * 0.08;

        s.player.x = Math.max(-ARENA_HALF_SIZE, Math.min(ARENA_HALF_SIZE, s.player.x));
        s.player.y = Math.max(-ARENA_HALF_SIZE, Math.min(ARENA_HALF_SIZE, s.player.y));

        s.camera.x += (s.player.x - s.camera.x) * Math.min(1, simDt * 9);
        s.camera.y += (s.player.y - s.camera.y) * Math.min(1, simDt * 9);

        // Find nearest live enemy for auto-targeting plasma hardpoints
        let nearestEnemy: EnemyEntity | null = null;
        let nearestDist = Infinity;
        for (let i = 0; i < s.enemies.length; i++) {
          const e = s.enemies[i];
          if (e.koTimer > 0) continue;
          const d = Math.hypot(e.x - s.player.x, e.y - s.player.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestEnemy = e;
          }
        }
        s.lockedTargetId = nearestEnemy ? nearestEnemy.id : -1;

        const fireRateMult =
          (1 + (s.skills.overclock_fire_rate || 0) * 0.18) * (isOverdrive ? 2.0 : 1.0);
        const dmgMult = stats.damageMultiplier;

        // 1. Twin Plasma Repeater (Rapid multi-bolt barrage)
        s.weaponTimers.repeater -= simDt * fireRateMult;
        if (s.weaponTimers.repeater <= 0 && nearestEnemy && nearestDist < 660) {
          const lvl = s.skills.plasma_repeater || 1;
          s.weaponTimers.repeater = Math.max(0.11, 0.26 - (lvl - 1) * 0.032);
          const aimAngle = Math.atan2(nearestEnemy.y - s.player.y, nearestEnemy.x - s.player.x);
          s.player.facingAngle = aimAngle;
          s.player.muzzleFlashTimer = 0.05;
          const boltCount = isOverdrive ? 4 : lvl >= 3 ? 3 : 2;
          for (let b = 0; b < boltCount; b++) {
            const spread = (b - (boltCount - 1) / 2) * 0.1;
            fireProjectile(
              false,
              false,
              false,
              false,
              s.player.x + Math.cos(aimAngle + spread) * 20,
              s.player.y + Math.sin(aimAngle + spread) * 20,
              aimAngle + spread,
              720,
              (22 + lvl * 7) * dmgMult,
              lvl >= 2 ? 1 : 0,
              5.5,
              1.1,
              isOverdrive ? '#FDE047' : '#38BDF8'
            );
          }
          soundEngine.playPlasmaShot(false);
        }

        // 2. Homing Micro-Missile Swarm Pod (Fires rapidly in Overdrive or every 1.4s baseline)
        s.weaponTimers.homingPod -= simDt * (isOverdrive ? 2.6 : 1.0);
        if (s.weaponTimers.homingPod <= 0 && nearestEnemy && nearestDist < 700) {
          s.weaponTimers.homingPod = 1.25;
          const missileCount = isOverdrive ? 4 : 2;
          for (let m = 0; m < missileCount; m++) {
            const launchAng = s.player.facingAngle + (m % 2 === 0 ? -0.65 : 0.65) + (m * 0.15);
            fireProjectile(
              false,
              false,
              false,
              true,
              s.player.x,
              s.player.y,
              launchAng,
              460,
              34 * dmgMult,
              0,
              6.5,
              1.9,
              '#F59E0B'
            );
          }
        }

        // 3. OMEGA Singularity Cannon (Trial Legendary Weapon or Upgraded)
        if ((s.skills.omega_singularity || 0) > 0) {
          s.weaponTimers.omega -= simDt * fireRateMult;
          if (s.weaponTimers.omega <= 0 && nearestEnemy && nearestDist < 750) {
            const lvl = s.skills.omega_singularity;
            s.weaponTimers.omega = Math.max(0.45, 0.88 - (lvl - 1) * 0.09);
            const aimAngle = Math.atan2(nearestEnemy.y - s.player.y, nearestEnemy.x - s.player.x);
            fireProjectile(
              false,
              true,
              false,
              false,
              s.player.x + Math.cos(aimAngle) * 22,
              s.player.y + Math.sin(aimAngle) * 22,
              aimAngle,
              800,
              (68 + lvl * 24) * dmgMult,
              6,
              12,
              1.35,
              '#F59E0B'
            );
            s.player.scaleX = 0.86;
            s.player.scaleY = 1.15;
            soundEngine.playPlasmaShot(true);
          }
        }

        // 4. Chain Arc Tesla
        if ((s.skills.chain_tesla || 0) > 0) {
          s.weaponTimers.tesla -= simDt * fireRateMult;
          if (s.weaponTimers.tesla <= 0 && nearestEnemy && nearestDist < 460) {
            const lvl = s.skills.chain_tesla;
            s.weaponTimers.tesla = Math.max(0.55, 1.1 - (lvl - 1) * 0.11);
            const maxTargets = 3 + lvl;
            const hitTargets = s.enemies
              .filter((e) => e.koTimer === 0 && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 460)
              .slice(0, maxTargets);
            let prevX = s.player.x;
            let prevY = s.player.y;
            hitTargets.forEach((target) => {
              s.arcs.push({
                x1: prevX,
                y1: prevY,
                x2: target.x,
                y2: target.y,
                life: 0.2,
                color: '#A855F7',
              });
              damageEnemy(
                target,
                (28 + lvl * 10) * dmgMult,
                false,
                Math.atan2(target.y - prevY, target.x - prevX)
              );
              prevX = target.x;
              prevY = target.y;
            });
          }
        }

        // 5. Thermal Rail Mortar
        if ((s.skills.rail_mortar || 0) > 0) {
          s.weaponTimers.mortar -= simDt * fireRateMult;
          if (s.weaponTimers.mortar <= 0 && nearestEnemy && nearestDist < 620) {
            const lvl = s.skills.rail_mortar;
            s.weaponTimers.mortar = Math.max(0.8, 1.5 - (lvl - 1) * 0.14);
            const aimAngle = Math.atan2(nearestEnemy.y - s.player.y, nearestEnemy.x - s.player.x);
            fireProjectile(
              false,
              false,
              true,
              false,
              s.player.x,
              s.player.y,
              aimAngle,
              480,
              (55 + lvl * 18) * dmgMult,
              0,
              9,
              1.2,
              '#EF4444'
            );
          }
        }

        // 6. Orbital Ion Blades
        const orbitalLvl = s.skills.orbital_blades || 0;
        if (orbitalLvl > 0) {
          s.weaponTimers.orbitalAngle += simDt * (3.8 + orbitalLvl * 0.45) * (isOverdrive ? 1.5 : 1.0);
          const bladeCount = Math.min(6, 2 + orbitalLvl);
          const orbitRadius = 72 + orbitalLvl * 6;
          for (let b = 0; b < bladeCount; b++) {
            const ang = s.weaponTimers.orbitalAngle + (b / bladeCount) * Math.PI * 2;
            const bx = s.player.x + Math.cos(ang) * orbitRadius;
            const by = s.player.y + Math.sin(ang) * orbitRadius;
            for (let i = 0; i < s.enemies.length; i++) {
              const e = s.enemies[i];
              if (e.koTimer > 0 || e.hitFlashTimer > 0) continue;
              if (Math.hypot(e.x - bx, e.y - by) < e.radius + 15) {
                damageEnemy(e, (18 + orbitalLvl * 6) * dmgMult, false, ang);
              }
            }
          }
        }

        // High-Action Continuous Swarm Spawner (scales batch count & stats with time)
        s.spawnTimer -= simDt;
        if (s.spawnTimer <= 0 && s.enemies.length < waveInfo.maxActiveEnemies) {
          s.spawnTimer = waveInfo.spawnIntervalSec;
          const spawnCount = waveInfo.spawnBatchCount;
          for (let c = 0; c < spawnCount; c++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 410 + Math.random() * 125;
            const roll = Math.random();
            const w = waveInfo.archetypeWeights;
            let kind: ArchetypeKind = 'swarmer';
            if (roll > w.swarmer + w.kiter + w.charger && w.phalanx > 0) {
              kind = 'phalanx';
            } else if (roll > w.swarmer + w.kiter && w.charger > 0) {
              kind = 'charger';
            } else if (roll > w.swarmer && w.kiter > 0) {
              kind = 'kiter';
            }

            const baseHp =
              kind === 'phalanx' ? 95 : kind === 'charger' ? 62 : kind === 'kiter' ? 42 : 34;
            const baseSpd =
              kind === 'charger' ? 136 : kind === 'kiter' ? 118 : kind === 'phalanx' ? 84 : 126;

            s.enemies.push({
              id: s.nextEnemyId++,
              kind,
              isElite: false,
              x: s.player.x + Math.cos(ang) * dist,
              y: s.player.y + Math.sin(ang) * dist,
              vx: 0,
              vy: 0,
              radius: kind === 'phalanx' ? 20 : kind === 'charger' ? 16 : 14,
              hp: baseHp * waveInfo.enemyHpMultiplier,
              maxHp: baseHp * waveInfo.enemyHpMultiplier,
              speed: baseSpd * waveInfo.enemySpeedMultiplier,
              damage: Math.round(
                (kind === 'charger' ? 24 : kind === 'phalanx' ? 19 : 13) *
                  waveInfo.enemyDamageMultiplier
              ),
              facingAngle: ang + Math.PI,
              hitFlashTimer: 0,
              koTimer: 0,
              maxKoTimer: 0.28,
              state: 'SEEK',
              stateTimer: Math.max(0.45, 0.95 - (waveInfo.wave - 1) * 0.04 + Math.random() * 0.8),
              telegraphAngle: 0,
              telegraphTargetX: 0,
              telegraphTargetY: 0,
              flankSign: Math.random() < 0.5 ? 1 : -1,
              waveSpawned: waveInfo.wave,
            });
          }
        }

        // Update Enemies with Escalating Crowd Attack Token Pool
        let activeAttackTokens = s.enemies.filter(
          (e) => e.koTimer === 0 && (e.state === 'WINDUP' || e.state === 'CHARGE')
        ).length;
        const maxAttackTokens = waveInfo.maxAttackTokens;

        for (let i = s.enemies.length - 1; i >= 0; i--) {
          const e = s.enemies[i];
          if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - simDt);

          if (e.koTimer > 0) {
            e.koTimer -= simDt;
            e.x += e.vx * simDt;
            e.y += e.vy * simDt;
            e.vx *= 0.88;
            e.vy *= 0.88;
            if (e.koTimer <= 0) {
              s.enemies.splice(i, 1);
            }
            continue;
          }

          const dx = s.player.x - e.x;
          const dy = s.player.y - e.y;
          const dist = Math.hypot(dx, dy) || 1;
          const toPlayerAngle = Math.atan2(dy, dx);

          if (e.kind === 'swarmer') {
            const flankAngle =
              toPlayerAngle + Math.sin(s.progression.elapsedSeconds * 3.4 + e.id) * 0.42 * e.flankSign;
            e.facingAngle = toPlayerAngle;
            e.vx += (Math.cos(flankAngle) * e.speed - e.vx) * Math.min(1, simDt * 8);
            e.vy += (Math.sin(flankAngle) * e.speed - e.vy) * Math.min(1, simDt * 8);
          } else if (e.kind === 'kiter') {
            e.facingAngle = toPlayerAngle;
            const desiredDist = 230;
            let radial = 0;
            if (dist > desiredDist + 35) radial = 1;
            else if (dist < desiredDist - 35) radial = -0.85;
            const strafeAngle = toPlayerAngle + Math.PI * 0.5 * e.flankSign;
            const moveDirX = Math.cos(toPlayerAngle) * radial + Math.cos(strafeAngle) * 0.85;
            const moveDirY = Math.sin(toPlayerAngle) * radial + Math.sin(strafeAngle) * 0.85;
            e.vx += (moveDirX * e.speed - e.vx) * Math.min(1, simDt * 7);
            e.vy += (moveDirY * e.speed - e.vy) * Math.min(1, simDt * 7);

            e.stateTimer -= simDt;
            if (
              e.state === 'SEEK' &&
              e.stateTimer <= 0 &&
              dist < 400 &&
              activeAttackTokens < maxAttackTokens
            ) {
              e.state = 'WINDUP';
              e.stateTimer = Math.max(0.28, 0.42 - (waveInfo.wave - 1) * 0.015);
              e.telegraphAngle = toPlayerAngle;
              activeAttackTokens++;
            } else if (e.state === 'WINDUP') {
              e.telegraphAngle = toPlayerAngle;
              if (e.stateTimer <= 0) {
                const volleyCount = waveInfo.wave >= 6 ? 3 : 1;
                for (let v = 0; v < volleyCount; v++) {
                  const spread = (v - (volleyCount - 1) / 2) * 0.18;
                  fireProjectile(
                    true,
                    false,
                    false,
                    false,
                    e.x,
                    e.y,
                    e.telegraphAngle + spread,
                    340 + waveInfo.wave * 10,
                    e.damage,
                    0,
                    5.5,
                    1.8,
                    '#A855F7'
                  );
                }
                e.state = 'SEEK';
                e.stateTimer = Math.max(1.15, 1.9 - (waveInfo.wave - 1) * 0.075);
              }
            }
          } else if (e.kind === 'charger') {
            if (e.state === 'SEEK') {
              e.facingAngle = toPlayerAngle;
              e.vx += (Math.cos(toPlayerAngle) * e.speed - e.vx) * Math.min(1, simDt * 6);
              e.vy += (Math.sin(toPlayerAngle) * e.speed - e.vy) * Math.min(1, simDt * 6);
              e.stateTimer -= simDt;
              if (e.stateTimer <= 0 && dist < 320 && activeAttackTokens < maxAttackTokens) {
                e.state = 'WINDUP';
                e.stateTimer = Math.max(0.36, 0.52 - (waveInfo.wave - 1) * 0.016);
                e.telegraphAngle = toPlayerAngle;
                e.vx = 0;
                e.vy = 0;
                activeAttackTokens++;
                soundEngine.playTelegraphWindup();
              }
            } else if (e.state === 'WINDUP') {
              e.vx *= 0.8;
              e.vy *= 0.8;
              e.stateTimer -= simDt;
              if (e.stateTimer <= 0) {
                e.state = 'CHARGE';
                e.stateTimer = 0.4;
                e.vx = Math.cos(e.telegraphAngle) * (e.speed * 3.35);
                e.vy = Math.sin(e.telegraphAngle) * (e.speed * 3.35);
              }
            } else if (e.state === 'CHARGE') {
              e.stateTimer -= simDt;
              if (e.stateTimer <= 0) {
                e.state = 'SEEK';
                e.stateTimer = Math.max(1.0, 1.6 - (waveInfo.wave - 1) * 0.06);
              }
            }
          } else if (e.kind === 'phalanx') {
            const turnSpeed = (2.6 + waveInfo.wave * 0.12) * simDt;
            const diff = Math.atan2(
              Math.sin(toPlayerAngle - e.facingAngle),
              Math.cos(toPlayerAngle - e.facingAngle)
            );
            e.facingAngle += Math.max(-turnSpeed, Math.min(turnSpeed, diff));
            e.vx += (Math.cos(e.facingAngle) * e.speed - e.vx) * Math.min(1, simDt * 5);
            e.vy += (Math.sin(e.facingAngle) * e.speed - e.vy) * Math.min(1, simDt * 5);
          } else if (e.kind === 'boss') {
            const isEnraged = e.hp < e.maxHp * 0.5;
            const bossMoveSpeed = e.speed * (isEnraged ? 1.28 : 1.0);
            e.facingAngle = toPlayerAngle;
            if (e.state === 'SEEK') {
              e.vx += (Math.cos(toPlayerAngle) * bossMoveSpeed - e.vx) * Math.min(1, simDt * 4.5);
              e.vy += (Math.sin(toPlayerAngle) * bossMoveSpeed - e.vy) * Math.min(1, simDt * 4.5);
              e.stateTimer -= simDt;
              if (e.stateTimer <= 0) {
                e.state = 'WINDUP';
                e.stateTimer = isEnraged ? 0.48 : 0.62;
                e.telegraphAngle = toPlayerAngle;
                e.telegraphTargetX = s.player.x;
                e.telegraphTargetY = s.player.y;
                e.vx = 0;
                e.vy = 0;
                soundEngine.playTelegraphWindup();
              }
            } else if (e.state === 'WINDUP') {
              e.stateTimer -= simDt;
              if (e.stateTimer <= 0) {
                const spokes = e.waveSpawned >= 10 ? (isEnraged ? 18 : 14) : isEnraged ? 14 : 11;
                for (let k = 0; k < spokes; k++) {
                  const ang = e.telegraphAngle + (k / spokes) * Math.PI * 2;
                  fireProjectile(
                    true,
                    false,
                    false,
                    false,
                    e.x,
                    e.y,
                    ang,
                    isEnraged ? 345 : 305,
                    e.damage * 0.8,
                    0,
                    7,
                    2.2,
                    '#EF4444'
                  );
                }
                e.vx = Math.cos(e.telegraphAngle) * (isEnraged ? 350 : 295);
                e.vy = Math.sin(e.telegraphAngle) * (isEnraged ? 350 : 295);
                e.state = 'CHARGE';
                e.stateTimer = 0.48;
              }
            } else if (e.state === 'CHARGE') {
              e.stateTimer -= simDt;
              if (e.stateTimer <= 0) {
                e.state = 'SEEK';
                e.stateTimer = isEnraged ? 1.35 : 1.9;
              }
            }
          }

          e.x += e.vx * simDt;
          e.y += e.vy * simDt;

          if (dist < e.radius + s.player.radius - 2 && s.player.invulnTimer <= 0) {
            s.player.invulnTimer = 0.48;
            s.player.hitFlashTimer = 0.12;
            s.player.shieldRegenDelay = 3.2;
            s.camera.trauma = Math.min(1, s.camera.trauma + 0.38);
            soundEngine.playPlayerHurt();

            let incoming = e.damage;
            if (s.player.shield > 0) {
              const absorbed = Math.min(s.player.shield, incoming);
              s.player.shield -= absorbed;
              incoming -= absorbed;
            }
            s.player.hp = Math.max(0, s.player.hp - incoming);
            spawnParticles(s.player.x, s.player.y, 14, '#EF4444', 60, 210, 4, 0.35);

            if (s.player.hp <= 0 && s.progression.defeatPendingTimer <= 0) {
              s.progression.defeatPendingTimer = 0.45;
              s.hitstopTimer = 0.06;
            }
          }
        }

        // Update Projectiles (including Homing Micro-Missiles)
        for (let i = 0; i < MAX_PROJECTILES; i++) {
          const p = s.projectiles[i];
          if (!p.active) continue;

          if (p.isHomingMissile && nearestEnemy) {
            const desiredAngle = Math.atan2(nearestEnemy.y - p.y, nearestEnemy.x - p.x);
            const curAngle = Math.atan2(p.vy, p.vx);
            const spd = Math.hypot(p.vx, p.vy) || 460;
            const diff = Math.atan2(Math.sin(desiredAngle - curAngle), Math.cos(desiredAngle - curAngle));
            const nextAngle = curAngle + Math.max(-7.5 * simDt, Math.min(7.5 * simDt, diff));
            p.vx = Math.cos(nextAngle) * (spd + 180 * simDt);
            p.vy = Math.sin(nextAngle) * (spd + 180 * simDt);
            if (Math.random() < 0.5) {
              spawnParticles(p.x, p.y, 1, '#F59E0B', 10, 35, 2.2, 0.16);
            }
          }

          p.x += p.vx * simDt;
          p.y += p.vy * simDt;
          p.life -= simDt;
          if (p.life <= 0) {
            p.active = false;
            continue;
          }

          if (p.isEnemy) {
            const distToPlayer = Math.hypot(p.x - s.player.x, p.y - s.player.y);
            if (distToPlayer < p.radius + s.player.radius - 2 && s.player.invulnTimer <= 0) {
              p.active = false;
              s.player.invulnTimer = 0.42;
              s.player.hitFlashTimer = 0.1;
              s.player.shieldRegenDelay = 3.0;
              s.camera.trauma = Math.min(1, s.camera.trauma + 0.3);
              soundEngine.playPlayerHurt();

              let incoming = p.damage;
              if (s.player.shield > 0) {
                const absorbed = Math.min(s.player.shield, incoming);
                s.player.shield -= absorbed;
                incoming -= absorbed;
              }
              s.player.hp = Math.max(0, s.player.hp - incoming);
              if (s.player.hp <= 0 && s.progression.defeatPendingTimer <= 0) {
                s.progression.defeatPendingTimer = 0.45;
              }
            }
          } else {
            for (let j = 0; j < s.enemies.length; j++) {
              const e = s.enemies[j];
              if (e.koTimer > 0) continue;
              if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) {
                const hitAngle = Math.atan2(p.vy, p.vx);
                if (p.isMortar) {
                  s.enemies.forEach((other) => {
                    if (other.koTimer === 0 && Math.hypot(other.x - p.x, other.y - p.y) < 105) {
                      damageEnemy(other, p.damage, true, hitAngle);
                    }
                  });
                  spawnParticles(p.x, p.y, 20, '#EF4444', 60, 250, 4.5, 0.42);
                  p.active = false;
                  break;
                } else {
                  damageEnemy(e, p.damage, p.isLegendary || p.isHomingMissile, hitAngle);
                  if (p.pierceLeft > 0) {
                    p.pierceLeft--;
                  } else {
                    p.active = false;
                    break;
                  }
                }
              }
            }
          }
        }

        // Update Pickups
        const pickupRadius = stats.magnetRadius * (1 + (s.skills.thruster_afterburner || 0) * 0.12);
        for (let i = 0; i < MAX_PICKUPS; i++) {
          const pk = s.pickups[i];
          if (!pk.active) continue;
          pk.pulsePhase += simDt * 5;
          const dx = s.player.x - pk.x;
          const dy = s.player.y - pk.y;
          const dist = Math.hypot(dx, dy);

          if (dist < (pk.kind === 'BOSS_CHEST' ? pickupRadius * 1.5 : pickupRadius)) {
            pk.magnetized = true;
          }

          if (pk.magnetized) {
            const pullSpd = 500;
            pk.x += (dx / (dist || 1)) * pullSpd * simDt;
            pk.y += (dy / (dist || 1)) * pullSpd * simDt;
          }

          if (dist < s.player.radius + (pk.kind === 'BOSS_CHEST' ? 26 : 15)) {
            pk.active = false;
            soundEngine.playPickup();
            if (pk.kind === 'XP') {
              s.progression.xp += pk.value * stats.xpMultiplier;
            } else if (pk.kind === 'HP_CELL') {
              s.player.hp = Math.min(s.player.maxHp, s.player.hp + pk.value);
              spawnFloatingText(`+${pk.value} HP`, s.player.x, s.player.y - 25, '#10B981', 1.1, 0.6);
            } else if (pk.kind === 'BOSS_CHEST') {
              callbacksRef.current.onHudUpdate(buildHudSnapshot());
              callbacksRef.current.onBossChestCollected(
                pk.wave,
                pk.bossName || 'TITAN SIEGE DREADNOUGHT'
              );
            }
          }
        }

        // Check paced Level-Up trigger (waits at least 18s into run and 10s between popups)
        if (
          canTriggerAutoLevelUp(
            s.progression.xp,
            s.progression.xpToNext,
            s.progression.elapsedSeconds,
            s.progression.lastLevelUpElapsedSeconds
          )
        ) {
          s.progression.xp -= s.progression.xpToNext;
          s.progression.level++;
          s.progression.xpToNext = xpRequiredForLevel(s.progression.level);
          s.progression.lastLevelUpElapsedSeconds = s.progression.elapsedSeconds;
          soundEngine.playLevelUp();
          callbacksRef.current.onHudUpdate(buildHudSnapshot());
          callbacksRef.current.onLevelUpReady(s.progression.level, { ...s.skills });
        }

        // Update pooled particles
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const pt = s.particles[i];
          if (!pt.active) continue;
          pt.x += pt.vx * simDt;
          pt.y += pt.vy * simDt;
          pt.vx *= 0.94;
          pt.vy *= 0.94;
          pt.life -= simDt;
          if (pt.life <= 0) pt.active = false;
        }

        for (let i = s.arcs.length - 1; i >= 0; i--) {
          s.arcs[i].life -= simDt;
          if (s.arcs[i].life <= 0) s.arcs.splice(i, 1);
        }

        hudEmitAccumulator += rawDt;
        if (hudEmitAccumulator >= 0.1) {
          hudEmitAccumulator = 0;
          callbacksRef.current.onHudUpdate(buildHudSnapshot());
        }
      };

      const renderScene = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = s.canvasBounds.width;
        const h = s.canvasBounds.height;

        ctx.save();
        ctx.scale(dpr, dpr);

        ctx.fillStyle = '#070B12';
        ctx.fillRect(0, 0, w, h);

        const shakeMag = s.camera.trauma * s.camera.trauma * 15;
        const shakeX = (Math.random() * 2 - 1) * shakeMag;
        const shakeY = (Math.random() * 2 - 1) * shakeMag;

        ctx.save();
        ctx.translate(w / 2 - s.camera.x + shakeX, h / 2 - s.camera.y + shakeY);

        // Tactical Cyber Grid
        const gridStep = 80;
        const startX = Math.floor((s.camera.x - w / 2) / gridStep) * gridStep;
        const endX = s.camera.x + w / 2 + gridStep;
        const startY = Math.floor((s.camera.y - h / 2) / gridStep) * gridStep;
        const endY = s.camera.y + h / 2 + gridStep;

        ctx.strokeStyle =
          s.comboState.overdriveActiveTimer > 0
            ? 'rgba(245, 158, 11, 0.22)'
            : 'rgba(30, 41, 59, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = startX; gx <= endX; gx += gridStep) {
          ctx.moveTo(gx, startY);
          ctx.lineTo(gx, endY);
        }
        for (let gy = startY; gy <= endY; gy += gridStep) {
          ctx.moveTo(startX, gy);
          ctx.lineTo(endX, gy);
        }
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        for (let gx = startX; gx <= endX; gx += gridStep * 2) {
          for (let gy = startY; gy <= endY; gy += gridStep * 2) {
            ctx.fillRect(gx - 2, gy - 2, 4, 4);
          }
        }

        // EMP / Overdrive Shockwave Ring
        if (s.camera.empRingAlpha > 0) {
          ctx.save();
          ctx.strokeStyle = `rgba(56, 189, 248, ${s.camera.empRingAlpha})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(s.player.x, s.player.y, s.camera.empRingRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Orbital Plasma Strike Sky Pillars & Blast Rings
        for (let i = 0; i < s.orbitalBeams.length; i++) {
          const ob = s.orbitalBeams[i];
          const ratio = Math.max(0, ob.life / ob.maxLife);
          ctx.save();
          ctx.globalAlpha = ratio;
          ctx.fillStyle = ob.color;
          ctx.fillRect(ob.x - 14 * ratio, ob.y - 600, 28 * ratio, 600);
          ctx.strokeStyle = ob.color;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(ob.x, ob.y, ob.radius * (1.15 - ratio * 0.4), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Pickups
        for (let i = 0; i < MAX_PICKUPS; i++) {
          const pk = s.pickups[i];
          if (!pk.active) continue;
          ctx.save();
          ctx.translate(pk.x, pk.y);
          if (pk.kind === 'XP') {
            ctx.fillStyle = '#38BDF8';
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(6, 0);
            ctx.lineTo(0, 6);
            ctx.lineTo(-6, 0);
            ctx.closePath();
            ctx.fill();
          } else if (pk.kind === 'HP_CELL') {
            ctx.fillStyle = '#10B981';
            ctx.fillRect(-6, -2, 12, 4);
            ctx.fillRect(-2, -6, 4, 12);
          } else if (pk.kind === 'BOSS_CHEST') {
            const scale = 1 + Math.sin(pk.pulsePhase) * 0.08;
            ctx.scale(scale, scale);
            ctx.fillStyle = '#F59E0B';
            ctx.strokeStyle = '#FEF3C7';
            ctx.lineWidth = 2;
            ctx.fillRect(-16, -12, 32, 24);
            ctx.strokeRect(-16, -12, 32, 24);
          }
          ctx.restore();
        }

        // Enemy Attack Telegraphs
        for (let i = 0; i < s.enemies.length; i++) {
          const e = s.enemies[i];
          if (e.koTimer > 0 || e.state !== 'WINDUP') continue;
          if (e.kind === 'charger' || e.kind === 'kiter') {
            ctx.save();
            ctx.strokeStyle =
              e.kind === 'charger' ? 'rgba(239, 68, 68, 0.85)' : 'rgba(168, 85, 247, 0.75)';
            ctx.lineWidth = e.kind === 'charger' ? 3 : 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(
              e.x + Math.cos(e.telegraphAngle) * 320,
              e.y + Math.sin(e.telegraphAngle) * 320
            );
            ctx.stroke();
            ctx.restore();
          } else if (e.kind === 'boss') {
            ctx.save();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(e.telegraphTargetX, e.telegraphTargetY, 76, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }

        // Enemies + Target Lock Reticle
        for (let i = 0; i < s.enemies.length; i++) {
          const e = s.enemies[i];
          ctx.save();
          ctx.translate(e.x, e.y);

          // Target Lock Reticle on primary auto-aim target
          if (e.id === s.lockedTargetId && e.koTimer === 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, e.radius + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // Elite Golden Halo
          if (e.isElite && e.kind !== 'boss' && e.koTimer === 0) {
            ctx.strokeStyle = 'rgba(253, 224, 71, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, e.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
          }

          if (e.koTimer > 0) {
            const koRatio = e.koTimer / e.maxKoTimer;
            ctx.globalAlpha = koRatio;
            ctx.rotate((1 - koRatio) * 3.5);
            ctx.scale(0.6 + koRatio * 0.4, 0.6 + koRatio * 0.4);
          } else {
            ctx.rotate(e.facingAngle);
          }

          const isFlashing = e.hitFlashTimer > 0;
          if (e.kind === 'swarmer') {
            ctx.fillStyle = isFlashing ? '#FFFFFF' : '#EF4444';
            ctx.strokeStyle = '#05080F';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(-11, -11);
            ctx.lineTo(-6, 0);
            ctx.lineTo(-11, 11);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (e.kind === 'kiter') {
            ctx.fillStyle = isFlashing ? '#FFFFFF' : '#A855F7';
            ctx.strokeStyle = '#05080F';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(16, 0);
            ctx.lineTo(0, -13);
            ctx.lineTo(-14, 0);
            ctx.lineTo(0, 13);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (e.kind === 'charger') {
            ctx.fillStyle = isFlashing
              ? '#FFFFFF'
              : e.isElite
              ? '#FDE047'
              : e.state === 'WINDUP'
              ? '#FDE047'
              : '#F59E0B';
            ctx.strokeStyle = '#05080F';
            ctx.lineWidth = 2.5;
            const sc = e.isElite ? 1.25 : 1;
            ctx.scale(sc, sc);
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(-12, -14);
            ctx.lineTo(-8, 0);
            ctx.lineTo(-12, 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (e.kind === 'phalanx') {
            ctx.fillStyle = isFlashing ? '#FFFFFF' : '#475569';
            ctx.strokeStyle = '#0F172A';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(-16, -16, 32, 32, 6);
            ctx.fill();
            ctx.stroke();

            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 22, -Math.PI * 0.42, Math.PI * 0.42);
            ctx.stroke();
          } else if (e.kind === 'boss') {
            ctx.fillStyle = isFlashing ? '#FFFFFF' : '#DC2626';
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
              const ang = (k / 8) * Math.PI * 2;
              const rx = Math.cos(ang) * e.radius;
              const ry = Math.sin(ang) * e.radius;
              if (k === 0) ctx.moveTo(rx, ry);
              else ctx.lineTo(rx, ry);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#FDE047';
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Orbital Ion Blades
        const orbitalLvl = s.skills.orbital_blades || 0;
        if (orbitalLvl > 0) {
          const bladeCount = Math.min(6, 2 + orbitalLvl);
          const orbitRadius = 72 + orbitalLvl * 6;
          for (let b = 0; b < bladeCount; b++) {
            const ang = s.weaponTimers.orbitalAngle + (b / bladeCount) * Math.PI * 2;
            const bx = s.player.x + Math.cos(ang) * orbitRadius;
            const by = s.player.y + Math.sin(ang) * orbitRadius;
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(ang + Math.PI * 0.5);
            ctx.fillStyle = '#F59E0B';
            ctx.strokeStyle = '#FEF3C7';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(-10, -7);
            ctx.lineTo(-6, 0);
            ctx.lineTo(-10, 7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }

        // Mech Afterimages
        for (let i = 0; i < s.afterimages.length; i++) {
          const ai = s.afterimages[i];
          ctx.save();
          ctx.translate(ai.x, ai.y);
          ctx.rotate(ai.angle);
          ctx.globalAlpha = ai.alpha * 0.45;
          ctx.fillStyle = ai.color;
          ctx.beginPath();
          ctx.roundRect(-15, -15, 30, 30, 7);
          ctx.fill();
          ctx.restore();
        }

        // Cyber Mech Protagonist
        ctx.save();
        const bobOffset = Math.sin(s.player.walkBobDistance) * 2.2;
        ctx.translate(s.player.x, s.player.y + bobOffset);
        ctx.scale(s.player.scaleX, s.player.scaleY);

        const isOverdrive = s.comboState.overdriveActiveTimer > 0;
        if (isOverdrive) {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.78)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, s.player.radius + 12, 0, Math.PI * 2);
          ctx.stroke();
        } else if (s.player.shield > 0) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.42)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, s.player.radius + 7, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.rotate(s.player.facingAngle);

        const mechFlash = s.player.hitFlashTimer > 0;
        const hasOmega = (s.skills.omega_singularity || 0) > 0;

        ctx.fillStyle = isOverdrive || hasOmega ? '#F59E0B' : '#0284C7';
        ctx.fillRect(-8, -22, 18, 8);
        ctx.fillRect(-8, 14, 18, 8);

        ctx.fillStyle = mechFlash ? '#FFFFFF' : '#0F172A';
        ctx.strokeStyle = isOverdrive || hasOmega ? '#F59E0B' : '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-16, -16, 32, 32, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isOverdrive || hasOmega ? '#FDE047' : '#38BDF8';
        ctx.fillRect(4, -9, 10, 18);
        ctx.fillRect(14, -12, 10, 4);
        ctx.fillRect(14, 8, 10, 4);

        // Muzzle Flash Burst
        if (s.player.muzzleFlashTimer > 0) {
          ctx.fillStyle = '#FDE047';
          ctx.beginPath();
          ctx.arc(26, -10, 5.5, 0, Math.PI * 2);
          ctx.arc(26, 10, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Projectiles
        for (let i = 0; i < MAX_PROJECTILES; i++) {
          const p = s.projectiles[i];
          if (!p.active) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
          ctx.fill();
          if (p.isLegendary || p.isHomingMissile) {
            ctx.strokeStyle = '#FEF3C7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius + 3.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Chain Tesla Lightning Arcs
        for (let i = 0; i < s.arcs.length; i++) {
          const arc = s.arcs[i];
          ctx.save();
          ctx.strokeStyle = arc.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(arc.x1, arc.y1);
          ctx.lineTo(
            (arc.x1 + arc.x2) / 2 + (Math.random() - 0.5) * 18,
            (arc.y1 + arc.y2) / 2 + (Math.random() - 0.5) * 18
          );
          ctx.lineTo(arc.x2, arc.y2);
          ctx.stroke();
          ctx.restore();
        }

        // Pooled Particles
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const pt = s.particles[i];
          if (!pt.active) continue;
          ctx.save();
          ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
          ctx.fillStyle = pt.color;
          ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
          ctx.restore();
        }

        // Floating Combat Damage & Kill Streak Callouts
        ctx.textAlign = 'center';
        for (let i = 0; i < MAX_FLOATING_TEXTS; i++) {
          const ft = s.floatingTexts[i];
          if (!ft.active) continue;
          ctx.save();
          ctx.globalAlpha = Math.min(1, (ft.life / ft.maxLife) * 1.4);
          ctx.font = `900 ${Math.round(14 * ft.scale)}px 'Big Shoulders Display', sans-serif`;
          ctx.strokeStyle = '#05080F';
          ctx.lineWidth = 3;
          ctx.strokeText(ft.text, ft.x, ft.y);
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
        }

        ctx.restore();

        // Low-HP Peripheral Vignette
        if (gameStateRef.current === 'playing' && s.player.hp / s.player.maxHp < 0.35) {
          const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
          grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
          grad.addColorStop(1, 'rgba(239, 68, 68, 0.32)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }

        // Virtual Touch/Mouse Joystick
        if (s.input.pointerActive && gameStateRef.current === 'playing') {
          const ox = s.input.pointerOriginX - s.canvasBounds.left;
          const oy = s.input.pointerOriginY - s.canvasBounds.top;
          const cx = s.input.pointerCurrentX - s.canvasBounds.left;
          const cy = s.input.pointerCurrentY - s.canvasBounds.top;

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ox, oy, 42, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.beginPath();
          ctx.arc(cx, cy, 18, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      };

      const loop = (now: number) => {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        stepSimulation(rawDt);
        renderScene();
        rafId = window.requestAnimationFrame(loop);
      };

      rafId = window.requestAnimationFrame(loop);

      return () => {
        window.cancelAnimationFrame(rafId);
        ro.disconnect();
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', clearHeldInputs);
        document.removeEventListener('visibilitychange', handleVisChange);
        canvas.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, []);

    return (
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#070B12]">
        <canvas
          ref={canvasRef}
          data-testid="cyber-mech-canvas"
          tabIndex={0}
          aria-label="Pocket Survivor Cyber Mechs tactical combat arena"
          className="w-full h-full block outline-none cursor-crosshair"
        />
      </div>
    );
  }
);
