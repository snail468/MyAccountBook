import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import SearchClient from './SearchClient';

export const dynamic = 'force-dynamic';

export default async function SearchPage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  return (
    <div>
      <header className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">搜索</h1>
        <Link href="/" className="text-xs text-ink-400 underline">
          返回
        </Link>
      </header>
      <p className="px-4 text-xs text-ink-500">跨全部账本查找记录</p>
      <SearchClient />
    </div>
  );
}
