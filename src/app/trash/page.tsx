import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import Prefetcher from '@/components/ui/Prefetcher';
import { listTrash } from '@/lib/recordTrash';
import TrashList from './TrashList';

export const dynamic = 'force-dynamic';

export default async function TrashPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const items = await listTrash(user.id);

  return (
    <div className="px-6 pt-14 pb-20">
      <Prefetcher routes={['/', '/ledgers']} />
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-ink-500 text-sm">‹ 返回</Link>
        <h1 className="text-2xl font-semibold flex-1">回收站</h1>
      </div>

      <p className="text-xs text-ink-500 mb-4">
        删除的记账条目保留 60 天，之后自动清理。恢复即回到原账本；
        彻底删除则立刻抹掉，无法找回。
        <br />
        整个账本的回收站在
        <Link href="/ledgers" className="underline ml-1">添加 / 删除账本</Link>
        里。
      </p>

      <TrashList items={items} />
    </div>
  );
}
