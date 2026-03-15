import { cookies } from 'next/headers'
import { prisma } from './prisma'

export async function getCurrentUser() {
  const sessionId = cookies().get('session')?.value

  if (!sessionId) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionId },
  })

  return user
}