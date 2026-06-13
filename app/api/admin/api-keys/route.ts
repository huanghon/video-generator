import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { encryptApiKey, maskApiKey, publicApiKeyAccountSelect } from '@/lib/apiKeyPool';

const VALID_STATUS = new Set(['active', 'disabled']);

function normalizeOptionalText(value: unknown) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeMaxConcurrency(value: unknown) {
  const maxConcurrency = Number(value ?? 2);
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error('最大并发必须是大于 0 的整数');
  }
  return maxConcurrency;
}

function normalizeSortOrder(value: unknown) {
  const sortOrder = Number(value ?? 0);
  if (!Number.isInteger(sortOrder)) {
    throw new Error('排序值必须是整数');
  }
  return sortOrder;
}

function getErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return message.includes('KEY_ENCRYPTION_SECRET') ? 500 : 400;
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKeys = await prisma.apiKeyAccount.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: publicApiKeyAccountSelect
  });

  return NextResponse.json({ apiKeys });
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const apiKey = String(body?.apiKey || '').trim();
  const provider = String(body?.provider || 'video_provider').trim() || 'video_provider';
  const status = String(body?.status || 'active');

  if (!name) {
    return NextResponse.json({ message: 'Key 名称不能为空' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ message: 'API Key 不能为空' }, { status: 400 });
  }
  if (!VALID_STATUS.has(status)) {
    return NextResponse.json({ message: 'Key 状态不合法' }, { status: 400 });
  }

  try {
    const created = await prisma.apiKeyAccount.create({
      data: {
        name,
        provider,
        apiKeyEncrypted: encryptApiKey(apiKey),
        apiKeyMasked: maskApiKey(apiKey),
        baseUrl: normalizeOptionalText(body?.baseUrl),
        status,
        maxConcurrency: normalizeMaxConcurrency(body?.maxConcurrency),
        sortOrder: normalizeSortOrder(body?.sortOrder),
        note: normalizeOptionalText(body?.note)
      },
      select: publicApiKeyAccountSelect
    });

    return NextResponse.json({ apiKey: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建 Key 失败';
    return NextResponse.json({ message }, { status: getErrorStatus(error) });
  }
}
