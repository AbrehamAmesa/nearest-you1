import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import '../core/config/app_config.dart';
import '../core/models/models.dart';
import '../core/providers/app_state.dart';
import '../core/services/ws_service.dart';
import '../core/theme/app_theme.dart';

class LiveChatSheet extends StatefulWidget {
  final String? threadKey;
  final int? businessId;
  final int? listingId;
  final int? orderId;
  final int? bookingId;
  final String? recipientUid;
  final String title;
  final String? subtitle;
  final double? defaultAmount;
  final String? defaultContractType;

  const LiveChatSheet({
    super.key,
    this.threadKey,
    this.businessId,
    this.listingId,
    this.orderId,
    this.bookingId,
    this.recipientUid,
    required this.title,
    this.subtitle,
    this.defaultAmount,
    this.defaultContractType,
  });

  static Future<void> show(
    BuildContext context, {
    String? threadKey,
    int? businessId,
    int? listingId,
    int? orderId,
    int? bookingId,
    String? recipientUid,
    required String title,
    String? subtitle,
    double? defaultAmount,
    String? defaultContractType,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => LiveChatSheet(
        threadKey: threadKey,
        businessId: businessId,
        listingId: listingId,
        orderId: orderId,
        bookingId: bookingId,
        recipientUid: recipientUid,
        title: title,
        subtitle: subtitle,
        defaultAmount: defaultAmount,
        defaultContractType: defaultContractType,
      ),
    );
  }

  @override
  State<LiveChatSheet> createState() => _LiveChatSheetState();
}

class _LiveChatSheetState extends State<LiveChatSheet> {
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();

  StreamSubscription<WsEvent>? _wsSub;
  Timer? _recTimer;
  String? _activeThreadKey;
  bool _loading = true;
  bool _sending = false;
  bool _recording = false;
  int _recordSeconds = 0;
  String? _playingMessageKey;
  String? _error;
  bool _showContracts = false;

  List<ChatMessage> _messages = [];
  List<ServiceContractRecord> _contracts = [];
  bool _otherActive = false;
  String? _otherName;

  @override
  void initState() {
    super.initState();
    _activeThreadKey = widget.threadKey;
    final app = context.read<AppState>();
    _wsSub = app.ws.events.listen((ev) {
      if (!mounted) return;
      if (ev.type == 'chat:message') {
        final msgMap = ev.payload['message'] is Map
            ? Map<String, dynamic>.from(ev.payload['message'] as Map)
            : ev.payload;
        final msg = ChatMessage.fromJson(msgMap);
        if (_activeThreadKey == null ||
            msg.threadKey == _activeThreadKey) {
          _activeThreadKey ??= msg.threadKey;
          if (!_messages.any((m) => m.id == msg.id)) {
            setState(() => _messages.add(msg));
            _scrollToBottom();
          }
        }
      } else if (ev.type == 'contract:updated') {
        _loadContracts();
      }
    });
    _loadInitial();
  }

