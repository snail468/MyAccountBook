import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin');

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
          log.info('自动把最早注册的用户升为 admin', { username: oldest.username });
        }
      }
      done = true;
    } catch (err) {
      log.error('admin bootstrap 失败', err);
      running = null;
      throw err;
    }
  })();
  return running;
}
