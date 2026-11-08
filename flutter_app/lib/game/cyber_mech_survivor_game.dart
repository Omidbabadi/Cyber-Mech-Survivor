import 'dart:math';
import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import '../services/adivery_service.dart';
import 'combat_rules.dart';

class CyberMechSurvivorGame extends FlameGame
    with HasCollisionDetection, KeyboardEvents, PanDetector {
  double elapsedSurvivalSeconds = 0; // Target: 600s (10 minutes)
  double lastLevelUpElapsedSeconds = 0;
  int currentWave = 1; // Waves 1..10
  int playerLevel = 1;
  double currentXp = 0;
  double xpToNext = CombatMath.xpRequiredForLevel(1).toDouble();
  double playerHp = 195;
  double maxHp = 195;
  double damageMultiplier = 1.14;
  bool hasTrialOmegaCannon = false;
  int revivesUsed = 0;
  int kills = 0;
  int runGold = 0;
  int runParts = 0;

  // High-Action State: Combo Streak, Cyber Overdrive, Orbital Strike & Camera Trauma
  ComboOverdriveState comboState = const ComboOverdriveState();
  double orbitalCooldownTimer = 0.0;
  double dashCooldownTimer = 0.0;
  double hitstopTimer = 0.0;
  double cameraTrauma = 0.0;
  double spawnTimer = 0.25;
  double eliteStalkerTimer = 26.0;
  double homingMissilePodTimer = 0.4;

  final Random _rng = Random();
  Vector2 mechPosition = Vector2.zero();
  Vector2 mechVelocity = Vector2.zero();

  @override
  void update(double dt) {
    final clampedDt = min(dt, 0.05);
    cameraTrauma = max(0.0, cameraTrauma - clampedDt * 1.85);

    if (hitstopTimer > 0) {
      hitstopTimer = max(0.0, hitstopTimer - clampedDt);
      return;
    }

    super.update(clampedDt);
    elapsedSurvivalSeconds += clampedDt;
    final difficulty = CombatMath.getWaveDifficulty(elapsedSurvivalSeconds);
    currentWave = difficulty.wave;

    comboState = comboState.tick(clampedDt);
    if (orbitalCooldownTimer > 0) {
      orbitalCooldownTimer = max(0.0, orbitalCooldownTimer - clampedDt);
    }
    if (dashCooldownTimer > 0) {
      dashCooldownTimer = max(0.0, dashCooldownTimer - clampedDt);
    }

    // Check Paced Level-Up Trigger (enforces 18s initial grace period & 10s cooldown)
    if (CombatMath.canTriggerAutoLevelUp(
      currentXp: currentXp,
      xpToNext: xpToNext,
      elapsedSeconds: elapsedSurvivalSeconds,
      lastLevelUpElapsedSeconds: lastLevelUpElapsedSeconds,
    )) {
      currentXp -= xpToNext;
      playerLevel++;
      xpToNext = CombatMath.xpRequiredForLevel(playerLevel).toDouble();
      lastLevelUpElapsedSeconds = elapsedSurvivalSeconds;
      overlays.add('SelectTacticalAugmentationModal');
      pauseEngine();
    }

    // Continuous Escalating Swarm Spawner (tightens interval & increases batch size over time)
    spawnTimer -= clampedDt;
    if (spawnTimer <= 0) {
      spawnTimer = difficulty.spawnIntervalSec;
      _spawnEscalatingSwarmBatch(
        count: difficulty.spawnBatchCount,
        hpMult: difficulty.enemyHpMultiplier,
        speedMult: difficulty.enemySpeedMultiplier,
        damageMult: difficulty.enemyDamageMultiplier,
      );
    }

    // Auto-launch Homing Micro-Missiles (accelerated 2.6x during Cyber Overdrive)
    homingMissilePodTimer -= clampedDt * (comboState.isOverdriveActive ? 2.6 : 1.0);
    if (homingMissilePodTimer <= 0) {
      homingMissilePodTimer = 1.25;
      _launchHomingMicroMissiles(count: comboState.isOverdriveActive ? 4 : 2);
    }

    // Accelerating Elite Cyber-Stalker Squads (scales from 24s down to 10s, up to 3x Elites)
    eliteStalkerTimer -= clampedDt;
    if (eliteStalkerTimer <= 0) {
      eliteStalkerTimer = difficulty.eliteSpawnIntervalSec;
      triggerSwarmSurge(
        count: 4 + difficulty.eliteSquadCount,
        includeEliteStalker: true,
        eliteCount: difficulty.eliteSquadCount,
      );
    }
  }

  /// Active Action Ability [E]: Cyber Overdrive Mode (8s 2x Fire Rate + Homing Missiles)
  void triggerCyberOverdrive() {
    comboState = comboState.activateOverdrive();
    cameraTrauma = min(1.0, cameraTrauma + 0.55);
    spawnFloatingCombatText(
      text: 'CYBER OVERDRIVE ENGAGED! (2X FIRE RATE)',
      position: mechPosition - Vector2(0, 38),
      color: const Color(0xFFF59E0B),
      scale: 1.35,
    );
  }

  /// Active Action Ability [Q]: Orbital Plasma Barrage
  void triggerOrbitalStrike() {
    if (orbitalCooldownTimer > 0) return;
    final specs = CombatMath.getOrbitalStrikeSpecs(playerLevel, damageMultiplier);
    orbitalCooldownTimer = specs.cooldownSec;
    cameraTrauma = min(1.0, cameraTrauma + 0.65);
    hitstopTimer = 0.045;

    spawnFloatingCombatText(
      text: 'ORBITAL PLASMA BARRAGE!',
      position: mechPosition - Vector2(0, 42),
      color: const Color(0xFF38BDF8),
      scale: 1.35,
    );

    for (var i = 0; i < specs.pillarCount; i++) {
      final angle = (i / specs.pillarCount) * pi * 2;
      final strikePos = mechPosition + Vector2(cos(angle), sin(angle)) * 185.0;
      _detonateOrbitalPillar(
        position: strikePos,
        radius: specs.blastRadius,
        damage: specs.damagePerPillar.toDouble(),
      );
    }
  }

  /// Instant Adrenaline Injection: Spawn Swarm Surge (+18 Hostiles + Escalating Elite Cyber-Stalkers)
  void triggerSwarmSurge({
    int count = 18,
    bool includeEliteStalker = true,
    int eliteCount = 1,
  }) {
    cameraTrauma = min(1.0, cameraTrauma + 0.35);
    spawnFloatingCombatText(
      text: eliteCount > 1
          ? 'ELITE CYBER-STALKER PACK (${eliteCount}X ELITES)!'
          : 'SWARM FRENZY SURGE! (+$count HOSTILES)',
      position: mechPosition - Vector2(0, 44),
      color: const Color(0xFFEF4444),
      scale: 1.35,
    );
  }

  /// Damage resolution with Critical Hits, Floating Combat Numbers & Kill Streak Combo
  void applyDamageToDrone({
    required Vector2 dronePos,
    required double baseDamage,
    required bool isEliteOrBoss,
  }) {
    final critRes = CombatMath.computeCritHit(
      baseDamage: baseDamage,
      comboMultiplier: comboState.comboMultiplier,
      isOverdriveActive: comboState.isOverdriveActive,
      randomRoll: _rng.nextDouble(),
    );

    if (critRes.isCrit || isEliteOrBoss) {
      spawnFloatingCombatText(
        text: critRes.isCrit ? 'CRIT! ${critRes.finalDamage}' : '${critRes.finalDamage}',
        position: dronePos,
        color: critRes.isCrit ? const Color(0xFFFDE047) : const Color(0xFF38BDF8),
        scale: critRes.isCrit ? 1.25 : 1.0,
      );
    }

    kills++;
    comboState = comboState.registerKill(isEliteOrBoss: isEliteOrBoss);
  }

  /// Trigger 1: Wave 8/10 or Boss Fight Revive (~85% Opt-In Rate)
  void triggerWaveReviveViaAdivery() {
    pauseEngine();
    AdiveryMonetizationService.showRewardedTrigger(
      placementId: AdiveryMonetizationService.placementReviveWave8Boss,
      onRewardGranted: () {
        playerHp = maxHp;
        revivesUsed++;
        comboState = comboState.activateOverdrive();
        triggerEmpScreenShockwave(radius: 580, damage: 950);
        resumeEngine();
      },
    );
  }

  /// Trigger 2: Free Skill Reroll during Level-Up Selection
  void rerollLevelUpSkillsViaAdivery(VoidCallback onRerolled) {
    AdiveryMonetizationService.showRewardedTrigger(
      placementId: AdiveryMonetizationService.placementSkillReroll,
      onRewardGranted: onRerolled,
    );
  }

  /// Trigger 3: Double Boss Loot Chest (2x Gold & Equipment Parts)
  void doubleBossLootViaAdivery(VoidCallback onDoubled) {
    AdiveryMonetizationService.showRewardedTrigger(
      placementId: AdiveryMonetizationService.placementDoubleBossLoot,
      onRewardGranted: onDoubled,
    );
  }

  void _spawnEscalatingSwarmBatch({
    required int count,
    required double hpMult,
    required double speedMult,
    required double damageMult,
  }) {}
  void _launchHomingMicroMissiles({required int count}) {}
  void _detonateOrbitalPillar({
    required Vector2 position,
    required double radius,
    required double damage,
  }) {}
  void spawnFloatingCombatText({
    required String text,
    required Vector2 position,
    required Color color,
    double scale = 1.0,
  }) {}
  void triggerEmpScreenShockwave({required double radius, required double damage}) {}
}
