import 'package:intl/intl.dart';

/// 金额工具：服务端/本地一律以"分"（cents）为整数存储，展示时换算成"元"。
///
/// 统一换算能避免浮点误差（0.1+0.2 问题），与后端 src/lib/money.ts 约定一致。
class Money {
  /// 分 -> 元字符串，例如 12345 -> "123.45"。
  static String formatCents(int cents, {String symbol = '¥'}) {
    final negative = cents < 0;
    final abs = negative ? -cents : cents;
    final yuan = abs ~/ 100;
    final fen = abs % 100;
    final s = '$yuan.${fen.toString().padLeft(2, '0')}';
    return '${negative ? '-' : ''}$symbol$s';
  }

  /// 元字符串 -> 分。支持 "123.45" / "123" / "123.4" / "-12.3"。
  /// 解析失败返回 null（用于输入框校验）。
  static int? parseToCents(String input) {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;
    final negative = trimmed.startsWith('-');
    final body = negative ? trimmed.substring(1) : trimmed;
    if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(body)) return null;
    final parts = body.split('.');
    final yuanPart = int.tryParse(parts[0]) ?? 0;
    final fenPart = parts.length == 2
        ? int.parse(parts[1].padRight(2, '0').substring(0, 2))
        : 0;
    final cents = yuanPart * 100 + fenPart;
    return negative ? -cents : cents;
  }

  /// 带千分位、无符号的纯数字（用于合计展示）。
  static String formatPlain(int cents) {
    final n = NumberFormat('#,##0.00');
    return n.format(cents / 100);
  }
}
