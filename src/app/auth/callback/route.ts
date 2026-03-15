import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  exchangeAuthorizationCode,
  fetchSecondMeProfile,
  fetchSecondMeShades,
  fetchSecondMeSoftMemory,
} from '@/lib/secondme'
import { setSessionCookie } from '@/lib/auth'
import { syncRealAgentForUser } from '@/lib/mesociety/simulation'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/login?error=access_denied', request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const token = await exchangeAuthorizationCode(code)
    const [profile, shades, memories] = await Promise.all([
      fetchSecondMeProfile(token.accessToken),
      fetchSecondMeShades(token.accessToken),
      fetchSecondMeSoftMemory(token.accessToken),
    ])

    const user = await prisma.user.upsert({
      where: { secondMeId: profile.userId },
      update: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
        name: profile.name,
        avatar: profile.avatar,
        email: profile.email,
        route: profile.route,
      },
      create: {
        secondMeId: profile.userId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
        name: profile.name,
        avatar: profile.avatar,
        email: profile.email,
        route: profile.route,
      },
    })

    await syncRealAgentForUser(user, {
      profile,
      shades,
      memories,
    })

    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    setSessionCookie(cookies(), user.id)
    return response
  } catch (routeError) {
    console.error('SecondMe OAuth callback failed:', routeError)
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
  }
}
