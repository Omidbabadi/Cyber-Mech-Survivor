import React, { useState } from 'react';
import { ADIVERY_PLACEMENTS } from '../game/rules';

interface FlutterCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FLUTTER_FILES: Record<string, { label: string; code: string }> = {
  pubspec: {
    label: 'pubspec.yaml',
    code: `name: pocket_survivor_cyber_mechs
description: "Pocket Survivor: Cyber Mechs - 10-Min High-Action Roguelite with Yektanet Adivery Ads"
publish_to: 'none'
version: 1.2.0+2

environment:
  sdk: '>=3.4.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flame: ^1.18.0
  adivery: ^4.6.2
  shared_preferences: ^2.3.2
  audioplayers: ^6.0.0

flutter:
  uses-material-design: true`,
  },
  combat_rules: {
    label: 'lib/game/combat_rules.dart',
    code: `import 'dart:math';

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
}`,
  },
  flame_game: {
    label: 'lib/game/cyber_mech_survivor_game.dart',
    code: `import 'dart:math';
import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
          ? 'ELITE CYBER-STALKER PACK (\${eliteCount}X ELITES)!'
          : 'SWARM FRENZY SURGE! (+\$count HOSTILES)',
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
        text: critRes.isCrit ? 'CRIT! \${critRes.finalDamage}' : '\${critRes.finalDamage}',
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
}`,
  },
  adivery_service: {
    label: 'lib/services/adivery_service.dart',
    code: `import 'package:adivery/adivery.dart';
import 'package:adivery/adivery_ads.dart';
import 'package:flutter/foundation.dart';

/// Yektanet Adivery Mediation Service for Pocket Survivor: Cyber Mechs
class AdiveryMonetizationService {
  static const String appId = '7e94a1c0-88b4-4f2d-9c12-yektanetadivery';

  // Top 5 High-Conversion Roguelite Rewarded Ad Placements
  static const String placementReviveWave8Boss = '${ADIVERY_PLACEMENTS.REVIVE_WAVE_BOSS.placementId}';
  static const String placementSkillReroll = '${ADIVERY_PLACEMENTS.SKILL_REROLL.placementId}';
  static const String placementDoubleBossLoot = '${ADIVERY_PLACEMENTS.DOUBLE_BOSS_LOOT.placementId}';
  static const String placementTrialLegendary = '${ADIVERY_PLACEMENTS.TRIAL_LEGENDARY_WEAPON.placementId}';
  static const String placementDoubleIdleIncome = '${ADIVERY_PLACEMENTS.DOUBLE_IDLE_INCOME.placementId}';

  static void initialize() {
    AdiveryPlugin.initialize(appId);
    AdiveryPlugin.setLoggingEnabled(kDebugMode);

    // Pre-cache all high-intent roguelite placements
    AdiveryPlugin.prepareRewardedAd(placementReviveWave8Boss);
    AdiveryPlugin.prepareRewardedAd(placementSkillReroll);
    AdiveryPlugin.prepareRewardedAd(placementDoubleBossLoot);
    AdiveryPlugin.prepareRewardedAd(placementTrialLegendary);
    AdiveryPlugin.prepareRewardedAd(placementDoubleIdleIncome);
  }

  static Future<void> showRewardedTrigger({
    required String placementId,
    required VoidCallback onRewardGranted,
    VoidCallback? onAdDismissedWithoutReward,
  }) async {
    final isLoaded = await AdiveryPlugin.isLoaded(placementId) ?? false;
    if (!isLoaded) {
      AdiveryPlugin.prepareRewardedAd(placementId);
    }

    AdiveryPlugin.addListener(AdiveryListener(
      onRewardedAdClosed: (String placement, bool isRewarded) {
        if (placement == placementId) {
          if (isRewarded) {
            onRewardGranted();
          } else {
            onAdDismissedWithoutReward?.call();
          }
          AdiveryPlugin.prepareRewardedAd(placementId);
        }
      },
    ));

    AdiveryPlugin.show(placementId);
  }
}`,
  },
  idle_service: {
    label: 'lib/services/offline_idle_service.dart',
    code: `import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';

class OfflineIdleReward {
  final int elapsedSeconds;
  final int goldEarned;
  final int partsEarned;

  const OfflineIdleReward({
    required this.elapsedSeconds,
    required this.goldEarned,
    required this.partsEarned,
  });
}

class OfflineIdleService {
  static const _lastTimestampKey = 'cyber_mech_last_active_epoch_sec';

  static Future<void> recordHeartbeat() async {
    final prefs = await SharedPreferences.getInstance();
    final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    await prefs.setInt(_lastTimestampKey, nowSec);
  }

  static Future<OfflineIdleReward> calculatePendingIdle({
    required int extractorLevel,
    bool doubledViaAdiveryAd = false,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final lastSec = prefs.getInt(_lastTimestampKey) ?? (nowSec - 1800);
    final cappedSec = min(max(0, nowSec - lastSec), 8 * 3600);

    final minutes = cappedSec / 60.0;
    final goldPerMin = 35 + (extractorLevel - 1) * 45;
    final partsPerMin = 1.5 + (extractorLevel - 1) * 2.5;
    final mult = doubledViaAdiveryAd ? 2 : 1;

    return OfflineIdleReward(
      elapsedSeconds: cappedSec,
      goldEarned: (minutes * goldPerMin * mult).round(),
      partsEarned: (minutes * partsPerMin * mult).round(),
    );
  }
}`,
  },
};

export const FlutterCodeModal: React.FC<FlutterCodeModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<string>('flame_game');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentFile = FLUTTER_FILES[activeTab] || FLUTTER_FILES.flame_game;

  const handleCopy = () => {
    navigator.clipboard?.writeText(currentFile.code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Flutter and Yektanet Adivery Source Code"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070D]/90 p-4 pointer-events-auto"
    >
      <div className="w-full max-w-4xl rounded-xl hud-panel p-6 text-[#F1F5F9] shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white">
              Flutter + Flame + Yektanet Adivery SDK Architecture
            </h2>
            <p className="text-xs text-slate-400">
              Synchronized Dart code for Combo Streaks, Cyber Overdrive, Orbital Plasma Barrage, Homing Missiles & Adivery Ads
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
          >
            Close SDK View
          </button>
        </div>

        {/* File Tabs */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {Object.entries(FLUTTER_FILES).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono-num transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === key
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="px-3.5 py-1.5 rounded-md bg-[#F59E0B] hover:bg-amber-400 text-[#070B12] text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            {copied ? 'Copied Dart File' : 'Copy Dart Code'}
          </button>
        </div>

        {/* Code Viewer */}
        <pre className="flex-1 overflow-auto rounded-lg bg-[#05080F] border border-slate-800 p-4 text-xs font-mono-num text-slate-200 leading-relaxed">
          <code>{currentFile.code}</code>
        </pre>
      </div>
    </div>
  );
};
