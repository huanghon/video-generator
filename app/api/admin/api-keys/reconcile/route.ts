import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { reconcileApiKeyConcurrency } from '@/lib/apiKeyPool';

export async function POST() {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKeys = await reconcileApiKeyConcurrency();
  return NextResponse.json({ apiKeys });
}
