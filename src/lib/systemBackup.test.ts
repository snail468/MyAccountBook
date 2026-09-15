import { describe, expect, it } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { generateBackupFilename, type FullBackupPayload } from '@/lib/systemBackup';

describe('全系统备份功能测试', () => {
  it('generateBackupFilename 生成符合命名规范的文件名', () => {
    const testDate = new Date(Date.UTC(2026, 8, 15, 12, 30, 45)); // 2026-09-15 12:30:45 UTC -> 北京时间 20:30:45
    const name = generateBackupFilename(testDate);
    expect(name).toBe('MyAccountBook_backup_20260915_203045.json.gz');
    expect(name.endsWith('.json.gz')).toBe(true);
  });

  it('Gzip 序列化与反序列化完整性测试', () => {
    const samplePayload: FullBackupPayload = {
      format: 'MY_ACCOUNT_BOOK_FULL_SYSTEM_BACKUP',
      version: 1,
      exportedAt: new Date().toISOString(),
      database: {
        users: [{ id: 'u1', username: 'testuser' }],
        ledgers: [{ id: 'l1', name: '工作账本' }],
      },
      files: [{ path: 'receipts/sample.jpg', dataBase64: 'aGVsbG8gd29ybGQ=' }],
      summary: {
        userCount: 1,
        ledgerCount: 1,
        entryCount: 0,
        eventCount: 0,
        cardCount: 0,
        loanOrderCount: 0,
        fileCount: 1,
      },
    };

    const compressed = gzipSync(Buffer.from(JSON.stringify(samplePayload), 'utf-8'));
    expect(compressed.length).toBeGreaterThan(0);

    const decompressedStr = gunzipSync(compressed).toString('utf-8');
    const parsed = JSON.parse(decompressedStr) as FullBackupPayload;

    expect(parsed.format).toBe('MY_ACCOUNT_BOOK_FULL_SYSTEM_BACKUP');
    expect(parsed.version).toBe(1);
    expect(parsed.database.users[0].username).toBe('testuser');
    expect(parsed.files[0].path).toBe('receipts/sample.jpg');
    expect(parsed.summary.userCount).toBe(1);
  });
});
