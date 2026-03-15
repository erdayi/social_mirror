import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const posts = await prisma.communityPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    posts: posts.map((p) => ({
      ...p,
      tags: p.tags ? JSON.parse(p.tags) : [],
    })),
  })
}

export async function POST(request: Request) {
  // 简化版：允许匿名发帖，实际应用中应验证用户身份
  const { title, content, tags, authorId, authorName } = await request.json()

  const post = await prisma.communityPost.create({
    data: {
      authorId: authorId || 'anonymous',
      authorName: authorName || '匿名用户',
      title,
      content,
      tags: JSON.stringify(tags || []),
    },
  })

  return NextResponse.json({ post })
}