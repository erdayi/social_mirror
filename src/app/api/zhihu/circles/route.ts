import { NextRequest, NextResponse } from 'next/server'
import { listCircles } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ringIds = searchParams.getAll('ring_id')
  const pageNum = Number(searchParams.get('page_num') || '1')
  const pageSize = Number(searchParams.get('page_size') || '10')

  return NextResponse.json(
    await listCircles({
      ringIds,
      pageNum,
      pageSize,
    })
  )
}
