import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 外观模式：白天 / 黑夜 / 跟随系统。
enum AppThemeMode { light, dark, system }

/// 界面风格：默认 / 液态玻璃。
enum AppStyle { classic, glass }

/// 将 [AppThemeMode] 映射为 Flutter 的 [ThemeMode]。
extension AppThemeModeX on AppThemeMode {
  ThemeMode toThemeMode() {
    switch (this) {
      case AppThemeMode.light:
        return ThemeMode.light;
      case AppThemeMode.dark:
        return ThemeMode.dark;
      case AppThemeMode.system:
        return ThemeMode.system;
    }
  }
}

/// 全局外观状态：主题模式 / 界面风格 / 字号 / 光效 / 音效。
///
/// 持久化到 [SharedPreferences]，启动前由 `main()` 调用 [load]。
class ThemeState extends ChangeNotifier {
  static const String _kThemeMode = 'themeMode';
  static const String _kStyle = 'style';
  static const String _kFontScale = 'fontScale';
  static const String _kEffectOn = 'effectOn';
  static const String _kSoundOn = 'soundOn';

  AppThemeMode _themeMode = AppThemeMode.light;
  AppStyle _style = AppStyle.classic;
  double _fontScale = 1.0;
  bool _effectOn = false;
  bool _soundOn = false;

  AppThemeMode get themeMode => _themeMode;
  AppStyle get style => _style;
  double get fontScale => _fontScale;
  bool get effectOn => _effectOn;
  bool get soundOn => _soundOn;

  /// 从持久化读取；失败则回退默认，不阻断启动（参照 [AuthState.init] 的健壮做法）。
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final modeStr = prefs.getString(_kThemeMode);
      if (modeStr != null) {
        _themeMode = AppThemeMode.values.firstWhere(
          (e) => e.name == modeStr,
          orElse: () => AppThemeMode.light,
        );
      }
      final styleStr = prefs.getString(_kStyle);
      if (styleStr != null) {
        _style = AppStyle.values.firstWhere(
          (e) => e.name == styleStr,
          orElse: () => AppStyle.classic,
        );
      }
      final fs = prefs.getDouble(_kFontScale);
      if (fs != null) _fontScale = fs;
      _effectOn = prefs.getBool(_kEffectOn) ?? false;
      _soundOn = prefs.getBool(_kSoundOn) ?? false;
    } catch (_) {
      // 持久化异常：保持默认值即可
    }
    notifyListeners();
  }

  /// 写回持久化；写入失败静默忽略。
  Future<void> save() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kThemeMode, _themeMode.name);
      await prefs.setString(_kStyle, _style.name);
      await prefs.setDouble(_kFontScale, _fontScale);
      await prefs.setBool(_kEffectOn, _effectOn);
      await prefs.setBool(_kSoundOn, _soundOn);
    } catch (_) {
      // 忽略写入失败
    }
  }

  void setThemeMode(AppThemeMode v) {
    if (_themeMode == v) return;
    _themeMode = v;
    notifyListeners();
    save();
  }

  void setStyle(AppStyle v) {
    if (_style == v) return;
    _style = v;
    notifyListeners();
    save();
  }

  void setFontScale(double v) {
    if (_fontScale == v) return;
    _fontScale = v;
    notifyListeners();
    save();
  }

  void setEffectOn(bool v) {
    if (_effectOn == v) return;
    _effectOn = v;
    notifyListeners();
    save();
  }

  void setSoundOn(bool v) {
    if (_soundOn == v) return;
    _soundOn = v;
    notifyListeners();
    save();
  }
}
