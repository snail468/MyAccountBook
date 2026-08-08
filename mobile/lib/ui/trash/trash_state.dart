import 'package:flutter/foundation.dart';

/// 回收站条目（demo，内存态）。
class TrashItem {
  final String title;
  final int cents;
  final String content;
  final int daysAgo; // 多少天前删除

  const TrashItem({
    required this.title,
    required this.cents,
    required this.content,
    required this.daysAgo,
  });
}

/// 回收站页状态（in-memory demo）。
class TrashState extends ChangeNotifier {
  final List<TrashItem> _items = const [
    TrashItem(title: '咖啡', cents: -3200, content: '瑞幸 · 08-10', daysAgo: 12),
    TrashItem(title: '打车', cents: -4500, content: '滴滴 · 08-08', daysAgo: 9),
    TrashItem(title: '午餐', cents: -6800, content: '公司附近 · 08-03', daysAgo: 3),
  ];

  List<TrashItem> get items => _items;

  void restore(TrashItem i) {
    _items.remove(i);
    notifyListeners();
  }

  void permanentDelete(TrashItem i) {
    _items.remove(i);
    notifyListeners();
  }

  Future<void> load() async {
    notifyListeners();
  }
}
