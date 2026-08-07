import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  CARDS_UNLOCK_TTL_MS,
  getSession,
  isCardsUnlocked,
  requireUserWithRole,
} from '@/lib/session';
import { cardEncryptionAvailable } from '@/lib/cardCrypto';
import CardsClient from './CardsClient';
import CardsUnlockGate from './CardsUnlockGate';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const user = await requireUserWithRole();
  if (!user) redirect('/login');

  const featureAvailable = cardEncryptionAvailable();
  const session = await getSession();
  const unlocked = featureAvailable && isCardsUnlocked(session);

  return (
    <div>
      <header className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">银行卡备份</h1>
        <Link href="/" className="text-xs text-ink-400 underline">
          返回
        </Link>
      </header>
      <p className="px-4 pb-3 text-xs text-ink-500">加密存储卡号，忘了卡号时来这里查</p>
      {!featureAvailable ? (
        <div className="px-4 py-10">
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="font-medium text-sm mb-1">功能未启用</div>
            <p className="text-xs text-ink-500">
              请在环境变量里配置 CARD_SECRET（至少 32 字符）后重启。
            </p>
            <p className="text-xs text-ink-500 mt-2">
              生成密钥：<code className="text-[11px]">openssl rand -base64 32</code>
            </p>
          </div>
        </div>
      ) : unlocked ? (
        // 解锁到点的绝对时刻交给客户端 —— 页面开着不动时它负责清掉明文并
        // 回到解锁门，否则 10 分钟 TTL 对"一直停在这页"的人形同虚设
        <CardsClient
          lockAtMs={
            session.cardsUnlockedAt ? session.cardsUnlockedAt + CARDS_UNLOCK_TTL_MS : null
          }
        />
      ) : (
        <CardsUnlockGate />
      )}
    </div>
  );
}
