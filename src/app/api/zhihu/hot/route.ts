import { NextRequest, NextResponse } from 'next/server'
import { listHotTopics } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const topCnt = Number(searchParams.get('top_cnt') || '10')
  const publishInHours = Number(searchParams.get('publish_in_hours') || '48')

  return NextResponse.json(await listHotTopics({ topCnt, publishInHours }))
}
