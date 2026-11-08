import 'dart:math';

/// Pure High-Action Combat Rules (Kill Streak Combo, Cyber Overdrive, Crits & Orbital Strike)
class ComboOverdriveState {
  final int comboCount;
  final double comboTimer;
  final double comboMultiplier;
  final double overdriveCharge; // 0..100
  final double overdriveActiveTimer; // > 0 means in Cyber Overdrive Mode

  const ComboOverdriveState({
    this.comboCount = 0,
    this.comboTimer = 0.0,
    this.comboMultiplier = 1.0,
    this.overdriveCharge = 100.0,
    this.overdriveActiveTimer = 0.0,
  });

  bool get isOverdriveActive => overdriveActiveTimer > 0;

  static const double comboDecaySeconds = 3.5;
  static const double overdriveDurationSeconds = 8.0;

  ComboOverdriveState registerKill({bool isEliteOrBoss = false}) {
    final nextCombo = comboCount + (isEliteOrBoss ? 5 : 1);
    final nextMult = min(5.0, 1.0 + (nextCombo ~/ 4) * 0.25);
    final chargeGain = isEliteOrBoss ? 28.0 : 4.5;
    final nextCharge = isOverdriveActive
        ? overdriveCharge
        : min(100.0, overdriveCharge + chargeGain);

    return ComboOverdriveState(
      comboCount: nextCombo,
      comboTimer: comboDecaySeconds,
      comboMultiplier: nextMult,
      overdriveCharge: nextCharge,
      overdriveActiveTimer: overdriveActiveTimer,
    );
  }

  ComboOverdriveState activateOverdrive() {
    if (overdriveCharge < 100.0 && !isOverdriveActive) return this;
    return ComboOverdriveState(
      comboCount: comboCount,
      comboTimer: comboTimer,
      comboMultiplier: comboMultiplier,
      overdriveCharge: 0.0,
      overdriveActiveTimer: overdriveDurationSeconds,
    );
  }

  ComboOverdriveState tick(double dt) {
    final nextComboTimer = max(0.0, comboTimer - dt);
    final nextOverdriveTimer = max(0.0, overdriveActiveTimer - dt);
    return ComboOverdriveState(
      comboCount: nextComboTimer <= 0 ? 0 : comboCount,
      comboTimer: nextComboTimer,
      comboMultiplier: nextComboTimer <= 0 ? 1.0 : comboMultiplier,
      overdriveCharge: overdriveCharge,
      overdriveActiveTimer: nextOverdriveTimer,
    );
  }
}

class CritHitResult {
  final int finalDamage;
  final bool isCrit;
  const CritHitResult(this.finalDamage, this.isCrit);
}

class WaveDifficultyScaling {
  final int wave;
  final bool isBossWave;
  final bool isHighOptInReviveZone;
  final double spawnIntervalSec;
  final int spawnBatchCount;
  final double enemyHpMultiplier;
  final double enemySpeedMultiplier;
  final double enemyDamageMultiplier;
  final double eliteSpawnIntervalSec;
  final int eliteSquadCount;
  final int maxAttackTokens;
  final int maxActiveEnemies;

  const WaveDifficultyScaling({
    required this.wave,
    required this.isBossWave,
    required this.isHighOptInReviveZone,
    required this.spawnIntervalSec,
    required this.spawnBatchCount,
    required this.enemyHpMultiplier,
    required this.enemySpeedMultiplier,
    required this.enemyDamageMultiplier,
    required this.eliteSpawnIntervalSec,
    required this.eliteSquadCount,
    required this.maxAttackTokens,
    required this.maxActiveEnemies,
  });
}

class CombatMath {
  static const double totalSurvivalSeconds = 600.0;
  static const double minFirstLevelUpSeconds = 18.0;
  static const double minLevelUpCooldownSeconds = 10.0;

  static int xpRequiredForLevel(int level) {
    return (180 + (level - 1) * 95 + pow(level - 1, 1.55) * 35).round();
  }

