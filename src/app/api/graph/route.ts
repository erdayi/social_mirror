import { NextResponse } from 'next/server'
import { getGraphView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    graph: await getGraphView(),
  })
}
