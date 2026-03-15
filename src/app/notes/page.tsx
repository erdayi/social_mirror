'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Search } from 'lucide-react'

interface Note {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    try {
      const res = await fetch('/api/notes')
      const data = await res.json()
      setNotes(data.notes || [])
    } catch (error) {
      console.error('Failed to fetch notes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return

    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      })

      if (res.ok) {
        setShowEditor(false)
        setTitle('')
        setContent('')
        setTags('')
        fetchNotes()
      }
    } catch (error) {
      console.error('Failed to save note:', error)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="max-w-4xl mx-auto mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-500 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> 返回
          </Link>
          <h1 className="font-pixel text-xl text-primary-600">我的笔记</h1>
        </div>
        <button
          onClick={() => setShowEditor(true)}
          className="btn-cute bg-primary-400 hover:bg-primary-500 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> 新建笔记
        </button>
      </header>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-cute p-6 w-full max-w-lg shadow-cute">
            <h2 className="font-cute font-bold text-lg text-gray-700 mb-4">
              {editNote ? '编辑笔记' : '新建笔记'}
            </h2>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="笔记标题"
              className="w-full px-3 py-2 rounded-cute border-2 border-primary-200 focus:border-primary-400 focus:outline-none mb-3 font-cute"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="记录你的社交心得..."
              rows={6}
              className="w-full px-3 py-2 rounded-cute border-2 border-primary-200 focus:border-primary-400 focus:outline-none mb-3 font-cute resize-none"
            />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="标签（用逗号分隔）"
              className="w-full px-3 py-2 rounded-cute border-2 border-primary-200 focus:border-primary-400 focus:outline-none mb-4 font-cute"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowEditor(false)
                  setEditNote(null)
                }}
                className="btn-cute bg-gray-200 text-gray-600 hover:bg-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="btn-cute bg-primary-400 hover:bg-primary-500"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500 font-cute">加载中...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="card-pixel text-center py-12">
            <p className="text-gray-500 font-cute">还没有笔记</p>
            <p className="text-sm text-gray-400 mt-2">
              点击右上角创建你的第一篇笔记
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {notes.map((note) => (
              <div key={note.id} className="card-pixel">
                <h3 className="font-cute font-bold text-gray-800 mb-2">
                  {note.title}
                </h3>
                <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                  {note.content}
                </p>
                <div className="flex flex-wrap gap-1">
                  {note.tags?.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 bg-primary-100 text-primary-600 rounded-full font-cute"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}