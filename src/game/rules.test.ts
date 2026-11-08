import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWaveFromTime,
  calculateOfflineIdleReward,
  computePlayerBaseStats,
  purchaseUpgrade,
  rollSkillChoices,
  generateBossLootChest,
  doubleBossLootChest,
  canTriggerAdRevive,
  applyAdRevive,
  xpRequiredForLevel,
  canTriggerAutoLevelUp,
  registerKillCombo,
  activateCyberOverdrive,
  computeCritHit,
  getOrbitalStrikeSpecs,
  HangarLevels,
  ComboOverdriveState,
} from './rules';

test('wave progression maps 10 minutes (600s) to Waves 1..10 and escalates difficulty over time', () => {
  const wave1Start = getWaveFromTime(0);
  const wave1Late = getWaveFromTime(50);
  assert.equal(wave1Start.wave, 1);
  assert.equal(wave1Start.isBossWave, false);
  assert.equal(wave1Start.isHighOptInReviveZone, false);
  // Difficulty escalates even within the same wave as seconds tick up
  assert.ok(wave1Late.enemyHpMultiplier > wave1Start.enemyHpMultiplier);
  assert.ok(wave1Late.enemyDamageMultiplier > wave1Start.enemyDamageMultiplier);

  const wave5Boss = getWaveFromTime(250); // 4m 10s -> Wave 5
  assert.equal(wave5Boss.wave, 5);
  assert.equal(wave5Boss.isBossWave, true);
  assert.equal(wave5Boss.isHighOptInReviveZone, true);
  assert.ok(wave5Boss.spawnBatchCount > wave1Start.spawnBatchCount);

  const wave8 = getWaveFromTime(430); // 7m 10s -> Wave 8
  assert.equal(wave8.wave, 8);
  assert.equal(wave8.isHighOptInReviveZone, true);
  assert.ok(wave8.eliteSquadCount >= 2);
  assert.ok(wave8.eliteSpawnIntervalSec < wave1Start.eliteSpawnIntervalSec);

  const wave10Boss = getWaveFromTime(580); // 9m 40s -> Wave 10
  assert.equal(wave10Boss.wave, 10);
  assert.equal(wave10Boss.isBossWave, true);
  assert.equal(wave10Boss.isHighOptInReviveZone, true);
  assert.ok(wave10Boss.enemyHpMultiplier > wave8.enemyHpMultiplier);
  assert.ok(wave10Boss.enemyDamageMultiplier > wave5Boss.enemyDamageMultiplier);
  assert.ok(wave10Boss.maxAttackTokens > wave1Start.maxAttackTokens);
});

test('offline idle income calculates passive Gold & Parts and doubles with Adivery ad', () => {
  const baseIdle = calculateOfflineIdleReward(1800, 2, false); // 30 mins at level 2
  const doubledIdle = calculateOfflineIdleReward(1800, 2, true);

  assert.ok(baseIdle.goldEarned > 0);
  assert.ok(baseIdle.partsEarned > 0);
  assert.equal(doubledIdle.goldEarned, baseIdle.goldEarned * 2);
  assert.equal(doubledIdle.partsEarned, baseIdle.partsEarned * 2);
});

test('trial legendary weapon ad unlock boosts player damage multiplier', () => {
  const levels: HangarLevels = {
    plasmaDamage: 2,
    chassisArmor: 2,
    thrusterSpeed: 1,
    magnetField: 1,
    idleExtractor: 1,
  };
  const normalStats = computePlayerBaseStats(levels, false);
  const trialStats = computePlayerBaseStats(levels, true);

  assert.equal(trialStats.hasTrialLegendary, true);
  assert.ok(trialStats.damageMultiplier > normalStats.damageMultiplier);
});

test('hangar upgrade purchase deducts resources and increments level', () => {
  const initialLevels: HangarLevels = {
    plasmaDamage: 1,
    chassisArmor: 1,
    thrusterSpeed: 1,
    magnetField: 1,
    idleExtractor: 1,
  };
  const result = purchaseUpgrade(initialLevels, 'plasmaDamage', 500, 20);
  assert.equal(result.purchased, true);
  assert.equal(result.levels.plasmaDamage, 2);
  assert.ok(result.gold < 500);
  assert.ok(result.parts < 20);
});

test('free skill reroll via Adivery ad unlocks overclocked bonus choice', () => {
  const normalRoll = rollSkillChoices({ plasma_repeater: 1 }, false, 1);
  const adReroll = rollSkillChoices({ plasma_repeater: 1 }, true, 2);

  assert.equal(normalRoll.length, 3);
  assert.equal(adReroll.length, 3);
  assert.equal(adReroll[0].isOverclockedBonus, true);
});

test('double boss loot chest via Adivery ad doubles gold and equipment parts', () => {
  const chest = generateBossLootChest(5, 'Titan Siege Dreadnought');
  const doubled = doubleBossLootChest(chest);

  assert.equal(doubled.doubledViaAd, true);
  assert.equal(doubled.finalGold, chest.baseGold * 2);
  assert.equal(doubled.finalParts, chest.baseParts * 2);
});

test('revive via Adivery ad restores 100% HP and triggers EMP blast', () => {
  assert.equal(canTriggerAdRevive(0, 2), true);
  assert.equal(canTriggerAdRevive(2, 2), false);

  const revive = applyAdRevive(230, 0);
  assert.equal(revive.newHp, 230);
  assert.equal(revive.revivesUsed, 1);
  assert.ok(revive.empBlastRadius >= 500);
  assert.ok(revive.invulnerableSeconds >= 3);
});

test('xp curve scales monotonically and prevents premature early-game level-up popups', () => {
  assert.ok(xpRequiredForLevel(1) >= 180);
  assert.ok(xpRequiredForLevel(2) > xpRequiredForLevel(1));
  assert.ok(xpRequiredForLevel(5) > xpRequiredForLevel(2));

  // Even with full XP at 5 seconds, auto level-up waits until 18s grace period
  assert.equal(canTriggerAutoLevelUp(200, 180, 5, 0), false);
  assert.equal(canTriggerAutoLevelUp(200, 180, 19, 0), true);
  // Cooldown prevents back-to-back level-up popups within 10s
  assert.equal(canTriggerAutoLevelUp(300, 275, 24, 19), false);
  assert.equal(canTriggerAutoLevelUp(300, 275, 30, 19), true);
});

test('kill streak combo builds multiplier, charges Cyber Overdrive, and amplifies critical hits', () => {
  let state: ComboOverdriveState = {
    comboCount: 0,
    comboTimer: 0,
    comboMultiplier: 1.0,
    overdriveCharge: 90,
    overdriveActiveTimer: 0,
  };

  state = registerKillCombo(state, true); // Elite kill (+5 combo, +28 charge -> capped at 100)
  assert.equal(state.comboCount, 5);
  assert.equal(state.comboMultiplier, 1.25);
  assert.equal(state.overdriveCharge, 100);

  const activated = activateCyberOverdrive(state);
  assert.equal(activated.overdriveCharge, 0);
  assert.equal(activated.overdriveActiveTimer, 8.0);

  const critRes = computeCritHit(100, activated.comboMultiplier, true, 0.05);
  const nonCritRes = computeCritHit(100, 1.0, false, 0.95);
  assert.equal(critRes.isCrit, true);
  assert.ok(critRes.finalDamage > nonCritRes.finalDamage * 2);

  const orbital = getOrbitalStrikeSpecs(4, 1.5);
  assert.ok(orbital.pillarCount >= 6);
  assert.ok(orbital.damagePerPillar >= 300);
});
