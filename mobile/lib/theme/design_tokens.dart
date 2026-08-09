import 'package:flutter/material.dart';

/// 设计系统精确色值（Ardot 规格，1:1 还原）。
///
/// 所有颜色使用 `0xAARRGGBB` 表示。
/// 分为三套：Light（浅色）、Dark（深色镜像）、Glass（仅浅色生效的磨砂背景）。
class AppColors {
  AppColors._();

  // ---------------- Light ----------------
  static const Color lightPageBg = Color(0xFFF9FAFC);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceSubtle = Color(0xFFF9FAFC);
  static const Color lightBorder = Color(0xFFE2E8F0);
  static const Color lightBorderDashed = Color(0xFFCBD5E1);
  static const Color lightInk900 = Color(0xFF0F172A);
  static const Color lightInk800 = Color(0xFF1E293B);
  static const Color lightInk700 = Color(0xFF334155);
  static const Color lightInk100 = Color(0xFFF1F5F9);
  static const Color lightInk400 = Color(0xFF94A3B8);
  static const Color lightInk500 = Color(0xFF64748B);
  static const Color lightSemanticRed = Color(0xFFEF4444);
  static const Color lightSemanticGreen = Color(0xFF049E69);
  static const Color lightSemanticBlue = Color(0xFF2557EB);
  // 品牌粉：正值收入/进度高亮（1:1 对齐网页端 #ff2d87，见 IncomeComponentsCard）。
  static const Color lightBrandPink = Color(0xFFff2d87);
  static const Color lightOverspendBg = Color(0xFFFEF2F2);
  static const Color lightOverspendBorder = Color(0xFFFECACA);
  static const Color lightOverspendTitle = Color(0xFF991B1B);
  static const Color lightOverspendDetail = Color(0xFF7F1D1D);
  // 浮动按钮：白色 0.8 透明度 + 描边 #E2E8F0 0.7
  static const Color lightFloatingBtnBg = Color(0xCCFFFFFF);
  static const Color lightFloatingBtnBorder = Color(0xB2E2E8F0);

  // ---------------- Dark（镜像） ----------------
  static const Color darkPageBg = Color(0xFF0F172A); // = ink900
  static const Color darkSurface = Color(0xFF1E293B); // = ink800
  static const Color darkBorder = Color(0xFF334155); // = ink700
  static const Color darkInk100 = Color(0xFFF1F5F9); // 主文本
  static const Color darkInk400 = Color(0xFF94A3B8); // 次文本
  static const Color darkInk500 = Color(0xFF64748B); // 三级文本
  static const Color darkCtaFill = Color(0xFFF1F5F9); // CTA 填充 = ink100
  static const Color darkCtaText = Color(0xFF0F172A); // CTA 文字 = ink900
  // 浮动按钮：#1E293B 0.8 + 描边 #334155 0.7
  static const Color darkFloatingBtnBg = Color(0xCC1E293B);
  static const Color darkFloatingBtnBorder = Color(0xB2334155);
  // 品牌粉：与浅色同值（亮粉在深色背景下仍清晰可读）。
  static const Color darkBrandPink = Color(0xFFff2d87);

  // ---------------- Glass（仅浅色生效） ----------------
  static const Color glassPageBg = Color(0xFFFBF5FF); // (0.984, 0.961, 1)
  static const Color glassCardFill = Color(0x80FFFFFF); // 白 0.5
  static const Color glassCardBorder = Color(0xB3FFFFFF); // 白 0.7
}
