import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import BatchImportClient from './BatchImportClient';

export const dynamic = 'force-dynamic';

export default async function BatchImportPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  return (
    <div className="px-6 pt-14 pb-20">
      <Prefetcher routes={['/renqing']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/renqing" className="text-ink-500 text-sm">
          ‹ 返回人情往来
        </Link>
        <h1 className="text-2xl font-bold flex-1">批量导入人情往来</h1>
      </div>

      <BatchImportClient />
    </div>
  );
}
