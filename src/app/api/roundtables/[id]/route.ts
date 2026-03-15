import { NextRequest, NextResponse } from 'next/server'
import { getRoundtableDetailView } from '@/lib/mesociety/simulation'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const roundtable = await getRoundtableDetailView(context.params.id)

  if (!roundtable) {
    return NextResponse.json({ error: 'Roundtable not found' }, { status: 404 })
  }

  return NextResponse.json({ roundtable })
}