  @override
  void dispose() {
    if (_activeThreadKey != null) {
      context.read<AppState>().ws.leaveThread(_activeThreadKey!);
    }
    _wsSub?.cancel();
    _recTimer?.cancel();
    _recorder.dispose();
    _audioPlayer.dispose();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadInitial() async {
    final app = context.read<AppState>();
    setState(() => _loading = true);
    try {
      if (_activeThreadKey != null && _activeThreadKey!.isNotEmpty) {
        app.ws.joinThread(_activeThreadKey!);
        final data = await app.api.getThreadMessages(_activeThreadKey!);
        final rawMsgs = (data['messages'] as List?) ?? const [];
        if (mounted) {
          setState(() {
            _messages = rawMsgs
                .map((e) =>
                    ChatMessage.fromJson(Map<String, dynamic>.from(e as Map)))
                .toList();
            _otherActive = parseBool(data['otherPartyActiveLastMinute']);
            _otherName = parseNullableStr(data['otherPartyName']);
          });
        }
        await _loadContracts();
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) {
        setState(() => _loading = false);
        _scrollToBottom();
      }
    }
  }

  Future<void> _loadContracts() async {
    final app = context.read<AppState>();
    if (_activeThreadKey == null && widget.listingId == null) return;
    try {
      final list = await app.api.getContracts(
        threadKey: _activeThreadKey,
        listingId: _activeThreadKey == null ? widget.listingId : null,
      );
      if (mounted) setState(() => _contracts = list);
    } catch (_) {}
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendText() async {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    final app = context.read<AppState>();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final sent = await app.api.sendMessage({
        if (_activeThreadKey != null) 'threadKey': _activeThreadKey,
        if (widget.businessId != null) 'businessId': widget.businessId,
        if (widget.listingId != null) 'listingId': widget.listingId,
        if (widget.orderId != null) 'orderId': widget.orderId,
        if (widget.bookingId != null) 'bookingId': widget.bookingId,
        if (widget.recipientUid != null) 'recipientUid': widget.recipientUid,
        'messageType': 'TEXT',
        'body': text,
      });
      _msgCtrl.clear();
      _activeThreadKey ??= sent.threadKey;
      if (_activeThreadKey != null) app.ws.joinThread(_activeThreadKey!);
      if (mounted) {
        setState(() {
          if (!_messages.any((m) => m.id == sent.id)) {
            _messages.add(sent);
          }
        });
        _scrollToBottom();
      }
      await app.refreshChatThreads();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _toggleAutoVoiceRecord() async {
    if (_recording) {
      await _stopAndSendVoice();
    } else {
      await _startVoiceRecording();
    }
  }

  Future<void> _startVoiceRecording() async {
    try {
      final hasPerm = await _recorder.hasPermission();
      if (!hasPerm) {
        setState(() => _error = 'Microphone permission is required for voice messages.');
        return;
      }
      final dir = await getTemporaryDirectory();
      final outPath =
          '${dir.path}/ny_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 64000,
          sampleRate: 22050,
        ),
        path: outPath,
      );
      _recTimer?.cancel();
      setState(() {
        _recording = true;
        _recordSeconds = 0;
        _error = null;
      });
      _recTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) {
          setState(() => _recordSeconds++);
          if (_recordSeconds >= 120) {
            _stopAndSendVoice();
          }
        }
      });
    } catch (e) {
      setState(() => _error = 'Unable to start audio recording: $e');
    }
  }

  Future<void> _stopAndSendVoice() async {
    _recTimer?.cancel();
    final duration = _recordSeconds < 1 ? 1 : _recordSeconds;
    setState(() {
      _recording = false;
      _sending = true;
    });
    try {
      final path = await _recorder.stop();
      if (path == null) {
        setState(() => _sending = false);
        return;
      }
      final bytes = await File(path).readAsBytes();
      if (bytes.isEmpty) {
        setState(() => _sending = false);
        return;
      }
      final b64 = base64Encode(bytes);
      final dataUrl = 'data:audio/mp4;base64,$b64';
      final app = context.read<AppState>();
      final sent = await app.api.sendMessage({
        if (_activeThreadKey != null) 'threadKey': _activeThreadKey,
        if (widget.businessId != null) 'businessId': widget.businessId,
        if (widget.listingId != null) 'listingId': widget.listingId,
        if (widget.orderId != null) 'orderId': widget.orderId,
        if (widget.bookingId != null) 'bookingId': widget.bookingId,
        if (widget.recipientUid != null) 'recipientUid': widget.recipientUid,
        'messageType': 'VOICE',
        'body': 'Voice message (${duration}s)',
        'audioDataUrl': dataUrl,
        'audioDurationSeconds': duration,
      });
      _activeThreadKey ??= sent.threadKey;
      if (_activeThreadKey != null) app.ws.joinThread(_activeThreadKey!);
      if (mounted) {
        setState(() {
          if (!_messages.any((m) => m.id == sent.id)) {
            _messages.add(sent);
          }
        });
        _scrollToBottom();
      }
      await app.refreshChatThreads();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _playVoice(ChatMessage msg) async {
    final key = '${msg.id}';
    if (_playingMessageKey == key) {
      await _audioPlayer.stop();
      setState(() => _playingMessageKey = null);
      return;
    }
    final dataUrl = msg.audioDataUrl;
    if (dataUrl == null || dataUrl.isEmpty) return;
    try {
      await _audioPlayer.stop();
      setState(() => _playingMessageKey = key);
      if (dataUrl.startsWith('data:audio')) {
        final idx = dataUrl.indexOf('base64,');
        final b64 = dataUrl.substring(idx + 7).trim();
        final bytes = base64Decode(b64);
        final dir = await getTemporaryDirectory();
        final ext = dataUrl.contains('webm')
            ? 'webm'
            : (dataUrl.contains('ogg') ? 'ogg' : 'm4a');
        final file = File('${dir.path}/play_${msg.id}.$ext');
        await file.writeAsBytes(bytes, flush: true);
        await _audioPlayer.play(DeviceFileSource(file.path));
      } else {
        await _audioPlayer.play(UrlSource(dataUrl));
      }
      _audioPlayer.onPlayerComplete.first.then((_) {
        if (mounted) setState(() => _playingMessageKey = null);
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _playingMessageKey = null;
          _error = 'Playback error: $e';
        });
      }
    }
  }

  Future<void> _openNewContractDialog() async {
    final titleCtrl = TextEditingController(
        text: widget.title.isNotEmpty ? '${widget.title} Agreement' : 'Service Contract');
    final scopeCtrl = TextEditingController();
    final amountCtrl = TextEditingController(
      text: widget.defaultAmount != null && widget.defaultAmount! > 0
          ? widget.defaultAmount!.round().toString()
          : '',
    );
    String contractType = 'ONE_TIME_CONTRACT';
    String schedule = 'ON_COMPLETION';

    final created = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text('Create Service Contract Offer'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(labelText: 'Contract Title'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: contractType,
                  decoration: const InputDecoration(labelText: 'Contract Type'),
                  items: const [
                    DropdownMenuItem(
                        value: 'ONE_TIME_CONTRACT',
                        child: Text('One-Time Contract')),
                    DropdownMenuItem(value: 'PER_HOUR', child: Text('Per Hour')),
                    DropdownMenuItem(value: 'PER_DAY', child: Text('Per Day')),
                    DropdownMenuItem(
                        value: 'PER_MONTH', child: Text('Monthly Retainer')),
                    DropdownMenuItem(value: 'FULL_TIME', child: Text('Full-Time')),
                  ],
                  onChanged: (v) =>
                      setDlg(() => contractType = v ?? 'ONE_TIME_CONTRACT'),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: schedule,
                  decoration:
                      const InputDecoration(labelText: 'Payment Schedule'),
                  items: const [
                    DropdownMenuItem(
                        value: 'ON_COMPLETION', child: Text('On Completion')),
                    DropdownMenuItem(
                        value: 'UPFRONT_ESCROW', child: Text('Upfront Escrow')),
                    DropdownMenuItem(
                        value: 'MILESTONE', child: Text('Milestone Based')),
                    DropdownMenuItem(value: 'WEEKLY', child: Text('Weekly')),
                    DropdownMenuItem(value: 'MONTHLY', child: Text('Monthly')),
                  ],
                  onChanged: (v) => setDlg(() => schedule = v ?? 'ON_COMPLETION'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration:
                      const InputDecoration(labelText: 'Agreed Amount (ETB)'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: scopeCtrl,
                  maxLines: 3,
                  decoration:
                      const InputDecoration(labelText: 'Scope & Deliverables'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                final amt = double.tryParse(amountCtrl.text.trim()) ?? 0;
                if (titleCtrl.text.trim().isEmpty ||
                    scopeCtrl.text.trim().isEmpty ||
                    amt <= 0) {
                  return;
                }
                final app = context.read<AppState>();
                await app.api.createContract({
                  if (_activeThreadKey != null) 'threadKey': _activeThreadKey,
                  if (widget.businessId != null) 'businessId': widget.businessId,
                  if (widget.listingId != null) 'listingId': widget.listingId,
                  if (widget.bookingId != null) 'bookingId': widget.bookingId,
                  if (widget.recipientUid != null)
                    'recipientUid': widget.recipientUid,
                  'contractType': contractType,
                  'title': titleCtrl.text.trim(),
                  'scopeSummary': scopeCtrl.text.trim(),
                  'paymentSchedule': schedule,
                  'agreedAmount': amt,
                });
                if (ctx.mounted) Navigator.pop(ctx, true);
              },
              child: const Text('Send Offer'),
            ),
          ],
        ),
      ),
    );
    if (created == true) {
      await _loadContracts();
    }
  }

  Future<void> _respondContract(ServiceContractRecord c, String action) async {
    final app = context.read<AppState>();
    try {
      if (action == 'COUNTER') {
        final amtCtrl =
            TextEditingController(text: c.agreedAmount.round().toString());
        final noteCtrl = TextEditingController();
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Counter Contract Offer'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: amtCtrl,
                  keyboardType: TextInputType.number,
                  decoration:
                      const InputDecoration(labelText: 'Counter Amount (ETB)'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: noteCtrl,
                  decoration: const InputDecoration(labelText: 'Notes'),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Send Counter'),
              ),
            ],
          ),
        );
        if (ok == true) {
          await app.api.respondContract(c.id, {
            'action': 'COUNTER',
            'counterAmount': double.tryParse(amtCtrl.text.trim()) ?? c.agreedAmount,
            'counterNotes': noteCtrl.text.trim(),
          });
        }
      } else {
        await app.api.respondContract(c.id, {'action': action});
      }
      await _loadContracts();
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final myUids = app.currentUser?.allUids ?? const <String>{};

    return DraggableScrollableSheet(
      initialChildSize: 0.86,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      expand: false,
      builder: (_, __) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 42,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.border,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
              child: Row(
                children: [
                  const Icon(Icons.forum_rounded, color: AppTheme.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                _otherName ?? widget.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w800),
                              ),
                            ),
                            if (_otherActive) ...[
                              const SizedBox(width: 6),
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: Color(0xFF16A34A),
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ],
                        ),
                        if (widget.subtitle != null)
                          Text(
                            widget.subtitle!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12, color: AppTheme.mutedInk),
                          ),
                      ],
                    ),
                  ),
                  TextButton.icon(
                    onPressed: () =>
                        setState(() => _showContracts = !_showContracts),
                    icon: const Icon(Icons.description_outlined, size: 18),
                    label: Text('Contracts (${_contracts.length})'),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            if (_showContracts) _buildContractsPanel(myUids),
            if (_error != null)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_error!,
                    style:
                        const TextStyle(color: AppTheme.danger, fontSize: 12)),
              ),
            const Divider(height: 1),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _messages.isEmpty
                      ? const Center(
                          child: Text(
                            'Send a text or voice message to start the live conversation.',
                            style: TextStyle(color: AppTheme.mutedInk),
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollCtrl,
                          padding: const EdgeInsets.all(14),
                          itemCount: _messages.length,
                          itemBuilder: (_, i) {
                            final msg = _messages[i];
                            final isMe = myUids.contains(msg.senderUid);
                            return _buildBubble(msg, isMe);
                          },
                        ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: AppTheme.border)),
              ),
              child: Row(
                children: [
                  IconButton.filledTonal(
                    style: IconButton.styleFrom(
                      backgroundColor: _recording
                          ? AppTheme.danger
                          : AppTheme.primaryLight,
                      foregroundColor:
                          _recording ? Colors.white : AppTheme.primary,
                    ),
                    onPressed: _sending ? null : _toggleAutoVoiceRecord,
                    icon: Icon(_recording ? Icons.stop_rounded : Icons.mic_rounded),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _recording
                        ? Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFEBEE),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              'Recording voice (${_recordSeconds}s)... Tap stop to send automatically',
                              style: const TextStyle(
                                  color: AppTheme.danger,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12.5),
                            ),
                          )
                        : TextField(
                            controller: _msgCtrl,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _sendText(),
                            decoration: InputDecoration(
                              hintText: app.t('voice_hold_or_tap'),
                              isDense: true,
                            ),
                          ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    style: IconButton.styleFrom(
                      backgroundColor: AppTheme.primary,
                      foregroundColor: Colors.white,
                    ),
                    onPressed: (_sending || _recording) ? null : _sendText,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContractsPanel(Set<String> myUids) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
      color: AppTheme.surfaceBg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Service Contracts',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
              ),
              TextButton.icon(
                onPressed: _openNewContractDialog,
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('New Contract'),
              ),
            ],
          ),
          if (_contracts.isEmpty)
            const Text('No contracts created yet in this thread.',
                style: TextStyle(fontSize: 12, color: AppTheme.mutedInk))
          else
            ..._contracts.take(3).map((c) {
              final canRespond =
                  (c.status == 'OFFERED' || c.status == 'COUNTERED') &&
                      !myUids.contains(c.offeredByUid);
              return Card(
                margin: const EdgeInsets.only(top: 6),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              '${c.title} · ${AppConfig.formatEtb(c.agreedAmount)}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 12.5),
                            ),
                          ),
                          Text(
                            c.status,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                                color: AppTheme.primary),
                          ),
                        ],
                      ),
                      Text(
                        c.scopeSummary,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11.5, color: AppTheme.mutedInk),
                      ),
                      if (canRespond)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Row(
                            children: [
                              OutlinedButton(
                                onPressed: () =>
                                    _respondContract(c, 'ACCEPT'),
                                child: const Text('Accept',
                                    style: TextStyle(fontSize: 11.5)),
                              ),
                              const SizedBox(width: 6),
                              OutlinedButton(
                                onPressed: () =>
                                    _respondContract(c, 'COUNTER'),
                                child: const Text('Counter',
                                    style: TextStyle(fontSize: 11.5)),
                              ),
                              const SizedBox(width: 6),
                              TextButton(
                                onPressed: () =>
                                    _respondContract(c, 'DECLINE'),
                                child: const Text('Decline',
                                    style: TextStyle(
                                        fontSize: 11.5,
                                        color: AppTheme.danger)),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildBubble(ChatMessage msg, bool isMe) {
    final isPlaying = _playingMessageKey == '${msg.id}';
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
        decoration: BoxDecoration(
          color: isMe ? AppTheme.primary : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: isMe ? null : Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              msg.senderName,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: isMe ? Colors.white70 : AppTheme.mutedInk,
              ),
            ),
            const SizedBox(height: 4),
            if (msg.isVoice)
              InkWell(
                onTap: () => _playVoice(msg),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isPlaying
                          ? Icons.pause_circle_filled_rounded
                          : Icons.play_circle_fill_rounded,
                      color: isMe ? Colors.white : AppTheme.primary,
                      size: 28,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isPlaying
                          ? 'Playing voice (${msg.audioDurationSeconds ?? 1}s)...'
                          : 'Voice Message · ${msg.audioDurationSeconds ?? 1}s',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        color: isMe ? Colors.white : AppTheme.ink,
                      ),
                    ),
                  ],
                ),
              )
            else
              Text(
                msg.body,
                style: TextStyle(
                  fontSize: 13.5,
                  color: isMe ? Colors.white : AppTheme.ink,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
