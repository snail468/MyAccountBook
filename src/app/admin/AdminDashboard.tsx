'use client';

import { useState } from 'react';
import AdminUserList from './AdminUserList';
import AdminWebdavBackup from './AdminWebdavBackup';

type UserItem = {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  entryCount: number;
  eventCount: number;
};

export default function AdminDashboard({
  currentUserId,
  users,
  initialTab = 'users',
}: {
  currentUserId: string;
  users: UserItem[];
  initialTab?: 'users' | 'webdav';
}) {
  const [activeTab, setActiveTab] = useState<'users' | 'webdav'>(initialTab);

  return (
    <div>
      {/* 选项卡切换 */}
      <div className="flex gap-2 p-1.5 rounded-2xl bg-ink-100/70 dark:bg-ink-800/80 mb-6 border border-ink-200/60 dark:border-ink-700/60">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 ${
            activeTab === 'users'
              ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-ink-100 shadow-xs'
              : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
          }`}
        >
          <span>👥</span>
          用户管理
          <span className="text-xs opacity-75">({users.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('webdav')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2 ${
            activeTab === 'webdav'
              ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-ink-100 shadow-xs'
              : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
          }`}
        >
          <span>☁️</span>
          WebDAV 备份与恢复
        </button>
      </div>

      {activeTab === 'users' ? (
        <AdminUserList currentUserId={currentUserId} users={users} />
      ) : (
        <AdminWebdavBackup />
      )}
    </div>
  );
}
