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

  /// 序列化回 JSON（分类管理页保存时用）。
  Map<String, dynamic> toJson() => {
        'added': added,
        'hidden': hidden,
        'budgets': budgets,
        'budgetsWeekly': budgetsWeekly,
      };
}

/// 默认（内置）分类清单（1:1 对齐网页端常用分类）。
const List<String> defaultCategories = <String>[
  '餐饮',
  '交通',
  '购物',
  '娱乐',
  '居家',
  '居住',
  '医疗',
  '教育',
  '通讯',
  '工资',
  '红包',
  '理财',
  '旅行',
  '其他',
];

/// 分类 -> emoji 图标（1:1 对齐网页端分类图标）。
const Map<String, String> _categoryIcons = <String, String>{
  '餐饮': '🍜',
  '早餐': '🥐',
  '午餐': '🍱',
  '晚餐': '🍲',
  '交通': '🚌',
  '打车': '🚕',
  '地铁': '🚇',
  '购物': '🛍️',
  '服饰': '👕',
  '数码': '📱',
  '居家': '🧺',
  '居住': '🏠',
  '房租': '🏠',
  '水电': '💡',
  '娱乐': '🎮',
  '运动': '🏀',
  '旅行': '✈️',
  '医疗': '💊',
  '教育': '📚',
  '书籍': '📖',
  '通讯': '📞',
  '工资': '💰',
  '收入': '💵',
  '奖金': '🎉',
  '红包': '🧧',
  '理财': '📈',
  '投资': '📊',
  '礼金': '🎁',
  '社交': '🍻',
  '宠物': '🐾',
  '美容': '💄',
  '烟酒': '🍺',
  '孩子': '🍼',
  '捐赠': '🤝',
  '其他': '📦',
];

/// 返回某分类的展示图标；未知分类回退到 📦。
String iconOf(String category) => _categoryIcons[category] ?? '📦';
