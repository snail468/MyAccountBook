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
  // 深色超支卡：对齐网页端 dark:bg-red-900/20 + border-red-800 + text-red-300/200。
  static const Color darkOverspendBg = Color(0x337F1D1D); // red-900 @20%
  static const Color darkOverspendBorder = Color(0xFF991B1B); // red-800
  static const Color darkOverspendTitle = Color(0xFFFCA5A5); // red-300
  static const Color darkOverspendDetail = Color(0xFFFECACA); // red-200
  // 浮动按钮：白色 0.8 透明度 + 描边 #E2E8F0 0.7
  static const Color lightFloatingBtnBg = Color(0xCCFFFFFF);
  static const Color lightFloatingBtnBorder = Color(0xB2E2E8F0);

  // ---------------- Dark（镜像） ----------------
  static const Color darkPageBg = Color(0xFF0F172A); // = ink900
  static const Color darkInk900 = Color(0xFF0F172A); // 镜像 lightInk900（深底上的最暗色/深底反白文字底色）
  static const Color darkSurface = Color(0xFF1E293B); // = ink800
  static const Color darkBorder = Color(0xFF334155); // = ink700
  static const Color darkBorderDashed = Color(0xFF64748B); // 镜像 lightBorderDashed（深底虚线，比实线亮一档）
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
  // 语义色：与浅色同值（深色背景下仍清晰可读）。T01 收入配色引用了 darkSemanticRed，
  // 此前漏定义导致 v2.0.20/21/22 全部编译失败；补齐整套以避免同类问题。
  static const Color darkSemanticRed = Color(0xFFEF4444);
  static const Color darkSemanticGreen = Color(0xFF049E69);
  static const Color darkSemanticBlue = Color(0xFF2557EB);
  // 卡片阴影：对齐网页端 shadow-sm（0 1px 2px 0 rgba(0,0,0,0.05)），仅经典态卡片使用。
  static const Color lightCardShadow = Color(0x0D000000);
  static const Color darkCardShadow = Color(0x0D000000);

  // ---------------- Glass（液态玻璃，亮/暗两套，1:1 对齐 globals.css .liquid） ----------------
  // 浅色玻璃
  static const Color glassPageBg = Color(0xFFFBF5FF); // (0.984, 0.961, 1) 兜底纯色
  static const Color glassCardFill = Color(0x80FFFFFF); // 白 0.5（backdrop-blur 磨砂）
  static const Color glassCardBorder = Color(0xB3FFFFFF); // 白 0.7
  // 暗色玻璃：对齐 .liquid.dark .dark\:bg-ink-800 -> rgba(30,30,48,0.5) + 白 0.14 描边
  static const Color darkGlassPageBg = Color(0xFF0B0518); // 兜底纯色（深紫黑）
  static const Color darkGlassCardFill = Color(0x801E2130); // rgba(30,30,48,0.5)
  static const Color darkGlassCardBorder = Color(0x24FFFFFF); // rgba(255,255,255,0.14)

  // ---------------- After-tax（劳务报酬税后卡，amber/tax 强调，1:1 对齐网页端 amber-*/20） ----------------
  static const Color lightAfterTaxBg = Color(0xFFFEF3C7); // amber-100（近似 amber-50 兜底纯色）
  static const Color lightAfterTaxBorder = Color(0xFFFDE68A); // amber-200
  static const Color lightAfterTaxFg = Color(0xFF92400E); // amber-800
  static const Color lightAfterTaxSub = Color(0xFFB45309); // amber-700
  static const Color darkAfterTaxBg = Color(0x3378350F); // amber-900 @ 0.2
  static const Color darkAfterTaxBorder = Color(0x6692400E); // amber-800 @ 0.4
  static const Color darkAfterTaxFg = Color(0xFFFCD34D); // amber-300
  static const Color darkAfterTaxSub = Color(0xB2FB923C); // amber-400 @ 0.7
}
