import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { publishControlledRingPost } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    ringId?: string
    title?: string
    content?: string
    imageUrls?: string[]
  }

  if (!body.ringId || !body.title || !body.content) {
    return NextResponse.json({ error: 'ringId, title and content are required.' }, { status: 400 })
  }

  return NextResponse.json(
    await publishControlledRingPost({
      ringId: body.ringId,
      title: body.title,
      content: body.content,
      imageUrls: body.imageUrls,
    })
  )
}
