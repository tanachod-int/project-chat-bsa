"use client"

import { useState, useCallback } from 'react'
import { generateUniqueId } from '@/lib/utils'
import { API_BASE } from '@/constants/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: string
}

export function useChatHistory(initialSessionId?: string, userId?: string) {

  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(initialSessionId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || loading) return

    setLoading(true)
    setHistoryError(null)

    const controller = new AbortController()
    setAbortController(controller)

    const userMessage: ChatMessage = {
      id: generateUniqueId('temp-user'),
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')

    const apiMessages = updatedMessages.map(msg => ({
      id: msg.id,
      role: msg.role,
      parts: [{ type: 'text', text: msg.content }]
    }))

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          sessionId: currentSessionId,
          userId: userId,
        }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error('Failed to send message')

      const sessionId = response.headers.get('x-session-id')
      if (sessionId && !currentSessionId) {
        setCurrentSessionId(sessionId)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const assistantMessage: ChatMessage = {
        id: generateUniqueId('temp-assistant'),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMessage])

      const decoder = new TextDecoder()
      let accumulatedContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        // 1. สร้างตัวแปรเช็คสถานะจบ
        let isStreamFinished = false

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6)

              // 2. ถ้าเจอ [DONE] ให้ตั้งค่า flag เป็น true
              if (jsonStr === '[DONE]') {
                isStreamFinished = true
                break // หยุด loop ย่อย
              }

              const data = JSON.parse(jsonStr)
              if (data.type === 'text-delta' && data.delta) {
                accumulatedContent += data.delta
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessage.id
                    ? { ...msg, content: accumulatedContent }
                    : msg
                ))
              }
            } catch (e) {
              console.warn('Failed to parse streaming data:', line)
            }
          }
        }

        // 3. เช็ค flag ถ้าจบแล้ว ให้ break loop ใหญ่ (while) ทันที
        if (isStreamFinished) {
          break
        }
      }
      // ---------------------------------------------------------

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted')
      } else {
        setHistoryError(error instanceof Error ? error.message : 'Unknown error')
        console.error('Send message error:', error)
      }
    } finally {
      // เมื่อหลุด Loop ได้แล้ว finally จะทำงาน และ setLoading จะหยุดหมุน
      setLoading(false)
      setAbortController(null)
    }
  }, [messages, currentSessionId, loading, userId])

  const stopMessage = useCallback(() => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setLoading(false)
    }
  }, [abortController])

  // ใช้ useCallback เพื่อป้องกัน Infinite Loop ในหน้า ChatHistory
  const loadChatHistory = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === 'new') return

    setLoadingHistory(true)
    setHistoryError(null)

    try {
      const apiUrl = `${API_BASE}?sessionId=${sessionId}`
      const response = await fetch(apiUrl)

      if (!response.ok) {
        throw new Error('Failed to load chat history')
      }

      const data = await response.json()
      const loadedMessages: ChatMessage[] = data.messages || []

      setMessages(loadedMessages)
      setCurrentSessionId(sessionId)

    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const startNewChat = useCallback(() => {
    setCurrentSessionId(undefined)
    setMessages([])
    setHistoryError(null)
    setInput('')
  }, [])

  const switchToSession = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) return
    await loadChatHistory(sessionId)
  }, [currentSessionId, loadChatHistory])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim()) {
      sendMessage(input)
    }
  }, [input, sendMessage])

  return {
    messages,
    loading,
    input,
    setInput,
    sendMessage,
    stopMessage,
    handleSubmit,
    currentSessionId,
    setCurrentSessionId,
    loadChatHistory,
    startNewChat,
    switchToSession,
    loadingHistory,
    historyError,
  }
}