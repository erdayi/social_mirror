import { prisma } from '../src/lib/prisma'

async function main() {
  const result = (await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'roundtable_turns'
      AND COLUMN_NAME = 'audioUrl'
  `)) as Array<{ count: bigint | number }>

  const exists = Number(result[0]?.count || 0) > 0

  if (exists) {
    console.log('audioUrl column already exists on roundtable_turns')
    return
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE roundtable_turns
    ADD COLUMN audioUrl TEXT NULL AFTER content
  `)
  console.log('Successfully added audioUrl column to roundtable_turns table')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
