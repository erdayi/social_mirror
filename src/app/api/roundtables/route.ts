import { NextResponse } from 'next/server'
import { getRoundtableListView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    roundtables: await getRoundtableListView(),
  })
}
