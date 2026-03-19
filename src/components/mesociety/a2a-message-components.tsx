'use client'

import { useState, useRef } from 'react'

export interface A2AMessage {
  id: string
  senderId: string
  receiverId: string
  content: string
  messageType: 'message' | 'encounter' | 'handshake'
  status: 'pending' | 'delivered' | 'read'
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AgentInfo {
  id: string
  displayName: string
  bio?: string | null
  avatarUrl?: string | null
  slug: string
  style: string
  stance: string
  influence: number
}

interface A2AMessageListProps {
  messages: A2AMessage[]
  currentAgentId: string
  agents: Map<string, AgentInfo>
  onSelectConversation?: (agentId: string) => void
  selectedAgentId?: string
}

// 格式化时间
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (days === 1) {
    return '昨天'
  } else if (days < 7) {
    return date.toLocaleDateString('zh-CN', { weekday: 'short' })
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
}

// 获取消息类型标签
function getMessageTypeLabel(type: string) {
  switch (type) {
    case 'encounter':
      return '偶遇'
    case 'handshake':
      return '握手'
    default:
      return '消息'
  }
}

export function A2AMessageList({
  messages,
  currentAgentId,
  agents,
  onSelectConversation,
  selectedAgentId,
}: A2AMessageListProps) {
  // 按对话分组
  const conversations = messages.reduce(
    (acc, msg) => {
      const otherId = msg.senderId === currentAgentId ? msg.receiverId : msg.senderId
      if (!acc[otherId]) {
        acc[otherId] = []
      }
      acc[otherId].push(msg)
      return acc
    },
    {} as Record<string, A2AMessage[]>
  )

  // 按最新消息时间排序
  const sortedConversations = Object.entries(conversations)
    .map(([agentId, msgs]) => ({
      agentId,
      messages: msgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      latestMsg: msgs[0],
    }))
    .sort((a, b) => new Date(b.latestMsg.createdAt).getTime() - new Date(a.latestMsg.createdAt).getTime())

  if (sortedConversations.length === 0) {
    return (
      <div className="pixel-empty-state">
        <div className="pixel-empty-icon">💬</div>
        <p className="pixel-empty-text">暂无消息记录</p>
        <p className="pixel-empty-hint">开始发现其他居民并发送消息吧</p>
      </div>
    )
  }

  return (
    <div className="a2a-message-list">
      {sortedConversations.map(({ agentId, messages: conversationMessages, latestMsg }) => {
        const agent = agents.get(agentId)
        const isSelected = selectedAgentId === agentId
        const unreadCount = conversationMessages.filter(
          (m) => m.receiverId === currentAgentId && m.status !== 'read'
        ).length
        const isSent = latestMsg.senderId === currentAgentId

        return (
          <button
            key={agentId}
            className={`a2a-conversation-item ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectConversation?.(agentId)}
          >
            <div className="a2a-conversation-avatar">
              {agent?.avatarUrl ? (
                <img src={agent.avatarUrl} alt={agent.displayName} />
              ) : (
                <div className="a2a-avatar-placeholder">
                  {agent?.displayName?.charAt(0) || '?'}
                </div>
              )}
              {unreadCount > 0 && <span className="a2a-unread-badge">{unreadCount}</span>}
            </div>
            <div className="a2a-conversation-content">
              <div className="a2a-conversation-header">
                <span className="a2a-conversation-name">
                  {agent?.displayName || '未知用户'}
                </span>
                <span className="a2a-conversation-time">
                  {formatTime(latestMsg.createdAt)}
                </span>
              </div>
              <div className="a2a-conversation-preview">
                {latestMsg.messageType !== 'message' && (
                  <span className="a2a-type-tag">{getMessageTypeLabel(latestMsg.messageType)}</span>
                )}
                <span className="a2a-preview-text">
                  {isSent ? '我: ' : ''}
                  {latestMsg.content.substring(0, 40)}
                  {latestMsg.content.length > 40 ? '...' : ''}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// 消息气泡组件
interface A2AMessageBubbleProps {
  message: A2AMessage
  isMine: boolean
  agent?: AgentInfo
}

export function A2AMessageBubble({ message, isMine, agent }: A2AMessageBubbleProps) {
  return (
    <div className={`a2a-message-bubble ${isMine ? 'mine' : 'theirs'}`}>
      {!isMine && (
        <div className="a2a-bubble-avatar">
          {agent?.avatarUrl ? (
            <img src={agent.avatarUrl} alt={agent.displayName} />
          ) : (
            <div className="a2a-avatar-placeholder small">
              {agent?.displayName?.charAt(0) || '?'}
            </div>
          )}
        </div>
      )}
      <div className="a2a-bubble-content">
        {!isMine && (
          <span className="a2a-bubble-sender">{agent?.displayName}</span>
        )}
        <div className="a2a-bubble-body">
          {message.messageType !== 'message' && (
            <span className="a2a-type-tag small">{getMessageTypeLabel(message.messageType)}</span>
          )}
          <p className="a2a-bubble-text">{message.content}</p>
        </div>
        <span className="a2a-bubble-time">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  )
}

// 消息输入框组件
interface A2AComposerProps {
  onSend: (content: string, type?: 'message' | 'handshake') => void
  disabled?: boolean
  placeholder?: string
}

export function A2AComposer({ onSend, disabled, placeholder = '发送消息...' }: A2AComposerProps) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = async () => {
    if (!content.trim() || isSending) return

    setIsSending(true)
    try {
      await onSend(content.trim())
      setContent('')
      textareaRef.current?.focus()
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="a2a-composer">
      <textarea
        ref={textareaRef}
        className="a2a-composer-input"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isSending}
        rows={1}
      />
      <div className="a2a-composer-actions">
        <button
          className="a2a-composer-btn send"
          onClick={handleSend}
          disabled={disabled || isSending || !content.trim()}
        >
          {isSending ? '...' : '发送'}
        </button>
      </div>
    </div>
  )
}

// 用户发现组件
interface AgentDiscoverProps {
  agents: AgentInfo[]
  currentAgentId?: string
  onSelectAgent?: (agent: AgentInfo) => void
  onSwitchToTopics?: () => void
  loading?: boolean
}

export function AgentDiscover({ agents, onSelectAgent, onSwitchToTopics, loading }: AgentDiscoverProps) {
  if (loading) {
    return (
      <div className="agent-discover-loading">
        <span className="loading-dots">加载中...</span>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="pixel-empty-state a2a-discover-empty">
        <div className="a2a-discover-empty-icon">🌟</div>
        <p className="pixel-empty-text">探索社区</p>
        <p className="pixel-empty-hint">成为第一批与其他 Agent 交流的先驱者！</p>
        <div className="a2a-discover-empty-hint">
          <span>💡 试试创建话题讨论</span>
          <span>或等待其他用户加入</span>
        </div>
        {onSwitchToTopics && (
          <button className="a2a-discover-start-btn" onClick={onSwitchToTopics}>
            发起话题讨论
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="agent-discover-grid">
      {agents.map((agent) => (
        <button
          key={agent.id}
          className="agent-discover-card"
          onClick={() => onSelectAgent?.(agent)}
        >
          <div className="agent-discover-avatar">
            {agent.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.displayName} />
            ) : (
              <div className="a2a-avatar-placeholder">
                {agent.displayName.charAt(0)}
              </div>
            )}
          </div>
          <div className="agent-discover-info">
            <h4 className="agent-discover-name">{agent.displayName}</h4>
            <p className="agent-discover-bio">
              {agent.bio?.substring(0, 50) || '暂无简介'}
              {(agent.bio?.length || 0) > 50 ? '...' : ''}
            </p>
            <div className="agent-discover-tags">
              <span className="agent-discover-tag">{agent.style}</span>
              <span className="agent-discover-tag">{agent.stance}</span>
              <span className="agent-discover-influence">影响力 {agent.influence}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

// 未读消息数徽章
interface A2AUnreadBadgeProps {
  count: number
}

export function A2AUnreadBadge({ count }: A2AUnreadBadgeProps) {
  if (count <= 0) return null

  return (
    <span className="a2a-nav-badge">
      {count > 99 ? '99+' : count}
    </span>
  )
}

// SSE连接状态指示器
interface A2AConnectionStatusProps {
  connected: boolean
}

export function A2AConnectionStatus({ connected }: A2AConnectionStatusProps) {
  return (
    <div className={`a2a-connection-status ${connected ? 'connected' : 'disconnected'}`}>
      <span className="a2a-status-dot" />
      <span className="a2a-status-text">
        {connected ? '实时同步中' : '连接中断'}
      </span>
    </div>
  )
}
