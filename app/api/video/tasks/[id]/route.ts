import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getVideoTaskStatus } from '@/lib/loova';
import { refundVideoTaskIfNeeded } from '@/lib/credits';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '查询视频任务失败';
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { user, response } = await requireUser();
  if (response) return response;

  let task = await prisma.videoTask.findUnique({
    where: { id: params.id }
  });

  if (!task) {
    return NextResponse.json({ message: '任务不存在' }, { status: 404 });
  }

  if (user!.role !== 'admin' && task.userId !== user!.id) {
    return NextResponse.json({ message: '无权查看该任务' }, { status: 403 });
  }

  if ((task.status === 'pending' || task.status === 'processing') && task.apiTaskId) {
    try {
      const providerStatus = await getVideoTaskStatus(task.apiTaskId);

      if (providerStatus.status === 'success') {
        task = await prisma.videoTask.update({
          where: { id: task.id },
          data: {
            status: 'success',
            videoUrl: providerStatus.videoUrl,
            errorMessage: null
          }
        });
      }

      if (providerStatus.status === 'failed') {
        await prisma.videoTask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            errorMessage: providerStatus.errorMessage || '视频生成失败'
          }
        });
        task = (await refundVideoTaskIfNeeded(
          task.id,
          providerStatus.errorMessage || '视频生成失败自动退还积分'
        )) as typeof task;
      }
    } catch (error) {
      return NextResponse.json({ message: getErrorMessage(error), task }, { status: 502 });
    }
  }

  const freshUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { balance: true }
  });

  return NextResponse.json({ task, balance: freshUser?.balance ?? user!.balance });
}
