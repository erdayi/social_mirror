import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { reactToRingContent } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    contentToken?: string
    contentType?: 'pin' | 'comment'
    actionValue?: 0 | 1
  }

  if (!body.contentToken || !body.contentType || body.actionValue === undefined) {
    return NextResponse.json(
      { error: 'contentToken, contentType and actionValue are required.' },
      { status: 400 }
    )
  }

  return NextResponse.json(
    await reactToRingContent({
      contentToken: body.contentToken,
      contentType: body.contentType,
      actionValue: body.actionValue,
    })
  )
}
