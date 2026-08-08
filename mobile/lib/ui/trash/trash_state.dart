import 'package:flutter/foundation.dart';

/// 回收站条目（内存态，仅本地展示，无后端持久化）。
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

/// 回收站页状态（in-memory，无后端，数据仅存于本次会话）。
class TrashState extends ChangeNotifier {
  final List<TrashItem> _items = const <TrashItem>[];

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
