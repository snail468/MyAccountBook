// 离线记账队列（浏览器端）。
//
// 架构（B8 规划时明确要求）：
//   1. 主线程直接写 IndexedDB —— 乐观 UI，"记录成功（待同步）"立即返回
//   2. 客户端生成 UUID 作为幂等键；后端见到相同 clientId 直接返回已有 id，
//      重放安全（键空间：普通/旅游用 (ledgerId, clientId)，工作/桃源用
//      (userId, clientId) —— 见 prisma schema）
//   3. Sync manager：navigator.onLine + 'online' 事件触发重放
//
// 为什么不上 Service Worker：SW 拦截需要 fetch handler + 缓存策略，
// 出错时用户看不到失败提示。app 层 + 明确的"待同步"badge 更透明。
//
// 覆盖范围（B8→B9）：
//   * general — 普通账本 → POST /api/ledgers/:id/entries
//   * work    — 工作账本 → POST /api/entries
//   * taoyuan — 桃源账本 → POST /api/events
//   * travel  — 旅游账本 → POST /api/ledgers/:id/expenses
// 图片一律不入队（Blob 上传本身需要网络），联网后可编辑补图。

// ---- 各账本的载荷（与对应 API 的 zod schema 字段严格对齐） ----

export type GeneralPayload = {
  ledgerId: string;
  direction: 'income' | 'expense';
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string[];
  occurredAt: string; // ISO
};

export type WorkPayload = {
  yearMonth: string; // "YYYY-MM"
  category: string;
  direction: 'income' | 'expense';
  amountCents: number;
  note: string | null;
  occurredAt: string; // ISO
};

export type TaoyuanPayload = {
  title: string;
  participate: boolean;
  startAt: string | null;
  deadline: string | null;
  content: string | null;
  reward: string | null;
  rewardMethods: string[];
  contentImages: string[];
  topicTag: string | null;
  note: string | null;
};

export type TravelPayload = {
  ledgerId: string;
  title: string;
  category: string;
  phase: 'pre' | 'during';
  currency: string;
  amountForeignCents: number;
  rate: number;
  payerId: string;
  allocation: { memberId: string; weight: number }[];
  note: string | null;
  imageUrls: string[];
  occurredAt: string; // ISO
};

/** 一条待同步记录 */
export type QueuedItem = {
  /** UUID —— 幂等键 */
  clientId: string;
  /**
   * 载荷类型。缺省视为 'general' —— B8 老队列里的行没有 kind 字段，
   * 就地兼容不需要迁移。
   */
  kind?: 'general' | 'work' | 'taoyuan' | 'travel';
  /**
   * 归属账本 id：
   *   general/travel → 具体 ledger id
   *   work/taoyuan   → 内建单例账本，用 kind 名占位，方便页面按"当前账本"过滤 pending
   */
  ledgerId: string;
  /** 各账本的完整请求体（不含 clientId，POST 时会自动加） */
  payload: GeneralPayload | WorkPayload | TaoyuanPayload | TravelPayload;
  /** 入队时刻 */
  queuedAt: string;
  /** 上次重试失败的错误信息 */
  lastError?: string | null;
  /** 重试次数 —— 达到阈值后不再自动重试 */
  attempts: number;
};

// ---- 老结构兼容：B8 存的行没有 kind/payload，直接是扁平字段 ----
type LegacyGeneralEntry = {
  clientId: string;
  ledgerId: string;
  direction: 'income' | 'expense';
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string[];
  occurredAt: string;
  queuedAt: string;
  lastError?: string | null;
  attempts: number;
};

/** 老/新混存 → 统一按新结构对外暴露 */
function normalize(row: LegacyGeneralEntry | QueuedItem): QueuedItem {
  if ('payload' in row && row.payload) return row as QueuedItem;
  const legacy = row as LegacyGeneralEntry;
  return {
    clientId: legacy.clientId,
    kind: 'general',
    ledgerId: legacy.ledgerId,
    payload: {
      ledgerId: legacy.ledgerId,
      direction: legacy.direction,
      category: legacy.category,
      amountCents: legacy.amountCents,
      tags: legacy.tags,
      note: legacy.note,
      imageUrls: legacy.imageUrls,
      occurredAt: legacy.occurredAt,
    },
    queuedAt: legacy.queuedAt,
    lastError: legacy.lastError,
    attempts: legacy.attempts,
  };
}

const DB_NAME = 'xyd:offline';
const DB_VERSION = 1;
const STORE = 'pendingEntries';
const MAX_AUTO_ATTEMPTS = 5;

function hasIDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    Promise.resolve(fn(store)).then(
      (value) => {
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
      },
      (err) => reject(err),
    );
  });
}

/** 入队 */
export async function enqueue(
  input: { kind: NonNullable<QueuedItem['kind']>; ledgerId: string; payload: QueuedItem['payload'] },
): Promise<QueuedItem> {
  const entry: QueuedItem = {
    clientId: crypto.randomUUID(),
    kind: input.kind,
    ledgerId: input.ledgerId,
    payload: input.payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  if (!hasIDB()) return entry;
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const r = store.add(entry);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
  return entry;
}

/** 列出全部待同步（含老结构条目，已就地归一化） */
export async function listPending(): Promise<QueuedItem[]> {
  if (!hasIDB()) return [];
  return withStore('readonly', (store) => {
    return new Promise<QueuedItem[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => {
        const rows = (r.result as (LegacyGeneralEntry | QueuedItem)[]) ?? [];
        resolve(rows.map(normalize));
      };
      r.onerror = () => reject(r.error);
    });
  });
}

