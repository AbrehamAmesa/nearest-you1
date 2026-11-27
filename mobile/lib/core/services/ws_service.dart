import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/app_config.dart';

class WsEvent {
  final String type;
  final Map<String, dynamic> payload;

  WsEvent(this.type, this.payload);
}

class LiveWsService {
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  String? _baseUrl;
  String? _token;
  bool _disposed = false;
  bool _connected = false;

  final _eventsController = StreamController<WsEvent>.broadcast();
  Stream<WsEvent> get events => _eventsController.stream;
  bool get isConnected => _connected;

  void connect(String baseUrl, String? token) {
    if (token == null || token.isEmpty) {
      disconnect();
      return;
    }
    if (_baseUrl == baseUrl && _token == token && _channel != null) {
      return;
    }
    _baseUrl = baseUrl;
    _token = token;
    _disposed = false;
    _open();
  }

  void _open() {
    _cleanupSocket();
    final token = _token;
    final baseUrl = _baseUrl;
    if (_disposed || token == null || token.isEmpty || baseUrl == null) return;

    try {
      final wsUrl = AppConfig.toWebSocketUrl(baseUrl, token);
      final channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      _channel = channel;
      _connected = true;

      _sub = channel.stream.listen(
        (raw) {
          if (raw is String) {
            try {
              final map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
              final type = (map['type'] ?? '').toString();
              if (type.isNotEmpty) {
                _eventsController.add(WsEvent(type, map));
              }
            } catch (_) {}
          }
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );

      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(const Duration(seconds: 25), (_) {
        send({'type': 'ping'});
      });
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _connected = false;
    _cleanupSocket();
    if (_disposed || _token == null || _token!.isEmpty) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), _open);
  }

  void send(Map<String, dynamic> frame) {
    try {
      _channel?.sink.add(jsonEncode(frame));
    } catch (_) {}
  }

  void joinThread(String threadKey) {
    send({'type': 'join', 'threadKey': threadKey});
  }

  void leaveThread(String threadKey) {
    send({'type': 'leave', 'threadKey': threadKey});
  }

  void _cleanupSocket() {
    _pingTimer?.cancel();
    _pingTimer = null;
    _sub?.cancel();
    _sub = null;
    try {
      _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  void disconnect() {
    _disposed = true;
    _connected = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _token = null;
    _cleanupSocket();
  }

  void dispose() {
    disconnect();
    _eventsController.close();
  }
}
