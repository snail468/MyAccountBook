import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// 本地 SQLite（sqflite）。App 的"真相源"：所有读都走这里，断网也能用。
///
/// 金额一律用分（cents，整数）；时间用 epoch 毫秒（int）；软删用 deleted_at 非 NULL。
/// 每张业务表都有 `server_id`（服务端 cuid）和 `synced`（0/1）两列，
/// 用于离线写入后联网把本地行对上服务端、并标记已同步。
class AppDatabase {
  AppDatabase._internal();
  static final AppDatabase instance = AppDatabase._internal();

  static const int _version = 5;
  Database? _db;

  Future<Database> get database async {
    if (_db != null) return _db!;
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, 'myaccountbook.db');
    _db = await openDatabase(
      path,
      version: _version,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
    return _db!;
  }

  Future<void> _onCreate(Database db, int version) async {
    await _createTables(db);
  }

  /// 版本升级：旧库补建新表，保证已安装用户不丢数据。
  Future<void> _onUpgrade(Database db, int oldV, int newV) async {
    if (oldV < 2) {
      await _createV2Tables(db);
    }
    // 版本 3：新增 ledgers.server_id 唯一索引，根治「同步重复账本」Bug。
    if (oldV < 3) {
      // 先清理历史重复行（同一 server_id 多行），否则建唯一索引会因
      // UNIQUE constraint failed 中断升级，导致旧库永远卡在 v2 反复失败。
      await _dedupeLedgersByServerId(db);
      await db.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ledgers_server_id ON ledgers(server_id) WHERE server_id IS NOT NULL;',
      );
    }
    // 版本 4：bank_cards / recurring_rules 接入同步。补齐 server_id 等新列
    // + server_id 唯一部分索引（幂等迁移，PRAGMA 探测缺失列后 ALTER ADD）。
    if (oldV < 4) {
      await _migrateToV4(db);
    }
    // 版本 5：家庭成员补 password 列（创建/重置登录密码用）；
    // 银行卡补 number 列（完整卡号，落库经混淆）。均幂等迁移。
    if (oldV < 5) {
      await _migrateToV5(db);
    }
  }

  /// 升级到 v3 前清理历史重复账本：同一 server_id 若出现多行，仅保留一行
  /// （优先保留已同步行，其次 rowid 最小行），并级联清理其下孤儿子数据，避免外键半成品。
  Future<void> _dedupeLedgersByServerId(Database db) async {
    final dupRows = await db.rawQuery('''
      SELECT server_id
      FROM ledgers
      WHERE server_id IS NOT NULL
      GROUP BY server_id
      HAVING COUNT(*) > 1
    ''');
    for (final row in dupRows) {
      final sid = row['server_id'] as String;
      final rows = await db.query(
        'ledgers',
        where: 'server_id = ?',
        whereArgs: [sid],
        orderBy: 'synced DESC, rowid ASC',
      );
      // 跳过首个（保留行），删除其余重复行及其子数据。
      for (final r in rows.skip(1)) {
        final lid = r['id'] as String;
        await db.delete(
          'event_amounts',
          where: 'event_id IN (SELECT id FROM taoyuan_events WHERE ledger_id = ?)',
          whereArgs: [lid],
        );
        await db.delete('taoyuan_events', where: 'ledger_id = ?', whereArgs: [lid]);
        await db.delete(
          'trip_splits',
          where: 'expense_id IN (SELECT id FROM trip_expenses WHERE ledger_id = ?)',
          whereArgs: [lid],
        );
        await db.delete('trip_expenses', where: 'ledger_id = ?', whereArgs: [lid]);
        await db.delete('trip_members', where: 'ledger_id = ?', whereArgs: [lid]);
        await db.delete('general_entries', where: 'ledger_id = ?', whereArgs: [lid]);
        await db.delete('work_entries', where: 'ledger_id = ?', whereArgs: [lid]);
        await db.delete('ledgers', where: 'id = ?', whereArgs: [lid]);
      }
    }
  }

  /// 升级到 v4：根据 PRAGMA table_info 探测缺失列，仅对缺失列做 ALTER ADD
  /// （SQLite 不支持 ADD COLUMN IF NOT EXISTS，探测保证幂等，避免重复升级/版本回退时崩）。
  /// 再建 server_id 唯一部分索引。
  Future<void> _migrateToV4(Database db) async {
    const bankCols = <String, String>{
      'server_id': 'TEXT',
      'alias': 'TEXT',
      'holder': 'TEXT',
      'synced': 'INTEGER NOT NULL DEFAULT 1',
    };
    const ruleCols = <String, String>{
      'server_id': 'TEXT',
      'target': 'TEXT',
      'ledger_id': 'TEXT',
      'ledger_name': 'TEXT',
      'direction': 'TEXT',
      'frequency': 'TEXT',
      'day_of_month': 'INTEGER',
      'day_of_week': 'INTEGER',
      'start_date': 'TEXT',
      'end_date': 'TEXT',
      'last_generated_at': 'TEXT',
      'active': 'INTEGER NOT NULL DEFAULT 1',
      'auto_create': 'INTEGER NOT NULL DEFAULT 1',
      'note': 'TEXT',
      'synced': 'INTEGER NOT NULL DEFAULT 1',
    };
    await _addColumnsIfMissing(db, 'bank_cards', bankCols);
    await _addColumnsIfMissing(db, 'recurring_rules', ruleCols);
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_cards_server_id ON bank_cards(server_id) WHERE server_id IS NOT NULL;',
    );
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_rules_server_id ON recurring_rules(server_id) WHERE server_id IS NOT NULL;',
    );
  }

  /// 升级到 v5：家庭成员补 password 列；银行卡补 number 列。
  /// 均按 PRAGMA 探测缺失列后仅 ALTER ADD（幂等）。
  Future<void> _migrateToV5(Database db) async {
    await _addColumnsIfMissing(db, 'family_members', const {
      'password': 'TEXT',
    });
    await _addColumnsIfMissing(db, 'bank_cards', const {
      'number': 'TEXT',
    });
  }

  /// 对指定表探测列，仅 ALTER ADD 缺失列（幂等）。
  Future<void> _addColumnsIfMissing(
    Database db,
    String table,
    Map<String, String> columns,
  ) async {
    final info = await db.rawQuery('PRAGMA table_info($table);');
    final existing = <String>{
      for (final row in info) (row['name'] as String).toLowerCase(),
    };
    for (final entry in columns.entries) {
      if (!existing.contains(entry.key.toLowerCase())) {
        await db.execute(
          'ALTER TABLE $table ADD COLUMN ${entry.key} ${entry.value};',
        );
      }
    }
  }

  /// 建全部表 + 索引（新装库用）。
  Future<void> _createTables(Database db) async {
    await db.execute('''
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        session_version INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db.execute('''
      CREATE TABLE ledgers (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        deleted_at INTEGER,
        budget_cents INTEGER,
        custom_categories TEXT,
        base_currency TEXT,
        start_date INTEGER,
        end_date INTEGER,
        trip_budget TEXT,
        synced INTEGER NOT NULL DEFAULT 1
      );
    ''');
    await db.execute('''
      CREATE TABLE general_entries (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        server_id TEXT,
        direction TEXT NOT NULL,
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        tags TEXT,
        note TEXT,
        image_urls TEXT,
        occurred_at INTEGER NOT NULL,
        deleted_at INTEGER,
        synced INTEGER NOT NULL DEFAULT 0,
        client_id TEXT
      );
    ''');
    await db.execute('''
      CREATE TABLE work_entries (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        server_id TEXT,
        year_month TEXT NOT NULL,
        category TEXT NOT NULL,
        direction TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        note TEXT,
        occurred_at INTEGER NOT NULL,
        refunded_at INTEGER,
        deleted_at INTEGER,
        synced INTEGER NOT NULL DEFAULT 0,
        client_id TEXT
      );
    ''');
    await db.execute('''
      CREATE TABLE taoyuan_events (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        server_id TEXT,
        title TEXT NOT NULL,
        start_at INTEGER,
        content TEXT,
        reward_method TEXT,
        reward_methods TEXT,
        reward TEXT,
        topic_tag TEXT,
        content_images TEXT,
        published_at INTEGER NOT NULL,
        participate INTEGER NOT NULL DEFAULT 1,
        deadline INTEGER,
        predicted_cents INTEGER,
        announced_cents INTEGER,
        paid_cents INTEGER,
        predicted_at INTEGER,
        announced_at INTEGER,
        paid_at INTEGER,
        status TEXT NOT NULL DEFAULT 'published',
        note TEXT,
        parent_id TEXT,
        deleted_at INTEGER,
        synced INTEGER NOT NULL DEFAULT 0,
        client_id TEXT
      );
    ''');
    await db.execute('''
      CREATE TABLE event_amounts (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        server_id TEXT,
        stage TEXT NOT NULL,
        cents INTEGER NOT NULL DEFAULT 0,
        quantity INTEGER,
        item_desc TEXT,
        note TEXT,
        reward_method TEXT,
        occurred_at INTEGER NOT NULL,
        deleted_at INTEGER,
        synced INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db.execute('''
      CREATE TABLE trip_members (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        server_id TEXT,
        user_id TEXT,
        display_name TEXT NOT NULL,
        settled INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db.execute('''
      CREATE TABLE trip_expenses (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        server_id TEXT,
        payer_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        phase TEXT NOT NULL,
        currency TEXT NOT NULL,
        amount_foreign_cents INTEGER NOT NULL,
        rate REAL NOT NULL DEFAULT 1,
        amount_base_cents INTEGER NOT NULL,
        note TEXT,
        image_urls TEXT,
        occurred_at INTEGER NOT NULL,
        deleted_at INTEGER,
        synced INTEGER NOT NULL DEFAULT 0,
        client_id TEXT
      );
    ''');
    await db.execute('''
      CREATE TABLE trip_splits (
        id TEXT PRIMARY KEY,
        expense_id TEXT NOT NULL,
        server_id TEXT,
        member_id TEXT NOT NULL,
        share_cents INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      );
    ''');
    await db.execute('''
      CREATE TABLE pending_ops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op_uuid TEXT UNIQUE NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        body TEXT,
        client_id TEXT,
        entity TEXT,
        entity_local_id TEXT,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    ''');

    // 索引（性能）
    await db.execute('CREATE INDEX idx_ledgers_kind ON ledgers(kind, deleted_at);');
    await db.execute('CREATE INDEX idx_general_ledger ON general_entries(ledger_id, occurred_at, deleted_at);');
    await db.execute('CREATE INDEX idx_work_ledger ON work_entries(ledger_id, year_month, deleted_at);');
    await db.execute('CREATE INDEX idx_event_ledger ON taoyuan_events(ledger_id, status, deleted_at);');
    await db.execute('CREATE INDEX idx_trip_exp_ledger ON trip_expenses(ledger_id, phase, deleted_at);');
    await db.execute('CREATE INDEX idx_trip_split_exp ON trip_splits(expense_id);');
    await db.execute('CREATE INDEX idx_pending_status ON pending_ops(status, created_at);');

    // 账本 server_id 唯一索引：根治「同步重复账本」Bug（离线优先 + 服务端对账）。
    // 部分索引：仅对非 NULL 的 server_id 生效，本地未同步（server_id 为 NULL）的行不受约束。
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_ledgers_server_id ON ledgers(server_id) WHERE server_id IS NOT NULL;',
    );

    // 版本 2 新增表（含 v4 同步新列 + 唯一部分索引；新装即 v4）。
    await _createV2Tables(db);

    // 版本 4 兼容索引（新装库也建立，保证与升级路径一致）。
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_cards_server_id ON bank_cards(server_id) WHERE server_id IS NOT NULL;',
    );
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_rules_server_id ON recurring_rules(server_id) WHERE server_id IS NOT NULL;',
    );
  }

  /// 版本 2 新增：银行卡 / 家庭成员 / 周期记账规则。
  ///
  /// v4 起银行卡/规则接入同步：bank_cards / recurring_rules 补齐 server_id 等新列
  /// + server_id 唯一部分索引（upsert 真「更新」不「插入新行」）。
  Future<void> _createV2Tables(Database db) async {
    await db.execute('''
      CREATE TABLE IF NOT EXISTS bank_cards (
        id TEXT PRIMARY KEY,
        bank TEXT NOT NULL,
        type TEXT NOT NULL,
        last4 TEXT NOT NULL,
        created_at INTEGER,
        server_id TEXT,
        alias TEXT,
        holder TEXT,
        synced INTEGER NOT NULL DEFAULT 1,
        number TEXT
      );
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS family_members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_date TEXT,
        is_self INTEGER NOT NULL DEFAULT 0,
        password TEXT,
        created_at INTEGER
      );
    ''');
    await db.execute('''
      CREATE TABLE IF NOT EXISTS recurring_rules (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        cents INTEGER NOT NULL,
        period TEXT NOT NULL,
        next_date TEXT NOT NULL,
        green_amount INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        server_id TEXT,
        target TEXT,
        ledger_id TEXT,
        ledger_name TEXT,
        direction TEXT,
        frequency TEXT,
        day_of_month INTEGER,
        day_of_week INTEGER,
        start_date TEXT,
        end_date TEXT,
        last_generated_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        auto_create INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        synced INTEGER NOT NULL DEFAULT 1
      );
    ''');

    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_cards_server_id ON bank_cards(server_id) WHERE server_id IS NOT NULL;',
    );
    await db.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_rules_server_id ON recurring_rules(server_id) WHERE server_id IS NOT NULL;',
    );
  }

  /// 清空所有本地数据（退出登录或重装场景）。
  Future<void> clearAll() async {
    final db = await database;
    final tables = [
      'pending_ops', 'trip_splits', 'trip_expenses', 'trip_members',
      'event_amounts', 'taoyuan_events', 'work_entries', 'general_entries',
      'ledgers', 'users',
      'bank_cards', 'family_members', 'recurring_rules',
    ];
    for (final t in tables) {
      await db.delete(t);
    }
  }

  /// 参与备份/还原的业务表（不含 pending_ops / users 等本地元信息）。
  static const List<String> backupTables = [
    'ledgers', 'general_entries', 'work_entries', 'taoyuan_events',
    'event_amounts', 'trip_members', 'trip_expenses', 'trip_splits',
    'bank_cards', 'recurring_rules', 'family_members',
  ];

  /// 导出全部业务数据为扁平 map（表名 → 行列表），供 JSON 备份。
  Future<Map<String, List<Map<String, Object?>>>> exportAll() async {
    final db = await database;
    final out = <String, List<Map<String, Object?>>>{};
    for (final t in backupTables) {
      out[t] = await db.query(t);
    }
    return out;
  }

  /// 从备份 map 还原：逐表清空后整表重插（事务内），对齐网页端导入还原。
  Future<void> importAll(Map<String, List<Map<String, Object?>>> data) async {
    final db = await database;
    await db.transaction((txn) async {
      for (final entry in data.entries) {
        final table = entry.key;
        if (!backupTables.contains(table)) continue;
        await txn.delete(table);
        for (final row in entry.value) {
          await txn.insert(
            table,
            row,
            conflictAlgorithm: ConflictAlgorithm.replace,
          );
        }
      }
    });
  }
}
