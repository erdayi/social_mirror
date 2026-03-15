import axios from 'axios'

const SECONDME_API_URL = process.env.SECONDME_API_URL || 'https://api.second.me'

export const secondMeApi = axios.create({
  baseURL: SECONDME_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 聊天 API
export async function sendChatMessage(
  accessToken: string,
  message: string,
  sessionId?: string
) {
  const response = await secondMeApi.post(
    '/v1/chat',
    {
      message,
      session_id: sessionId,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )
  return response.data
}

// 获取用户 Profile
export async function getUserProfile(accessToken: string) {
  const response = await secondMeApi.get('/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  return response.data
}

// 笔记 API
export async function createNote(
  accessToken: string,
  title: string,
  content: string,
  tags?: string[]
) {
  const response = await secondMeApi.post(
    '/v1/notes',
    {
      title,
      content,
      tags,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )
  return response.data
}

export async function getNotes(accessToken: string) {
  const response = await secondMeApi.get('/v1/notes', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  return response.data
}