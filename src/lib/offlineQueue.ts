// 普通账本离线记账队列（浏览器端）。
//
// 架构（用户在 B8 规划时明确要求）：
//   1. 主线程直接写 IndexedDB —— 乐观 UI，"记录成功（待同步）"立即返回
//   2. 客户端生成 UUID 作为幂等键；后端见到相同 (ledgerId, clientId)
//      直接返回已有 id，重放安全
//   3. Sync manager：navigator.onLine + 'online' 事件触发重放
//
// 为什么不上 Service Worker：SW 拦截需要 fetch handler + 缓存策略，
// 出错时用户看不到失败提示。app 层 + 明确的"待同步"badge 更透明。
//
// 只覆盖普通账本：日常"随手记"场景最容易断网。工作/桃源/旅游都是坐在
// 电脑前有意识地维护的。

/** 一条待同步记录的完整信息 */
export type QueuedEntry = {
  /** UUID —— 幂等键。发给后端做去重，本地也用它做主键 */
  clientId: string;
  ledgerId: string;
  direction: 'income' | 'expense';
  category: string;
  amountCents: number;
  tags: string | null;
  note: string | null;
  imageUrls: string[]; // 图片在离线队列里其实用不到（Blob 上传需要网络），保留字段以便日后扩展
  occurredAt: string; // ISO
  /** 入队时刻，展示"等待了 N 分钟" */
  queuedAt: string;
  /** 上次重试失败的错误信息（非网络失败时用来提醒用户） */
  lastError?: string | null;
  /** 重试次数 —— 达到阈值后不再自动重试，避免死循环 */
  attempts: number;
};

const DB_NAME = 'xyd:offline';
const DB_VERSION = 1;
const STORE = 'pendingEntries';
const MAX_AUTO_ATTEMPTS = 5;

// SSR 与旧浏览器兜底：没有 indexedDB 就直接返回空实现，让所有调用都走网络。
function hasIDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // clientId 是主键 —— 天然去重、天然可作为服务端幂等键
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

/** 入队。返回入队后的完整对象（含服务端将会用的 clientId） */
export async function enqueue(
  input: Omit<QueuedEntry, 'clientId' | 'queuedAt' | 'attempts'>,
): Promise<QueuedEntry> {
  const entry: QueuedEntry = {
    ...input,
    clientId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  if (!hasIDB()) return entry; // SSR：调用方不应到这，保险起见返回对象
  await withStore('readwrite', (store) => {
    return new Promise<void>((resolve, reject) => {
      const r = store.add(entry);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  });
  return entry;
}

/** 列出全部待同步 */
export async function listPending(): Promise<QueuedEntry[]> {
  if (!hasIDB()) return [];
  return withStore('readonly', (store) => {
    return new Promise<QueuedEntry[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result as QueuedEntry[]);
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
        const row = getReq.result as QueuedEntry | undefined;
        if (!row) return resolve(); // 已经被别处清了
        row.attempts = attempts;
        row.lastError = lastError;
        const putReq = store.put(row);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
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
 * 400/404/409 等**服务端明确拒绝**当作永久失败：递增 attempts，
 * 到 MAX_AUTO_ATTEMPTS 后不再自动重试（等用户手动强制）—— 因为再次尝试
 * 也肯定失败（脏数据或权限问题），继续挂着只会打扰用户。
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
      const res = await fetch(`/api/ledgers/${q.ledgerId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: q.direction,
          category: q.category,
          amountCents: q.amountCents,
          tags: q.tags,
          note: q.note,
          imageUrls: q.imageUrls,
          occurredAt: q.occurredAt,
          clientId: q.clientId,
        }),
      });
      if (res.ok) {
        await remove(q.clientId);
        synced += 1;
        continue;
      }
      // 服务端明确拒绝（4xx）—— 永久失败，标 attempts 阻止无限重试
      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => '');
        await updateAttempts(q.clientId, MAX_AUTO_ATTEMPTS, `HTTP ${res.status}: ${body.slice(0, 100)}`);
        failed += 1;
        continue;
      }
      // 5xx 或其它 —— 临时失败，让 attempts +1 下次继续
      await updateAttempts(q.clientId, q.attempts + 1, `HTTP ${res.status}`);
      failed += 1;
    } catch (err) {
      // 纯网络错误 —— 大概率整个连接坏了，不用继续遍历，减轻重试压力
      const msg = err instanceof Error ? err.message : String(err);
      await updateAttempts(q.clientId, q.attempts, msg); // 网络错不算 attempt
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
        const row = cursor.value as QueuedEntry;
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

/** 主动扔掉一条 —— 用户看了错误决定不要了 */
export async function discard(clientId: string): Promise<void> {
  await remove(clientId);
}
