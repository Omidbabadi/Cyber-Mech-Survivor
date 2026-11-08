export type AdPlacementKey =
  | 'REVIVE_WAVE_BOSS'
  | 'SKILL_REROLL'
  | 'DOUBLE_BOSS_LOOT'
  | 'TRIAL_LEGENDARY_WEAPON'
  | 'DOUBLE_IDLE_INCOME';

export interface AdiveryPlacement {
  key: AdPlacementKey;
  placementId: string;
  title: string;
  subtitle: string;
  optInRateLabel: string;
  rewardSummary: string;
}

export const ADIVERY_PLACEMENTS: Record<AdPlacementKey, AdiveryPlacement> = {
  REVIVE_WAVE_BOSS: {
    key: 'REVIVE_WAVE_BOSS',
    placementId: 'adivery_rewarded_revive_wave8_boss_94a2',
    title: 'Emergency Cyber-Revive',
    subtitle: 'Wave 8–10 / Boss Fight Hull Breach Recovery',
    optInRateLabel: '85% Opt-In Rate',
    rewardSummary: '100% Hull Repair + 3.5s Invulnerability + Screen-Clearing EMP Nova',
  },
  SKILL_REROLL: {
    key: 'SKILL_REROLL',
    placementId: 'adivery_rewarded_skill_reroll_31c8',
    title: 'Tactical Matrix Reroll',
    subtitle: 'Level-Up Augmentation Selection',
    optInRateLabel: '72% Opt-In Rate',
    rewardSummary: 'Refresh all 3 skill choices with guaranteed Overclock-tier augmentation',
  },
  DOUBLE_BOSS_LOOT: {
    key: 'DOUBLE_BOSS_LOOT',
    placementId: 'adivery_rewarded_double_boss_chest_77e1',
    title: 'Overcharge Boss Loot Chest',
    subtitle: 'Dreadnought & Elite Supply Cache',
    optInRateLabel: '79% Opt-In Rate',
    rewardSummary: '2x Gold Credits & 2x Cybernetic Equipment Parts',
  },
  TRIAL_LEGENDARY_WEAPON: {
    key: 'TRIAL_LEGENDARY_WEAPON',
    placementId: 'adivery_rewarded_trial_omega_cannon_55f0',
    title: 'Unlock Trial Legendary Weapon',
    subtitle: 'OMEGA Singularity Cannon (1 Full Game Run)',
    optInRateLabel: '81% Opt-In Rate',
    rewardSummary: 'Equip Lv.MAX Omega Singularity Cannon (+165% Plasma DPS & Gravity Vortex)',
  },
  DOUBLE_IDLE_INCOME: {
    key: 'DOUBLE_IDLE_INCOME',
    placementId: 'adivery_rewarded_double_idle_extractor_19b4',
    title: 'Overclock Offline Collector',
    subtitle: '2x Passive Hangar Resource Extraction',
    optInRateLabel: '68% Opt-In Rate',
    rewardSummary: 'Double all accrued Offline Gold & Equipment Parts immediately',
  },
};

export interface HangarLevels {
  plasmaDamage: number;
  chassisArmor: number;
  thrusterSpeed: number;
  magnetField: number;
  idleExtractor: number;
}

export interface UpgradeConfig {
  id: keyof HangarLevels;
  name: string;
  role: string;
  baseCostGold: number;
  baseCostParts: number;
  maxLevel: number;
  perLevelStatLabel: string;
}