async function remove(clientId: string): Promise<void> {
  if (!hasIDB()) return;
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const r = store.delete(clientId);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
}

async function updateAttempts(
  clientId: string,
  attempts: number,
  lastError: string | null,
): Promise<void> {
  if (!hasIDB()) return;
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const getReq = store.get(clientId);
      getReq.onsuccess = () => {
        const row = getReq.result as LegacyGeneralEntry | QueuedItem | undefined;
        if (!row) return resolve();
        // 就地写回：老/新结构原样保留，只改这两个字段
        (row as { attempts: number }).attempts = attempts;
        (row as { lastError?: string | null }).lastError = lastError;
        const putReq = store.put(row);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

/** 根据 kind 决定 POST URL 与请求体（后端 zod schema 只认自己的字段） */
function requestFor(item: QueuedItem): { url: string; body: object } {
  const kind = item.kind ?? 'general';
  const clientId = item.clientId;
  if (kind === 'general') {
    const p = item.payload as GeneralPayload;
    return {
      url: `/api/ledgers/${p.ledgerId}/entries`,
      body: {
        direction: p.direction,
        category: p.category,
        amountCents: p.amountCents,
        tags: p.tags,
        note: p.note,
        imageUrls: p.imageUrls,
        occurredAt: p.occurredAt,
        clientId,
      },
    };
  }
  if (kind === 'work') {
    const p = item.payload as WorkPayload;
    return {
      url: '/api/entries',
      body: {
        yearMonth: p.yearMonth,
        category: p.category,
        direction: p.direction,
        amountCents: p.amountCents,
        note: p.note,
        occurredAt: p.occurredAt,
        clientId,
      },
    };
  }
  if (kind === 'taoyuan') {
    const p = item.payload as TaoyuanPayload;
    return {
      url: '/api/events',
      body: {
        title: p.title,
        participate: p.participate,
        startAt: p.startAt,
        deadline: p.deadline,
        content: p.content,
        reward: p.reward,
        rewardMethods: p.rewardMethods,
        contentImages: p.contentImages,
        topicTag: p.topicTag,
        note: p.note,
        clientId,
      },
    };
  }
  // travel
  const p = item.payload as TravelPayload;
  return {
    url: `/api/ledgers/${p.ledgerId}/expenses`,
    body: {
      title: p.title,
      category: p.category,
      phase: p.phase,
      currency: p.currency,
      amountForeignCents: p.amountForeignCents,
      rate: p.rate,
      payerId: p.payerId,
      allocation: p.allocation,
      note: p.note,
      imageUrls: p.imageUrls,
      occurredAt: p.occurredAt,
      clientId,
    },
  };
}

/** 一次 sync 的结果 */
export type SyncResult = {
  synced: number;
  failed: number;
  offline: boolean;
};

/**
 * 尝试同步全部待办。逐个发 POST；成功后从队列移除；
 * 网络错误就停下 —— 剩下的等下次 online 触发再来。
 *
 * 4xx 当作永久失败：递增 attempts 到 MAX_AUTO_ATTEMPTS 后不再自动重试
 * （脏数据 / 权限问题，重试也没意义）。
 */
export async function syncAll(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, offline: true };
  }
  const pending = await listPending();
  let synced = 0;
  let failed = 0;
  for (const q of pending) {
    if (q.attempts >= MAX_AUTO_ATTEMPTS) continue;
    try {
      const { url, body } = requestFor(q);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await remove(q.clientId);
        synced += 1;
        continue;
      }
      if (res.status >= 400 && res.status < 500) {
        const txt = await res.text().catch(() => '');
        await updateAttempts(q.clientId, MAX_AUTO_ATTEMPTS, `HTTP ${res.status}: ${txt.slice(0, 100)}`);
        failed += 1;
        continue;
      }
      await updateAttempts(q.clientId, q.attempts + 1, `HTTP ${res.status}`);
      failed += 1;
    } catch (err) {
      // 纯网络错 —— 不用继续遍历，减轻重试压力
      const msg = err instanceof Error ? err.message : String(err);
      await updateAttempts(q.clientId, q.attempts, msg);
      return { synced, failed: pending.length - synced, offline: true };
    }
  }
  return { synced, failed, offline: false };
}

/** 强制重试所有已达上限的条目（用户主动按"再试"时用） */
export async function retryAll(): Promise<SyncResult> {
  if (!hasIDB()) return { synced: 0, failed: 0, offline: false };
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return resolve();
        const row = cursor.value as { attempts: number; lastError?: string | null };
        row.attempts = 0;
        row.lastError = null;
        cursor.update(row);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  });
  return syncAll();
}

/** 主动扔掉一条 */
export async function discard(clientId: string): Promise<void> {
  await remove(clientId);
}
