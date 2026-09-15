'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatShort } from '@/lib/datetime';
import { useAlert, useConfirm, useToast } from '@/components/ui/Dialog';

type WebdavConfigState = {
  url: string;
  username: string;
  password?: string;
  remotePath: string;
  autoBackupEnabled: boolean;
  scheduleTime: string;
  lastBackupAt?: string | null;
  lastBackupStatus?: 'success' | 'failed' | null;
  lastBackupMessage?: string | null;
  hasPassword?: boolean;
};

type WebdavBackupItem = {
  name: string;
  href: string;
  sizeBytes: number;
  lastModified: string;
  isCollection: boolean;
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminWebdavBackup() {
  const confirm = useConfirm();
  const alert = useAlert();
  const toast = useToast();

  const [config, setConfig] = useState<WebdavConfigState>({
    url: '',
    username: '',
    password: '',
    remotePath: '/MyAccountBook',
    autoBackupEnabled: false,
    scheduleTime: '03:00',
    lastBackupAt: null,
    lastBackupStatus: null,
    hasPassword: false,
  });

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [backups, setBackups] = useState<WebdavBackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [operatingFile, setOperatingFile] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // 1. 获取 WebDAV 配置
  const loadConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const res = await fetch('/api/admin/webdav/config');
      if (!res.ok) throw new Error('加载配置失败');
      const data = await res.json();
      if (data.config) {
        setConfig((prev) => ({
          ...prev,
          ...data.config,
          password: '', // 留空，通过 hasPassword 标识
        }));
      }
    } catch (err: any) {
      toast({ message: err.message || '加载配置失败', kind: 'info' });
    } finally {
      setLoadingConfig(false);
    }
  }, [toast]);

  // 2. 获取 WebDAV 远端备份文件列表
  const loadBackups = useCallback(async () => {
    try {
      setLoadingBackups(true);
      const res = await fetch('/api/admin/webdav/backups');
      const data = await res.json();
      if (res.ok && Array.isArray(data.backups)) {
        setBackups(data.backups);
        if (data.lastBackupAt !== undefined) {
          setConfig((prev) => ({
            ...prev,
            lastBackupAt: data.lastBackupAt,
            lastBackupStatus: data.lastBackupStatus,
          }));
        }
      }
    } catch {
      // 忽略
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadBackups();
  }, [loadConfig, loadBackups]);

  // 3. 测试连通性
  async function handleTestConnection() {
    if (!config.url || !config.username) {
      await alert({ title: '参数不完整', body: '请先填写 WebDAV 服务器地址和用户名。' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/webdav/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: config.url.trim(),
          username: config.username.trim(),
          password: config.password || undefined,
          remotePath: config.remotePath.trim() || '/MyAccountBook',
        }),
      });
      const data = await res.json();
      setTestResult({
        ok: Boolean(data.ok),
        message: data.message || (data.ok ? '连通成功！' : '连接失败'),
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `测试请求失败: ${err.message || '网络异常'}`,
      });
    } finally {
      setTesting(false);
    }
  }

  // 4. 保存配置
  async function handleSaveConfig(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (config.url && !config.url.startsWith('http://') && !config.url.startsWith('https://')) {
      await alert({ title: 'URL 格式错误', body: 'WebDAV 服务器地址必须以 http:// 或 https:// 开头' });
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetch('/api/admin/webdav/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: config.url.trim(),
          username: config.username.trim(),
          password: config.password ? config.password : undefined,
          remotePath: config.remotePath.trim() || '/MyAccountBook',
          autoBackupEnabled: config.autoBackupEnabled,
          scheduleTime: config.scheduleTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast({ message: 'WebDAV 配置已保存', kind: 'success' });
      setConfig((prev) => ({
        ...prev,
        ...data.config,
        password: '',
      }));
      // 触发一次远端列表刷新
      loadBackups();
    } catch (err: any) {
      await alert({ title: '保存失败', body: err.message || '未知错误', danger: true });
    } finally {
      setSavingConfig(false);
    }
  }

  // 5. 立即执行手动备份
  async function handleManualBackup() {
    if (!config.url || !config.username) {
      await alert({ title: '未配置 WebDAV', body: '请先保存 WebDAV 服务器地址和凭证。' });
      return;
    }

    const ok = await confirm({
      title: '立即执行全系统备份？',
      body: '系统将打包包含全部用户的所有数据库数据以及全部上传凭证附件，并自动上传至 WebDAV。\n同时将自动滚动清理，仅保留最新的 7 份备份。',
      confirmText: '开始备份',
    });
    if (!ok) return;

    setBackingUp(true);
    try {
      const res = await fetch('/api/admin/webdav/backups', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '备份执行失败');
      }

      const s = data.summary;
      const statsMsg = s
        ? `\n备份包含：${s.userCount} 位用户、${s.ledgerCount} 个账本、${s.entryCount} 条记账、${s.loanOrderCount} 笔个贷、${s.fileCount} 个附件。\n已上传归档包：${data.filename} (${formatFileSize(s.totalSizeBytes)})`
        : `\n已成功上传：${data.filename}`;

      await alert({
        title: '全系统备份成功！',
        body: `全量数据已安全保存至 WebDAV。${data.deletedOldCount > 0 ? `\n（已自动清理 ${data.deletedOldCount} 份超期旧备份）` : ''}${statsMsg}`,
      });

      // 重新加载备份列表与状态
      loadBackups();
    } catch (err: any) {
      await alert({ title: '备份失败', body: err.message || '未知错误', danger: true });
    } finally {
      setBackingUp(false);
    }
  }

  // 6. 从 WebDAV 恢复全量数据
  async function handleRestore(filename: string) {
    const ok = await confirm({
      title: '⚠️ 极其重要：确认恢复全系统数据？',
      body: `【警告】您选中的备份为：\n${filename}\n\n恢复数据将清空并全量覆盖当前系统内的所有数据（包含全部用户的全部账本明细、银行卡、个贷单据以及所有上传附件）！\n\n此操作不可逆！请确认是否立即执行恢复？`,
      danger: true,
      confirmText: '确认强制覆盖恢复',
    });
    if (!ok) return;

    setOperatingFile(filename);
    try {
      const res = await fetch('/api/admin/webdav/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '恢复操作失败');
      }

      const s = data.summary;
      const statsMsg = s
        ? `\n恢复概况：${s.userCount} 位用户、${s.ledgerCount} 个账本、${s.entryCount} 条记账、${s.loanOrderCount} 笔个贷、${s.fileCount} 个附件。`
        : '';

      await alert({
        title: '数据恢复成功！',
        body: `系统数据已还原至该备份状态。${statsMsg}\n页面即将重新加载。`,
      });

      // 刷新当前页面
      window.location.reload();
    } catch (err: any) {
      await alert({ title: '恢复失败', body: err.message || '未知错误', danger: true });
    } finally {
      setOperatingFile(null);
    }
  }

  // 7. 删除单份备份
  async function handleDelete(filename: string) {
    const ok = await confirm({
      title: '删除此备份？',
      body: `将从 WebDAV 永久删除备份文件：\n${filename}`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;

    setOperatingFile(filename);
    try {
      const res = await fetch('/api/admin/webdav/backups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '删除失败');
      toast({ message: '备份已删除', kind: 'success' });
      loadBackups();
    } catch (err: any) {
      await alert({ title: '删除失败', body: err.message || '未知错误', danger: true });
    } finally {
      setOperatingFile(null);
    }
  }

  if (loadingConfig) {
    return (
      <div className="p-8 text-center text-ink-500">
        正在读取 WebDAV 配置…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 状态与快速动作卡片 */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-ink-900 to-ink-800 text-white dark:from-ink-800 dark:to-ink-900 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">☁️</span>
              <h2 className="text-lg font-semibold tracking-tight">全系统 WebDAV 备份</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 font-medium text-white/90">
                保留 7 份
              </span>
            </div>
            <p className="text-xs text-white/70 mt-1">
              包含全系统所有用户的全部数据库记录与上传凭证附件，超出 7 份自动清理最旧版本。
            </p>
          </div>
          <button
            onClick={handleManualBackup}
            disabled={backingUp || !config.url}
            className="px-5 py-2.5 rounded-2xl bg-white text-ink-900 hover:bg-white/90 font-medium text-sm transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {backingUp ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-ink-900 border-t-transparent rounded-full animate-spin" />
                正在打包与上传…
              </>
            ) : (
              <>
                <span>⚡</span>
                立即全量备份
              </>
            )}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-white/60">最近备份时间</div>
            <div className="font-medium mt-0.5">
              {config.lastBackupAt ? formatShort(config.lastBackupAt) : '暂无备份记录'}
            </div>
          </div>
          <div>
            <div className="text-white/60">最近执行状态</div>
            <div className="font-medium mt-0.5 flex items-center gap-1">
              {config.lastBackupStatus === 'success' && (
                <span className="text-emerald-400">● 成功</span>
              )}
              {config.lastBackupStatus === 'failed' && (
                <span className="text-rose-400">● 失败</span>
              )}
              {!config.lastBackupStatus && <span className="text-white/50">未执行</span>}
            </div>
          </div>
          <div>
            <div className="text-white/60">定时自动备份</div>
            <div className="font-medium mt-0.5">
              {config.autoBackupEnabled ? `每日 ${config.scheduleTime}` : '未启用'}
            </div>
          </div>
          <div>
            <div className="text-white/60">远端备份数量</div>
            <div className="font-medium mt-0.5">{backups.length} / 7 份</div>
          </div>
        </div>
      </div>

      {/* WebDAV 交互式配置卡片 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <span>⚙️</span>
          WebDAV 服务配置
        </h3>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
              WebDAV 服务器地址 (URL)
            </label>
            <input
              type="text"
              placeholder="例如：https://dav.jianguoyun.com/dav/ 或 http://192.168.1.10:5005"
              value={config.url}
              onChange={(e) => {
                setConfig({ ...config, url: e.target.value });
                setTestResult(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                账号 / 用户名
              </label>
              <input
                type="text"
                placeholder="WebDAV 登录用户名"
                value={config.username}
                onChange={(e) => {
                  setConfig({ ...config, username: e.target.value });
                  setTestResult(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                应用密码 / 密码
                {config.hasPassword && !config.password && (
                  <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                    (已安全保存，留空则保持不变)
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={config.hasPassword ? '••••••••' : 'WebDAV 密码'}
                  value={config.password || ''}
                  onChange={(e) => {
                    setConfig({ ...config, password: e.target.value });
                    setTestResult(null);
                  }}
                  className="w-full px-3.5 py-2.5 pr-14 rounded-2xl bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-600"
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                远程存储目录
              </label>
              <input
                type="text"
                placeholder="/MyAccountBook"
                value={config.remotePath}
                onChange={(e) => {
                  setConfig({ ...config, remotePath: e.target.value });
                  setTestResult(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400"
              />
              <span className="text-[11px] text-ink-400 mt-0.5 block">
                若目录不存在，测试或备份时将自动创建
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                定时自动备份
              </label>
              <button
                type="button"
                onClick={() => setConfig({ ...config, autoBackupEnabled: !config.autoBackupEnabled })}
                className={`w-full py-2.5 px-3.5 rounded-2xl text-sm font-medium border transition text-left flex items-center justify-between ${
                  config.autoBackupEnabled
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent'
                    : 'bg-ink-50 dark:bg-ink-900 text-ink-600 dark:text-ink-400 border-ink-200 dark:border-ink-700'
                }`}
              >
                <span>{config.autoBackupEnabled ? '已开启定时备份' : '未开启'}</span>
                <span className="text-xs">{config.autoBackupEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                每日执行时间 (北京时间)
              </label>
              <input
                type="time"
                value={config.scheduleTime}
                onChange={(e) => setConfig({ ...config, scheduleTime: e.target.value })}
                disabled={!config.autoBackupEnabled}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400 disabled:opacity-40"
              />
            </div>
          </div>

          {/* 测试连通性反馈 */}
          {testResult && (
            <div
              className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                testResult.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              <span>{testResult.ok ? '✓' : '✕'}</span>
              <span className="flex-1">{testResult.message}</span>
            </div>
          )}

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !config.url || !config.username}
              className="px-4 py-2.5 rounded-2xl bg-ink-100 hover:bg-ink-200 dark:bg-ink-700 dark:hover:bg-ink-600 text-ink-800 dark:text-ink-100 text-xs font-medium transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {testing ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  正在测试连通…
                </>
              ) : (
                <>
                  <span>🔌</span>
                  测试连通性
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={savingConfig}
              className="px-5 py-2.5 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-xs font-medium transition hover:opacity-90 disabled:opacity-50"
            >
              {savingConfig ? '正在保存…' : '保存设置'}
            </button>
          </div>
        </form>
      </div>

      {/* WebDAV 远端备份文件列表 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <span>📦</span>
              WebDAV 备份列表
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              最多保留 7 份历史备份。支持一键拉取备份执行全系统灾难恢复。
            </p>
          </div>
          <button
            onClick={loadBackups}
            disabled={loadingBackups}
            className="text-xs px-3 py-1.5 rounded-xl bg-ink-50 hover:bg-ink-100 dark:bg-ink-700 dark:hover:bg-ink-600 text-ink-600 dark:text-ink-300 font-medium transition disabled:opacity-40"
          >
            {loadingBackups ? '刷新中…' : '↻ 刷新列表'}
          </button>
        </div>

        {loadingBackups ? (
          <div className="p-8 text-center text-xs text-ink-400">
            正在从 WebDAV 读取备份列表…
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 rounded-2xl bg-ink-50/50 dark:bg-ink-900/40 text-center text-xs text-ink-400">
            {config.url ? '当前 WebDAV 目录中暂无备份文件，点击上方【立即全量备份】开始第一次备份。' : '请先在上方配置并保存 WebDAV 服务信息。'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {backups.map((item, index) => {
              const isLatest = index === 0;
              const isBusy = operatingFile === item.name;

              return (
                <div
                  key={item.name}
                  className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isLatest
                      ? 'bg-ink-50/70 dark:bg-ink-900/60 border-ink-300 dark:border-ink-600'
                      : 'bg-white dark:bg-ink-800/80 border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate max-w-full text-ink-900 dark:text-ink-100">
                        {item.name}
                      </span>
                      {isLatest && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium">
                          最新
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500 mt-1 flex items-center gap-3">
                      <span>{formatShort(item.lastModified)}</span>
                      <span>·</span>
                      <span className="font-mono">{formatFileSize(item.sizeBytes)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleRestore(item.name)}
                      disabled={isBusy || backingUp}
                      className="text-xs px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium transition shadow-xs disabled:opacity-40"
                    >
                      {isBusy ? '处理中…' : '恢复数据'}
                    </button>
                    <button
                      onClick={() => handleDelete(item.name)}
                      disabled={isBusy || backingUp}
                      className="text-xs px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition disabled:opacity-40"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
