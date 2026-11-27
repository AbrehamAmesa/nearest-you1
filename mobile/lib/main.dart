import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/providers/app_state.dart';
import 'core/theme/app_theme.dart';
import 'screens/home_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NearestYouMobileApp());
}

class NearestYouMobileApp extends StatelessWidget {
  const NearestYouMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..bootstrap(),
      child: MaterialApp(
        title: 'Nearest You',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        home: const HomeShell(),
      ),
    );
  }
}
