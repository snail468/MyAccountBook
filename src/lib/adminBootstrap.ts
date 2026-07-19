import { prisma } from '@/lib/db';

// 幂等：如果数据库里没有 admin，把最早注册的用户升为 admin
let done = false;
let running: Promise<void> | null = null;

export function ensureAdminBootstrap(): Promise<void> {
  if (done) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    try {
      const hasAdmin = await prisma.user.count({ where: { role: 'admin' } });
      if (hasAdmin === 0) {
        const oldest = await prisma.user.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true, username: true },
        });
        if (oldest) {
          await prisma.user.update({
            where: { id: oldest.id },
            data: { role: 'admin' },
          });
          console.log(`[admin] 自动将最早的用户 ${oldest.username} 升为 admin`);
        }
      }
      done = true;
    } catch (err) {
      console.error('[admin bootstrap] failed:', err);
      running = null;
      throw err;
    }
  })();
  return running;
}
