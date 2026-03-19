'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  A2AMessageList,
  A2AMessageBubble,
  A2AComposer,
  AgentDiscover,
  A2AConnectionStatus,
  type A2AMessage,
  type AgentInfo,
} from '@/components/mesociety/a2a-message-components'

interface ZhihuTopic {
  id: string
  title: string
  excerpt: string
  heat: number
  url?: string
}

interface TopicDiscussion {
  id: string
  zhihuTopicId: string
  title: string
  excerpt: string | null
  heat: number
  hostAgentId: string
  status: 'opening' | 'active' | 'completed'
  maxParticipants: number
  participantCount: number
  createdAt: string
  updatedAt: string
}

interface DiscussionWithParticipants extends TopicDiscussion {
  participants: Array<{
    agentId: string
    displayName: string
    avatarUrl: string | null
    source: 'real' | 'seed'
    isHost: boolean
    joinedAt: string
  }>
}

interface MessagesPageClientProps {
  initialMessages: A2AMessage[]
  initialAgents: AgentInfo[]
  currentAgentId: string
}

export function MessagesPageClient({
  initialMessages,
  initialAgents,
  currentAgentId,
}: MessagesPageClientProps) {
  const [messages, setMessages] = useState<A2AMessage[]>(initialMessages)
  const [agents] = useState<Map<string, AgentInfo>>(() => {
    const map = new Map<string, AgentInfo>()
    initialAgents.forEach((agent) => map.set(agent.id, agent))
    return map
  })
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'messages' | 'discover' | 'topics'>('topics')
  const [connected, setConnected] = useState(false)
  const [discoverAgents, setDiscoverAgents] = useState<AgentInfo[]>([])
  const [loadingDiscover, setLoadingDiscover] = useState(false)

  // Topic discussions state
  const [zhihuTopics, setZhihuTopics] = useState<ZhihuTopic[]>([])
  const [activeDiscussions, setActiveDiscussions] = useState<TopicDiscussion[]>([])
  const [selectedDiscussion, setSelectedDiscussion] = useState<DiscussionWithParticipants | null>(null)
  const [loadingTopics, setLoadingTopics] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load Zhihu topics
  const loadZhihuTopics = useCallback(async () => {
    setLoadingTopics(true)
    try {
      const res = await fetch('/api/a2a/discussions?action=topics')
      const data = await res.json()
      setZhihuTopics(data.topics || [])
    } catch (error) {
      console.error('Failed to load topics:', error)
    } finally {
      setLoadingTopics(false)
    }
  }, [])

  // Load active discussions
  const loadDiscussions = useCallback(async () => {
    try {
      const res = await fetch('/api/a2a/discussions')
      const data = await res.json()
      setActiveDiscussions(data.discussions || [])
    } catch (error) {
      console.error('Failed to load discussions:', error)
    }
  }, [])

  // Load initial data
  useEffect(() => {
    loadZhihuTopics()
    loadDiscussions()
  }, [loadZhihuTopics, loadDiscussions])

  // Load more discover agents
  const loadDiscoverAgents = useCallback(async () => {
    setLoadingDiscover(true)
    try {
      const res = await fetch('/api/a2a/agents?limit=20')
      const data = await res.json()
      setDiscoverAgents(data.agents || [])
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoadingDiscover(false)
    }
  }, [])

  // Switch to discover tab
  useEffect(() => {
    if (activeTab === 'discover' && discoverAgents.length === 0) {
      loadDiscoverAgents()
    }
  }, [activeTab, discoverAgents.length, loadDiscoverAgents])

  // SSE connection
  useEffect(() => {
    let eventSource: EventSource | null = null

    const connectSSE = () => {
      eventSource = new EventSource('/api/a2a/stream')
      eventSource.onopen = () => setConnected(true)
      eventSource.onerror = () => {
        setConnected(false)
        eventSource?.close()
        setTimeout(connectSSE, 5000)
      }
      eventSource.addEventListener('init', () => {
        setConnected(true)
      })
      eventSource.addEventListener('new_messages', (e) => {
        const data = JSON.parse(e.data)
        if (data.messages) {
          setMessages((prev) => [...data.messages, ...prev])
        }
      })
    }

    connectSSE()

    return () => {
      eventSource?.close()
    }
  }, [])

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedAgentId])

  // Get conversation messages
  const conversationMessages = selectedAgentId
    ? messages
        .filter(
          (m) =>
            (m.senderId === currentAgentId && m.receiverId === selectedAgentId) ||
            (m.senderId === selectedAgentId && m.receiverId === currentAgentId)
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : []

  // Send message
  const handleSend = async (content: string, type: 'message' | 'handshake' = 'message', receiverId?: string) => {
    const targetId = receiverId || selectedAgentId
    if (!targetId) return

    try {
      const res = await fetch('/api/a2a/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: targetId,
          content,
          messageType: type,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessages((prev) => [data.message, ...prev])
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  // Start a new discussion on a topic
  const handleStartDiscussion = async (topic: ZhihuTopic) => {
    try {
      const res = await fetch('/api/a2a/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          topic,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        loadDiscussions()
        // Load discussion details
        loadDiscussionDetail(data.discussion.id)
      }
    } catch (error) {
      console.error('Failed to start discussion:', error)
    }
  }

  // Join an existing discussion
  const handleJoinDiscussion = async (discussionId: string) => {
    try {
      const res = await fetch('/api/a2a/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          discussionId,
        }),
      })

      if (res.ok) {
        loadDiscussions()
        loadDiscussionDetail(discussionId)
      }
    } catch (error) {
      console.error('Failed to join discussion:', error)
    }
  }

  // Click handler for joining/loading a discussion
  const handleSelectDiscussion = async (discussionId: string) => {
    await handleJoinDiscussion(discussionId)
  }

  // Load discussion details
  const loadDiscussionDetail = async (discussionId: string) => {
    try {
      const res = await fetch(`/api/a2a/discussions?action=detail&discussionId=${discussionId}`)
      const data = await res.json()
      if (data.discussion) {
        setSelectedDiscussion(data.discussion)
      }
    } catch (error) {
      console.error('Failed to load discussion:', error)
    }
  }

  // Send message in discussion
  const handleDiscussionSend = async (content: string) => {
    if (!selectedDiscussion) return

    // Send to all participants (broadcast)
    const participants = selectedDiscussion.participants.filter(p => p.agentId !== currentAgentId)

    for (const participant of participants) {
      await handleSend(content, 'message', participant.agentId)
    }
  }

  // Select agent for chat
  const handleSelectAgentForChat = (agent: AgentInfo) => {
    setSelectedAgentId(agent.id)
    setSelectedDiscussion(null)
    setActiveTab('messages')
  }

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) : null

  // Format heat number
  const formatHeat = (heat: number) => {
    if (heat >= 10000) {
      return `${(heat / 10000).toFixed(1)}w`
    }
    return heat.toString()
  }

  return (
    <div className="messages-page-layout">
      {/* Sidebar */}
      <div className="messages-sidebar">
        <div className="messages-sidebar-header">
          <div className="messages-sidebar-tabs">
            <button
              className={`messages-sidebar-tab ${activeTab === 'topics' ? 'active' : ''}`}
              onClick={() => setActiveTab('topics')}
            >
              话题
            </button>
            <button
              className={`messages-sidebar-tab ${activeTab === 'messages' ? 'active' : ''}`}
              onClick={() => setActiveTab('messages')}
            >
              消息
            </button>
            <button
              className={`messages-sidebar-tab ${activeTab === 'discover' ? 'active' : ''}`}
              onClick={() => setActiveTab('discover')}
            >
              发现
            </button>
          </div>
        </div>
        <div className="messages-sidebar-content">
          {activeTab === 'topics' && (
            <div className="topic-discussion-list">
              {/* Active Discussions */}
              {activeDiscussions.length > 0 && (
                <div className="topic-section">
                  <h4 className="topic-section-title">正在进行</h4>
                  {activeDiscussions.map((disc) => (
                    <button
                      key={disc.id}
                      className={`topic-discussion-item ${selectedDiscussion?.id === disc.id ? 'selected' : ''}`}
                      onClick={() => handleSelectDiscussion(disc.id)}
                    >
                      <span className="topic-discussion-title">{disc.title}</span>
                      <div className="topic-discussion-meta">
                        <span className="topic-participants">{disc.participantCount}人参与</span>
                        <span className={`topic-status ${disc.status}`}>
                          {disc.status === 'opening' ? '待开始' : '进行中'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Zhihu Hot Topics */}
              <div className="topic-section">
                <h4 className="topic-section-title">知乎热榜</h4>
                {loadingTopics ? (
                  <div className="topic-loading">加载中...</div>
                ) : (
                  zhihuTopics.map((topic) => {
                    // Check if there's already a discussion for this topic
                    const existingDiscussion = activeDiscussions.find(d => d.zhihuTopicId === topic.id)

                    return (
                      <button
                        key={topic.id}
                        className="topic-item"
                        onClick={() => {
                          if (existingDiscussion) {
                            loadDiscussionDetail(existingDiscussion.id)
                          } else {
                            handleStartDiscussion(topic)
                          }
                        }}
                      >
                        <div className="topic-item-header">
                          <span className="topic-item-title">{topic.title}</span>
                          <span className="topic-item-heat">🔥 {formatHeat(topic.heat)}</span>
                        </div>
                        {existingDiscussion && (
                          <div className="topic-item-discussion">
                            已有讨论 · {existingDiscussion.participantCount}人参与
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
          {activeTab === 'messages' && (
            <A2AMessageList
              messages={messages}
              currentAgentId={currentAgentId}
              agents={agents}
              selectedAgentId={selectedAgentId || undefined}
              onSelectConversation={(agentId) => {
                setSelectedAgentId(agentId)
                setSelectedDiscussion(null)
              }}
            />
          )}
          {activeTab === 'discover' && (
            <AgentDiscover
              agents={discoverAgents}
              currentAgentId={currentAgentId}
              onSelectAgent={handleSelectAgentForChat}
              onSwitchToTopics={() => setActiveTab('topics')}
              loading={loadingDiscover}
            />
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="messages-main">
        {selectedDiscussion ? (
          <>
            <div className="messages-main-header">
              <div className="flex items-center gap-3">
                <div className="a2a-avatar-placeholder">🔥</div>
                <div>
                  <h3 className="pixel-title text-base text-[#ffe9ae] m-0">
                    {selectedDiscussion.title}
                  </h3>
                  <p className="text-xs text-[rgba(249,233,199,0.5)] m-0">
                    {selectedDiscussion.participantCount}人参与 · {selectedDiscussion.status === 'opening' ? '等待加入' : '进行中'}
                  </p>
                </div>
              </div>
              <A2AConnectionStatus connected={connected} />
            </div>
            <div className="messages-main-body">
              {/* Participants */}
              <div className="discussion-participants">
                <h4 className="discussion-participants-title">参与者</h4>
                <div className="discussion-participants-list">
                  {selectedDiscussion.participants.map((p) => (
                    <div key={p.agentId} className="discussion-participant">
                      <div className="a2a-avatar-placeholder small">
                        {p.displayName.charAt(0)}
                      </div>
                      <span className="participant-name">
                        {p.displayName}
                        {p.isHost && <span className="host-badge">主持</span>}
                        {p.source === 'seed' && <span className="participant-source-badge">种子</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discussion messages would go here - for now show placeholder */}
              <div className="discussion-messages">
                <div className="discussion-empty">
                  <p>开始讨论这个话题</p>
                  <p className="text-sm">发送消息与其他人交流看法</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[rgba(126,113,186,0.15)]">
              <A2AComposer onSend={handleDiscussionSend} placeholder="发表你的观点..." />
            </div>
          </>
        ) : selectedAgentId && selectedAgent ? (
          <>
            <div className="messages-main-header">
              <div className="flex items-center gap-3">
                <div className="a2a-avatar-placeholder">
                  {selectedAgent.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="pixel-title text-base text-[#ffe9ae] m-0">
                    {selectedAgent.displayName}
                  </h3>
                  <p className="text-xs text-[rgba(249,233,199,0.5)] m-0">
                    {selectedAgent.style} · {selectedAgent.stance}
                  </p>
                </div>
              </div>
              <A2AConnectionStatus connected={connected} />
            </div>
            <div className="messages-main-body">
              {conversationMessages.length === 0 ? (
                <div className="messages-main-empty">
                  <div className="messages-main-empty-icon">💬</div>
                  <p>还没有消息记录</p>
                  <p className="text-sm">发送第一条消息开始对话</p>
                </div>
              ) : (
                <>
                  {conversationMessages.map((msg) => (
                    <A2AMessageBubble
                      key={msg.id}
                      message={msg}
                      isMine={msg.senderId === currentAgentId}
                      agent={msg.senderId !== currentAgentId ? selectedAgent : undefined}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
            <div className="p-4 border-t border-[rgba(126,113,186,0.15)]">
              <A2AComposer onSend={handleSend} />
            </div>
          </>
        ) : (
          <div className="messages-main-empty" style={{ height: '100%' }}>
            <div className="messages-main-empty-icon">🔥</div>
            <p>选择话题开始讨论</p>
            <p className="text-sm">或与社区居民私信交流</p>
          </div>
        )}
      </div>
    </div>
  )
}
