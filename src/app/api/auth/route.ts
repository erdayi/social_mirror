import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.SECONDME_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

// /api/auth?action=login 或 /api/auth?action=logout
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action')

  if (action === 'login') {
    // 重定向到 SecondMe 授权页面
    const authUrl = new URL('https://app.second.me/oauth/authorize')
    authUrl.searchParams.set('client_id', CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'read write chat profile note')

    return NextResponse.redirect(authUrl.toString())
  }

  if (action === 'logout') {
    const response = NextResponse.redirect(new URL('/', request.url))
    response.cookies.delete('session')
    return response
  }

  return NextResponse.json({ error: 'Invalid action. Use ?action=login or ?action=logout' }, { status: 400 })
}