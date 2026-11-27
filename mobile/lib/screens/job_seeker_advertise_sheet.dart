import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../core/config/app_config.dart';
import '../core/providers/app_state.dart';
import '../core/theme/app_theme.dart';
import '../widgets/smart_image.dart';
import 'auth_sheet.dart';

class JobSeekerAdvertiseSheet extends StatefulWidget {
  const JobSeekerAdvertiseSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => const JobSeekerAdvertiseSheet(),
    );
  }

  @override
  State<JobSeekerAdvertiseSheet> createState() =>
      _JobSeekerAdvertiseSheetState();
}

class _JobSeekerAdvertiseSheetState extends State<JobSeekerAdvertiseSheet> {
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _skillsCtrl = TextEditingController();
  final _expCtrl = TextEditingController();
  final _availCtrl = TextEditingController(text: 'Available immediately');
  final _payCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _landmarkCtrl = TextEditingController();
  final _videoUrlCtrl = TextEditingController();

  String _subCity = 'Bole';
  String _pricingModel = 'PER_MONTH';
  bool _negotiable = true;
  int? _categoryId;
  final List<String> _imageUrls = [];
  String? _cvUrl;
  String? _cvFileName;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    _phoneCtrl.text = app.currentUser?.phoneNumber ?? '';
    _subCity = AppConfig.addisSubCities.contains(app.currentUser?.defaultSubCity)
        ? app.currentUser!.defaultSubCity
        : 'Bole';
    final jobsCat = app.categories.where(
        (c) => c.slug.contains('job') || c.categoryType.toUpperCase() == 'JOB');
    _categoryId = jobsCat.isNotEmpty
        ? jobsCat.first.id
        : (app.categories.isNotEmpty ? app.categories.first.id : null);
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _skillsCtrl.dispose();
    _expCtrl.dispose();
    _availCtrl.dispose();
    _payCtrl.dispose();
    _phoneCtrl.dispose();
    _landmarkCtrl.dispose();
    _videoUrlCtrl.dispose();
    super.dispose();
  }

  Future<void> _addPhoto() async {
    if (_imageUrls.length >= 5) return;
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 75,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _imageUrls.add('data:image/jpeg;base64,${base64Encode(bytes)}');
    });
  }

  Future<void> _pickCv() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'doc', 'docx'],
      withData: true,
    );
    if (res == null || res.files.isEmpty) return;
    final f = res.files.first;
    if (f.bytes == null) return;
    final mime = f.extension == 'pdf' ? 'application/pdf' : 'application/octet-stream';
    setState(() {
      _cvFileName = f.name;
      _cvUrl = 'data:$mime;base64,${base64Encode(f.bytes!)}';
    });
  }

  Future<void> _submit() async {
    final app = context.read<AppState>();
    if (app.currentUser == null) {
      final ok = await AuthSheet.show(context);
      if (ok != true || !mounted) return;
    }
    if (_titleCtrl.text.trim().isEmpty || _descCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Please enter your role title and bio.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await app.api.advertiseAsJobSeeker({
        if (_categoryId != null) 'categoryId': _categoryId,
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'skills': _skillsCtrl.text.trim(),
        'experienceSummary': _expCtrl.text.trim(),
        'availabilityNote': _availCtrl.text.trim(),
        'pricingModel': _pricingModel,
        'pricingUnit': _pricingModel == 'PER_HOUR'
            ? 'HOUR'
            : (_pricingModel == 'PER_DAY' ? 'DAY' : 'MONTH'),
        if (_payCtrl.text.trim().isNotEmpty)
          'expectedPay': double.tryParse(_payCtrl.text.trim()) ?? 0,
        'negotiable': _negotiable,
        'phoneNumber': _phoneCtrl.text.trim(),
        'subCity': _subCity,
        'landmark': _landmarkCtrl.text.trim().isEmpty
            ? _subCity
            : _landmarkCtrl.text.trim(),
        'latitude': app.userLat,
        'longitude': app.userLng,
        'imageUrls': _imageUrls,
        if (_cvUrl != null) 'cvUrl': _cvUrl,
        if (_cvFileName != null) 'cvFileName': _cvFileName,
        if (_videoUrlCtrl.text.trim().isNotEmpty)
          'introVideoUrl': _videoUrlCtrl.text.trim(),
      });
      await app.loadCatalog(silent: true);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      expand: false,
      builder: (_, scrollCtrl) => Padding(
        padding: EdgeInsets.fromLTRB(
            18, 12, 18, MediaQuery.of(context).viewInsets.bottom + 24),
        child: ListView(
          controller: scrollCtrl,
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
              'Advertise Yourself (Job Seeker)',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const Text(
              'Publish your profile so nearby employers can hire & chat with you.',
              style: TextStyle(fontSize: 12.5, color: AppTheme.mutedInk),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: AppTheme.danger)),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                  labelText: 'Profession / Role Title *'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                  labelText: 'About Your Experience & Services *'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _skillsCtrl,
              decoration: const InputDecoration(
                  labelText: 'Skills (comma separated)'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _pricingModel,
                    decoration:
                        const InputDecoration(labelText: 'Rate Structure'),
                    items: const [
                      DropdownMenuItem(
                          value: 'PER_MONTH', child: Text('Per Month')),
                      DropdownMenuItem(
                          value: 'PER_DAY', child: Text('Per Day')),
                      DropdownMenuItem(
                          value: 'PER_HOUR', child: Text('Per Hour')),
                      DropdownMenuItem(
                          value: 'ONE_TIME_CONTRACT',
                          child: Text('One-Time Contract')),
                    ],
                    onChanged: (v) =>
                        setState(() => _pricingModel = v ?? 'PER_MONTH'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _payCtrl,
                    keyboardType: TextInputType.number,
                    decoration:
                        const InputDecoration(labelText: 'Expected ETB'),
                  ),
                ),
              ],
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _negotiable,
              onChanged: (v) => setState(() => _negotiable = v ?? true),
              title: const Text('Pay is negotiable'),
            ),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _subCity,
                    decoration: const InputDecoration(labelText: 'Sub-City'),
                    items: AppConfig.addisSubCities
                        .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                        .toList(),
                    onChanged: (v) => setState(() => _subCity = v ?? 'Bole'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _phoneCtrl,
                    decoration: const InputDecoration(labelText: 'Phone Number'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _videoUrlCtrl,
              decoration: const InputDecoration(
                  labelText: 'YouTube Intro Video URL (optional)'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _addPhoto,
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label: Text('Add Photo (${_imageUrls.length}/5)'),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  onPressed: _pickCv,
                  icon: const Icon(Icons.attach_file_rounded),
                  label: Text(_cvFileName ?? 'Upload CV (PDF)'),
                ),
              ],
            ),
            if (_imageUrls.isNotEmpty) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 68,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _imageUrls.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => SmartImage(
                    source: _imageUrls[i],
                    width: 68,
                    height: 68,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: Text(
                    _submitting ? 'Publishing...' : 'Publish Job Seeker Ad'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
