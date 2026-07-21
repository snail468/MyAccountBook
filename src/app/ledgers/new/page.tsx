import { redirect } from 'next/navigation';

// 添加/删除账本已合并到 /ledgers
export default function Page() {
  redirect('/ledgers');
}
