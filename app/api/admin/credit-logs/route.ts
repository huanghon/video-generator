import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const logs = await prisma.creditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: {
        select: { username: true }
      },
      operator: {
        select: { username: true }
      }
    }
  });

  return NextResponse.json({ logs });
}