export const HANGAR_UPGRADES: UpgradeConfig[] = [
  {
    id: 'plasmaDamage',
    name: 'Plasma Core Output',
    role: 'Weapon Damage Multiplier',
    baseCostGold: 120,
    baseCostParts: 4,
    maxLevel: 10,
    perLevelStatLabel: '+14% All Plasma Damage',
  },
  {
    id: 'chassisArmor',
    name: 'Titanium-V Hull Plating',
    role: 'Max Integrity & Regen',
    baseCostGold: 100,
    baseCostParts: 3,
    maxLevel: 10,
    perLevelStatLabel: '+35 Max Hull HP & +0.4 HP/s',
  },
  {
    id: 'thrusterSpeed',
    name: 'Vector ThrusterServos',
    role: 'Mobility & Dash Recovery',
    baseCostGold: 95,
    baseCostParts: 3,
    maxLevel: 10,
    perLevelStatLabel: '+6% Move Speed & -5% Dash CD',
  },
  {
    id: 'magnetField',
    name: 'Graviton Tractor Array',
    role: 'XP & Gold Pickup Radius',
    baseCostGold: 85,
    baseCostParts: 2,
    maxLevel: 10,
    perLevelStatLabel: '+22px Pickup Radius & +8% XP',
  },
  {
    id: 'idleExtractor',
    name: 'Autonomous Mining Rig',
    role: 'Offline Idle Resource Rate',
    baseCostGold: 140,
    baseCostParts: 5,
    maxLevel: 10,
    perLevelStatLabel: '+45 Gold/min & +2.5 Parts/min Offline',
  },
];

export interface PlayerComputedStats {
  maxHp: number;
  hpRegenPerSec: number;
  damageMultiplier: number;
  moveSpeed: number;
  magnetRadius: number;
  xpMultiplier: number;
  dashCooldown: number;
  hasTrialLegendary: boolean;
}

export function computePlayerBaseStats(
  levels: HangarLevels,
  hasTrialLegendary: boolean
): PlayerComputedStats {
  const maxHp = Math.round(160 + (levels.chassisArmor - 1) * 35);
  const hpRegenPerSec = +(0.5 + (levels.chassisArmor - 1) * 0.4).toFixed(2);
  const baseDmg = 1 + (levels.plasmaDamage - 1) * 0.14;
  const damageMultiplier = +(baseDmg * (hasTrialLegendary ? 1.45 : 1)).toFixed(2);
  const moveSpeed = Math.round(215 * (1 + (levels.thrusterSpeed - 1) * 0.06));
  const magnetRadius = Math.round(95 + (levels.magnetField - 1) * 22);
  const xpMultiplier = +(1 + (levels.magnetField - 1) * 0.08).toFixed(2);
  const dashCooldown = Math.max(1.4, +(3.0 * Math.pow(0.95, levels.thrusterSpeed - 1)).toFixed(2));

  return {
    maxHp,
    hpRegenPerSec,
    damageMultiplier,
    moveSpeed,
    magnetRadius,
    xpMultiplier,
    dashCooldown,
    hasTrialLegendary,
  };
}

export function getUpgradeCost(
  config: UpgradeConfig,
  currentLevel: number
): { gold: number; parts: number } {
  const factor = Math.pow(1.42, Math.max(0, currentLevel - 1));
  return {
    gold: Math.round(config.baseCostGold * factor),
    parts: Math.round(config.baseCostParts * factor),
  };
}

export function canAffordUpgrade(
  config: UpgradeConfig,
  currentLevel: number,
  gold: number,
  parts: number
): boolean {
  if (currentLevel >= config.maxLevel) return false;
  const cost = getUpgradeCost(config, currentLevel);
  return gold >= cost.gold && parts >= cost.parts;
}

export function purchaseUpgrade(
  levels: HangarLevels,
  upgradeId: keyof HangarLevels,
  gold: number,
  parts: number
): { levels: HangarLevels; gold: number; parts: number; purchased: boolean } {
  const config = HANGAR_UPGRADES.find((u) => u.id === upgradeId);
  if (!config) return { levels, gold, parts, purchased: false };
  const currentLevel = levels[upgradeId];
  if (!canAffordUpgrade(config, currentLevel, gold, parts)) {
    return { levels, gold, parts, purchased: false };
  }
  const cost = getUpgradeCost(config, currentLevel);
  return {
    levels: {
      ...levels,
      [upgradeId]: currentLevel + 1,
    },
    gold: gold - cost.gold,
    parts: parts - cost.parts,
    purchased: true,
  };
}

