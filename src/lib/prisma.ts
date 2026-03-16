import { PrismaClient, type Prisma } from '@prisma/client'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Missing env DATABASE_URL. Create `.env.local` (recommended) or set DATABASE_URL before starting Next.js.',
  )
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prismaLogLevels: Prisma.LogLevel[] =
  process.env.PRISMA_LOG_QUERIES === '1'
    ? ['query', 'error', 'warn']
    : ['error', 'warn']

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? prismaLogLevels : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
