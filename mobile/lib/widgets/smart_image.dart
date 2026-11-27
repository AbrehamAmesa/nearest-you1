import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../core/theme/app_theme.dart';

class SmartImage extends StatelessWidget {
  final String? source;
  final double? width;
  final double? height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final IconData fallbackIcon;

  const SmartImage({
    super.key,
    required this.source,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.fallbackIcon = Icons.storefront_outlined,
  });

  Uint8List? _decodeDataUrl(String raw) {
    final idx = raw.indexOf('base64,');
    if (idx < 0) return null;
    try {
      return base64Decode(raw.substring(idx + 7).replaceAll('\n', '').trim());
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget child;
    final src = (source ?? '').trim();
    if (src.isEmpty) {
      child = _fallback();
    } else if (src.startsWith('data:image')) {
      final bytes = _decodeDataUrl(src);
      if (bytes != null && bytes.isNotEmpty) {
        child = Image.memory(
          bytes,
          width: width,
          height: height,
          fit: fit,
          errorBuilder: (_, __, ___) => _fallback(),
        );
      } else {
        child = _fallback();
      }
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      child = Image.network(
        src,
        width: width,
        height: height,
        fit: fit,
        errorBuilder: (_, __, ___) => _fallback(),
      );
    } else {
      child = _fallback();
    }

    if (borderRadius != null) {
      return ClipRRect(borderRadius: borderRadius!, child: child);
    }
    return child;
  }

  Widget _fallback() {
    return Container(
      width: width,
      height: height,
      color: AppTheme.primaryLight,
      alignment: Alignment.center,
      child: Icon(
        fallbackIcon,
        color: AppTheme.primary.withAlpha(166),
        size: 30,
      ),
    );
  }
}