export interface OfflineIdleReward {
  elapsedSeconds: number;
  cappedSeconds: number;
  goldEarned: number;
  partsEarned: number;
  goldPerMinute: number;
  partsPerMinute: number;
}

export function calculateOfflineIdleReward(
  elapsedSeconds: number,
  extractorLevel: number,
  doubledViaAd = false
): OfflineIdleReward {
  const maxOfflineSeconds = 8 * 3600; // 8 hours cap
  const cappedSeconds = Math.max(0, Math.min(elapsedSeconds, maxOfflineSeconds));
  const minutes = cappedSeconds / 60;
  const goldPerMinute = 35 + (Math.max(1, extractorLevel) - 1) * 45;
  const partsPerMinute = 1.5 + (Math.max(1, extractorLevel) - 1) * 2.5;

  const multiplier = doubledViaAd ? 2 : 1;
  const goldEarned = Math.round(minutes * goldPerMinute * multiplier);
  const partsEarned = Math.max(
    cappedSeconds >= 60 ? 1 * multiplier : 0,
    Math.round(minutes * partsPerMinute * multiplier)
  );

  return {
    elapsedSeconds,
    cappedSeconds,
    goldEarned,
    partsEarned,
    goldPerMinute,
    partsPerMinute,
  };
}

export const TOTAL_SURVIVAL_SECONDS = 600; // 10 minutes = 10 waves

export interface WaveInfo {
  wave: number; // 1..10
  totalWaves: number;
  isBossWave: boolean;
  isHighOptInReviveZone: boolean;
  waveTitle: string;
  spawnIntervalSec: number;
  spawnBatchCount: number;
  enemyHpMultiplier: number;
  enemySpeedMultiplier: number;
  enemyDamageMultiplier: number;
  eliteSpawnIntervalSec: number;
  eliteSquadCount: number;
  maxAttackTokens: number;
  maxActiveEnemies: number;
  archetypeWeights: {
    swarmer: number;
    kiter: number;
    charger: number;
    phalanx: number;
  };
}

const WAVE_TITLES: string[] = [
  'Perimeter Recon Swarm',
  'Wasp Strafing Squadron',
  'Vanguard Laser Chargers',
  'Aegis Shield Phalanx',
  'BOSS: Titan Siege Dreadnought',
  'Hyper-Velocity Drone Surge',
  'Crossfire Ion Armada',
  'Critical Sector Overrun',
  'Eclipse Elite Guard',
  'FINAL BOSS: Omega Hive Sovereign',
];

export function getWaveFromTime(elapsedSeconds: number): WaveInfo {
  const clamped = Math.max(0, Math.min(TOTAL_SURVIVAL_SECONDS - 0.01, elapsedSeconds));
  const timeMinutes = clamped / 60;
  const wave = Math.min(10, Math.floor(timeMinutes) + 1);
  const isBossWave = wave === 5 || wave === 10;
  const isHighOptInReviveZone = wave >= 8 || isBossWave;

  // Continuous intra-wave + exponential time scaling so difficulty ramps up smoothly and relentlessly
  const spawnIntervalSec = Math.max(0.11, +(0.56 - timeMinutes * 0.048).toFixed(2));
  const spawnBatchCount = wave >= 9 ? 5 : wave >= 6 ? 4 : wave >= 3 ? 3 : 2;
  const enemyHpMultiplier = +(
    1 +
    timeMinutes * 0.48 +
    Math.pow(timeMinutes, 1.65) * 0.16 +
    (wave >= 8 ? 0.65 : 0)
  ).toFixed(2);
  const enemySpeedMultiplier = +(1.06 + timeMinutes * 0.075 + (wave >= 7 ? 0.12 : 0)).toFixed(2);
  const enemyDamageMultiplier = +(
    1 +
    timeMinutes * 0.18 +
    Math.pow(timeMinutes, 1.4) * 0.05
  ).toFixed(2);
  const eliteSpawnIntervalSec = Math.max(10, +(24 - timeMinutes * 1.4).toFixed(1));
  const eliteSquadCount = wave >= 9 ? 3 : wave >= 6 ? 2 : 1;
  const maxAttackTokens = Math.min(10, 4 + Math.floor(wave * 0.6));
  const maxActiveEnemies = Math.round(38 + timeMinutes * 14);

  const archetypeWeights = {
    swarmer: Math.max(0.22, +(0.65 - (wave - 1) * 0.048).toFixed(2)),
    kiter: wave >= 1 ? +(0.2 + Math.min(0.24, (wave - 1) * 0.026)).toFixed(2) : 0,
    charger: wave >= 2 ? +(0.18 + Math.min(0.26, (wave - 2) * 0.032)).toFixed(2) : 0,
    phalanx: wave >= 3 ? +(0.16 + Math.min(0.28, (wave - 3) * 0.038)).toFixed(2) : 0,
  };

  return {
    wave,
    totalWaves: 10,
    isBossWave,
    isHighOptInReviveZone,
    waveTitle: WAVE_TITLES[wave - 1] || 'Alien Drone Assault',
    spawnIntervalSec,
    spawnBatchCount,
    enemyHpMultiplier,
    enemySpeedMultiplier,
    enemyDamageMultiplier,
    eliteSpawnIntervalSec,
    eliteSquadCount,
    maxAttackTokens,
    maxActiveEnemies,
    archetypeWeights,
  };
}

