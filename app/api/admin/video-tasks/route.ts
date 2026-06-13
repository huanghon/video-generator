import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const tasks = await prisma.videoTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      userId: true,
      prompt: true,
      imageUrl: true,
      videoUrl: true,
      model: true,
      aspectRatio: true,
      cost: true,
      taskType: true,
      status: true,
      apiTaskId: true,
      apiKeyAccountId: true,
      keyReleasedAt: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { username: true }
      }
    }
  });

  return NextResponse.json({ tasks });
}
