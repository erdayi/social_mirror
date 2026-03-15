import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SessionMessageTimeline } from '@/components/mesociety/session-message-timeline'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { getCurrentUser } from '@/lib/auth'
import { getSecondMeSessionMessages, getValidAccessToken } from '@/lib/secondme'

export const dynamic = 'force-dynamic'

export default async function SessionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const accessToken = await getValidAccessToken(user)

  let messages: Array<{
    messageId: string
    role: 'system' | 'user' | 'assistant'
    content: string
    senderUserId: number | null
    receiverUserId: number | null
    createTime: string
  }> = []

  try {
    messages = await getSecondMeSessionMessages({
      accessToken,
      sessionId: params.id,
    })
  } catch {
    // 静默失败
  }

  if (messages.length === 0) {
    notFound()
  }

  return (
    <SiteFrame
      eyebrow="会话详情"
      title={`会话 ${params.id.slice(0, 8)}...`}
      description="查看与 SecondMe Agent 的聊天消息历史。"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/sessions" className="pixel-button subtle">
            返回会话列表
          </Link>
          <Link href="/dashboard" className="pixel-button subtle">
            返回控制台
          </Link>
        </div>
      }
    >
      <section className="world-card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="pixel-inline-badge">{messages.length} 条消息</span>
          <span className="pixel-inline-badge">支持即时语音回放</span>
        </div>

        {messages.length > 0 ? (
          <SessionMessageTimeline messages={messages} />
        ) : (
          <div className="py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-[rgba(249,233,199,0.32)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="mt-4 text-sm font-semibold text-[rgba(249,233,199,0.68)]">
              暂无消息
            </p>
          </div>
        )}
      </section>
    </SiteFrame>
  )
}
