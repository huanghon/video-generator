import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE_NAME = 'video_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  exp: number;
};

function getAuthSecret() {
  return process.env.AUTH_SECRET || 'dev-only-change-this-auth-secret';
}

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload: string) {
  return crypto
    .createHmac('sha256', getAuthSecret())
    .update(payload)
    .digest('base64url');
}

export function createSessionToken(userId: string) {
  const payload = base64Url(
    JSON.stringify({
      userId,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
    })
  );
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(token?: string): SessionPayload | null {
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionPayload;
    if (!parsed.userId || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
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
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ message: '未登录' }, { status: 401 }) };
  }
  if (user.status !== 'active') {
    return { user: null, response: NextResponse.json({ message: '账号已禁用' }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function requireAdmin() {
  const { user, response } = await requireUser();
  if (response) return { user: null, response };
  if (user?.role !== 'admin') {
    return { user: null, response: NextResponse.json({ message: '需要管理员权限' }, { status: 403 }) };
  }
  return { user, response: null };
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 0
  });
}

export function publicUser(user: {
  id: string;
  username: string;
  role: string;
  balance: number;
  status: string;
}) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    balance: user.balance,
    status: user.status
  };
}
