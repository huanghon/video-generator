import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

export type ApiKeyCredential = {
  apiKeyAccountId: string;
  apiKey: string;
  baseUrl?: string | null;
};

export class ApiKeyPoolBusyError extends Error {
  constructor() {
    super('当前生成队列繁忙，请稍后再试');
    this.name = 'ApiKeyPoolBusyError';
  }
}

export function maskApiKey(apiKey: string) {
  const value = apiKey.trim();
  if (value.length <= 8) {
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }
  return `${value.slice(0, 7)}****${value.slice(-4)}`;
}

export function encryptApiKey(apiKey: string) {
  return encryptSecret(apiKey);
}

export function decryptApiKey(encrypted: string) {
  return decryptSecret(encrypted);
}

export async function acquireApiKeyForTask(): Promise<ApiKeyCredential> {
  const candidates = await prisma.apiKeyAccount.findMany({
    where: { status: 'active' },
    orderBy: [
      { currentConcurrency: 'asc' },
      { lastUsedAt: { sort: 'asc', nulls: 'first' } },
      { sortOrder: 'asc' },
      { createdAt: 'asc' }
    ]
  });

  for (const candidate of candidates) {
    if (candidate.currentConcurrency >= candidate.maxConcurrency) {
      continue;
    }

    const apiKey = decryptApiKey(candidate.apiKeyEncrypted);
    const updated = await prisma.apiKeyAccount.updateMany({
      where: {
        id: candidate.id,
        status: 'active',
        currentConcurrency: { lt: candidate.maxConcurrency }
      },
      data: {
        currentConcurrency: { increment: 1 },
        lastUsedAt: new Date()
      }
    });

    if (updated.count === 1) {
      return {
        apiKeyAccountId: candidate.id,
        apiKey,
        baseUrl: candidate.baseUrl
      };
    }
  }

  throw new ApiKeyPoolBusyError();
}

export async function releaseApiKeyForTask(apiKeyAccountId?: string | null) {
  if (!apiKeyAccountId) return;

  await prisma.apiKeyAccount.updateMany({
    where: {
      id: apiKeyAccountId,
      currentConcurrency: { gt: 0 }
    },
    data: {
      currentConcurrency: { decrement: 1 }
    }
  });
}

export async function releaseVideoTaskKeyIfNeeded(taskId: string) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.videoTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        apiKeyAccountId: true,
        keyReleasedAt: true
      }
    });

    if (!task?.apiKeyAccountId || task.keyReleasedAt) {
      return false;
    }

    const marked = await tx.videoTask.updateMany({
      where: {
        id: task.id,
        keyReleasedAt: null
      },
      data: {
        keyReleasedAt: new Date()
      }
    });

    if (marked.count !== 1) {
      return false;
    }

    await tx.apiKeyAccount.updateMany({
      where: {
        id: task.apiKeyAccountId,
        currentConcurrency: { gt: 0 }
      },
      data: {
        currentConcurrency: { decrement: 1 }
      }
    });

    return true;
  });
}

export async function reconcileApiKeyConcurrency() {
  const activeTaskCounts = await prisma.videoTask.groupBy({
    by: ['apiKeyAccountId'],
    where: {
      apiKeyAccountId: { not: null },
      keyReleasedAt: null,
      status: { in: ['pending', 'processing'] }
    },
    _count: { _all: true }
  });

  await prisma.$transaction(async (tx) => {
    await tx.apiKeyAccount.updateMany({
      data: { currentConcurrency: 0 }
    });

    for (const item of activeTaskCounts) {
      if (!item.apiKeyAccountId) continue;
      await tx.apiKeyAccount.update({
        where: { id: item.apiKeyAccountId },
        data: {
          currentConcurrency: item._count._all
        }
      });
    }
  });

  return prisma.apiKeyAccount.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: publicApiKeyAccountSelect
  });
}

export const publicApiKeyAccountSelect = {
  id: true,
  name: true,
  provider: true,
  apiKeyMasked: true,
  baseUrl: true,
  status: true,
  maxConcurrency: true,
  currentConcurrency: true,
  lastUsedAt: true,
  sortOrder: true,
  note: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ApiKeyAccountSelect;
