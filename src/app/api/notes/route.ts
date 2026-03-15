import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    notes: notes.map((n) => ({
      ...n,
      tags: n.tags ? JSON.parse(n.tags) : [],
    })),
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, content, tags } = await request.json()

  const note = await prisma.note.create({
    data: {
      userId: user.id,
      title,
      content,
      tags: JSON.stringify(tags || []),
    },
  })

  return NextResponse.json({ note })
}