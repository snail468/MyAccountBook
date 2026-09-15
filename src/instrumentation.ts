export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 延迟 15 秒等待系统和数据库启动就绪
    setTimeout(async () => {
      try {
        const { checkAndRunScheduledBackup } = await import('@/lib/webdavScheduler');
        // 启动后首次检查
        await checkAndRunScheduledBackup().catch(() => {});

        // 之后每 10 分钟检查一次是否需要执行定时备份
        setInterval(() => {
          checkAndRunScheduledBackup().catch(() => {});
        }, 10 * 60 * 1000);
      } catch {
        // 忽略初始化错误，避免影响应用主进程
      }
    }, 15000);
  }
}
