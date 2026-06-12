import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const tasks = await prisma.videoTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: {
        select: { username: true }
      }
    }
  });

  return NextResponse.json({ tasks });
}
