import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

const VALID_ROLES = new Set(['admin', 'user']);
const VALID_STATUS = new Set(['active', 'disabled']);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const data: Record<string, string> = {};

  if (body?.password) {
    data.passwordHash = await bcrypt.hash(String(body.password), 10);
  }

  if (body?.status !== undefined) {
    const status = String(body.status);
    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ message: '账号状态不合法' }, { status: 400 });
    }
    data.status = status;
  }

  if (body?.role !== undefined) {
    const role = String(body.role);
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ message: '角色不合法' }, { status: 400 });
    }
    data.role = role;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: '没有可更新的字段' }, { status: 400 });
  }

  if (params.id === admin?.id && data.status === 'disabled') {
    return NextResponse.json({ message: '不能禁用当前登录的管理员账号' }, { status: 400 });
  }

  const updatedUser = await prisma.user.update({
    where: { id: params.id },
    data,
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

  return NextResponse.json({ user: updatedUser });
}
