import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import SearchClient from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  return (
    <div className="pt-14">
      <div className="px-4 flex items-center gap-3 mb-2">
        <Link href="/" className="text-ink-500 text-sm">
          ‹ 返回
        </Link>
        <h1 className="text-2xl font-semibold flex-1">搜索</h1>
      </div>
      <p className="px-4 text-xs text-ink-500">跨全部账本查找记录</p>
      <SearchClient />
    </div>
  );
}
