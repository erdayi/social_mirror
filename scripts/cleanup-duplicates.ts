import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('清理 score_snapshots 表中的重复记录...')

  const result = await prisma.$executeRaw`
    DELETE s1 FROM score_snapshots s1
    INNER JOIN (
      SELECT agentId, tickNumber, MAX(id) as maxId
      FROM score_snapshots
      GROUP BY agentId, tickNumber
      HAVING COUNT(*) > 1
    ) s2 ON s1.agentId = s2.agentId AND s1.tickNumber = s2.tickNumber
    WHERE s1.id < s2.maxId
  `

  console.log('清理完成！')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
