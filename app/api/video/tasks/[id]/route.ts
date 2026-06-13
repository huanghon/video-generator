import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { decryptApiKey, releaseVideoTaskKeyIfNeeded } from '@/lib/apiKeyPool';
import { getVideoTaskStatus } from '@/lib/videoProvider';
import { refundVideoTaskIfNeeded } from '@/lib/credits';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '查询视频任务失败';
}

function toProviderRaw(rawResponse: unknown) {
  return rawResponse === undefined ? undefined : (rawResponse as Prisma.InputJsonValue);
}

function publicTask(task: any) {
  if (!task) return task;
  const { providerRaw, ...safeTask } = task;
  return safeTask;
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
      if (!task.apiKeyAccountId) {
        throw new Error('任务缺少 API Key 绑定，无法查询供应商状态');
      }

      const apiKeyAccount = await prisma.apiKeyAccount.findUnique({
        where: { id: task.apiKeyAccountId }
      });

      if (!apiKeyAccount) {
        throw new Error('任务绑定的 API Key 不存在');
      }

      const providerStatus = await getVideoTaskStatus(task.apiTaskId, {
        apiKeyAccountId: apiKeyAccount.id,
        apiKey: decryptApiKey(apiKeyAccount.apiKeyEncrypted),
        baseUrl: apiKeyAccount.baseUrl
      }, {
        taskType: task.taskType
      });

      if (providerStatus.status === 'success') {
        task = await prisma.videoTask.update({
          where: { id: task.id },
          data: {
            status: 'success',
            videoUrl: providerStatus.videoUrl,
            errorMessage: null,
            providerRaw: toProviderRaw(providerStatus.rawResponse)
          }
        });
        await releaseVideoTaskKeyIfNeeded(task.id);
      }

      if (providerStatus.status === 'failed') {
        await prisma.videoTask.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            errorMessage: providerStatus.errorMessage || '视频生成失败',
            providerRaw: toProviderRaw(providerStatus.rawResponse)
          }
        });
        task = (await refundVideoTaskIfNeeded(
          task.id,
          providerStatus.errorMessage || '视频生成失败自动退还积分'
        )) as typeof task;
        await releaseVideoTaskKeyIfNeeded(task.id);
      }
    } catch (error) {
      return NextResponse.json({ message: getErrorMessage(error), task: publicTask(task) }, { status: 502 });
    }
  }

  const freshUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { balance: true }
  });

  return NextResponse.json({ task: publicTask(task), balance: freshUser?.balance ?? user!.balance });
}