export type SkillId =
  | 'plasma_repeater'
  | 'orbital_blades'
  | 'chain_tesla'
  | 'rail_mortar'
  | 'omega_singularity'
  | 'overclock_fire_rate'
  | 'nanite_hull_repair'
  | 'thruster_afterburner';

export interface SkillDefinition {
  id: SkillId;
  name: string;
  category: 'WEAPON' | 'AUGMENT' | 'LEGENDARY';
  roleClue: string;
  description: string;
  maxLevel: number;
  accentColor: string;
}

export const SKILLS_CATALOG: SkillDefinition[] = [
  {
    id: 'plasma_repeater',
    name: 'Twin Plasma Repeater',
    category: 'WEAPON',
    roleClue: 'Rapid Auto-Target Bolts',
    description: 'Fires high-velocity twin plasma bolts at the nearest hostile drone.',
    maxLevel: 5,
    accentColor: '#38BDF8',
  },
  {
    id: 'orbital_blades',
    name: 'Orbital Ion Blades',
    category: 'WEAPON',
    roleClue: '360° Perimeter Shredder',
    description: 'Maintains rotating thermal ion blades that slice swarmers at close range.',
    maxLevel: 5,
    accentColor: '#F59E0B',
  },
  {
    id: 'chain_tesla',
    name: 'Arc Tesla Emitter',
    category: 'WEAPON',
    roleClue: 'Multi-Target Chain Lightning',
    description: 'Discharges high-voltage arcs that bounce across clustered alien drones.',
    maxLevel: 5,
    accentColor: '#A855F7',
  },
  {
    id: 'rail_mortar',
    name: 'Thermal Rail Mortar',
    category: 'WEAPON',
    roleClue: 'Heavy AoE Plasma Blast',
    description: 'Launches armor-cracking shells that detonate in a wide plasma shockwave.',
    maxLevel: 5,
    accentColor: '#EF4444',
  },
  {
    id: 'overclock_fire_rate',
    name: 'Accelerator Cycling',
    category: 'AUGMENT',
    roleClue: '+18% Global Fire Rate',
    description: 'Reduces weapon cooldowns across all mounted mech hardpoints.',
    maxLevel: 5,
    accentColor: '#10B981',
  },
  {
    id: 'nanite_hull_repair',
    name: 'Nanite Armor Weave',
    category: 'AUGMENT',
    roleClue: '+40 Max HP & Instant 30% Heal',
    description: 'Reinforces chassis integrity and repairs hull damage immediately.',
    maxLevel: 5,
    accentColor: '#22C55E',
  },
  {
    id: 'thruster_afterburner',
    name: 'Ion Afterburners',
    category: 'AUGMENT',
    roleClue: '+12% Move Speed & Pickup Range',
    description: 'Boosts mech evasion speed and expands graviton XP collection field.',
    maxLevel: 5,
    accentColor: '#06B6D4',
  },
  {
    id: 'omega_singularity',
    name: 'OMEGA Singularity Cannon',
    category: 'LEGENDARY',
    roleClue: 'Trial Legendary · Piercing Vortex Beam',
    description: 'Fires cataclysmic singularity beams that pierce all armor and implode targets.',
    maxLevel: 5,
    accentColor: '#F59E0B',
  },
];

