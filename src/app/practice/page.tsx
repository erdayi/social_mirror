'use client'

import { useState } from 'react'
import { Send, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const SCENARIOS = [
  { id: 'greeting', name: '初次见面', emoji: '👋' },
  { id: 'smalltalk', name: '闲聊技巧', emoji: '💬' },
  { id: 'interview', name: '面试交流', emoji: '💼' },
  { id: 'conflict', name: '冲突处理', emoji: '🤝' },
  { id: 'presentation', name: '演讲表达', emoji: '🎤' },
  { id: 'dating', name: '约会沟通', emoji: '💕' },
]

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function PracticePage() {
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          scenario: selectedScenario,
          sessionId: Date.now().toString(),
        }),
      })

      const data = await response.json()
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || '抱歉，请稍后再试' },
      ])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '网络错误，请稍后重试' },
      ])
    } finally {
      setLoading(false)
    }
  }

  if (!selectedScenario) {
    return (
      <div className="min-h-screen bg-background p-4">
        <header className="max-w-4xl mx-auto mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-500 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> 返回
          </Link>
          <h1 className="font-pixel text-xl text-primary-600">
            选择练习场景
          </h1>
        </header>

        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setSelectedScenario(scenario.id)}
              className="card-pixel text-center py-6 hover:scale-105 transition-transform"
            >
              <span className="text-3xl block mb-2">{scenario.emoji}</span>
              <span className="font-cute font-bold text-gray-700">
                {scenario.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const scenarioName = SCENARIOS.find((s) => s.id === selectedScenario)?.name

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white/80 backdrop-blur-sm border-b-2 border-primary-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedScenario(null)
              setMessages([])
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-primary-500"
          >
            <ArrowLeft className="w-4 h-4" /> 返回
          </button>
          <h1 className="font-cute font-bold text-lg text-gray-700">
            {scenarioName} 练习
          </h1>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 font-cute py-12">
              <p>开始你的{scenarioName}练习吧！</p>
              <p className="text-sm mt-2">AI 会扮演对话对象与你交流</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-cute ${
                  msg.role === 'user'
                    ? 'bg-primary-400 text-white'
                    : 'bg-white border-2 border-primary-200'
                }`}
              >
                <p className="font-cute whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border-2 border-primary-200 p-3 rounded-cute">
                <p className="font-cute text-gray-500">正在思考中...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-white border-t-2 border-primary-200 p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入你的回复..."
            className="flex-1 px-4 py-2 rounded-cute border-2 border-primary-200 focus:border-primary-400 focus:outline-none font-cute"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="btn-cute bg-primary-400 hover:bg-primary-500 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}