import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { generateSecondMeTTS, getValidAccessToken } from '@/lib/secondme'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as null | {
    text?: unknown
    emotion?: unknown
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const emotion =
    body?.emotion === 'happy' ||
    body?.emotion === 'sad' ||
    body?.emotion === 'angry' ||
    body?.emotion === 'fearful' ||
    body?.emotion === 'disgusted' ||
    body?.emotion === 'surprised' ||
    body?.emotion === 'calm' ||
    body?.emotion === 'fluent'
      ? body.emotion
      : 'calm'

  if (!text) {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 })
  }

  const accessToken = await getValidAccessToken(user)
  const audio = await generateSecondMeTTS({
    accessToken,
    text: text.slice(0, 600),
    emotion,
  })

  return NextResponse.json({
    audio,
  })
}
