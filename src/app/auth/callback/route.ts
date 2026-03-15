import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const CLIENT_ID = process.env.SECONDME_CLIENT_ID!
const CLIENT_SECRET = process.env.SECONDME_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/?error=access_denied', request.url))
  }

  if (!code) {
    // 没有 code，重定向到登录
    return NextResponse.redirect(new URL('/api/auth?action=login', request.url))
  }

  try {
    // 用授权码换取 access token
    const tokenResponse = await fetch('https://api.second.me/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to get token')
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // 获取用户信息
    const userResponse = await fetch('https://api.second.me/v1/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error('Failed to get user info')
    }

    const userData = await userResponse.json()
    const { id: secondMeId, name, avatar, email } = userData

    // 保存或更新用户
    const user = await prisma.user.upsert({
      where: { secondMeId },
      create: {
        secondMeId,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        name,
        avatar,
        email,
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        name,
        avatar,
        email,
      },
    })

    // 设置 session cookie
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    response.cookies.set('session', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    })

    return response
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}