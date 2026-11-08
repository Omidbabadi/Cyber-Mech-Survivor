import React from 'react';
import {
  HANGAR_UPGRADES,
  HangarLevels,
  OfflineIdleReward,
  PlayerComputedStats,
  canAffordUpgrade,
  getUpgradeCost,
} from '../game/rules';

interface HangarIdleModalProps {
  isOpen: boolean;
  onClose: () => void;
  gold: number;
  parts: number;
  levels: HangarLevels;
  computedStats: PlayerComputedStats;
  pendingIdle: OfflineIdleReward;
  onClaimIdleNormal: () => void;
  onClaimIdleDoubleViaAd: () => void;
  onSimulateOfflineTime: () => void;
  onPurchaseUpgrade: (id: keyof HangarLevels) => void;
}

export const HangarIdleModal: React.FC<HangarIdleModalProps> = ({
  isOpen,
  onClose,
  gold,
  parts,
  levels,
  computedStats,
  pendingIdle,
  onClaimIdleNormal,
  onClaimIdleDoubleViaAd,
  onSimulateOfflineTime,
  onPurchaseUpgrade,
}) => {
  if (!isOpen) return null;

  const idleMinutes = Math.max(1, Math.round(pendingIdle.cappedSeconds / 60));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mech Hangar and Offline Idle Extractor"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#04070D]/90 p-4 pointer-events-auto"
    >
      <div className="w-full max-w-4xl rounded-xl hud-panel p-6 text-[#F1F5F9] shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-wide text-white">
              MECH HANGAR & OFFLINE IDLE EXTRACTOR
            </h2>
            <p className="text-xs text-slate-400">
              Collect passive offline resources and upgrade permanent Cyber Mech subsystems
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Gold Credits</div>
              <div className="font-display text-2xl font-extrabold text-[#F59E0B] font-mono-num">
                {gold.toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Mech Parts</div>
              <div className="font-display text-2xl font-extrabold text-sky-400 font-mono-num">
                {parts.toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap shrink-0"
            >
              Return to Bridge
            </button>
          </div>
        </div>

        {/* Section 1: Offline Idle Resource Collector */}
        <div className="rounded-xl hud-panel-amber p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-1">
                AUTONOMOUS MINING RIG · LV.{levels.idleExtractor} ({pendingIdle.goldPerMinute} Gold/m ·{' '}
                {pendingIdle.partsPerMinute.toFixed(1)} Parts/m)
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-1">
                Offline Storage Ready ({idleMinutes}m Accrued)
              </h3>
              <div className="flex items-center gap-4 text-sm font-mono-num text-slate-200">
                <span>
                  +<strong className="text-[#F59E0B]">{pendingIdle.goldEarned}</strong> Gold Credits
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  +<strong className="text-sky-400">{pendingIdle.partsEarned}</strong> Equipment Parts
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onSimulateOfflineTime}
                className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                +30m Offline Sim
              </button>
              <button
                type="button"
                disabled={pendingIdle.goldEarned <= 0}
                onClick={onClaimIdleNormal}
                className="px-4 py-2.5 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                Claim 1x ({pendingIdle.goldEarned}G)
              </button>
              <button
                type="button"
                disabled={pendingIdle.goldEarned <= 0}
                onClick={onClaimIdleDoubleViaAd}
                className="px-4 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-400 disabled:opacity-40 text-[#070B12] text-xs font-extrabold tracking-wide cursor-pointer whitespace-nowrap shrink-0"
              >
                2x Claim via Adivery Ad (+{pendingIdle.goldEarned * 2}G / +{pendingIdle.partsEarned * 2}P)
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Permanent Mech Subsystems */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-5">
          {HANGAR_UPGRADES.map((up) => {
            const currentLvl = levels[up.id];
            const cost = getUpgradeCost(up, currentLvl);
            const affordable = canAffordUpgrade(up, currentLvl, gold, parts);
            const isMax = currentLvl >= up.maxLevel;

            return (
              <div
                key={up.id}
                className="rounded-xl bg-[#090F1B] border border-slate-800 p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-0.5">
                    <span>{up.role}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num text-sky-400">
                      Lv.{currentLvl}/{up.maxLevel}
                    </span>
                  </div>
                  <h4 className="font-display text-xl font-bold text-white">{up.name}</h4>
                  <p className="text-xs text-emerald-400 mt-0.5">{up.perLevelStatLabel}</p>
                </div>

                <button
                  type="button"
                  disabled={!affordable || isMax}
                  onClick={() => onPurchaseUpgrade(up.id)}
                  className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isMax
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : affordable
                      ? 'bg-sky-500 hover:bg-sky-400 text-[#070B12]'
                      : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isMax ? 'MAXED' : `Upgrade (${cost.gold}G · ${cost.parts}P)`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Current Computed Mech Spec Sheet */}
        <div className="rounded-lg bg-[#05080F] border border-slate-800/80 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 font-mono-num">
          <span>Hull Integrity: {computedStats.maxHp} HP ({computedStats.hpRegenPerSec}/s)</span>
          <span>·</span>
          <span>Plasma Multiplier: {(computedStats.damageMultiplier * 100).toFixed(0)}%</span>
          <span>·</span>
          <span>Thruster Speed: {computedStats.moveSpeed} px/s</span>
          <span>·</span>
          <span>Tractor Radius: {computedStats.magnetRadius} px</span>
        </div>
      </div>
    </div>
  );
};
