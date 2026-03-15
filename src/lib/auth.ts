import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = 'mesociety_session'

export async function getCurrentUser() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value

  if (!sessionId) {
    return null
  }

  return prisma.user.findUnique({
    where: { id: sessionId },
    include: { agent: true },
  })
}

export async function getCurrentAgent() {
  const user = await getCurrentUser()
  return user?.agent ?? null
}

export function setSessionCookie(cookieStore: ReturnType<typeof cookies>, userId: string) {
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export function clearSessionCookie(cookieStore: ReturnType<typeof cookies>) {
  cookieStore.delete(SESSION_COOKIE)
}

export { SESSION_COOKIE }
