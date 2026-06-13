import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const tasks = await prisma.videoTask.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
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
      errorMessage: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ tasks });
}
