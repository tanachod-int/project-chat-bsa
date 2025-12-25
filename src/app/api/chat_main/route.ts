import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/database'
import { toUIMessageStream } from '@ai-sdk/langchain'
import { createUIMessageStreamResponse, UIMessage } from 'ai'
import { AIMessage } from '@langchain/core/messages'

import { ChatHistoryService } from '@/services/chat-history'
import { ChatService } from '@/services/chat-service'
import { RagService } from '@/services/rag-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/chat_main - API หลักสำหรับคุยกับ AI
// ขั้นตอน: Session -> Summary -> History -> RAG Search -> Stream Response -> Save
// Header x-log-csv: "true" = บันทึก log สำหรับ Ragas
export async function POST(req: NextRequest) {
  const pool = getDatabase()
  try {
    const { messages, sessionId, userId }: {
      messages: UIMessage[], sessionId?: string, userId?: string
    } = await req.json()

    // 1. จัดการเซสชัน
    const currentSessionId = await ChatHistoryService.getOrCreateSessionId(sessionId, userId, messages)

    // 2. ดึงสรุปการสนทนา
    const persistedSummary = await ChatHistoryService.getSummary(currentSessionId)

    // 3. เตรียมบริบท (ประวัติการสนทนาและข้อมูลเข้า)
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()
    let input = ''
    if (lastUserMessage?.parts?.[0]?.type === 'text') {
      input = lastUserMessage.parts[0].text
    }
    if (!input) return new Response('No valid user input found.', { status: 400 })

    const { messageHistory, recentWindowWithoutCurrentInput } = await ChatService.prepareChatContext(
      currentSessionId,
      pool,
      messages,
      input
    )

    // 4. ค้นหาข้อมูลด้วย RAG
    const { context: documentContext, hasError: searchError } = await ChatService.getDocumentContext(input)

    // documentContext เป็นข้อความที่ถูกจัดรูปแบบแล้วจาก ChatService.getDocumentContext
    const contextString = documentContext;

    const isEvalMode = req.headers.get('x-eval-mode') === 'true'

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

    // --- โหมดประเมินผล: ส่งคืน JSON โดยตรง (ไม่มีการสตรีม) ---
    if (isEvalMode) {

      const result = await ragChain.invoke(chainInput);

      let answerText = "";
      if (typeof result === 'string') answerText = result;
      // ตรวจสอบความปลอดภัยสำหรับออบเจกต์ที่มีพร็อพเพอร์ตี้ content
      else if (result && typeof result === 'object' && 'content' in result) {
        answerText = (result as any).content;
      }

      // ดึงข้อความบริบทสำหรับการบันทึก log
      // เนื่องจาก documentContext เป็นสตริงที่เชื่อมด้วย '\n\n---\n\n' เราจึงสามารถแยกกลับได้
      const contextContents = typeof documentContext === 'string'
        ? documentContext.split('\n\n---\n\n').filter(s => s.trim().length > 0)
        : [];

      return NextResponse.json({
        answer: answerText,
        contexts: contextContents
      });
    }

    // --- โหมดปกติ: ส่งคืนข้อมูลแบบสตรีม ---
    const stream = await ragChain.stream(chainInput)

    // 6. บันทึกข้อความของผู้ใช้
    let canSaveToDatabase = true
    try {
      await messageHistory.addUserMessage(input)
    } catch (e) {
      console.warn('Save User Msg Error:', e)
      canSaveToDatabase = false
    }

    // 7. ส่งคืนข้อมูลแบบสตรีมและบันทึกข้อความของ AI
    let assistantText = ''
    let hasSearchError = searchError

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (hasSearchError) continue;
            if (typeof chunk === 'string') {
              if (chunk.includes('ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้') ||
                assistantText.includes('ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้')) {
                hasSearchError = true;
                const friendlyMessage = 'ขออภัยครับ ขณะนี้ไม่สามารถเข้าถึงระบบค้นหาเอกสารได้ กรุณาลองใหม่อีกครั้งในภายหลัง';
                controller.enqueue(friendlyMessage);
                assistantText = friendlyMessage;
              } else {
                assistantText += chunk;
                controller.enqueue(chunk);
              }
            }
          }

          if (assistantText && !hasSearchError && canSaveToDatabase) {
            try {
              // บันทึกข้อความของ AI
              await messageHistory.addMessage(new AIMessage(assistantText))

              // บันทึก CSV (เฉพาะเมื่อมีการร้องขอผ่าน header)
              const shouldLogCsv = req.headers.get('x-log-csv') === 'true';
              if (shouldLogCsv) {
                RagService.appendToCSV(input, assistantText, documentContext.map(c => c.pageContent));
                // RagService.appendToCSV(input, assistantText, documentContext);
              }

              // อัปเดตสรุปการสนทนา
              const updatedSummary = await ChatService.summarizeConversation(
                persistedSummary,
                input,
                assistantText
              )
              await ChatHistoryService.updateSummary(currentSessionId, updatedSummary)

            } catch (e) {
              console.warn('Update summary/history failed', e)
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
    console.error('API Error Details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      raw: error
    })
    return new Response(JSON.stringify({
      error: 'Error processing request',
      details: error instanceof Error ? error.message : String(error)
    }), { status: 500 })
  }
}

// GET /api/chat_main?sessionId=xxx - ดึงประวัติแชทเดิม
export async function GET(req: NextRequest) {
  const pool = getDatabase()
  let client;
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'Session ID required' }, { status: 400 })

    client = await pool.connect()
    const result = await client.query(
      `SELECT message, message->>'type' as message_type, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    )
    const messages = result.rows.map((row, i) => ({
      id: `history-${i}`,
      role: row.message_type === 'ai' ? 'assistant' : 'user',
      content: row.message.content || '',
      createdAt: row.created_at
    }))
    return NextResponse.json({ messages }, { status: 200 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  } finally {
    if (client) client.release()
  }
}