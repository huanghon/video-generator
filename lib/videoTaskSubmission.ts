import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { VIDEO_GENERATION_COST, refundVideoTaskIfNeeded } from '@/lib/credits';
import {
  ApiKeyPoolBusyError,
  acquireApiKeyForTask,
  releaseApiKeyForTask,
  releaseVideoTaskKeyIfNeeded
} from '@/lib/apiKeyPool';
import { createImageToVideoTask, createTextToVideoTask } from '@/lib/videoProvider';
import { uploadReferenceAssetForVideo } from '@/lib/storage';

type TaskType = 'image-to-video' | 'text-to-video';

type SubmitVideoTaskParams = {
  userId: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: number;
  taskType: TaskType;
  functionMode?: string | null;
  image?: File | null;
  referenceFiles?: File[];
};

export class VideoTaskSubmissionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'VideoTaskSubmissionError';
    this.status = status;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '视频任务提交失败';
}

function toProviderRaw(rawResponse: unknown) {
  return rawResponse === undefined ? undefined : (rawResponse as Prisma.InputJsonValue);
}

function getReferenceBucket(file: File) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

async function uploadReferenceFiles(files: File[]) {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];

  for (const file of files) {
    const bucket = getReferenceBucket(file);
    if (!bucket) {
      throw new Error(`不支持的参考素材格式：${file.name}`);
    }

    const url = await uploadReferenceAssetForVideo(file);
    if (!url) continue;

    if (bucket === 'image' && imageUrls.length < 9) imageUrls.push(url);
    if (bucket === 'video' && videoUrls.length < 3) videoUrls.push(url);
    if (bucket === 'audio' && audioUrls.length < 3) audioUrls.push(url);
  }

  return { imageUrls, videoUrls, audioUrls };
}

export async function submitVideoGenerationTask(params: SubmitVideoTaskParams) {
  const dbUser = await prisma.user.findUnique({
    where: { id: params.userId }
  });

  if (!dbUser || dbUser.status !== 'active') {
    throw new VideoTaskSubmissionError('账号不可用', 403);
  }
  if (dbUser.balance < VIDEO_GENERATION_COST) {
    throw new VideoTaskSubmissionError('积分不足，请联系管理员充值', 400);
  }

  let credential;
  try {
    credential = await acquireApiKeyForTask();
  } catch (error) {
    if (error instanceof ApiKeyPoolBusyError) {
      throw new VideoTaskSubmissionError(error.message, 429);
    }
    throw new VideoTaskSubmissionError(getErrorMessage(error), 500);
  }

  let task = null;
  let imageUrl: string | null = null;
  let referenceUrls = {
    imageUrls: [] as string[],
    videoUrls: [] as string[],
    audioUrls: [] as string[]
  };

  try {
    const referenceFiles = params.referenceFiles?.length
      ? params.referenceFiles
      : params.image instanceof File && params.image.size > 0
        ? [params.image]
        : [];

    if (referenceFiles.length > 0) {
      referenceUrls = await uploadReferenceFiles(referenceFiles);
      imageUrl = referenceUrls.imageUrls[0] || null;
    }

    task = await prisma.$transaction(async (tx) => {
      const latestUser = await tx.user.findUnique({
        where: { id: params.userId }
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
          reason: params.taskType === 'text-to-video' ? '文生视频任务扣费' : '全能参考任务扣费'
        }
      });

      return tx.videoTask.create({
        data: {
          userId: latestUser.id,
          prompt: params.prompt,
          imageUrl,
          model: params.model,
          aspectRatio: params.aspectRatio,
          cost: VIDEO_GENERATION_COST,
          taskType: params.taskType,
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
    throw new VideoTaskSubmissionError(getErrorMessage(error), 400);
  }

  try {
    const providerTask =
      params.taskType === 'text-to-video'
        ? await createTextToVideoTask(
            {
              prompt: params.prompt,
              model: params.model,
              aspectRatio: params.aspectRatio,
              duration: params.duration
            },
            credential
          )
        : await createImageToVideoTask(
            {
              prompt: params.prompt,
              imageUrl,
              imageUrls: referenceUrls.imageUrls,
              videoUrls: referenceUrls.videoUrls,
              audioUrls: referenceUrls.audioUrls,
              model: params.model,
              aspectRatio: params.aspectRatio,
              duration: params.duration,
              functionMode: params.functionMode
            },
            credential
          );

    if (!providerTask.apiTaskId) {
      throw new Error('第三方视频服务未返回任务 ID');
    }

    return prisma.videoTask.update({
      where: { id: task.id },
      data: {
        apiTaskId: providerTask.apiTaskId,
        status: 'processing',
        providerRaw: toProviderRaw(providerTask.rawResponse)
      }
    });
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
    throw new VideoTaskSubmissionError(getErrorMessage(error), 502);
  }
}
