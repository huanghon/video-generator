import { prisma } from '@/lib/prisma';

export const VIDEO_GENERATION_COST = 12;

export async function refundVideoTaskIfNeeded(taskId: string, reason = '视频生成失败自动退还积分') {
  return prisma.$transaction(async (tx) => {
    const task = await tx.videoTask.findUnique({
      where: { id: taskId }
    });

    if (!task || task.cost <= 0) {
      return null;
    }

    const refundReason = `${reason}: ${task.id}`;
    const existingRefund = await tx.creditLog.findFirst({
      where: {
        userId: task.userId,
        type: 'refund',
        reason: refundReason
      }
    });

    if (existingRefund) {
      return task;
    }

    const user = await tx.user.findUnique({
      where: { id: task.userId }
    });

    if (!user) {
      return task;
    }

    const beforeBalance = user.balance;
    const afterBalance = beforeBalance + task.cost;

    await tx.user.update({
      where: { id: user.id },
      data: { balance: afterBalance }
    });

    await tx.creditLog.create({
      data: {
        userId: user.id,
        type: 'refund',
        amount: task.cost,
        beforeBalance,
        afterBalance,
        reason: refundReason
      }
    });

    return tx.videoTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        errorMessage: task.errorMessage || '视频生成失败，积分已退还'
      }
    });
  });
}
