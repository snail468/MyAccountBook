// 纯逻辑单元测试。
//
// 说明：完整启动 [MyApp] 需要 sqflite / path_provider / local_auth 等平台通道，
// 在纯 Dart 测试环境（无设备）下不可用。这里改测无平台依赖的核心逻辑：
// 金额（分/元）换算与图片 URL 解析——正是最不容许出错、又最易被静态检查漏掉的部分。

import 'package:flutter_test/flutter_test.dart';

import 'package:myaccountbook/core/money.dart';
import 'package:myaccountbook/core/constants.dart';

void main() {
  group('Money.formatCents', () {
    test('正数按分换算并补零', () {
      expect(Money.formatCents(12345), '¥123.45');
      expect(Money.formatCents(5), '¥0.05');
      expect(Money.formatCents(0), '¥0.00');
    });
    test('负数带负号', () {
      expect(Money.formatCents(-12345), '-¥123.45');
    });
    test('自定义符号', () {
      expect(Money.formatCents(100, symbol: r'$'), r'$1.00');
    });
  });

  group('Money.parseToCents', () {
    test('常见输入', () {
      expect(Money.parseToCents('123.45'), 12345);
      expect(Money.parseToCents('123'), 12300);
      expect(Money.parseToCents('123.4'), 12340);
      expect(Money.parseToCents('-12.3'), -1230);
    });
    test('非法输入返回 null', () {
      expect(Money.parseToCents(''), isNull);
      expect(Money.parseToCents('abc'), isNull);
      expect(Money.parseToCents('1.234'), isNull);
    });
    test('往返一致（parse ∘ format 去符号）', () {
      for (final c in [0, 5, 99, 100, 12345, -6789]) {
        final formatted = Money.formatCents(c, symbol: '').replaceAll('-', '');
        final back = Money.parseToCents(formatted)!;
        expect(back, c.abs());
      }
    });
  });

  group('AppConfig.resolveImageUrl', () {
    test('相对路径拼上 baseUrl', () {
      final url = AppConfig.resolveImageUrl('/api/uploads/x.jpg');
      expect(url, '${AppConfig.apiBaseUrl}/api/uploads/x.jpg');
    });
    test('绝对 http(s) 原样返回', () {
      const abs = 'https://cdn.example.com/x.jpg';
      expect(AppConfig.resolveImageUrl(abs), abs);
    });
  });
}
