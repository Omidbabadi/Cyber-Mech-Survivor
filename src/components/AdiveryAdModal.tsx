import React, { useEffect, useState } from 'react';
import { ADIVERY_PLACEMENTS, AdPlacementKey } from '../game/rules';

interface AdiveryAdModalProps {
  placementKey: AdPlacementKey | null;
  onCompleteReward: (placementKey: AdPlacementKey) => void;
  onCancel: () => void;
}

export const AdiveryAdModal: React.FC<AdiveryAdModalProps> = ({
  placementKey,
  onCompleteReward,
  onCancel,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(3);
  const [sdkStep, setSdkStep] = useState<'LOADING' | 'SHOWING' | 'REWARD_READY'>('LOADING');

  useEffect(() => {
    if (!placementKey) return;
    setSecondsLeft(3);
    setSdkStep('LOADING');

    const loadTimer = window.setTimeout(() => {
      setSdkStep('SHOWING');
    }, 220);

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setSdkStep('REWARD_READY');
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 900);

    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(interval);
    };
  }, [placementKey]);

  if (!placementKey) return null;

  const placement = ADIVERY_PLACEMENTS[placementKey];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Yektanet Adivery Rewarded Ad: ${placement.title}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070D]/90 p-4 pointer-events-auto"
    >
      <div className="w-full max-w-lg rounded-xl hud-panel-amber p-6 text-[#F1F5F9] shadow-2xl">
        {/* Top bar: Yektanet Adivery SDK Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#F59E0B]" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
            </svg>
            <div>
              <div className="text-sm font-bold tracking-wide text-[#F59E0B]">
                YEKTANET ADIVERY · REWARDED VIDEO SDK
              </div>
              <div className="text-xs text-slate-400 font-mono-num">
                Placement: {placement.placementId}
              </div>
            </div>
          </div>
          <span className="text-xs font-mono-num text-amber-300">
            {placement.optInRateLabel}
          </span>
        </div>

        {/* Simulated Video Showcase */}
        <div className="relative rounded-lg bg-[#070B12] border border-slate-800 p-5 mb-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-mono-num text-sky-400 truncate">
              AdiveryPlugin.showRewardedAd(&apos;{placement.placementId}&apos;)
            </span>
            <span className="text-xs font-mono-num text-amber-400 whitespace-nowrap shrink-0">
              {secondsLeft > 0 ? `Reward in ${secondsLeft}s...` : 'onRewardedAdClosed(true)'}
            </span>
          </div>

          <h3 className="font-display text-2xl font-extrabold tracking-wide text-white mb-1">
            {placement.title}
          </h3>
          <p className="text-xs text-slate-300 mb-4">{placement.subtitle}</p>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 mb-3">
            <div
              className="h-full bg-[#F59E0B]"
              style={{ width: `${((3 - secondsLeft) / 3) * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
            <span className="shrink-0">Reward Payload:</span>
            <span className="text-emerald-400 font-semibold text-right">{placement.rewardSummary}</span>
          </div>
        </div>

        {/* SDK Lifecycle Trace */}
        <div className="rounded bg-[#05080F] border border-slate-800/80 px-3 py-2.5 mb-5 font-mono-num text-xs text-slate-400 space-y-1 overflow-hidden">
          <div className="truncate">
            1. prepareRewardedAd(&apos;{placement.placementId}&apos;) ·{' '}
            <span className="text-emerald-400">LOADED</span>
          </div>
          <div className="truncate">
            2. AdiveryListener.onRewardedAdShown ·{' '}
            <span className="text-sky-400">{sdkStep === 'LOADING' ? 'INITIALIZING' : 'ACTIVE'}</span>
          </div>
          <div className="truncate">
            3. onRewardedAdClosed(isRewarded: true) ·{' '}
            <span className={secondsLeft === 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}>
              {secondsLeft === 0 ? 'VERIFIED' : 'STREAMING (30s Sim)'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Skip Ad (Forfeit Reward)
          </button>
          <button
            type="button"
            data-ad-confirm="true"
            onClick={() => onCompleteReward(placementKey)}
            className="px-5 py-2.5 rounded-lg bg-[#F59E0B] hover:bg-amber-400 text-[#070B12] text-xs font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {secondsLeft === 0
              ? 'Claim Adivery Reward'
              : `Complete Ad Now (${secondsLeft}s)`}
          </button>
        </div>
      </div>
    </div>
  );
};
