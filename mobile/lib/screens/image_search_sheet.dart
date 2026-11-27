import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../widgets/smart_image.dart';
import 'listing_detail_sheet.dart';

class ImageSearchSheet extends StatefulWidget {
  const ImageSearchSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => const ImageSearchSheet(),
    );
  }

  @override
  State<ImageSearchSheet> createState() => _ImageSearchSheetState();
}

class _ImageSearchSheetState extends State<ImageSearchSheet> {
  final ImagePicker _picker = ImagePicker();
  bool _searching = false;
  String? _previewBase64;
  String? _error;
  String? _detectedLabel;
  List<RecommendedItem> _results = [];

  Future<void> _pickAndSearch(ImageSource source) async {
    final file = await _picker.pickImage(
      source: source,
      maxWidth: 1024,
      imageQuality: 75,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final b64 = base64Encode(bytes);
    final app = context.read<AppState>();

    setState(() {
      _previewBase64 = 'data:image/jpeg;base64,$b64';
      _searching = true;
      _error = null;
      _results = [];
    });

    try {
      final res = await app.api.searchByImage(
        imageBase64: b64,
        mimeType: 'image/jpeg',
        lat: app.userLat,
        lng: app.userLng,
      );
      final analysis = res['analysis'] is Map
          ? Map<String, dynamic>.from(res['analysis'] as Map)
          : const <String, dynamic>{};
      final rawMatches = (res['results'] as List?) ?? const [];
      if (mounted) {
        setState(() {
          _detectedLabel = parseNullableStr(
              analysis['detectedItem'] ?? analysis['primaryQuery']);
          _results = rawMatches
              .map((e) =>
                  RecommendedItem.fromJson(Map<String, dynamic>.from(e as Map)))
              .toList();
          _searching = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _searching = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.80,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.border,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Search by Camera or Image',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const Text(
              'Take a photo or choose an image to find the nearest matching products & services.',
              style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed:
                        _searching ? null : () => _pickAndSearch(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt_outlined),
                    label: const Text('Take Photo'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed:
                        _searching ? null : () => _pickAndSearch(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Upload Photo'),
                  ),
                ),
              ],
            ),
            if (_previewBase64 != null) ...[
              const SizedBox(height: 12),
              SmartImage(
                source: _previewBase64,
                height: 120,
                width: double.infinity,
                borderRadius: BorderRadius.circular(12),
              ),
            ],
            if (_detectedLabel != null) ...[
              const SizedBox(height: 8),
              Chip(
                avatar: const Icon(Icons.auto_awesome_rounded,
                    size: 16, color: AppTheme.primary),
                label: Text('Detected: $_detectedLabel'),
                backgroundColor: AppTheme.primaryLight,
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppTheme.danger)),
            ],
            const SizedBox(height: 8),
            Expanded(
              child: _searching
                  ? const Center(child: CircularProgressIndicator())
                  : _results.isEmpty
                      ? const Center(
                          child: Text(
                            'Capture or pick an image to find nearest matches.',
                            style: TextStyle(color: AppTheme.mutedInk),
                          ),
                        )
                      : ListView.separated(
                          controller: scrollCtrl,
                          itemCount: _results.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final item = _results[i];
                            return Card(
                              child: ListTile(
                                onTap: () {
                                  Navigator.pop(context);
                                  ListingDetailSheet.show(
                                    context,
                                    listing: item.listing,
                                    business: item.business,
                                  );
                                },
                                leading: SmartImage(
                                  source: item.listing.primaryImage,
                                  width: 54,
                                  height: 54,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                title: Text(
                                  item.listing.title,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700),
                                ),
                                subtitle: Text(
                                  '${item.business.businessName} · ${item.distanceKm?.toStringAsFixed(1) ?? '-'} km',
                                  style: const TextStyle(fontSize: 12),
                                ),
                                trailing: Text(
                                  AppConfig.formatEtb(item.effectivePrice),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: AppTheme.primary,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
