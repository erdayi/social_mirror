import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { buildSecondMeAuthUrl } from '@/lib/secondme'
import { clearSessionCookie } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action')

  if (action === 'login') {
    try {
      return NextResponse.redirect(buildSecondMeAuthUrl())
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'SecondMe credentials are not configured.',
        },
        { status: 503 }
      )
    }
  }

  if (action === 'logout') {
    const response = NextResponse.redirect(new URL('/', request.url))
    clearSessionCookie(cookies())
    return response
  }

  return NextResponse.json(
    { error: 'Invalid action. Use ?action=login or ?action=logout.' },
    { status: 400 }
  )
}
