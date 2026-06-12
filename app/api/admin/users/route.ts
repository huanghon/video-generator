import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

const VALID_ROLES = new Set(['admin', 'user']);

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      role: true,
      balance: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const role = String(body?.role || 'user');
  const balance = Number(body?.balance ?? 0);

  if (!username || !password) {
    return NextResponse.json({ message: '用户名和密码不能为空' }, { status: 400 });
  }
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ message: '角色不合法' }, { status: 400 });
  }
  if (!Number.isInteger(balance) || balance < 0) {
    return NextResponse.json({ message: '初始积分不能为负数' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username,
          passwordHash,
          role,
          balance,
          status: 'active'
        },
        select: {
          id: true,
          username: true,
          role: true,
          balance: true,
          status: true,
          createdAt: true
        }
      });

      if (balance > 0) {
        await tx.creditLog.create({
          data: {
            userId: createdUser.id,
            type: 'add',
            amount: balance,
            beforeBalance: 0,
            afterBalance: balance,
            reason: '创建用户初始积分',
            operatorId: admin!.id
          }
        });
      }

      return createdUser;
    });

    return NextResponse.json({ user });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ message: '用户名已存在' }, { status: 409 });
    }
    throw error;
  }
}
