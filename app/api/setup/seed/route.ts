import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

async function createUser(
  tx: any,
  username: string,
  password: string,
  role: string,
  balance: number
) {
  const passwordHash = await bcrypt.hash(password, 10);

  return tx.user.create({
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
      status: true
    }
  });
}

async function seedUsers(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret');

  if (!process.env.SETUP_SECRET) {
    return NextResponse.json({ message: 'SETUP_SECRET 未配置' }, { status: 500 });
  }

  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ message: '初始化密钥错误' }, { status: 401 });
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return NextResponse.json(
      { message: '数据库已存在用户，初始化接口不会重复执行' },
      { status: 409 }
    );
  }

  const users = await prisma.$transaction(async (tx) => {
    const createdUsers = [];
    createdUsers.push(await createUser(tx, 'admin', 'admin123456', 'admin', 0));

    for (let index = 1; index <= 5; index += 1) {
      createdUsers.push(await createUser(tx, `user${index}`, '123456', 'user', 100));
    }

    return createdUsers;
  });

  return NextResponse.json({
    message: '初始化完成',
    users
  });
}

export async function GET(request: Request) {
  return seedUsers(request);
}

export async function POST(request: Request) {
  return seedUsers(request);
}
