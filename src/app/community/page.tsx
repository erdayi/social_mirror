'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Heart, MessageCircle, User } from 'lucide-react'

interface Post {
  id: string
  authorId: string
  authorName: string
  authorAvatar?: string
  title: string
  content: string
  tags: string[]
  likes: number
  createdAt: string
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/community')
      const data = await res.json()
      setPosts(data.posts || [])
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async (postId: string) => {
    try {
      await fetch(`/api/community/${postId}/like`, { method: 'POST' })
      setPosts(
        posts.map((p) =>
          p.id === postId ? { ...p, likes: p.likes + 1 } : p
        )
      )
    } catch (error) {
      console.error('Failed to like:', error)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <header className="max-w-4xl mx-auto mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-500 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </Link>
        <h1 className="font-pixel text-xl text-primary-600">社区交流</h1>
        <p className="text-gray-600 font-cute mt-2">
          与其他用户分享社交经验，互相学习成长
        </p>
      </header>

      <div className="max-w-4xl mx-auto">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500 font-cute">加载中...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="card-pixel text-center py-12">
            <p className="text-gray-500 font-cute">社区还没有帖子</p>
            <p className="text-sm text-gray-400 mt-2">成为第一个分享经验的人吧</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post.id} className="card-cute">
                {/* Author */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    {post.authorAvatar ? (
                      <img
                        src={post.authorAvatar}
                        alt=""
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <User className="w-5 h-5 text-primary-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-cute font-bold text-gray-700">
                      {post.authorName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(post.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <h3 className="font-cute font-bold text-gray-800 mb-2">
                  {post.title}
                </h3>
                <p className="text-gray-600 font-cute mb-3 whitespace-pre-wrap">
                  {post.content}
                </p>

                {/* Tags */}
                {post.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {post.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 bg-secondary-100 text-secondary-600 rounded-full font-cute"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleLike(post.id)}
                    className="flex items-center gap-1 text-gray-500 hover:text-coral-400 transition-colors"
                  >
                    <Heart className="w-4 h-4" />
                    <span className="text-sm font-cute">{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-1 text-gray-500 hover:text-primary-400 transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    <span className="text-sm font-cute">评论</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}