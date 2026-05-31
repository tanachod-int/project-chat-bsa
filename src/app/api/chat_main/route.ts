import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'
import { toUIMessageStream } from '@ai-sdk/langchain'
import { createUIMessageStreamResponse, UIMessage } from 'ai'
import { AIMessage } from '@langchain/core/messages'

import { requireAuthenticatedUser, requireEvalAccess, hasValidEvalSecret } from '@/lib/api-auth'
import { handleApiError, jsonError } from '@/lib/api-errors'
import { ChatHistoryService } from '@/services/chat-history'
import { ChatService } from '@/services/chat-service'
import { RagService } from '@/services/rag-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RETRIEVAL_FAILURE_MESSAGE =
  'ขออภัยครับ ขณะนี้ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้ กรุณาลองใหม่อีกครั้งในภายหลัง'

function extractLastUserInput(messages: UIMessage[] | undefined): string {
  if (!Array.isArray(messages)) return ''

  const lastUserMessage = messages.filter(message => message.role === 'user').pop()
  if (!lastUserMessage || !Array.isArray(lastUserMessage.parts)) return ''

  return lastUserMessage.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('')
    .trim()
}

function splitContextForEval(documentContext: string) {
  return documentContext
    .split('\n\n---\n\n')
    .filter(context => context.trim().length > 0)
}

function streamPlainText(text: string, sessionId?: string) {
  const readable = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text)
      controller.close()
    }
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(readable),
    headers: sessionId ? { 'x-session-id': sessionId } : undefined
  })
}

async function persistVisibleResponse(
  messageHistory: Awaited<ReturnType<typeof ChatService.prepareChatContext>>['messageHistory'],
  input: string,
  assistantText: string
) {
  await messageHistory.addUserMessage(input)
  await messageHistory.addMessage(new AIMessage(assistantText))
}

