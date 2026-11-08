import 'dart:math';
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
}
