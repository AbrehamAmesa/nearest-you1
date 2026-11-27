import 'dart:math' as math;

class AppConfig {
  /// Configured at build time via `--dart-define=API_BASE_URL=https://...`
  /// and overridable at runtime from Account -> Server URL settings.
  static const String defaultApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8080',
  );

  static const double addisCenterLat = 9.0192;
  static const double addisCenterLng = 38.7525;

  static const List<String> addisSubCities = [
    'Bole',
    'Yeka',
    'Kirkos',
    'Arada',
    'Lideta',
    'Addis Ketema',
    'Gulele',
    'Kolfe Keranio',
    'Nifas Silk-Lafto',
    'Akaki Kality',
    'Lemi Kura',
  ];

  static String normalizeBaseUrl(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return defaultApiBaseUrl;
    return trimmed.endsWith('/') ? trimmed.substring(0, trimmed.length - 1) : trimmed;
  }

  static String toWebSocketUrl(String httpBaseUrl, String token) {
    final base = normalizeBaseUrl(httpBaseUrl);
    final wsBase = base.startsWith('https://')
        ? base.replaceFirst('https://', 'wss://')
        : base.startsWith('http://')
            ? base.replaceFirst('http://', 'ws://')
            : 'ws://$base';
    return '$wsBase/api/v1/ws/chat?token=${Uri.encodeQueryComponent(token)}';
  }

  static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
    const earthRadiusKm = 6371.0;
    final dLat = _deg2rad(lat2 - lat1);
    final dLng = _deg2rad(lng2 - lng1);
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_deg2rad(lat1)) *
            math.cos(_deg2rad(lat2)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  static double _deg2rad(double deg) => deg * (math.pi / 180.0);

  static String formatEtb(num? amount) {
    final value = (amount ?? 0).toDouble();
    if (value == value.roundToDouble()) {
      return '${_withCommas(value.round().toString())} ETB';
    }
    return '${_withCommas(value.toStringAsFixed(2))} ETB';
  }

  static String _withCommas(String numStr) {
    final parts = numStr.split('.');
    final intPart = parts[0];
    final buf = StringBuffer();
    for (var i = 0; i < intPart.length; i++) {
      final posFromRight = intPart.length - i;
      if (i > 0 && posFromRight % 3 == 0 && intPart[i - 1] != '-') {
        buf.write(',');
      }
      buf.write(intPart[i]);
    }
    if (parts.length > 1) {
      buf.write('.${parts[1]}');
    }
    return buf.toString();
  }
}
