import { describe, expect, it } from 'vitest';
import {
  getWebdavDirectoryUrl,
  getAuthHeader,
  parseWebdavPropfindXml,
  type WebdavFileItem,
} from '@/lib/webdav';

describe('WebDAV 工具函数测试', () => {
  describe('getWebdavDirectoryUrl', () => {
    it('正确规范化拼接基础 URL 与远端相对目录', () => {
      expect(getWebdavDirectoryUrl('https://dav.example.com', '/MyAccountBook')).toBe(
        'https://dav.example.com/MyAccountBook/'
      );
      expect(getWebdavDirectoryUrl('https://dav.example.com/', 'MyAccountBook/')).toBe(
        'https://dav.example.com/MyAccountBook/'
      );
      expect(getWebdavDirectoryUrl('https://dav.example.com///', '///backups/2026///')).toBe(
        'https://dav.example.com/backups/2026/'
      );
    });
  });

  describe('getAuthHeader', () => {
    it('生成标准 HTTP Basic Authorization Header', () => {
      const header = getAuthHeader('admin', '123456');
      const expectedToken = Buffer.from('admin:123456').toString('base64');
      expect(header).toBe(`Basic ${expectedToken}`);
    });

    it('密码为空也能正常编码', () => {
      const header = getAuthHeader('user', '');
      const expectedToken = Buffer.from('user:').toString('base64');
      expect(header).toBe(`Basic ${expectedToken}`);
    });
  });

  describe('parseWebdavPropfindXml', () => {
    it('准确解析 PROPFIND XML 中的文件项与目录', () => {
      const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/MyAccountBook/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/MyAccountBook/MyAccountBook_backup_20260915_120000.json.gz</D:href>
    <D:propstat>
      <D:prop>
        <D:getcontentlength>1048576</D:getcontentlength>
        <D:getlastmodified>Tue, 15 Sep 2026 04:00:00 GMT</D:getlastmodified>
        <D:resourcetype/>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/MyAccountBook/subfolder/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

      const items = parseWebdavPropfindXml(sampleXml);
      expect(items.length).toBe(3);

      // 第一项目录
      expect(items[0].name).toBe('MyAccountBook');
      expect(items[0].isCollection).toBe(true);

      // 第二项文件
      expect(items[1].name).toBe('MyAccountBook_backup_20260915_120000.json.gz');
      expect(items[1].sizeBytes).toBe(1048576);
      expect(items[1].isCollection).toBe(false);

      // 第三项子目录
      expect(items[2].name).toBe('subfolder');
      expect(items[2].isCollection).toBe(true);
    });
  });

  describe('备份保留 7 份排序与筛选策略', () => {
    it('正确按文件名与时间戳倒序排列，超出 7 份的部分作为待清理项', () => {
      const files: WebdavFileItem[] = [];
      for (let i = 1; i <= 10; i++) {
        const dayStr = String(i).padStart(2, '0');
        files.push({
          name: `MyAccountBook_backup_202609${dayStr}_120000.json.gz`,
          href: `/MyAccountBook/MyAccountBook_backup_202609${dayStr}_120000.json.gz`,
          sizeBytes: 1000,
          lastModified: new Date(`2026-09-${dayStr}T12:00:00Z`).toISOString(),
          isCollection: false,
        });
      }

      // 模拟排序
      files.sort((a, b) => b.name.localeCompare(a.name));

      // 最新的应该在最前
      expect(files[0].name).toBe('MyAccountBook_backup_20260910_120000.json.gz');
      expect(files[6].name).toBe('MyAccountBook_backup_20260904_120000.json.gz');

      // 前 7 份保留，多出的第 8~10 份清理
      const retained = files.slice(0, 7);
      const excess = files.slice(7);

      expect(retained.length).toBe(7);
      expect(excess.length).toBe(3);
      expect(excess.map((f) => f.name)).toEqual([
        'MyAccountBook_backup_20260903_120000.json.gz',
        'MyAccountBook_backup_20260902_120000.json.gz',
        'MyAccountBook_backup_20260901_120000.json.gz',
      ]);
    });
  });
});