  static bool canTriggerAutoLevelUp({
    required double currentXp,
    required double xpToNext,
    required double elapsedSeconds,
    required double lastLevelUpElapsedSeconds,
  }) {
    if (currentXp < xpToNext) return false;
    if (elapsedSeconds < minFirstLevelUpSeconds) return false;
    if (lastLevelUpElapsedSeconds > 0 &&
        (elapsedSeconds - lastLevelUpElapsedSeconds) < minLevelUpCooldownSeconds) {
      return false;
    }
    return true;
  }

  /// Continuous intra-wave + exponential time difficulty scaling across 10 minutes
  static WaveDifficultyScaling getWaveDifficulty(double elapsedSeconds) {
    final clamped = elapsedSeconds.clamp(0.0, totalSurvivalSeconds - 0.01);
    final timeMinutes = clamped / 60.0;
    final wave = min(10, (timeMinutes.floor()) + 1);
    final isBossWave = wave == 5 || wave == 10;
    final isHighOptInReviveZone = wave >= 8 || isBossWave;

    final spawnIntervalSec = max(0.11, 0.56 - timeMinutes * 0.048);
    final spawnBatchCount = wave >= 9 ? 5 : (wave >= 6 ? 4 : (wave >= 3 ? 3 : 2));
    final enemyHpMultiplier = 1.0 +
        timeMinutes * 0.48 +
        pow(timeMinutes, 1.65) * 0.16 +
        (wave >= 8 ? 0.65 : 0.0);
    final enemySpeedMultiplier = 1.06 + timeMinutes * 0.075 + (wave >= 7 ? 0.12 : 0.0);
    final enemyDamageMultiplier = 1.0 + timeMinutes * 0.18 + pow(timeMinutes, 1.4) * 0.05;
    final eliteSpawnIntervalSec = max(10.0, 24.0 - timeMinutes * 1.4);
    final eliteSquadCount = wave >= 9 ? 3 : (wave >= 6 ? 2 : 1);
    final maxAttackTokens = min(10, 4 + (wave * 0.6).floor());
    final maxActiveEnemies = (38 + timeMinutes * 14).round();

    return WaveDifficultyScaling(
      wave: wave,
      isBossWave: isBossWave,
      isHighOptInReviveZone: isHighOptInReviveZone,
      spawnIntervalSec: spawnIntervalSec,
      spawnBatchCount: spawnBatchCount,
      enemyHpMultiplier: enemyHpMultiplier,
      enemySpeedMultiplier: enemySpeedMultiplier,
      enemyDamageMultiplier: enemyDamageMultiplier,
      eliteSpawnIntervalSec: eliteSpawnIntervalSec,
      eliteSquadCount: eliteSquadCount,
      maxAttackTokens: maxAttackTokens,
      maxActiveEnemies: maxActiveEnemies,
    );
  }

  static CritHitResult computeCritHit({
    required double baseDamage,
    required double comboMultiplier,
    required bool isOverdriveActive,
    required double randomRoll,
  }) {
    final critChance = min(
      0.65,
      0.16 + (comboMultiplier - 1.0) * 0.08 + (isOverdriveActive ? 0.22 : 0.0),
    );
    final isCrit = randomRoll < critChance;
    final overdriveBoost = isOverdriveActive ? 1.35 : 1.0;
    final critMult = isCrit ? 2.1 : 1.0;
    return CritHitResult((baseDamage * overdriveBoost * critMult).round(), isCrit);
  }

  static ({int pillarCount, int damagePerPillar, double blastRadius, double cooldownSec})
      getOrbitalStrikeSpecs(int playerLevel, double damageMultiplier) {
    return (
      pillarCount: min(10, 5 + (playerLevel ~/ 2)),
      damagePerPillar: ((145 + playerLevel * 28) * damageMultiplier).round(),
      blastRadius: 115.0,
      cooldownSec: 9.0,
    );
  }
}
