import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserWithRole } from '@/lib/session';
import CardsClient from './CardsClient';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  return (
    <div>
      <header className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">银行卡备份</h1>
        <Link href="/" className="text-xs text-ink-400 underline">
          返回
        </Link>
      </header>
      <p className="px-4 pb-3 text-xs text-ink-500">加密存储卡号，忘了卡号时来这里查</p>
      <CardsClient />
    </div>
  );
}
