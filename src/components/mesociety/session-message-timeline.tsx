'use client'

import { useState } from 'react'

type SessionMessage = {
  messageId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  senderUserId: number | null
  receiverUserId: number | null
  createTime: string
}

type Props = {
  messages: SessionMessage[]
}

type AudioState = Record<string, { url: string; loading: boolean }>

export function SessionMessageTimeline({ messages }: Props) {
  const [audioByMessage, setAudioByMessage] = useState<AudioState>({})

  const handleGenerateReplay = async (messageId: string, content: string) => {
    if (audioByMessage[messageId]?.loading) {
      return
    }

    setAudioByMessage((current) => ({
      ...current,
      [messageId]: { url: current[messageId]?.url || '', loading: true },
    }))

    try {
      const response = await fetch('/api/sessions/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: content,
          emotion: 'calm',
        }),
      })

      if (!response.ok) {
        throw new Error('TTS failed')
      }

      const payload = (await response.json()) as {
        audio?: {
          url?: string
        }
      }

      setAudioByMessage((current) => ({
        ...current,
        [messageId]: { url: payload.audio?.url || '', loading: false },
      }))
    } catch {
      setAudioByMessage((current) => ({
        ...current,
        [messageId]: { url: '', loading: false },
      }))
    }
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const isUser = message.role === 'user'
        const audio = audioByMessage[message.messageId]

        return (
          <div key={message.messageId} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-[18px] border px-4 py-3 ${
                isUser
                  ? 'border-[rgba(124,218,255,0.24)] bg-[rgba(31,44,78,0.84)]'
                  : 'border-[rgba(126,113,186,0.24)] bg-[rgba(31,23,46,0.92)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[rgba(249,233,199,0.52)]">
                <span>{isUser ? '你' : message.role === 'assistant' ? 'Agent' : '系统'}</span>
                <span>{new Date(message.createTime).toLocaleString('zh-CN')}</span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-[rgba(249,233,199,0.84)]">
                {message.content}
              </p>

              {!isUser && message.content ? (
                <div className="mt-3 pixel-audio-shell">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="pixel-inline-badge">语音回放</span>
                    <button
                      type="button"
                      onClick={() => handleGenerateReplay(message.messageId, message.content)}
                      className="pixel-nav"
                      disabled={audio?.loading}
                    >
                      {audio?.loading ? '生成中...' : audio?.url ? '重新生成语音' : '生成语音回放'}
                    </button>
                  </div>
                  {audio?.url ? (
                    <audio controls preload="none" className="pixel-audio-player mt-3">
                      <source src={audio.url} />
                      <span className="text-xs font-semibold text-[rgba(249,233,199,0.52)]">不支持音频播放</span>
                    </audio>
                  ) : (
                    <p className="mt-3 text-xs font-semibold text-[rgba(249,233,199,0.62)]">
                      可将这条消息即时合成为语音，便于答辩演示回放。
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
