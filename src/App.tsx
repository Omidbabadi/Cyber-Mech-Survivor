import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdPlacementKey,
  BossLootChest,
  HangarLevels,
  SkillChoice,
  SkillId,
  TOTAL_SURVIVAL_SECONDS,
  applyAdRevive,
  calculateOfflineIdleReward,
  canTriggerAdRevive,
  computePlayerBaseStats,
  doubleBossLootChest,
  generateBossLootChest,
  purchaseUpgrade,
  rollSkillChoices,
  xpRequiredForLevel,
} from './game/rules';
import {
  GameCanvas,
  GameCanvasHandle,
  HudTelemetrySnapshot,
} from './components/GameCanvas';
import { AdiveryAdModal } from './components/AdiveryAdModal';
import { HangarIdleModal } from './components/HangarIdleModal';
import { FlutterCodeModal } from './components/FlutterCodeModal';
import { soundEngine } from './game/sound';

type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';

type SubModalKind =
  | 'NONE'
  | 'LEVEL_UP'
  | 'BOSS_CHEST'
  | 'REVIVE_PROMPT'
  | 'PAUSE_MENU'
  | 'VICTORY'
  | 'DEFEAT';

const STORAGE_KEY = 'pocket_survivor_cyber_mechs_save_v1';

interface SavedProfile {
  gold: number;
  parts: number;
  bestTimeSec: number;
  bestWave: number;
  bestKills: number;
  levels: HangarLevels;
  lastOfflineEpochSec: number;
}

const DEFAULT_SAVE: SavedProfile = {
  gold: 380,
  parts: 12,
  bestTimeSec: 495,
  bestWave: 8,
  bestKills: 184,
  levels: {
    plasmaDamage: 2,
    chassisArmor: 2,
    thrusterSpeed: 1,
    magnetField: 1,
    idleExtractor: 2,
  },
  // Seed 45 minutes of accrued offline idle income out of the box
  lastOfflineEpochSec: Math.floor(Date.now() / 1000) - 45 * 60,
};

function loadSavedProfile(): SavedProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVE;
    const parsed = JSON.parse(raw) as Partial<SavedProfile>;
    return {
      ...DEFAULT_SAVE,
      ...parsed,
      levels: { ...DEFAULT_SAVE.levels, ...(parsed.levels || {}) },
    };
  } catch {
    return DEFAULT_SAVE;
  }
}

