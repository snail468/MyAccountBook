import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../data/local/recurring_rule_dao.dart';
import '../../data/models/recurring_rule.dart';
import '../../sync/sync_service.dart';

export '../../data/models/recurring_rule.dart';

/// 周期记账页状态（本地持久化到 recurring_rules 表）。
///
/// 离线优先：[D1] 本期新增规则仅落本地（serverId=null，不推送 POST）；
/// 删除已同步规则先入队 DELETE（clientId=serverId，防离线复活 [D4]）；
/// 停用/改为仅提醒切换先落本地再入队 PATCH active/autoCreate。
class RecurringState extends ChangeNotifier {
  final List<RecurringRule> _rules = <RecurringRule>[];
  final SyncService _sync = SyncService.instance;

  List<RecurringRule> get rules => _rules;

  int get count => _rules.length;

  Future<void> add({
    required String category,
    required int cents,
    required String period,
    required String nextDate,
  }) async {
    final rule = RecurringRule(
      id: const Uuid().v4(),
      category: category,
      cents: cents,
      period: period,
      nextDate: nextDate,
      greenAmount: false,
      serverId: null,
      synced: 0, // 本地新建、尚未推送服务端；与银行卡本地新建语义一致[R4]
    );
    await RecurringRuleDao().insert(rule);
    _rules.add(rule);
    notifyListeners();
  }

  Future<void> remove(RecurringRule r) async {
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      // 已同步：硬删本地 + 入队 DELETE（clientId 存 serverId 供离线防复活 [D4]）。
      await _sync.enqueue(
        method: 'DELETE',
        path: '/recurring/${r.serverId}',
        entity: 'recurring_rule',
        entityLocalId: r.id,
        clientId: r.serverId,
      );
    } else {
      // 本地新建未推送：服务端无对应行，仅清掉待操作即可。
      await _sync.removePendingFor(r.id);
    }
    await RecurringRuleDao().delete(r.id);
    _rules.removeWhere((e) => e.id == r.id);
    notifyListeners();
  }

  /// 停用（active=false）。已同步则入队 PATCH {active:false}。[D1]
  Future<void> disable(RecurringRule r) async {
    final updated = r.copyWith(active: false);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'active': false},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  /// 改为仅提醒（autoCreate=false，仍保留规则但不自动记账）。已同步则入队
  /// PATCH {autoCreate:false}。[D1]
  Future<void> setReminderOnly(RecurringRule r) async {
    final updated = r.copyWith(autoCreate: false);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'autoCreate': false},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  /// 启用（active=true）。已同步则入队 PATCH {active:true}。[D1]
  Future<void> enable(RecurringRule r) async {
    final updated = r.copyWith(active: true);
    await RecurringRuleDao().upsert(updated);
    _replaceInList(updated);
    if (r.serverId != null && r.serverId!.isNotEmpty) {
      await _sync.enqueue(
        method: 'PATCH',
        path: '/recurring/${r.serverId}',
        body: {'active': true},
        entity: 'recurring_rule',
        entityLocalId: r.id,
      );
    }
    notifyListeners();
  }

  void _replaceInList(RecurringRule updated) {
    final idx = _rules.indexWhere((e) => e.id == updated.id);
    if (idx >= 0) _rules[idx] = updated;
  }

  Future<void> load() async {
    final list = await RecurringRuleDao().listAll();
    _rules.clear();
    _rules.addAll(list);
    notifyListeners();
  }
}
