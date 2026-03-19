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

// 添加连接池限制
const databaseUrl = process.env.DATABASE_URL.includes('connection_limit')
  ? process.env.DATABASE_URL
  : process.env.DATABASE_URL + '&connection_limit=1&pool_timeout=30'

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? prismaLogLevels : ['error'],
    datasources: {
      db: { url: databaseUrl },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
