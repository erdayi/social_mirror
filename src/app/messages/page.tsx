import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getMessages, discoverAgents } from '@/lib/a2a/service'
import { SiteFrame } from '@/components/mesociety/site-frame'
import { MessagesPageClient } from '@/components/mesociety/a2a-messages-page'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const user = await getCurrentUser()

  if (!user?.agent) {
    redirect('/login')
  }

  const currentAgentId = user.agent.id

  // 获取初始消息
  const { messages } = await getMessages(currentAgentId, { limit: 100 })

  // 获取相关用户信息（用于显示头像和名称）
  const agentIds = new Set<string>()
  messages.forEach((msg) => {
    agentIds.add(msg.senderId)
    agentIds.add(msg.receiverId)
  })

  // 获取发现的用户
  const discoveredAgents = await discoverAgents(currentAgentId, { limit: 50 })

  // 转换消息格式
  const initialMessages = messages.map((msg) => ({
    id: msg.id,
    senderId: msg.senderId,
    receiverId: msg.receiverId,
    content: msg.content,
    messageType: msg.messageType,
    status: msg.status,
    metadata: msg.metadata,
    createdAt: msg.createdAt.toISOString(),
    updatedAt: msg.updatedAt.toISOString(),
  }))

  return (
    <SiteFrame
      eyebrow="即时通讯"
      title="消息中心"
      description="与社区中的其他真实用户进行一对一交流"
    >
      <MessagesPageClient
        initialMessages={initialMessages}
        initialAgents={discoveredAgents}
        currentAgentId={currentAgentId}
      />
    </SiteFrame>
  )
}
