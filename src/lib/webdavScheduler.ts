import { getBeijingParts } from '@/lib/datetime';
import {
  getStoredWebdavConfig,
  saveStoredWebdavConfig,
  uploadWebdavBackup,
} from '@/lib/webdav';
import { createFullSystemBackup } from '@/lib/systemBackup';
import { createLogger, errorFields } from '@/lib/logger';

const log = createLogger('webdavScheduler');

let isRunning = false;

/**
 * 检查并执行定时 WebDAV 备份
 * 策略：
 * 1. 检查是否开启 autoBackupEnabled 且已配置 WebDAV。
 * 2. 计算当前北京时间 (UTC+8) 的日期和分钟数。
 * 3. 检查当前时间是否达到 scheduleTime（如 03:00）。
 * 4. 检查今天是否已成功执行过备份，避免同一天重复执行。
 */
export async function checkAndRunScheduledBackup(): Promise<{
  triggered: boolean;
  reason?: string;
  filename?: string;
}> {
  if (isRunning) {
    return { triggered: false, reason: '上一轮备份任务仍在执行中' };
  }

  const config = await getStoredWebdavConfig();
  if (!config.autoBackupEnabled) {
    return { triggered: false, reason: '自动备份未启用' };
  }

  if (!config.url || !config.username) {
    return { triggered: false, reason: 'WebDAV 未配置' };
  }

  const now = new Date();
  const bjNow = getBeijingParts(now);
  if (!bjNow) {
    return { triggered: false, reason: '无法计算北京时间' };
  }

  const todayStr = `${bjNow.year}-${String(bjNow.month).padStart(2, '0')}-${String(bjNow.day).padStart(2, '0')}`;
  const currentMinutes = bjNow.hour * 60 + bjNow.minute;

  // 解析 scheduleTime "HH:mm"
  const [schedH, schedM] = (config.scheduleTime || '03:00').split(':').map((v) => parseInt(v, 10) || 0);
  const schedMinutes = schedH * 60 + schedM;

  if (currentMinutes < schedMinutes) {
    return {
      triggered: false,
      reason: `未到设定备份时间（设定: ${config.scheduleTime}, 当前北京时间: ${String(bjNow.hour).padStart(2, '0')}:${String(bjNow.minute).padStart(2, '0')}）`,
    };
  }

  // 检查今日是否已成功备份
  if (config.lastBackupAt && config.lastBackupStatus === 'success') {
    const lastDate = new Date(config.lastBackupAt);
    const lastBj = getBeijingParts(lastDate);
    if (lastBj) {
      const lastDateStr = `${lastBj.year}-${String(lastBj.month).padStart(2, '0')}-${String(lastBj.day).padStart(2, '0')}`;
      if (lastDateStr === todayStr) {
        return { triggered: false, reason: `今日已完成备份 (${config.lastBackupAt})` };
      }
    }
  }

  // 达到触发条件，开始备份
  isRunning = true;
  log.info(`触发定时自动备份，设定时间: ${config.scheduleTime}, 当前北京时间: ${todayStr} ${String(bjNow.hour).padStart(2, '0')}:${String(bjNow.minute).padStart(2, '0')}`);

  try {
    const backup = await createFullSystemBackup();
    const uploadRes = await uploadWebdavBackup(config, backup.filename, backup.buffer);

    await saveStoredWebdavConfig({
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'success',
      lastBackupMessage: null,
    });

    log.info(`定时自动备份完成: ${backup.filename}, 自动滚动清理 ${uploadRes.deletedOldCount} 份超期备份`);

    return {
      triggered: true,
      filename: backup.filename,
    };
  } catch (err: any) {
    log.error('定时自动备份执行失败', errorFields(err));

    await saveStoredWebdavConfig({
      lastBackupStatus: 'failed',
      lastBackupMessage: `定时备份失败: ${err.message || '未知错误'}`,
    });

    return {
      triggered: false,
      reason: err.message,
    };
  } finally {
    isRunning = false;
  }
}
