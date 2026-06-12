import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action || '');
  const reason = body?.reason ? String(body.reason) : undefined;

  if (!['add', 'deduct', 'reset'].includes(action)) {
    return NextResponse.json({ message: '积分操作类型不合法' }, { status: 400 });
  }

  const amount = Number(body?.amount ?? 0);
  if (!Number.isInteger(amount) || amount < 0) {
    return NextResponse.json({ message: '积分数量必须是非负整数' }, { status: 400 });
  }
  if ((action === 'add' || action === 'deduct') && amount <= 0) {
    return NextResponse.json({ message: '增加或扣除积分必须大于 0' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetUser = await tx.user.findUnique({
        where: { id: params.id }
      });

      if (!targetUser) {
        throw new Error('用户不存在');
      }

      const beforeBalance = targetUser.balance;
      let afterBalance = beforeBalance;
      let logType = action;

      if (action === 'add') {
        afterBalance = beforeBalance + amount;
      }

      if (action === 'deduct') {
        if (beforeBalance < amount) {
          throw new Error('用户积分不足，不能扣成负数');
        }
        afterBalance = beforeBalance - amount;
      }

      if (action === 'reset') {
        afterBalance = amount;
        logType = 'reset';
      }

      const user = await tx.user.update({
        where: { id: targetUser.id },
        data: { balance: afterBalance },
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

      await tx.creditLog.create({
        data: {
          userId: targetUser.id,
          type: logType,
          amount,
          beforeBalance,
          afterBalance,
          reason,
          operatorId: admin!.id
        }
      });

      return user;
    });

    return NextResponse.json({ user: result });
  } catch (error: any) {
    return NextResponse.json({ message: error.message || '积分操作失败' }, { status: 400 });
  }
}
