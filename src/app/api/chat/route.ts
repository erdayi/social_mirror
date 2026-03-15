import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { sendChatMessage } from '@/lib/secondme'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { message, scenario, sessionId } = await request.json()

  try {
    // 调用 SecondMe Chat API
    const response = await sendChatMessage(
      user.accessToken,
      `【社交练习场景: ${scenario || '自由对话'}】\n用户: ${message}\n\n请扮演对话对象，用自然的语气回复，并在最后给出简短的社交建议。`,
      sessionId
    )

    // 保存消息到数据库
    await prisma.chatSession.upsert({
      where: { id: sessionId || Date.now().toString() },
      create: {
        id: sessionId || Date.now().toString(),
        userId: user.id,
        sessionType: 'practice',
        scenario: scenario,
        messages: {
          create: [
            { role: 'user', content: message },
            { role: 'assistant', content: response.reply || response.message },
          ],
        },
      },
      update: {
        messages: {
          create: [
            { role: 'user', content: message },
            { role: 'assistant', content: response.reply || response.message },
          ],
        },
      },
    })

    return NextResponse.json({
      reply: response.reply || response.message,
    })
  } catch (error) {
    console.error('Chat error:', error)

    // 模拟响应（开发模式）
    const mockReplies: Record<string, string> = {
      greeting: '你好！很高兴认识你。我看你很紧张，放轻松，我们只是普通聊天。你想聊些什么呢？',
      smalltalk: '是啊，天气确实不错！对了，你最近有什么有趣的经历吗？',
      interview: '你好，请坐。我看过你的简历，很不错。能简单介绍一下你自己吗？',
      conflict: '我理解你的感受。让我们一起找一个双方都能接受的解决方案，好吗？',
      presentation: '感谢各位的聆听。我对这个项目很有热情，欢迎提问！',
      dating: '嗨！你也喜欢这家咖啡店吗？他们的拿铁很棒！',
    }

    return NextResponse.json({
      reply:
        mockReplies[scenario || ''] ||
        `模拟回复: 我理解你的意思。在${scenario || '这个场景'}中，你可以尝试更自信地表达自己。需要我给更多建议吗？`,
    })
  }
}