export interface SkillChoice {
  skill: SkillDefinition;
  nextLevel: number;
  isOverclockedBonus: boolean;
}

export function rollSkillChoices(
  currentLevels: Partial<Record<SkillId, number>>,
  isRerolledViaAd = false,
  seedOffset = 0
): SkillChoice[] {
  const pool = SKILLS_CATALOG.filter((s) => {
    if (s.id === 'omega_singularity' && !isRerolledViaAd && (currentLevels[s.id] || 0) === 0) {
      return false;
    }
    const lvl = currentLevels[s.id] || 0;
    return lvl < s.maxLevel;
  });

  if (pool.length === 0) {
    return SKILLS_CATALOG.slice(0, 3).map((skill) => ({
      skill,
      nextLevel: currentLevels[skill.id] || 1,
      isOverclockedBonus: isRerolledViaAd,
    }));
  }

  // Deterministic-friendly shuffle when seedOffset is provided, otherwise mixed
  const sorted = [...pool].sort((a, b) => {
    if (isRerolledViaAd) {
      if (a.category === 'LEGENDARY') return -1;
      if (b.category === 'LEGENDARY') return 1;
      if (a.category === 'WEAPON' && b.category !== 'WEAPON') return -1;
    }
    const hashA = (a.id.charCodeAt(0) * 31 + seedOffset * 17) % 97;
    const hashB = (b.id.charCodeAt(0) * 31 + seedOffset * 17) % 97;
    return hashA - hashB;
  });

  return sorted.slice(0, 3).map((skill, idx) => ({
    skill,
    nextLevel: Math.min(skill.maxLevel, (currentLevels[skill.id] || 0) + (isRerolledViaAd && idx === 0 ? 2 : 1)),
    isOverclockedBonus: isRerolledViaAd && idx === 0,
  }));
}

export interface BossLootChest {
  id: string;
  bossName: string;
  wave: number;
  baseGold: number;
  baseParts: number;
  equipmentItemName: string;
  doubledViaAd: boolean;
  finalGold: number;
  finalParts: number;
}

export function generateBossLootChest(wave: number, bossName: string): BossLootChest {
  const baseGold = 180 + wave * 65;
  const baseParts = 6 + Math.floor(wave * 1.8);
  const equipmentNames = [
    'MK-IV Plasma Condenser Coil',
    'Quantum Gyro Stabilizer',
    'Aegis Reactive Armor Core',
    'Zero-Point Singularity Cell',
    'Sovereign Dreadnought Relay',
  ];
  const equipmentItemName = equipmentNames[(wave - 1) % equipmentNames.length];

  return {
    id: `chest_w${wave}`,
    bossName,
    wave,
    baseGold,
    baseParts,
    equipmentItemName,
    doubledViaAd: false,
    finalGold: baseGold,
    finalParts: baseParts,
  };
}

export function doubleBossLootChest(chest: BossLootChest): BossLootChest {
  if (chest.doubledViaAd) return chest;
  return {
    ...chest,
    doubledViaAd: true,
    finalGold: chest.baseGold * 2,
    finalParts: chest.baseParts * 2,
  };
}

export interface ReviveResult {
  newHp: number;
  invulnerableSeconds: number;
  empBlastRadius: number;
  empDamage: number;
  revivesUsed: number;
}

export function canTriggerAdRevive(revivesUsed: number, maxRevivesPerRun = 2): boolean {
  return revivesUsed < maxRevivesPerRun;
}

