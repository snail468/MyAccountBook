import 'dart:convert';

/// 普通账本分类预算解析（对齐网页端 src/lib/generalCategories.ts 的 parseCustom）。
///
/// 账本 [Ledger.customCategories] 存一段 JSON：
/// ```json
/// { "added":[...], "hidden":[...], "budgets":{ "餐饮": 50000 }, "budgetsWeekly":{ "餐饮": 12000 } }
/// ```
/// 其中 budgets / budgetsWeekly 是分类别预算（分）。老账本可能没有这两个字段，
/// 兜底成空 map。
class CustomCategories {
  final List<dynamic> added;
  final List<String> hidden;
  final Map<String, int> budgets;
  final Map<String, int> budgetsWeekly;

  const CustomCategories({
    this.added = const [],
    this.hidden = const [],
    this.budgets = const {},
    this.budgetsWeekly = const {},
  });

  /// 解析；异常或空串都兜底成全空（与网页端一致：不崩、不影响展示）。
  static CustomCategories parse(String? json) {
    if (json == null || json.isEmpty) return const CustomCategories();
    try {
      final p = jsonDecode(json);
      if (p is! Map) return const CustomCategories();
      Map<String, int> parseBudgetMap(dynamic v) {
        final map = <String, int>{};
        if (v is Map) {
          for (final e in v.entries) {
            final val = e.value;
            if (val is num && val.isFinite && val > 0) {
              map[e.key.toString()] = val.toInt();
            }
          }
        }
        return map;
      }

      return CustomCategories(
        added: p['added'] is List ? p['added'] as List : const [],
        hidden: p['hidden'] is List
            ? (p['hidden'] as List).map((e) => e.toString()).toList()
            : const [],
        budgets: parseBudgetMap(p['budgets']),
        budgetsWeekly: parseBudgetMap(p['budgetsWeekly']),
      );
    } catch (_) {
      return const CustomCategories();
    }
  }
}
