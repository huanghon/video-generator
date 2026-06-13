import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { VIDEO_GENERATION_COST, refundVideoTaskIfNeeded } from '@/lib/credits';
import {
  ApiKeyPoolBusyError,
  acquireApiKeyForTask,
  releaseApiKeyForTask,
  releaseVideoTaskKeyIfNeeded
} from '@/lib/apiKeyPool';
import { createImageToVideoTask } from '@/lib/videoProvider';
import { uploadImageForVideo } from '@/lib/storage';

export const runtime = 'nodejs';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '视频任务提交失败';
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (response) return response;

  const formData = await request.formData();
  const prompt = String(formData.get('prompt') || '').trim();
  const model = String(formData.get('model') || 'seedance_2_0');
  const aspectRatio = String(formData.get('aspectRatio') || formData.get('ratio') || '16:9');
  const duration = Number(formData.get('duration') || 5);
  const image = formData.get('image');

  if (!prompt) {
    return NextResponse.json({ message: '请输入提示词' }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id }
  });

  if (!dbUser || dbUser.status !== 'active') {
    return NextResponse.json({ message: '账号不可用' }, { status: 403 });
  }
  if (dbUser.balance < VIDEO_GENERATION_COST) {
    return NextResponse.json({ message: '积分不足，请联系管理员充值' }, { status: 400 });
  }

  let credential;
  let task = null;

  try {
    credential = await acquireApiKeyForTask();
  } catch (error) {
    if (error instanceof ApiKeyPoolBusyError) {
      return NextResponse.json({ message: error.message }, { status: 429 });
    }
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }

  let imageUrl: string | null = null;

  try {
    if (image instanceof File && image.size > 0) {
      imageUrl = await uploadImageForVideo(image);
    }

    task = await prisma.$transaction(async (tx) => {
      const latestUser = await tx.user.findUnique({
        where: { id: user!.id }
      });

      if (!latestUser || latestUser.status !== 'active') {
        throw new Error('账号不可用');
      }
      if (latestUser.balance < VIDEO_GENERATION_COST) {
        throw new Error('积分不足，请联系管理员充值');
      }

      const deducted = await tx.user.updateMany({
        where: {
          id: latestUser.id,
          status: 'active',
          balance: { gte: VIDEO_GENERATION_COST }
        },
        data: {
          balance: { decrement: VIDEO_GENERATION_COST }
        }
      });

      if (deducted.count !== 1) {
        throw new Error('积分不足，请联系管理员充值');
      }

      const beforeBalance = latestUser.balance;
      const afterBalance = beforeBalance - VIDEO_GENERATION_COST;

      await tx.creditLog.create({
        data: {
          userId: latestUser.id,
          type: 'deduct',
          amount: VIDEO_GENERATION_COST,
          beforeBalance,
          afterBalance,
          reason: '全能参考任务扣费'
        }
      });

      return tx.videoTask.create({
        data: {
          userId: latestUser.id,
          prompt,
          imageUrl,
          model,
          aspectRatio,
          cost: VIDEO_GENERATION_COST,
          apiKeyAccountId: credential.apiKeyAccountId,
          status: 'pending'
        }
      });
    });
  } catch (error) {
    await releaseVideoTaskKeyIfNeeded(task?.id || '');
    if (!task) {
      await releaseApiKeyForTask(credential.apiKeyAccountId);
    }
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 400 });
  }

  try {
    const providerTask = await createImageToVideoTask({
      prompt,
      imageUrl,
      model,
      aspectRatio,
      duration: Number.isFinite(duration) ? duration : 5
    }, credential);

    if (!providerTask.apiTaskId) {
      throw new Error('第三方视频服务未返回任务 ID');
    }

    const updatedTask = await prisma.videoTask.update({
      where: { id: task.id },
      data: {
        apiTaskId: providerTask.apiTaskId,
        status: 'processing'
      }
    });

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    await prisma.videoTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        errorMessage: getErrorMessage(error)
      }
    });
    const refundedTask = await refundVideoTaskIfNeeded(task.id, '任务提交失败自动退还积分');
    await releaseVideoTaskKeyIfNeeded(task.id);
    return NextResponse.json(
      { message: getErrorMessage(error), task: refundedTask || task },
      { status: 502 }
    );
  }
}