export function applyAdRevive(maxHp: number, currentRevivesUsed: number): ReviveResult {
  return {
    newHp: maxHp,
    invulnerableSeconds: 3.5,
    empBlastRadius: 520,
    empDamage: 950,
    revivesUsed: currentRevivesUsed + 1,
  };
}

export const MIN_FIRST_LEVEL_UP_SECONDS = 18;
export const MIN_LEVEL_UP_COOLDOWN_SECONDS = 10;

export function xpRequiredForLevel(level: number): number {
  return Math.round(180 + (level - 1) * 95 + Math.pow(level - 1, 1.55) * 35);
}

export function canTriggerAutoLevelUp(
  currentXp: number,
  xpToNext: number,
  elapsedSeconds: number,
  lastLevelUpElapsedSeconds: number
): boolean {
  if (currentXp < xpToNext) return false;
  if (elapsedSeconds < MIN_FIRST_LEVEL_UP_SECONDS) return false;
  if (lastLevelUpElapsedSeconds > 0 && elapsedSeconds - lastLevelUpElapsedSeconds < MIN_LEVEL_UP_COOLDOWN_SECONDS) {
    return false;
  }
  return true;
}

export interface ComboOverdriveState {
  comboCount: number;
  comboTimer: number;
  comboMultiplier: number;
  overdriveCharge: number; // 0..100
  overdriveActiveTimer: number; // > 0 means in Cyber Overdrive Mode
}

export const COMBO_DECAY_SECONDS = 3.5;
export const OVERDRIVE_DURATION_SECONDS = 8.0;

export function registerKillCombo(
  state: ComboOverdriveState,
  isEliteOrBoss = false
): ComboOverdriveState {
  const nextCombo = state.comboCount + (isEliteOrBoss ? 5 : 1);
  const nextMultiplier = Math.min(5.0, +(1.0 + Math.floor(nextCombo / 4) * 0.25).toFixed(2));
  const chargeGain = isEliteOrBoss ? 28 : 4.5;
  const nextCharge =
    state.overdriveActiveTimer > 0
      ? state.overdriveCharge
      : Math.min(100, +(state.overdriveCharge + chargeGain).toFixed(1));

  return {
    comboCount: nextCombo,
    comboTimer: COMBO_DECAY_SECONDS,
    comboMultiplier: nextMultiplier,
    overdriveCharge: nextCharge,
    overdriveActiveTimer: state.overdriveActiveTimer,
  };
}

export function activateCyberOverdrive(state: ComboOverdriveState): ComboOverdriveState {
  if (state.overdriveCharge < 100 && state.overdriveActiveTimer <= 0) {
    return state;
  }
  return {
    ...state,
    overdriveCharge: 0,
    overdriveActiveTimer: OVERDRIVE_DURATION_SECONDS,
  };
}

export function computeCritHit(
  baseDamage: number,
  comboMultiplier: number,
  isOverdriveActive: boolean,
  roll: number
): { finalDamage: number; isCrit: boolean } {
  const critChance = Math.min(0.65, 0.16 + (comboMultiplier - 1) * 0.08 + (isOverdriveActive ? 0.22 : 0));
  const isCrit = roll < critChance;
  const overdriveBoost = isOverdriveActive ? 1.35 : 1.0;
  const critMult = isCrit ? 2.1 : 1.0;
  const finalDamage = Math.round(baseDamage * overdriveBoost * critMult);
  return { finalDamage, isCrit };
}

export interface OrbitalStrikeSpecs {
  pillarCount: number;
  damagePerPillar: number;
  blastRadius: number;
  cooldownSeconds: number;
}

export function getOrbitalStrikeSpecs(
  playerLevel: number,
  damageMultiplier: number
): OrbitalStrikeSpecs {
  return {
    pillarCount: Math.min(10, 5 + Math.floor(playerLevel / 2)),
    damagePerPillar: Math.round((145 + playerLevel * 28) * damageMultiplier),
    blastRadius: 115,
    cooldownSeconds: 9.0,
  };
}

