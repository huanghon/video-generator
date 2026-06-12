import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publicUser, setSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');

  if (!username || !password) {
    return NextResponse.json({ message: '请输入用户名和密码' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    return NextResponse.json({ message: '用户名或密码错误' }, { status: 401 });
  }

  if (user.status !== 'active') {
    return NextResponse.json({ message: '账号已禁用，请联系管理员' }, { status: 403 });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    return NextResponse.json({ message: '用户名或密码错误' }, { status: 401 });
  }

  const response = NextResponse.json({ user: publicUser(user) });
  setSessionCookie(response, user.id);
  return response;
}