export default function App() {
  const [profile, setProfile] = useState<SavedProfile>(() => loadSavedProfile());
  const [gameState, setGameState] = useState<GameShellState>('title');
  const [subModal, setSubModal] = useState<SubModalKind>('NONE');
  const [timeScale, setTimeScale] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(false);

  // Trial Legendary Weapon unlocked via Yektanet Adivery for 1 game run
  const [hasTrialLegendary, setHasTrialLegendary] = useState<boolean>(false);

  // Active Yektanet Adivery Rewarded Ad placement modal
  const [activeAdPlacement, setActiveAdPlacement] = useState<AdPlacementKey | null>(null);

  // Hangar & Flutter SDK Modals
  const [hangarOpen, setHangarOpen] = useState<boolean>(false);
  const [flutterModalOpen, setFlutterModalOpen] = useState<boolean>(false);

  // Level-up choices & reroll state
  const [skillChoices, setSkillChoices] = useState<SkillChoice[]>([]);
  const [rerollCount, setRerollCount] = useState<number>(0);

  // Active Boss Loot Chest
  const [activeBossChest, setActiveBossChest] = useState<BossLootChest | null>(null);

  // Revives used in current run
  const [revivesUsed, setRevivesUsed] = useState<number>(0);

  // Frozen end-of-run snapshot for Victory/Defeat modals
  const [frozenEndSnapshot, setFrozenEndSnapshot] = useState<HudTelemetrySnapshot | null>(null);

  // Live HUD Telemetry Snapshot
  const [hud, setHud] = useState<HudTelemetrySnapshot>({
    hp: 195,
    maxHp: 195,
    trailingHp: 195,
    shield: 50,
    maxShield: 50,
    xp: 0,
    xpToNext: xpRequiredForLevel(1),
    level: 1,
    elapsedSeconds: 0,
    wave: 1,
    waveTitle: 'Perimeter Recon Swarm',
    isBossWave: false,
    isHighOptInReviveZone: false,
    kills: 0,
    runGold: 0,
    runParts: 0,
    dashCooldownRatio: 1,
    orbitalCooldownRatio: 1,
    comboCount: 0,
    comboMultiplier: 1.0,
    overdriveCharge: 100,
    overdriveActive: false,
    overdriveRemainingSec: 0,
    bossActive: false,
    bossName: '',
    bossHp: 0,
    bossMaxHp: 1,
    activeSkills: {
      plasma_repeater: 1,
      orbital_blades: 1,
      chain_tesla: 1,
      rail_mortar: 0,
      omega_singularity: 0,
      overclock_fire_rate: 0,
      nanite_hull_repair: 0,
      thruster_afterburner: 0,
    },
  });

  const canvasHandleRef = useRef<GameCanvasHandle | null>(null);

  // Persist profile changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const computedStats = useMemo(
    () => computePlayerBaseStats(profile.levels, hasTrialLegendary),
    [profile.levels, hasTrialLegendary]
  );

  const pendingIdle = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, nowSec - profile.lastOfflineEpochSec);
    return calculateOfflineIdleReward(elapsed, profile.levels.idleExtractor, false);
  }, [profile.lastOfflineEpochSec, profile.levels.idleExtractor]);

  const startCombatRun = useCallback(
    (overrideTrialLegendary?: boolean) => {
      const useTrial =
        overrideTrialLegendary !== undefined ? overrideTrialLegendary : hasTrialLegendary;
      const runStats = computePlayerBaseStats(profile.levels, useTrial);
      document.body.dataset.state = 'playing';
      setGameState('playing');
      setSubModal('NONE');
      setHangarsClosed();
      setRevivesUsed(0);
      setRerollCount(0);
      setFrozenEndSnapshot(null);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      window.setTimeout(() => {
        canvasHandleRef.current?.startNewRun(runStats);
      }, 0);
    },
    [hasTrialLegendary, profile.levels]
  );

  const setHangarsClosed = () => {
    setHangarOpen(false);
    setFlutterModalOpen(false);
  };

  // Support ?autostart=1 and Title Screen Enter/Space handshake
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startCombatRun();
    }
  }, [startCombatRun]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeAdPlacement || hangarOpen || flutterModalOpen) return;

      if (gameState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startCombatRun();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === 'playing' && subModal === 'NONE') {
          e.preventDefault();
          setGameState('paused');
          setSubModal('PAUSE_MENU');
        } else if (gameState === 'paused' && subModal === 'PAUSE_MENU') {
          e.preventDefault();
          setGameState('playing');
          setSubModal('NONE');
        }
      } else if (e.code === 'KeyM') {
        soundEngine.muted = !soundEngine.muted;
        setMuted(soundEngine.muted);
      } else if (e.code === 'KeyR' && (gameState === 'playing' || gameState === 'paused')) {
        startCombatRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeAdPlacement, flutterModalOpen, gameState, hangarOpen, startCombatRun, subModal]);

  // Callbacks from 60Hz Canvas Engine
  const handleLevelUpReady = useCallback(
    (newLevel: number, currentSkills: Record<SkillId, number>) => {
      setGameState('paused');
      setSubModal('LEVEL_UP');
      setSkillChoices(rollSkillChoices(currentSkills, false, newLevel));
    },
    []
  );

  const handleBossChestCollected = useCallback((wave: number, bossName: string) => {
    const chest = generateBossLootChest(wave, bossName);
    setActiveBossChest(chest);
    setGameState('paused');
    setSubModal('BOSS_CHEST');
  }, []);

  const handlePlayerDefeated = useCallback(
    (snapshot: HudTelemetrySnapshot) => {
      setFrozenEndSnapshot(snapshot);
      if (canTriggerAdRevive(revivesUsed, 2)) {
        setGameState('paused');
        setSubModal('REVIVE_PROMPT');
      } else {
        finalizeRunAndBankLoot(snapshot, 'DEFEAT');
      }
    },
    [revivesUsed]
  );

  const handlePlayerVictory = useCallback((snapshot: HudTelemetrySnapshot) => {
    setFrozenEndSnapshot(snapshot);
    finalizeRunAndBankLoot(snapshot, 'VICTORY');
  }, []);

  const finalizeRunAndBankLoot = (
    snapshot: HudTelemetrySnapshot,
    outcome: 'VICTORY' | 'DEFEAT'
  ) => {
    setProfile((prev) => ({
      ...prev,
      gold: prev.gold + snapshot.runGold + (outcome === 'VICTORY' ? 350 : 0),
      parts: prev.parts + snapshot.runParts + (outcome === 'VICTORY' ? 10 : 2),
      bestTimeSec: Math.max(prev.bestTimeSec, Math.round(snapshot.elapsedSeconds)),
      bestWave: Math.max(prev.bestWave, snapshot.wave),
      bestKills: Math.max(prev.bestKills, snapshot.kills),
    }));
    // Consume the 1-run Trial Legendary weapon once run concludes
    setHasTrialLegendary(false);
    setGameState('gameover');
    setSubModal(outcome);
  };

  // Yektanet Adivery Rewarded Ad Completion Handler
  const handleAdRewardCompleted = (placementKey: AdPlacementKey) => {
    setActiveAdPlacement(null);

    if (placementKey === 'TRIAL_LEGENDARY_WEAPON') {
      setHasTrialLegendary(true);
      soundEngine.playLevelUp();
    } else if (placementKey === 'SKILL_REROLL') {
      const nextReroll = rerollCount + 1;
      setRerollCount(nextReroll);
      setSkillChoices(rollSkillChoices(hud.activeSkills, true, hud.level + nextReroll * 7));
      soundEngine.playLevelUp();
    } else if (placementKey === 'DOUBLE_BOSS_LOOT' && activeBossChest) {
      const doubled = doubleBossLootChest(activeBossChest);
      setActiveBossChest(doubled);
      soundEngine.playLevelUp();
    } else if (placementKey === 'REVIVE_WAVE_BOSS') {
      const reviveRes = applyAdRevive(hud.maxHp, revivesUsed);
      setRevivesUsed(reviveRes.revivesUsed);
      setSubModal('NONE');
      setGameState('playing');
      canvasHandleRef.current?.applyReviveEmp();
    } else if (placementKey === 'DOUBLE_IDLE_INCOME') {
      const nowSec = Math.floor(Date.now() / 1000);
      const doubledIdle = calculateOfflineIdleReward(
        Math.max(0, nowSec - profile.lastOfflineEpochSec),
        profile.levels.idleExtractor,
        true
      );
      setProfile((prev) => ({
        ...prev,
        gold: prev.gold + doubledIdle.goldEarned,
        parts: prev.parts + doubledIdle.partsEarned,
        lastOfflineEpochSec: nowSec,
      }));
      soundEngine.playLevelUp();
    }
  };

  const handleSelectSkillChoice = (choice: SkillChoice) => {
    canvasHandleRef.current?.applySkillUpgrade(choice.skill.id, choice.nextLevel);
    setSubModal('NONE');
    setGameState('playing');
  };

  const handleClaimBossChest = () => {
    if (!activeBossChest) return;
    setProfile((prev) => ({
      ...prev,
      gold: prev.gold + activeBossChest.finalGold,
      parts: prev.parts + activeBossChest.finalParts,
    }));
    setActiveBossChest(null);
    setSubModal('NONE');
    setGameState('playing');
  };

  const handleClaimIdleNormal = () => {
    const nowSec = Math.floor(Date.now() / 1000);
    setProfile((prev) => ({
      ...prev,
      gold: prev.gold + pendingIdle.goldEarned,
      parts: prev.parts + pendingIdle.partsEarned,
      lastOfflineEpochSec: nowSec,
    }));
    soundEngine.playPickup();
  };

  const handleSimulateOffline30Min = () => {
    setProfile((prev) => ({
      ...prev,
      lastOfflineEpochSec: prev.lastOfflineEpochSec - 30 * 60,
    }));
  };

  const handlePurchaseHangarUpgrade = (id: keyof HangarLevels) => {
    setProfile((prev) => {
      const res = purchaseUpgrade(prev.levels, id, prev.gold, prev.parts);
      if (!res.purchased) return prev;
      soundEngine.playLevelUp();
      return {
        ...prev,
        levels: res.levels,
        gold: res.gold,
        parts: res.parts,
      };
    });
  };

  // Format 10:00 survival countdown
  const remainingSec = Math.max(0, Math.ceil(TOTAL_SURVIVAL_SECONDS - hud.elapsedSeconds));
  const minsStr = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const secsStr = String(remainingSec % 60).padStart(2, '0');

  // Discrete Vitality Sockets (6 sockets)
  const totalSockets = 6;
  const filledSockets = Math.ceil((hud.hp / Math.max(1, hud.maxHp)) * totalSockets);

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none">
      {/* 60 FPS Canvas2D Combat Arena */}
      <GameCanvas
        ref={canvasHandleRef}
        gameState={gameState}
        timeScale={timeScale}
        computedStats={computedStats}
        onHudUpdate={setHud}
        onLevelUpReady={handleLevelUpReady}
        onBossChestCollected={handleBossChestCollected}
        onPlayerDefeated={handlePlayerDefeated}
        onPlayerVictory={handlePlayerVictory}
      />

      {/* =================================================================== */}
      {/* 1. TITLE SCREEN OVERLAY                                             */}
      {/* =================================================================== */}
      {gameState === 'title' && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none bg-gradient-to-r from-[#05080F]/92 via-[#05080F]/65 to-transparent">
          {/* Top Perimeter Bar: Saved Bank & SDK Export */}
          <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
            <div className="flex items-center gap-6 hud-panel rounded-xl px-4 py-2.5">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Gold Credits</div>
                <div className="font-display text-2xl font-extrabold text-[#F59E0B] font-mono-num">
                  {profile.gold.toLocaleString()}
                </div>
              </div>
              <div className="h-7 w-px bg-slate-800" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Equipment Parts</div>
                <div className="font-display text-2xl font-extrabold text-sky-400 font-mono-num">
                  {profile.parts.toLocaleString()}
                </div>
              </div>
              <div className="h-7 w-px bg-slate-800" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">Best Survival</div>
                <div className="font-display text-2xl font-extrabold text-emerald-400 font-mono-num">
                  Wave {profile.bestWave}/10
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setHangarOpen(true)}
                className="px-4 py-2.5 rounded-xl hud-panel hover:border-sky-400/60 text-xs font-bold text-sky-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Mech Hangar & Idle Collector (+{pendingIdle.goldEarned}G)
              </button>
              <button
                type="button"
                onClick={() => setFlutterModalOpen(true)}
                className="px-4 py-2.5 rounded-xl hud-panel-amber hover:border-amber-400 text-xs font-bold text-[#F59E0B] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Flutter + Adivery SDK Code
              </button>
            </div>
          </div>

          {/* Center-Left Negative Space Focal Lockup */}
          <div className="max-w-xl my-auto pointer-events-auto">
            {/* Custom Inline <svg> Title Emblem */}
            <div className="mb-4">
              <svg
                viewBox="0 0 580 128"
                className="w-full max-w-[530px] h-auto drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]"
                role="img"
                aria-label="Pocket Survivor: Cyber Mechs"
              >
                <defs>
                  <linearGradient id="cyberPlaque" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0F172A" />
                    <stop offset="100%" stopColor="#070B12" />
                  </linearGradient>
                </defs>
                {/* Armored Hex Crest */}
                <polygon
                  points="14,16 558,16 572,64 558,114 14,114 4,64"
                  fill="url(#cyberPlaque)"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                />
                <polygon
                  points="24,24 88,24 100,64 88,104 24,104 14,64"
                  fill="#0B1322"
                  stroke="#F59E0B"
                  strokeWidth="2"
                />
                {/* Mech Visor Icon inside Crest */}
                <rect x="38" y="44" width="38" height="40" rx="6" fill="#0F172A" stroke="#38BDF8" strokeWidth="2.5" />
                <rect x="45" y="54" width="24" height="10" fill="#F59E0B" />
                <line x1="30" y1="50" x2="36" y2="50" stroke="#38BDF8" strokeWidth="4" />
                <line x1="78" y1="50" x2="84" y2="50" stroke="#38BDF8" strokeWidth="4" />

                {/* Display Lockup Text */}
                <text
                  x="116"
                  y="62"
                  fill="#F8FAFC"
                  fontFamily="'Big Shoulders Display', sans-serif"
                  fontWeight="900"
                  fontSize="44"
                  letterSpacing="2"
                >
                  POCKET SURVIVOR
                </text>
                <text
                  x="118"
                  y="98"
                  fill="#F59E0B"
                  fontFamily="'Big Shoulders Display', sans-serif"
                  fontWeight="800"
                  fontSize="24"
                  letterSpacing="3.5"
                >
                  CYBER MECHS · 10-MIN ROGUELITE
                </text>
              </svg>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-5 max-w-lg">
              Pilot an auto-firing plasma mech against 10 waves of alien drone swarms. Upgrade weapon hardpoints mid-run, harvest offline idle resources, and trigger Yektanet Adivery rewarded boosts.
            </p>

            {/* Pre-Run Rewarded Ad Trigger #4: Unlock Trial Legendary Weapon for 1 Game Run */}
            <div className="rounded-xl hud-panel-amber p-4 mb-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#F59E0B]">
                    PRE-RUN ADIVERY TRIGGER · {hasTrialLegendary ? 'EQUIPPED FOR THIS RUN' : '1-RUN TRIAL'}
                  </div>
                  <div className="font-display text-xl font-bold text-white">
                    OMEGA Singularity Cannon (Legendary Plasma Vortex)
                  </div>
                  <div className="text-xs text-slate-300">
                    Starts your mech with Lv.3 piercing singularity beams (+45% total plasma damage)
                  </div>
                </div>

                <button
                  type="button"
                  disabled={hasTrialLegendary}
                  onClick={() => setActiveAdPlacement('TRIAL_LEGENDARY_WEAPON')}
                  className={`px-4 py-2.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    hasTrialLegendary
                      ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 cursor-default'
                      : 'bg-[#F59E0B] hover:bg-amber-400 text-[#070B12]'
                  }`}
                >
                  {hasTrialLegendary
                    ? 'Omega Cannon Ready'
                    : 'Unlock Trial Legendary (Watch Ad)'}
                </button>
              </div>
            </div>

            {/* Primary Start CTA + Secondary Hangar CTA (<= 3 menu actions) */}
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                data-start="true"
                onClick={() => startCombatRun()}
                className="px-8 py-4 rounded-xl bg-[#38BDF8] hover:bg-sky-300 text-[#070B12] font-display text-2xl font-black tracking-wider shadow-lg transition-transform active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                DEPLOY CYBER MECH (START RUN)
              </button>

              <button
                type="button"
                onClick={() => setHangarOpen(true)}
                className="px-5 py-4 rounded-xl hud-panel hover:border-sky-400/60 text-sm font-bold text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Upgrade Mech & Claim Idle ({pendingIdle.goldEarned}G)
              </button>
            </div>
          </div>

          {/* Bottom Safe Margin Flat Inline Control Hint */}
          <div className="text-xs text-slate-400 font-mono-num pointer-events-none">
            WASD / Drag Move · Space Dash · E Cyber Overdrive · Q Orbital Strike · P Pause · M Mute
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. PLAYING HUD (Compact Perimeter Clusters, >= 85% Clear Arena)     */}
      {/* =================================================================== */}
      {gameState !== 'title' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3.5 md:p-5">
          {/* Top Perimeter Row: 3 Compact Corner/Edge Clusters */}
          <div className="flex items-start justify-between gap-3">
            {/* Cluster 1 (Top-Left): Vitality Sockets, Trailing Ghost HP Bar, Overdrive & XP */}
            <div className="hud-panel rounded-xl p-3 w-64 pointer-events-auto">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                  HULL INTEGRITY
                </span>
                <span className="hud-numeral text-xl font-black text-white">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>

              {/* Discrete Vitality Pips (Full / Damaged / Empty Hollow Socket) */}
              <div className="grid grid-cols-6 gap-1 mb-2">
                {Array.from({ length: totalSockets }).map((_, idx) => {
                  const isFull = idx < filledSockets;
                  const isCrit = hud.hp / Math.max(1, hud.maxHp) < 0.35;
                  return (
                    <svg key={idx} viewBox="0 0 28 10" className="w-full h-2.5">
                      <rect
                        x="1"
                        y="1"
                        width="26"
                        height="8"
                        rx="2"
                        fill={isFull ? (isCrit ? '#EF4444' : '#10B981') : '#090F1B'}
                        stroke="#05080F"
                        strokeWidth="1.5"
                      />
                      {isFull && (
                        <rect
                          x="3"
                          y="2"
                          width="22"
                          height="2"
                          fill="rgba(255,255,255,0.35)"
                        />
                      )}
                    </svg>
                  );
                })}
              </div>

              {/* Continuous HP Bar with Trailing Ghost Damage Bar */}
              <div className="relative w-full h-2.5 rounded bg-[#05080F] overflow-hidden border border-slate-800 mb-2">
                <div
                  className="absolute inset-y-0 left-0 bg-amber-400/70"
                  style={{ width: `${Math.min(100, (hud.trailingHp / Math.max(1, hud.maxHp)) * 100)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500"
                  style={{ width: `${Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100)}%` }}
                />
              </div>

              {/* Cyber Overdrive Core Meter */}
              <div className="flex items-center justify-between text-[11px] font-mono-num mb-1">
                <span className={hud.overdriveActive ? 'text-amber-300 font-bold' : 'text-amber-400'}>
                  {hud.overdriveActive
                    ? `OVERDRIVE ACTIVE (${hud.overdriveRemainingSec}s)`
                    : 'OVERDRIVE CORE'}
                </span>
                <span className="text-amber-300 font-bold">
                  {hud.overdriveActive ? '2X DPS' : `${hud.overdriveCharge}%`}
                </span>
              </div>
              <div className="w-full h-2 rounded bg-[#05080F] overflow-hidden border border-slate-800 mb-2">
                <div
                  className="h-full bg-[#F59E0B]"
                  style={{
                    width: `${
                      hud.overdriveActive
                        ? Math.min(100, (hud.overdriveRemainingSec / 8) * 100)
                        : Math.min(100, hud.overdriveCharge)
                    }%`,
                  }}
                />
              </div>

              {/* XP & Level Bar */}
              <div className="flex items-center justify-between text-[11px] text-sky-300 font-mono-num mb-1">
                <span>MECH LV.{hud.level}</span>
                <span>
                  {hud.xp}/{hud.xpToNext} XP
                </span>
              </div>
              <div className="w-full h-2 rounded bg-[#05080F] overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-[#38BDF8]"
                  style={{ width: `${Math.min(100, (hud.xp / Math.max(1, hud.xpToNext)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Cluster 2 (Top-Center): 10-Minute Survival Clock, Wave 1-10, Combo Streak & Boss Bar */}
            <div className="hud-panel rounded-xl px-5 py-2.5 text-center pointer-events-auto">
              <div className="flex items-center justify-center gap-3">
                <div className="text-left">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    SECTOR WAVE
                  </div>
                  <div className="hud-numeral text-2xl font-black text-[#F59E0B]">
                    WAVE {hud.wave}/10
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    EXTRACTION TIMER
                  </div>
                  <div className="hud-numeral text-3xl font-black text-white">
                    {minsStr}:{secsStr}
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-800" />
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    KILL STREAK
                  </div>
                  <div className="hud-numeral text-2xl font-black text-sky-400">
                    {hud.comboCount}x ({hud.comboMultiplier.toFixed(2)}x)
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 font-medium mt-0.5">
                {hud.waveTitle}
                {hud.isHighOptInReviveZone && (
                  <span className="text-amber-400 font-semibold"> · High-Threat Zone</span>
                )}
              </div>

              {/* Boss Health Bar when Dreadnought is active */}
              {hud.bossActive && (
                <div className="mt-2 w-64 mx-auto">
                  <div className="flex items-center justify-between text-[10px] font-bold text-red-400 mb-0.5">
                    <span>{hud.bossName}</span>
                    <span className="font-mono-num">
                      {hud.bossHp}/{hud.bossMaxHp}
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded bg-[#05080F] border border-red-500/40 overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${Math.min(100, (hud.bossHp / Math.max(1, hud.bossMaxHp)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Cluster 3 (Top-Right): Gold, Parts, Kills & Compact Utility Icon Controls */}
            <div className="flex flex-col items-end gap-2 pointer-events-auto">
              <div className="hud-panel rounded-xl px-3.5 py-2 flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">GOLD</div>
                  <div className="hud-numeral text-xl font-black text-[#F59E0B]">
                    {hud.runGold}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">PARTS</div>
                  <div className="hud-numeral text-xl font-black text-sky-400">
                    {hud.runParts}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">KILLS</div>
                  <div className="hud-numeral text-xl font-black text-white">
                    {hud.kills}
                  </div>
                </div>

                {/* Utility Controls: TimeScale, Mute [M], Pause [P], Restart [R] */}
                <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Toggle simulation speed"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setTimeScale((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : 1));
                    }}
                    className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-mono-num font-bold text-amber-400 cursor-pointer"
                  >
                    {timeScale}x
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      soundEngine.muted = !soundEngine.muted;
                      setMuted(soundEngine.muted);
                    }}
                    className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                      {muted ? (
                        <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                      ) : (
                        <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                      )}
                    </svg>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Pause game"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setGameState('paused');
                      setSubModal('PAUSE_MENU');
                    }}
                    className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Restart run"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      startCombatRun();
                    }}
                    className="w-9 h-9 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Perimeter Dock: Active Combat Abilities + Tactical Wave / Ad Flow Quick-Triggers */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            {/* Active Combat Ability Dock: [SPACE] Dash, [E] Cyber Overdrive, [Q] Orbital Strike */}
            <div className="hud-panel rounded-xl px-3.5 py-2 flex flex-wrap items-center gap-2.5 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.triggerDash();
                }}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-xs font-mono-num font-bold text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                [SPACE] Dash ({Math.round(hud.dashCooldownRatio * 100)}%)
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.triggerOverdrive();
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono-num font-extrabold cursor-pointer whitespace-nowrap shrink-0 ${
                  hud.overdriveActive
                    ? 'bg-amber-400 text-[#070B12] border-amber-300'
                    : 'bg-amber-500/25 hover:bg-amber-500/35 border-amber-400/50 text-[#F59E0B]'
                }`}
              >
                {hud.overdriveActive
                  ? `[E] OVERDRIVE ON (${hud.overdriveRemainingSec}s)`
                  : `[E] Cyber Overdrive (${hud.overdriveCharge}%)`}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.triggerOrbitalStrike();
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-500/25 hover:bg-purple-500/35 border border-purple-400/50 text-xs font-mono-num font-bold text-purple-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                [Q] Orbital Strike ({Math.round(hud.orbitalCooldownRatio * 100)}%)
              </button>

              <div className="text-xs text-slate-300 font-mono-num flex items-center gap-1.5 pl-1 border-l border-slate-800">
                <span>Plasma Lv.{hud.activeSkills.plasma_repeater || 1}</span>
                {hud.activeSkills.orbital_blades > 0 && (
                  <>
                    <span>·</span>
                    <span>Blades Lv.{hud.activeSkills.orbital_blades}</span>
                  </>
                )}
                {hud.activeSkills.omega_singularity > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-[#F59E0B] font-bold">
                      OMEGA Lv.{hud.activeSkills.omega_singularity}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Tactical Sector Jump & Ad Trigger Inspector Bar */}
            <div className="hud-panel rounded-xl px-3 py-1.5 flex flex-wrap items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.triggerSwarmSurge();
                }}
                className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-[11px] font-bold text-red-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                +18 Swarm Surge
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.jumpToWave(5);
                }}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                Wave 5 Boss
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.jumpToWave(8);
                }}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-amber-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                Wave 8/10 Swarm
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleLevelUpReady(hud.level + 1, hud.activeSkills);
                }}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                Level-Up Reroll
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  canvasHandleRef.current?.spawnDemoBossChest();
                }}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-emerald-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                Boss Loot Chest
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setFrozenEndSnapshot(hud);
                  setGameState('paused');
                  setSubModal('REVIVE_PROMPT');
                }}
                className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] font-bold text-[#F59E0B] cursor-pointer whitespace-nowrap shrink-0"
              >
                Wave 8 Revive Ad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. LEVEL-UP MODAL + FREE SKILL REROLL (ADIVERY REWARDED TRIGGER #2) */}
      {/* =================================================================== */}
      {subModal === 'LEVEL_UP' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Level Up Tactical Augmentation"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070D]/85 p-4 pointer-events-auto"
        >
          <div className="w-full max-w-2xl rounded-xl hud-panel p-6 text-[#F1F5F9] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <div className="text-xs font-mono-num text-sky-400">
                  CYBER CORE UPGRADE · MECH LEVEL {hud.level}
                </div>
                <h2 className="font-display text-3xl font-black tracking-wide text-white">
                  SELECT TACTICAL AUGMENTATION
                </h2>
              </div>

              {/* Free Skill Reroll via Yektanet Adivery */}
              <button
                type="button"
                onClick={() => setActiveAdPlacement('SKILL_REROLL')}
                className="px-4 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-400 text-[#070B12] text-xs font-extrabold tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Free Skill Reroll (Watch Adivery Ad)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {skillChoices.map((choice) => (
                <button
                  key={choice.skill.id}
                  type="button"
                  onClick={() => handleSelectSkillChoice(choice)}
                  className="text-left rounded-xl bg-[#090F1B] hover:bg-[#0F192D] border border-slate-700 hover:border-sky-400 p-4 flex flex-col justify-between transition-all cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono-num text-slate-400 mb-1.5">
                      <span>{choice.skill.category}</span>
                      <span className="text-sky-400 font-bold">Lv.{choice.nextLevel}</span>
                    </div>
                    <h3 className="font-display text-xl font-extrabold text-white mb-1">
                      {choice.skill.name}
                    </h3>
                    <div className="text-xs font-semibold text-[#F59E0B] mb-2">
                      {choice.skill.roleClue}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed mb-3">
                      {choice.skill.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 text-xs font-bold text-sky-300">
                    {choice.isOverclockedBonus
                      ? 'Adivery Overclock (+2 Lv)'
                      : 'Install Augmentation'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. BOSS LOOT CHEST MODAL (ADIVERY DOUBLE LOOT TRIGGER #3)           */}
      {/* =================================================================== */}
      {subModal === 'BOSS_CHEST' && activeBossChest && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Boss Supply Cache Recovered"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070D]/85 p-4 pointer-events-auto"
        >
          <div className="w-full max-w-lg rounded-xl hud-panel-amber p-6 text-[#F1F5F9] shadow-2xl">
            <div className="text-xs font-mono-num text-amber-400 mb-1">
              DREADNOUGHT CACHE RECOVERED · WAVE {activeBossChest.wave}
            </div>
            <h2 className="font-display text-3xl font-black tracking-wide text-white mb-1">
              BOSS LOOT CHEST UNLOCKED
            </h2>
            <p className="text-xs text-slate-300 mb-5">
              Defeated {activeBossChest.bossName} · Salvaged {activeBossChest.equipmentItemName}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-4">
                <div className="text-xs text-slate-400">Gold Credits</div>
                <div className="font-display text-3xl font-black text-[#F59E0B] font-mono-num">
                  +{activeBossChest.finalGold}
                </div>
              </div>
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-4">
                <div className="text-xs text-slate-400">Equipment Parts</div>
                <div className="font-display text-3xl font-black text-sky-400 font-mono-num">
                  +{activeBossChest.finalParts}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {!activeBossChest.doubledViaAd && (
                <button
                  type="button"
                  onClick={() => setActiveAdPlacement('DOUBLE_BOSS_LOOT')}
                  className="px-5 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-400 text-[#070B12] text-xs font-extrabold tracking-wide cursor-pointer whitespace-nowrap shrink-0"
                >
                  Double Boss Loot (2x via Adivery Ad)
                </button>
              )}
              <button
                type="button"
                onClick={handleClaimBossChest}
                className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#070B12] text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
              >
                {activeBossChest.doubledViaAd ? 'Collect 2x Boss Loot' : 'Collect Standard Loot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. WAVE 8/10 OR BOSS FIGHT REVIVE PROMPT (85% OPT-IN TRIGGER #1)    */}
      {/* =================================================================== */}
      {subModal === 'REVIVE_PROMPT' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Emergency Cyber-Revive Prompt"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070D]/90 p-4 pointer-events-auto"
        >
          <div className="w-full max-w-lg rounded-xl hud-panel-amber p-6 text-[#F1F5F9] shadow-2xl">
            <div className="flex items-center justify-between text-xs font-mono-num text-amber-400 mb-1">
              <span>CRITICAL HULL BREACH · WAVE {hud.wave}/10</span>
              <span>85% PLAYER OPT-IN RATE</span>
            </div>
            <h2 className="font-display text-3xl font-black tracking-wide text-white mb-2">
              EMERGENCY CYBER-REVIVE AVAILABLE
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Don&apos;t lose your Lv.{hud.level} Mech build and {hud.runGold} Gold! Watch a 30s Yektanet Adivery video to repair 100% Hull HP and unleash an orbital EMP shockwave.
            </p>

            <div className="grid grid-cols-3 gap-2.5 mb-5 text-center font-mono-num">
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-3">
                <div className="text-[11px] text-slate-400">Wave Reached</div>
                <div className="text-lg font-bold text-white">Wave {hud.wave}/10</div>
              </div>
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-3">
                <div className="text-[11px] text-slate-400">Run Loot At Risk</div>
                <div className="text-lg font-bold text-[#F59E0B]">{hud.runGold}G</div>
              </div>
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-3">
                <div className="text-[11px] text-slate-400">Revives Left</div>
                <div className="text-lg font-bold text-emerald-400">{2 - revivesUsed}/2</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => finalizeRunAndBankLoot(frozenEndSnapshot || hud, 'DEFEAT')}
                className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                End Run
              </button>
              <button
                type="button"
                onClick={() => setActiveAdPlacement('REVIVE_WAVE_BOSS')}
                className="px-6 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-400 text-[#070B12] text-xs font-extrabold tracking-wide cursor-pointer whitespace-nowrap shrink-0"
              >
                Revive Full HP + EMP Blast (Watch Adivery Ad)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 6. PAUSE MODAL                                                      */}
      {/* =================================================================== */}
      {subModal === 'PAUSE_MENU' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game Paused"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070D]/85 p-4 pointer-events-auto"
        >
          <div className="w-full max-w-md rounded-xl hud-panel p-6 text-[#F1F5F9] shadow-2xl">
            <h2 className="font-display text-3xl font-black tracking-wide text-white mb-1">
              TACTICAL PAUSE
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Wave {hud.wave}/10 · {hud.kills} Hostiles Neutralized
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSubModal('NONE');
                  setGameState('playing');
                }}
                className="w-full py-3 rounded-lg bg-[#38BDF8] hover:bg-sky-300 text-[#070B12] font-bold text-xs cursor-pointer"
              >
                Resume Mission
              </button>
              <button
                type="button"
                onClick={() => startCombatRun()}
                className="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs cursor-pointer"
              >
                Restart Run
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubModal('NONE');
                  setGameState('title');
                }}
                className="w-full py-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 7. VICTORY / DEFEAT STATUS MODAL ('gameover')                       */}
      {/* =================================================================== */}
      {gameState === 'gameover' && (subModal === 'VICTORY' || subModal === 'DEFEAT') && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={subModal === 'VICTORY' ? 'Sector Cleared Victory' : 'Mission Defeat Summary'}
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#04070D]/90 p-4 pointer-events-auto"
        >
          <div className="w-full max-w-lg rounded-xl hud-panel p-6 text-[#F1F5F9] shadow-2xl">
            <div className="text-xs font-mono-num text-sky-400 mb-1">
              {subModal === 'VICTORY'
                ? '10:00 EXTRACTION COMPLETE · SECTOR SECURED'
                : 'MECH CHASSIS OFFLINE · TELEMETRY ARCHIVED'}
            </div>
            <h2 className="font-display text-4xl font-black tracking-wide text-white mb-4">
              {subModal === 'VICTORY' ? 'VICTORY: HIVE SOVEREIGN DEFEATED' : 'MISSION TERMINATED'}
            </h2>

            <div className="grid grid-cols-3 gap-3 mb-6 font-mono-num">
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">Wave Reached</div>
                <div className="text-xl font-bold text-white">
                  Wave {(frozenEndSnapshot || hud).wave}/10
                </div>
              </div>
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">Drones Destroyed</div>
                <div className="text-xl font-bold text-sky-400">
                  {(frozenEndSnapshot || hud).kills}
                </div>
              </div>
              <div className="rounded-lg bg-[#070B12] border border-slate-800 p-3.5">
                <div className="text-[11px] text-slate-400">Gold Banked</div>
                <div className="text-xl font-bold text-[#F59E0B]">
                  +{(frozenEndSnapshot || hud).runGold}G
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSubModal('NONE');
                  setGameState('title');
                  setHangarOpen(true);
                }}
                className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Hangar Upgrades
              </button>
              <button
                type="button"
                data-start="true"
                onClick={() => startCombatRun()}
                className="px-6 py-2.5 rounded-lg bg-[#38BDF8] hover:bg-sky-300 text-[#070B12] text-xs font-extrabold tracking-wide cursor-pointer whitespace-nowrap shrink-0"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 8. HANGAR & OFFLINE IDLE EXTRACTOR MODAL                            */}
      {/* =================================================================== */}
      <HangarIdleModal
        isOpen={hangarOpen}
        onClose={() => setHangarOpen(false)}
        gold={profile.gold}
        parts={profile.parts}
        levels={profile.levels}
        computedStats={computedStats}
        pendingIdle={pendingIdle}
        onClaimIdleNormal={handleClaimIdleNormal}
        onClaimIdleDoubleViaAd={() => setActiveAdPlacement('DOUBLE_IDLE_INCOME')}
        onSimulateOfflineTime={handleSimulateOffline30Min}
        onPurchaseUpgrade={handlePurchaseHangarUpgrade}
      />

      {/* =================================================================== */}
      {/* 9. FLUTTER + YEKTANET ADIVERY SDK SOURCE CODE MODAL                 */}
      {/* =================================================================== */}
      <FlutterCodeModal
        isOpen={flutterModalOpen}
        onClose={() => setFlutterModalOpen(false)}
      />

      {/* =================================================================== */}
      {/* 10. YEKTANET ADIVERY REWARDED AD PLAYER OVERLAY                     */}
      {/* =================================================================== */}
      <AdiveryAdModal
        placementKey={activeAdPlacement}
        onCompleteReward={handleAdRewardCompleted}
        onCancel={() => setActiveAdPlacement(null)}
      />
    </main>
  );
}
