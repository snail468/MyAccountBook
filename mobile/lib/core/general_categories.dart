import 'dart:convert';

/// 自定义类别（对齐网页端 src/lib/generalCategories.ts 的 GeneralCategory）。
///
/// 服务端 `customCategories.added` 要求是 `{name, icon, direction}` 对象数组
/// （见 /api/ledgers/[id] 的 zod schema），故移动端也用对象存储，才能与网页端
/// 双向兼容：网页端建的带 emoji 自定义类别能在端上显示图标，端上建的也能在
/// 网页端正确归入收入/支出分组。[#1]
class GeneralCategory {
  final String name;
  final String icon;
  final String direction; // 'income' | 'expense'

  const GeneralCategory({
    required this.name,
    this.icon = '🌟',
    this.direction = 'expense',
  });

  Map<String, dynamic> toJson() =>
      {'name': name, 'icon': icon, 'direction': direction};

  /// 从任意 JSON 值构造：新格式为对象；兼容老端上的「纯字符串名」格式
  /// （无 icon/direction，兜底 🌟 / expense）。
  static GeneralCategory fromAny(dynamic v) {
    if (v is Map) {
      final name = (v['name'] ?? '').toString().trim();
      final icon = (v['icon'] ?? '').toString().trim();
      final dir = (v['direction'] ?? 'expense').toString();
      return GeneralCategory(
        name: name,
        icon: icon.isEmpty ? '🌟' : icon,
        direction: dir == 'income' ? 'income' : 'expense',
      );
    }
    return GeneralCategory(name: v.toString().trim());
  }
}

/// 普通账本分类预算解析（对齐网页端 src/lib/generalCategories.ts 的 parseCustom）。
///
/// 账本 [Ledger.customCategories] 存一段 JSON：
/// ```json
/// { "added":[{"name":"健身","icon":"🏋️","direction":"expense"}], "hidden":[...],
///   "budgets":{ "餐饮": 50000 }, "budgetsWeekly":{ "餐饮": 12000 } }
/// ```
/// 其中 budgets / budgetsWeekly 是分类别预算（分）。老账本可能没有这两个字段，
/// 兜底成空 map。
class CustomCategories {
  final List<GeneralCategory> added;
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
      return CustomCategories(
        added: p['added'] is List
            ? (p['added'] as List)
                .map(GeneralCategory.fromAny)
                .where((c) => c.name.isNotEmpty)
                .toList()
            : const [],
        hidden: p['hidden'] is List
            ? (p['hidden'] as List).map((e) => e.toString()).toList()
            : const [],
        budgets: _parseBudgetMap(p['budgets']),
        budgetsWeekly: _parseBudgetMap(p['budgetsWeekly']),
      );
    } catch (_) {
      return const CustomCategories();
    }
  }

  /// 序列化回 JSON（分类管理页保存时用）。added 落成对象数组，与服务端 schema 一致。
  Map<String, dynamic> toJson() => {
        'added': added.map((c) => c.toJson()).toList(),
        'hidden': hidden,
        'budgets': budgets,
        'budgetsWeekly': budgetsWeekly,
      };
}

/// 解析分类别预算 map（值为正数分）；异常或空都兜底成空 map。
Map<String, int> _parseBudgetMap(dynamic v) {
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
};

/// 返回某分类的展示图标。
///
/// 优先用账本自定义类别里保存的 emoji（[customJson] 传账本 customCategories 时），
/// 其次内置分类图标表，最后回退 📦。这样端上/网页端新建的带 emoji 自定义类别，
/// 在列表、分类预算、记账条目里都能显示正确图标。[#1]
String iconOf(String category, [String? customJson]) {
  if (customJson != null && customJson.isNotEmpty) {
    for (final c in CustomCategories.parse(customJson).added) {
      if (c.name == category && c.icon.isNotEmpty) return c.icon;
    }
  }
  return _categoryIcons[category] ?? '📦';
}

/// 自定义类别可选 emoji 图标库（1:1 对齐网页端 generalCategories.ts 的 ICON_LIBRARY）。
///
/// 分组供「新增类别」时按类目浏览选择，覆盖餐饮/交通/购物/居家/娱乐/健康/人情/
/// 学习/宠物/通讯/收入/其它等常用图标。
const List<({String group, List<String> icons})> iconLibrary = [
  (
    group: '餐饮',
    icons: ['🍜', '🍚', '🍱', '🍔', '🍕', '🍣', '🍰', '☕', '🥤', '🍺', '🍷', '🍎', '🍇', '🥗', '🍳', '🥟'],
  ),
  (
    group: '交通',
    icons: ['🚌', '🚗', '🚕', '🚇', '✈️', '🚄', '🛵', '🚲', '⛽', '🅿️', '🛴', '🚢'],
  ),
  (
    group: '购物',
    icons: ['🛍️', '👗', '👟', '💄', '💍', '👜', '📱', '💻', '🎧', '⌚', '🧸', '🎮'],
  ),
  (
    group: '居家',
    icons: ['🏠', '🛏️', '🛋️', '🧴', '🧻', '💡', '🔧', '🧹', '🪴', '📦'],
  ),
  (
    group: '娱乐',
    icons: ['🎬', '🎵', '🎤', '🎨', '🎭', '🎳', '🎲', '🎯', '🎪', '🏖️', '🌊', '⛰️', '🎢', '🎡', '🕹️'],
  ),
  (
    group: '健康',
    icons: ['💊', '🏥', '🩺', '🦷', '👓', '🏋️', '🧘', '🚴', '⚽', '🏀', '🎾'],
  ),
  (
    group: '人情',
    icons: ['🎁', '💐', '🎂', '🎉', '💒', '👶', '🧧', '💌', '🥂'],
  ),
  (
    group: '学习',
    icons: ['📚', '✏️', '🎓', '📖', '📝', '🎒', '🖥️', '📊', '🔬'],
  ),
  (
    group: '宠物',
    icons: ['🐶', '🐱', '🐰', '🐹', '🐦', '🐟', '🦴', '🥩'],
  ),
  (
    group: '通讯',
    icons: ['📞', '📶', '📡', '💬', '📧', '📮'],
  ),
  (
    group: '收入',
    icons: ['💰', '💵', '💴', '💶', '💷', '💳', '🏦', '📈', '🎊', '🏆', '💎'],
  ),
  (
    group: '其它',
    icons: ['💸', '🌟', '⭐', '❤️', '🔥', '⚡', '☔', '☀️', '🌙', '🌈', '📌', '🔔'],
  ),
];
