import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const tasks = await prisma.videoTask.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  return NextResponse.json({ tasks });
}
