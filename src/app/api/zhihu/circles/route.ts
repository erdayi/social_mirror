import { NextResponse } from 'next/server'
import { listCircles } from '@/lib/zhihu'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await listCircles())
}