// POST /api/chat_main - API หลักสำหรับคุยกับ AI
// ขั้นตอน: Session -> Summary -> History -> RAG Search -> Stream Response -> Save
// Header x-log-csv: "true" = บันทึก log สำหรับ Ragas
export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      sessionId,
    }: {
      messages?: UIMessage[], sessionId?: string
    } = await req.json()

    const input = extractLastUserInput(messages)
    if (!input) {
      return jsonError('No valid user input found', 400, 'INVALID_INPUT')
    }

    const isEvalMode = req.headers.get('x-eval-mode') === 'true'

    if (isEvalMode) {
      requireEvalAccess(req)

      const emergencyResponse = ChatService.getEmergencyResponse(input)
      if (emergencyResponse) {
        return NextResponse.json({
          answer: emergencyResponse,
          contexts: []
        })
      }

      const { context: documentContext, hasError: searchError } = await ChatService.getDocumentContext(input)

      if (searchError) {
        return NextResponse.json({
          answer: RETRIEVAL_FAILURE_MESSAGE,
          contexts: []
        })
      }

      const ragChain = await ChatService.createChatChain([], null, documentContext, true)
      const result = await ragChain.invoke({
        input,
        chat_history: [],
        summary: '',
        context: documentContext
      })

      let answerText = ''
      if (typeof result === 'string') answerText = result
      else if (result && typeof result === 'object' && 'content' in result) {
        answerText = String((result as { content: unknown }).content)
      }

      return NextResponse.json({
        answer: answerText,
        contexts: splitContextForEval(documentContext)
      })
    }

    const user = await requireAuthenticatedUser()

    // 1. จัดการเซสชัน
    const currentSessionId = await ChatHistoryService.getOrCreateSessionId(sessionId, user.id, messages ?? [])

    // 2. ดึงสรุปการสนทนา
    const persistedSummary = await ChatHistoryService.getSummary(currentSessionId, user.id)

    // 3. เตรียมบริบท (ประวัติการสนทนาและข้อมูลเข้า)
    const pool = getDatabase()
    const { messageHistory, recentWindowWithoutCurrentInput } = await ChatService.prepareChatContext(
      currentSessionId,
      pool,
      messages ?? [],
      input
    )

    const emergencyResponse = ChatService.getEmergencyResponse(input)
    if (emergencyResponse) {
      try {
        await persistVisibleResponse(messageHistory, input, emergencyResponse)
      } catch {
        console.warn('Failed to save deterministic safety response')
      }

      return streamPlainText(emergencyResponse, currentSessionId)
    }

    // 4. ค้นหาข้อมูลด้วย RAG
    const { context: documentContext, hasError: searchError } = await ChatService.getDocumentContext(input)

    if (searchError) {
      try {
        await persistVisibleResponse(messageHistory, input, RETRIEVAL_FAILURE_MESSAGE)
      } catch {
        console.warn('Failed to save retrieval failure response')
      }

      return streamPlainText(RETRIEVAL_FAILURE_MESSAGE, currentSessionId)
    }

    // documentContext เป็นข้อความที่ถูกจัดรูปแบบแล้วจาก ChatService.getDocumentContext
    const contextString = documentContext;

    // 5. สร้าง Chain สำหรับการประมวลผล
    const ragChain = await ChatService.createChatChain(
      recentWindowWithoutCurrentInput,
      persistedSummary,
      contextString,
      isEvalMode
    )

    // เตรียมข้อมูลนำเข้าทั้งหมดที่จำเป็นสำหรับเทมเพลต prompt
    const chainInput = {
      input: input,
      chat_history: recentWindowWithoutCurrentInput,
      summary: persistedSummary || "",
      context: contextString
    };

    // --- โหมดปกติ: ส่งคืนข้อมูลแบบสตรีม ---
    const stream = await ragChain.stream(chainInput)

    // 6. บันทึกข้อความของผู้ใช้
    let canSaveToDatabase = true
    try {
      await messageHistory.addUserMessage(input)
    } catch {
      console.warn('Failed to save user message')
      canSaveToDatabase = false
    }

    // 7. ส่งคืนข้อมูลแบบสตรีมและบันทึกข้อความของ AI
    let assistantText = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (typeof chunk === 'string') {
              assistantText += chunk;
              controller.enqueue(chunk);
            }
          }

          if (assistantText && canSaveToDatabase) {
            try {
              // บันทึกข้อความของ AI
              await messageHistory.addMessage(new AIMessage(assistantText))

              // บันทึก CSV (เฉพาะเมื่อมีการร้องขอผ่าน header)
              const shouldLogCsv = req.headers.get('x-log-csv') === 'true' && hasValidEvalSecret(req);
              if (shouldLogCsv) {
                RagService.appendToCSV(input, assistantText, documentContext);
              }

              // อัปเดตสรุปการสนทนา
              const updatedSummary = await ChatService.summarizeConversation(
                persistedSummary,
                input,
                assistantText
              )
              await ChatHistoryService.updateSummary(currentSessionId, updatedSummary, user.id)

            } catch {
              console.warn('Update summary/history failed')
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })

    return createUIMessageStreamResponse({
      stream: toUIMessageStream(readable),
      headers: currentSessionId ? { 'x-session-id': currentSessionId } : undefined
    })

  } catch (error) {
    return handleApiError(error, 'Error processing request')
  }
}

// GET /api/chat_main?sessionId=xxx - ดึงประวัติแชทเดิม
export async function GET(req: NextRequest) {
  let client;
  try {
    const user = await requireAuthenticatedUser()
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) return jsonError('Session ID required', 400, 'INVALID_INPUT')

    await ChatHistoryService.assertSessionOwner(sessionId, user.id)

    const pool = getDatabase()
    client = await pool.connect()
    const result = await client.query(
      `SELECT id, message, message->>'type' as message_type, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    )
    const messages = result.rows.map((row, i) => ({
      id: row.id ? `history-${row.id}` : `history-${i}`,
      role: row.message_type === 'ai' ? 'assistant' : 'user',
      content: row.message.content || '',
      createdAt: row.created_at
    }))
    return NextResponse.json({ messages }, { status: 200 })
  } catch (error) {
    return handleApiError(error, 'Failed to fetch messages')
  } finally {
    if (client) client.release()
  }
}
