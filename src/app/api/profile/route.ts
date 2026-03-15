import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getUserProfile } from '@/lib/secondme'

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const profile = await getUserProfile(user.accessToken)
    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Profile error:', error)
    // 返回本地存储的用户信息
    return NextResponse.json({
      profile: {
        id: user.secondMeId,
        name: user.name,
        avatar: user.avatar,
        email: user.email,
      },
    })
  }
}