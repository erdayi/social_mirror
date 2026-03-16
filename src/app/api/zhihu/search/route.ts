import { NextRequest, NextResponse } from 'next/server'
import { searchTrustedContent } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const count = Number(searchParams.get('count') || '5')

  return NextResponse.json(await searchTrustedContent(query, count))
}
