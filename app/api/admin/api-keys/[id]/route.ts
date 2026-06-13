import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { encryptApiKey, maskApiKey, publicApiKeyAccountSelect } from '@/lib/apiKeyPool';

const VALID_STATUS = new Set(['active', 'disabled']);

function normalizeOptionalText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return message.includes('KEY_ENCRYPTION_SECRET') ? 500 : 400;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const data: Prisma.ApiKeyAccountUpdateInput = {};

  if (body?.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) {
      return NextResponse.json({ message: 'Key 名称不能为空' }, { status: 400 });
    }
    data.name = name;
  }

  if (body?.provider !== undefined) {
    data.provider = String(body.provider || 'video_provider').trim() || 'video_provider';
  }

  if (body?.apiKey !== undefined && String(body.apiKey).trim()) {
    const apiKey = String(body.apiKey).trim();
    try {
      data.apiKeyEncrypted = encryptApiKey(apiKey);
      data.apiKeyMasked = maskApiKey(apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新 API Key 失败';
      return NextResponse.json({ message }, { status: getErrorStatus(error) });
    }
  }

  if (body?.baseUrl !== undefined) {
    data.baseUrl = normalizeOptionalText(body.baseUrl);
  }

  if (body?.status !== undefined) {
    const status = String(body.status);
    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ message: 'Key 状态不合法' }, { status: 400 });
    }
    data.status = status;
  }

  if (body?.maxConcurrency !== undefined) {
    const maxConcurrency = Number(body.maxConcurrency);
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      return NextResponse.json({ message: '最大并发必须是大于 0 的整数' }, { status: 400 });
    }
    data.maxConcurrency = maxConcurrency;
  }

  if (body?.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      return NextResponse.json({ message: '排序值必须是整数' }, { status: 400 });
    }
    data.sortOrder = sortOrder;
  }

  if (body?.note !== undefined) {
    data.note = normalizeOptionalText(body.note);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: '没有可更新的字段' }, { status: 400 });
  }

  try {
    const updated = await prisma.apiKeyAccount.update({
      where: { id: params.id },
      data,
      select: publicApiKeyAccountSelect
    });

    return NextResponse.json({ apiKey: updated });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ message: 'Key 不存在' }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKey = await prisma.apiKeyAccount.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      currentConcurrency: true
    }
  });

  if (!apiKey) {
    return NextResponse.json({ message: 'Key 不存在' }, { status: 404 });
  }
  if (apiKey.currentConcurrency > 0) {
    return NextResponse.json(
      { message: '该 Key 仍有运行中任务，请稍后再删' },
      { status: 400 }
    );
  }

  await prisma.apiKeyAccount.delete({
    where: { id: params.id }
  });

  return NextResponse.json({ ok: true });
}
