import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSessionView } from '@/lib/mesociety/simulation'

export async function GET() {
  const user = await getCurrentUser()
  return NextResponse.json({
    session: await getSessionView(user),
  })
}
