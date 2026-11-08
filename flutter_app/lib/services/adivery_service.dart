import 'package:adivery/adivery.dart';
import 'package:adivery/adivery_ads.dart';
import 'package:flutter/foundation.dart';

/// Yektanet Adivery Mediation Service for Pocket Survivor: Cyber Mechs
class AdiveryMonetizationService {
  static const String appId = '7e94a1c0-88b4-4f2d-9c12-yektanetadivery';

  // Top 5 High-Conversion Roguelite Rewarded Ad Placements
  static const String placementReviveWave8Boss = 'adivery_rewarded_revive_wave8_boss_94a2';
  static const String placementSkillReroll = 'adivery_rewarded_skill_reroll_31c8';
  static const String placementDoubleBossLoot = 'adivery_rewarded_double_boss_chest_77e1';
  static const String placementTrialLegendary = 'adivery_rewarded_trial_omega_cannon_55f0';
  static const String placementDoubleIdleIncome = 'adivery_rewarded_double_idle_extractor_19b4';

  static void initialize() {
    AdiveryPlugin.initialize(appId);
    AdiveryPlugin.setLoggingEnabled(kDebugMode);

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
}
