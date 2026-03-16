import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createRingComment, removeRingComment } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    contentToken?: string
    contentType?: 'pin' | 'comment'
    content?: string
  }

  if (!body.contentToken || !body.contentType || !body.content) {
    return NextResponse.json(
      { error: 'contentToken, contentType and content are required.' },
      { status: 400 }
    )
  }

  return NextResponse.json(
    await createRingComment({
      contentToken: body.contentToken,
      contentType: body.contentType,
      content: body.content,
    })
  )
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const commentId = searchParams.get('comment_id')

  if (!commentId) {
    return NextResponse.json({ error: 'comment_id is required.' }, { status: 400 })
  }

  return NextResponse.json(await removeRingComment({ commentId }))
}
